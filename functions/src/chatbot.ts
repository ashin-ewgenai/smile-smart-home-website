import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { db, OPENAI_API_KEY } from "./core";

// Twilio/WhatsApp Configuration Secrets (defined locally in this file)
export const TWILIO_ACCOUNT_SID = defineSecret("TWILIO_ACCOUNT_SID");
export const TWILIO_AUTH_TOKEN = defineSecret("TWILIO_AUTH_TOKEN");
export const TWILIO_WHATSAPP_NUMBER = defineSecret("TWILIO_WHATSAPP_NUMBER");

// Declare global fetch to satisfy TypeScript without DOM lib in Node runtimes
declare const fetch: any;

// ===== CENTRALIZED CONFIGURATION =====
const CONFIG = {
  RATE_LIMIT: {
    COOLDOWN_MS: 3000,
    WINDOW_MS: 60000,
    MAX_PER_WINDOW: 15
  },
  OPENAI: {
    MODEL: "gpt-4.1",
    TEMPERATURE: 0.4,
    MAX_TOKENS: 310
  },
  COLLECTIONS: {
    DEVICES: "User_Devices",
    TICKETS: "Support_Tickets", 
    CHAT_SESSIONS: "chat_sessions",
    RATE_LIMITS: "rate_limits",
    ACCOUNTS: "Accounts",
    MAIN_DEVICES: "Devices",
    SUPPORT_REQUESTS: "support_requests",
    SUPPORT_STATUS: "support_status"
  }
};

const ENABLE_SERIAL_PARSING = false;

export const DEVICE_DETAILS_PROMPT_TEMPLATE = (
  devices: any,
  userMessage: string
) => `
You are a support AI. The user owns these devices:

${JSON.stringify(devices, null, 2)}

When the user asks for device details, find the matching device by name.
If no device matches, say: "I couldn’t find that device in your purchases."
User question: ${userMessage}
`;

const STRICT_SYSTEM_PROMPT = `
You are the Smart Smile Home Support Bot.
You are NOT allowed to answer free text questions.

RULES:
- ONLY respond when the backend sends a structured request with:
  { action: "...", deviceData: {...} }
- If the user types anything manually, reply ONLY with:
  "Please use the options provided."

Never generate troubleshooting steps unless the backend explicitly includes them in your input.
Never guess device information.
Never reply directly to user free-text.
`;

// Helper: fetch all devices for a user and build device summaries
async function loadUserDevicesAndSummaries(uid: string) {
  const devicesQuery = await db.collection(CONFIG.COLLECTIONS.DEVICES).where("uid", "==", uid).get();
  const userDevices = devicesQuery.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) })) as Array<any>;

  // Debug: Log all device serials to diagnose matching issues
  console.log("=== DEBUG USER DEVICES & SERIALS ===");
  console.log("Devices collection:", CONFIG.COLLECTIONS.DEVICES);
  console.log("User devices count:", userDevices.length);
  userDevices.forEach((d: any) => {
    console.log("USER_DEVICE DOC:", d.id, d.deviceName || d.name || "unnamed");
    console.log(
      "USER_DEVICE serials[]:",
      Array.isArray(d.serials) ? d.serials.map((s: any) => s?.serialNumber || s?.serial) : []
    );
    console.log("USER_DEVICE deviceSerial:", d.deviceSerial, "serial:", d.serial, "serialNumber:", d.serialNumber);
  });
  console.log("=== END DEBUG USER DEVICES & SERIALS ===");

  const maskSerial = (s: any) => {
    const v = typeof s === "string" ? s : "";
    if (!v) return "";
    const last4 = v.slice(-4);
    return v.length > 4 ? `***${last4}` : `***${last4}`;
  };

  const deviceSummaries = userDevices.map((d: any) => {
    const serialCandidates = [d.deviceSerial, d.serial, d.serialNumber].filter(Boolean);
    const serialMasked = serialCandidates.length > 0 ? maskSerial(serialCandidates[0]) : "";
    const serialArray = Array.isArray(d.serials) ? d.serials : [];
    const serialsMasked = serialArray
      .map((e: any) => ({
        serialNumber: maskSerial(e?.serialNumber),
        warrantyExpiry: e?.warrantyExpiry || e?.warrantyEnd || undefined,
      }))
      .filter((e: any) => e.serialNumber);
    const serialWarranty = (serialsMasked.find((e: any) => e?.warrantyExpiry)?.warrantyExpiry) || undefined;
    const warrantyCombined = d.warrantyExpiry || d.warrantyEnd || serialWarranty || undefined;
    return {
      id: d.id,
      name: d.deviceName || d.name || "Unknown Device",
      type: d.deviceType || d.type || "Device",
      model: d.deviceModel || d.model || d.modelNumber || "",
      serial: serialMasked,
      lastSeen: d.lastSeen || d.lastActive || undefined,
      room: d.room || d.location || undefined,
      installedAt: d.installedAt || d.addedAt || undefined,
      warrantyExpiry: d.warrantyExpiry || d.warrantyEnd || undefined,
      warrantyCombined,
      serials: serialsMasked,
    };
  });

  return { userDevices, deviceSummaries };
}

// ===== UTILITY FUNCTIONS =====

/**
 * Consolidated rate limiting utility with better error handling
 */
async function applyRateLimit(uid: string): Promise<void> {
  const rlRef = db.collection(CONFIG.COLLECTIONS.RATE_LIMITS).doc(uid);
  const nowTs = Date.now();
  
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(rlRef);
      const data = snap.exists ? (snap.data() as any) : {};
      const lastTs = Number(data.lastTs ?? 0);
      const windowStart = Number(data.windowStart ?? 0);
      const count = Number(data.count ?? 0);
      
      if (nowTs - lastTs < CONFIG.RATE_LIMIT.COOLDOWN_MS) {
        const waitSec = Math.ceil((CONFIG.RATE_LIMIT.COOLDOWN_MS - (nowTs - lastTs)) / 1000);
        throw new HttpsError("resource-exhausted", `Please wait ${waitSec}s before trying again.`);
      }
      
      if (nowTs - windowStart >= CONFIG.RATE_LIMIT.WINDOW_MS) {
        tx.set(rlRef, { lastTs: nowTs, windowStart: nowTs, count: 1 }, { merge: true });
      } else {
        if (count >= CONFIG.RATE_LIMIT.MAX_PER_WINDOW) {
          throw new HttpsError("resource-exhausted", "Rate limit exceeded. Try again in a minute.");
        }
        tx.set(rlRef, { lastTs: nowTs, count: count + 1 }, { merge: true });
      }
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Rate limiting failed");
  }
}

/**
 * Ensure there is an open support ticket for this issue / device.
 * - If an open ticket already exists for this uid (and optional deviceId), return it.
 * - Otherwise, create a new ticket with a generated ticket number.
 */
async function ensureSupportTicketForIssue(params: {
  uid: string;
  subject: string;
  description: string;
  deviceId?: string;
  category?: string;
  priority?: string;
  imageUrl?: string;
}): Promise<{
  ticketId: string;
  ticketNumber: string;
  status: string;
  alreadyExists: boolean;
}> {
  const { uid, subject, description, deviceId, category, priority, imageUrl } = params;
  const ticketsCol = db.collection(CONFIG.COLLECTIONS.TICKETS);

  // Look for an existing open ticket for this user (and device, if provided)
  let q = ticketsCol.where("uid", "==", uid).where("status", "in", [
    "Pending",
    "In Progress",
    "pending",
    "open",
    "awaiting_user",
  ]);
  if (deviceId) {
    q = q.where("deviceId", "==", deviceId);
  }
  const existingSnap = await q.limit(1).get();
  if (!existingSnap.empty) {
    const docSnap = existingSnap.docs[0];
    const data = docSnap.data() as any;
    const ticketId = docSnap.id;
    const ticketNumber = data.ticketNumber || `#${ticketId.slice(-6).toUpperCase()}`;
    const status = String(data.status || "Pending");
    return { ticketId, ticketNumber, status, alreadyExists: true };
  }

  // No open ticket found – create a new one
  const now = Date.now();
  const currentYear = new Date(now).getFullYear();
  const timestampPart = String(now).slice(-3);
  const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  const ticketNumber = `SMH-${currentYear}-${timestampPart}${randomSuffix.slice(-2)}`;

  const payload: any = {
    uid,
    ticketNumber,
    subject: subject.trim(),
    description: description.trim(),
    status: "Pending",
    priority: priority || "medium",
    createdAt: now,
    updatedAt: now,
  };
  if (category) payload.category = category;
  if (deviceId) payload.deviceId = deviceId;
  if (imageUrl) payload.imageUrl = imageUrl;

  const ticketRef = await ticketsCol.add(payload);
  const ticketId = ticketRef.id;
  return { ticketId, ticketNumber, status: payload.status, alreadyExists: false };
}

/**
 * triggerWhatsAppMessaging (Real Implementation with Twilio)
 * Sends WhatsApp messages using Twilio WhatsApp API
 */
export async function triggerWhatsAppMessaging(params: {
  recipient: string;
  templateId: string;
  variables: Record<string, string>;
}): Promise<boolean> {
  const { recipient, templateId, variables } = params;

  const accountSid = TWILIO_ACCOUNT_SID.value();
  const authToken = TWILIO_AUTH_TOKEN.value();
  const fromNumber = TWILIO_WHATSAPP_NUMBER.value(); // e.g., "whatsapp:+14155238886"

  // DEBUG: Log secret availability (redacted for security)
  console.log(`[WhatsApp DEBUG] Secrets check - accountSid exists: ${!!accountSid}, authToken exists: ${!!authToken}, fromNumber exists: ${!!fromNumber}`);
  console.log(`[WhatsApp DEBUG] fromNumber value: ${fromNumber || 'NOT SET'}`);

  // If Twilio is not configured, log and skip gracefully
  if (!accountSid || !authToken || !fromNumber) {
    console.warn(`[WhatsApp] Twilio not configured. Logging only for ${recipient}`);
    await db.collection("System_Logs").add({
      target: recipient,
      channel: "whatsapp",
      templateId,
      timestamp: new Date().toISOString(),
      status: "skipped",
      reason: "Twilio not configured"
    });
    return true;
  }

  // Dynamically import twilio if available
  let Twilio: any;
  try {
    Twilio = require("twilio");
  } catch {
    console.warn(`[WhatsApp] twilio not installed. Logging only for ${recipient}`);
    await db.collection("System_Logs").add({
      target: recipient,
      channel: "whatsapp",
      templateId,
      timestamp: new Date().toISOString(),
      status: "skipped",
      reason: "twilio not installed"
    });
    return true;
  }

  const client = new Twilio(accountSid, authToken);

  // Format recipient number with whatsapp: prefix
  const toNumber = recipient.startsWith("whatsapp:") ? recipient : `whatsapp:${recipient}`;

  // Build message based on template
  const messageBody = buildWhatsAppMessage(templateId, variables);

  try {
    const message = await client.messages.create({
      from: fromNumber,
      to: toNumber,
      body: messageBody,
    });

    console.log(`[WhatsApp Sent] SID: ${message.sid} to ${recipient}`);

    // Log to System_Logs
    await db.collection("System_Logs").add({
      target: recipient,
      channel: "whatsapp",
      templateId,
      timestamp: new Date().toISOString(),
      status: "success",
      twilioSid: message.sid,
    });

    return true;
  } catch (error: any) {
    console.error(`[WhatsApp Failed] to ${recipient}:`, error);

    await db.collection("System_Logs").add({
      target: recipient,
      channel: "whatsapp",
      templateId,
      timestamp: new Date().toISOString(),
      status: "failed",
      error: error.message,
    });

    throw error;
  }
}

/**
 * Build WhatsApp message content based on template
 */
function buildWhatsAppMessage(templateId: string, variables: Record<string, string>): string {
  const templates: Record<string, string> = {
    new_quote_user: `👋 Hi ${variables.name || "there"}!

Your Smart Home quote request (${variables.id}) has been received. 🏠

Our team will review your requirements and send a detailed estimation soon.

View your quote: https://smilesmarthome.com/dashboard/user/my-quotes

- Smile Smart Home Team`,

    estimation_ready: `🎉 Great news, ${variables.name || "there"}!

Your quote estimation for ${variables.id} is ready!

Check your email for full details or view it in your dashboard.

Questions? Reply here or call our support team.

- Smile Smart Home Team`,
  };

  return templates[templateId] || templates.new_quote_user;
}

// ===== Full chat with OpenAI including Firestore persistence =====
// request.data: { messages: {role:'system'|'user'|'assistant', content:string}[], model?: string, sessionId?: string, ticketId?: string }
// response: { reply: string, sessionId: string, requiresTicket?: boolean, ticketDetails?: any, deviceSelection?: any }
export const chatWithOpenAI = onCall(
  { secrets: [OPENAI_API_KEY], cors: true },
  async (request: CallableRequest): Promise<{
    reply: string;
    sessionId: string;
    requiresTicket?: boolean;
    ticketDetails?: any;
    deviceSelection?: any;
    debugInfo?: any;
    recommendations?: any[];
  }> => {
  const authCtx = request.auth;
  if (!authCtx) throw new HttpsError("unauthenticated", "Must be authenticated.");

  // AI Device Recommendation Mode
  if (request.data?.recommendations) {
    const { houseSize, priority, budget } = request.data.recommendations;
    const apiKey = OPENAI_API_KEY.value();
    if (!apiKey) throw new HttpsError("failed-precondition", "OPENAI_API_KEY is not configured");

    const systemPrompt = `
      You are a professional Smart Home Consultant for "Smile Smart Homes".
      Your goal is to recommend a tailored set of smart home devices based on:
      - House Size: ${houseSize}
      - Security Priority: ${priority}
      - Estimated Budget: ${budget}

      Guidelines:
      - Small homes/apartments should focus on essentials.
      - Larger homes should include mesh networking and more sensors.
      - High Security: Advanced CCTV, Motion Sensors, Smart Locks, Alarm System.
      - Low Budget: High-impact, low-cost devices (Smart Bulbs, Multi-plugs).

      Return ONLY a JSON object with a "recommendations" key containing an array of objects with the following schema:
      {
        "recommendations": [
          {
            "name": "Device Name",
            "category": "Lighting/Security/Convenience/etc",
            "reason": "Why this is recommended for them in 1 short sentence",
            "estimatedPrice": 120
          }
        ]
      }
      Limit to 3-6 of the most relevant devices.
    `;

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: "Generate my recommendations." }
          ],
          temperature: 0.5,
          response_format: { type: "json_object" }
        }),
      });

      if (!response.ok) {
        throw new HttpsError("internal", "Failed to get recommendations from AI.");
      }

      const result = await response.json();
      const content = result.choices[0].message.content;
      const parsed = JSON.parse(content);
      
      return {
        reply: "Here are your custom smart home recommendations.",
        sessionId: "recommendation",
        recommendations: parsed.recommendations || []
      };
    } catch (e: any) {
      throw new HttpsError("internal", e.message || "Error generating recommendations");
    }
  }

  const msgs = request.data?.messages as Array<{ role: string; content: string }> | undefined;
  const model = (request.data?.model as string | undefined) || CONFIG.OPENAI.MODEL;
  const providedTicketId = (request.data?.ticketId as string | undefined)?.trim();
  const noTicket: boolean = Boolean(request.data?.noTicket);
  const skipTicketId = (request.data?.skipTicketId as string | undefined)?.trim();
  const debug: boolean = Boolean(request.data?.debug);
  let sessionId: string = (request.data?.sessionId as string | undefined)?.trim() || "";

  if (!sessionId && authCtx?.uid) {
    sessionId = `live_${authCtx.uid}`;
  }
  if (!sessionId) {
    sessionId = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
  if (!Array.isArray(msgs) || msgs.length === 0) {
    throw new HttpsError("invalid-argument", "messages array is required");
  }


  // Clean and bound context
  const clean = msgs
    .filter((m) => m && typeof m.role === "string" && typeof m.content === "string")
    .slice(-12)
    .map((m) => ({
      role: m.role === "system" || m.role === "assistant" || m.role === "user" ? m.role : "user",
      content: m.content.slice(0, 4000),
    }));

  const apiKey = OPENAI_API_KEY.value();
  if (!apiKey) throw new HttpsError("failed-precondition", "OPENAI_API_KEY is not configured");

  // Apply consolidated rate limiting
  const uid = authCtx.uid;
  try {
    await applyRateLimit(uid);
  } catch (e) {
    if (e instanceof HttpsError && e.code === "resource-exhausted") throw e;
  }

  // Persist chat session
  const sessionsCol = db.collection(CONFIG.COLLECTIONS.CHAT_SESSIONS);
  const now = Date.now();
  try {
    await sessionsCol.doc(sessionId).set(
      {
        ownerUid: uid,
        createdAt: now,
        updatedAt: now,
        status: "active",
        model,
        type: "ai",
        ...(providedTicketId ? { activeTicketId: providedTicketId } : {}),
      },
      { merge: true },
    );
    const lastUser = [...clean].reverse().find((m) => m.role === "user");
    if (lastUser) {
      await sessionsCol.doc(sessionId).collection("messages").add({ role: "user", content: lastUser.content, ts: now });
    }
  } catch {}

  // Optional server-side safeguard: cancel ticket when explicitly requested by client
  try {
    if (noTicket && skipTicketId) {
      const tRef = db.collection(CONFIG.COLLECTIONS.TICKETS).doc(skipTicketId);
      const tSnap = await tRef.get();
      if (tSnap.exists) {
        const t = tSnap.data() as any;
        if (t.uid === uid && String(t.status).toLowerCase() === 'pending') {
          await tRef.set({ status: 'cancelled', manuallyUnbound: true, updatedAt: Date.now() }, { merge: true });
        }
      }
    }
  } catch {}

  // Device and profile context for better answers
  const { userDevices, deviceSummaries } = await loadUserDevicesAndSummaries(uid);

  // Fetch basic user profile (non-sensitive)
  let userProfile: any = null;
  try {
    const acctSnap = await db.collection(CONFIG.COLLECTIONS.ACCOUNTS).doc(uid).get();
    if (acctSnap.exists) {
      const a = acctSnap.data() as any;
      userProfile = {
        displayName: a?.displayName || a?.name || undefined,
        plan: a?.plan || a?.subscription || undefined,
        city: a?.city || a?.location?.city || undefined,
        state: a?.state || a?.location?.state || undefined,
        country: a?.country || a?.location?.country || undefined,
        timezone: a?.timezone || undefined,
      };
    }
  } catch (e) {
    console.warn("Failed to fetch user profile:", e);
  }

  // Normalization helpers for robust serial matching (alphanumeric, ignore separators)
  const normalize = (s: any) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const last4Of = (s: any) => normalize(s).slice(-4);
  const extractUserLast4Candidates = (text: string): Set<string> => {
    const set = new Set<string>();
    const tokens = String(text).match(/[a-z0-9]{4,}/gi) || [];
    for (const tk of tokens) {
      // Only consider tokens that contain at least one digit to avoid matching common words
      if (!/[0-9]/.test(tk)) continue;
      const n = normalize(tk);
      if (n.length >= 4) set.add(n.slice(-4));
    }
    return set;
  };

  // Build lightweight debug info for client-side verification (kept)
  const debugInfo = debug
    ? {
        queriedCollection: CONFIG.COLLECTIONS.DEVICES,
        authUid: uid,
        deviceDocs: (userDevices as any[]).map((d) => ({
          id: d.id,
          uid: d.uid,
          serials: Array.isArray(d.serials)
            ? d.serials.map((e: any) => ({ serialNumber: e?.serialNumber, warrantyExpiry: e?.warrantyExpiry || e?.warrantyEnd }))
            : [],
          deviceSerial: d.deviceSerial || null,
          serial: d.serial || null,
          serialNumber: d.serialNumber || null,
        })),
      }
    : undefined;

  // Compose human-readable context blocks
  // Detect warranty intent and try deterministic device match by model/name
  const lastUserMsg = [...clean].reverse().find((m) => m.role === "user")?.content || "";
  const isWarrantyQuestion = /\b(warranty|guarantee|coverage|warran|wty)\b/i.test(String(lastUserMsg));
  // Detect device information requests (e.g., device info/details/status/specs)
  const isDeviceInfoQuestion = /\b(device\s*(info|information|details|status)|show\s*(my\s*)?device\s*(info|details)|about\s*(this|the)\s*device|device\s*specs?|brand|model|manufacturer|give\s*me\s*(the\s*)?details\s*of|show\s*me\s*(the\s*)?details\s*of|what\s*are\s*the\s*details\s*of)\b/i.test(String(lastUserMsg));
  // Broader device-related intent detection (e.g., "show camera details", "what about my bulb")
  const deviceTokenRe = /(light|bulb|camera|cctv|plug|switch|sensor|thermostat|router|device|smart\s+light|strip|lock|curtain|blind|shade|drape|shutter|alarm|doorbell|tv)/i;
  const intentTokenRe = /(info|information|details|status|spec|specs|manual|documentation|about|show|what|how|guide|help)/i;
  const isDeviceRelatedQuestion = deviceTokenRe.test(String(lastUserMsg)) && intentTokenRe.test(String(lastUserMsg));
  // Problem / not-working detection (expanded coverage)
  // But exclude messages that are just serial numbers
  const isJustSerialNumber = /^[A-Za-z0-9\-]{6,}$/.test(String(lastUserMsg).trim());
  const isProblemIssue = !isJustSerialNumber && /(\bnot\s*working\b|doesn['’]?t\s*work|doesnt\s*work|\bproblem\b|\bissue\b|\bbroken\b|malfunction(ing)?|stopped\s*working|not\s*respond(ing)?|unresponsive|offline|disconnected|disconnect(ing)?|cannot\s*connect|can't\s*connect|won'?t\s*turn\s*on|no\s*power|error|fault|crash(ed)?|freeze|frozen|lag(gy)?|slow|overheat(ing)?) /i.test(String(lastUserMsg));

  // Global serial detector: acknowledge serial presence and prompt next action when no explicit intent
  let globalSerialMatchedDevice: any = null;
  let globalSerialMatchedSerialRaw: string | null = null;
  if (!isWarrantyQuestion && !isDeviceInfoQuestion && !isProblemIssue && userDevices.length > 0) {
    const text = String(lastUserMsg || '');
    const textNorm = normalize(text);
    const userLast4 = extractUserLast4Candidates(text);
    // Try full normalized include across all serial fields
    for (const d of userDevices) {
      const baseSerials = [d.deviceSerial, d.serial, d.serialNumber].filter(Boolean).map((s: any) => String(s).trim());
      const arraySerials = Array.isArray(d.serials) ? d.serials.map((e: any) => String(e?.serialNumber || '').trim()).filter(Boolean) : [];
      const allSerials = [...baseSerials, ...arraySerials].filter(Boolean);
      const hit = allSerials.find((s) => s && textNorm.includes(normalize(s)));
      if (hit) { globalSerialMatchedDevice = d; globalSerialMatchedSerialRaw = hit; break; }
    }
    // If not found, try unique last-4
    if (!globalSerialMatchedDevice && userLast4.size > 0) {
      type Cand = { device: any; serial: string };
      const matches: Cand[] = [];
      for (const d of userDevices) {
        const baseSerials = [d.deviceSerial, d.serial, d.serialNumber].filter(Boolean).map((s: any) => String(s).trim());
        const arraySerials = Array.isArray(d.serials) ? d.serials.map((e: any) => String(e?.serialNumber || '').trim()).filter(Boolean) : [];
        const allSerials = [...baseSerials, ...arraySerials].filter(Boolean);
        for (const s of allSerials) {
          if (userLast4.has(last4Of(s))) matches.push({ device: d, serial: s });
        }
      }
      if (matches.length === 1) {
        globalSerialMatchedDevice = matches[0].device;
        globalSerialMatchedSerialRaw = matches[0].serial;
      }
    }
    if (globalSerialMatchedDevice && globalSerialMatchedSerialRaw) {
      try {
        await sessionsCol.doc(sessionId).set({
          lastMatchedDeviceId: globalSerialMatchedDevice.id,
          lastMatchedSerial: globalSerialMatchedSerialRaw,
          lastMatchedAt: Date.now()
        }, { merge: true });
      } catch {}
    }
  }

  // Match by serial for problem-related intents (independent of warranty flow)
  let problemMatchedDevice: any = null;
  let problemMatchedSerialRaw: string | null = null;
  if ((isProblemIssue || isDeviceRelatedQuestion) && userDevices.length > 0) {
    const text = String(lastUserMsg || '');
    const textNorm = normalize(text);
    const userLast4 = extractUserLast4Candidates(text);
    // Try full normalized include
    for (const d of userDevices) {
      const baseSerials = [d.deviceSerial, d.serial, d.serialNumber].filter(Boolean).map((s: any) => String(s).trim());
      const arraySerials = Array.isArray(d.serials) ? d.serials.map((e: any) => String(e?.serialNumber || '').trim()).filter(Boolean) : [];
      const allSerials = [...baseSerials, ...arraySerials].filter(Boolean);
      const hit = allSerials.find((s) => s && textNorm.includes(normalize(s)));
      if (hit) { problemMatchedDevice = d; problemMatchedSerialRaw = hit; break; }
    }
    // If not found, try unique last-4 resolution
    if (!problemMatchedDevice && userLast4.size > 0) {
      type Cand = { device: any; serial: string };
      const matches: Cand[] = [];
      for (const d of userDevices) {
        const baseSerials = [d.deviceSerial, d.serial, d.serialNumber].filter(Boolean).map((s: any) => String(s).trim());
        const arraySerials = Array.isArray(d.serials) ? d.serials.map((e: any) => String(e?.serialNumber || '').trim()).filter(Boolean) : [];
        const allSerials = [...baseSerials, ...arraySerials].filter(Boolean);
        for (const s of allSerials) {
          if (userLast4.has(last4Of(s))) matches.push({ device: d, serial: s });
        }
      }
      if (matches.length === 1) {
        problemMatchedDevice = matches[0].device;
        problemMatchedSerialRaw = matches[0].serial;
      }
    }
    // If still not found, try session-persisted last match (for follow-up troubleshooting)
    if (!problemMatchedDevice) {
      try {
        const sSnap = await sessionsCol.doc(sessionId).get();
        const sData = sSnap.data();
        const lastId = (sData as any)?.lastMatchedDeviceId;
        const lastSerial = (sData as any)?.lastMatchedSerial;
        if (lastId || lastSerial) {
          for (const d of userDevices) {
            const base = [d.deviceSerial, d.serial, d.serialNumber]
              .filter(Boolean)
              .map((x: any) => String(x).trim().toLowerCase());
            const arr = Array.isArray(d.serials)
              ? d.serials.map((e: any) => String(e?.serialNumber || '').trim().toLowerCase()).filter(Boolean)
              : [];
            const all = [...base, ...arr];
            const idHit = lastId && d.id === lastId;
            const serialHit = lastSerial && all.includes(String(lastSerial).trim().toLowerCase());
            if (idHit || serialHit) {
              problemMatchedDevice = d;
              problemMatchedSerialRaw = lastSerial || (d.serialNumber || d.serial || d.deviceSerial) || null;
              break;
            }
          }
        }
      } catch {}
    }
  }

  // Determine device info match ONLY by full serial equality (case-insensitive, ignoring non-alphanumerics).
  // If no exact serial is present in the user's message, ask for full serial.
  let deviceInfoMatched: any = null;
  let deviceInfoMessage: string | null = null;
  let multiDeviceInfoMessage: string | null = null; // kept for API compatibility; unused now
  // New: fallback matches by name/type/model keywords when no serial is provided but intent is for device details
  let deviceInfoMessageByName: string | null = null;
  let deviceSelectionByName: { devices: Array<{ id: string; name: string; type: string; model: string; serial?: string }> } | null = null;
  if (isDeviceInfoQuestion && userDevices.length > 0) {
    const textRaw = String(lastUserMsg || '');
    const textTokens = (textRaw.match(/[A-Za-z0-9\-]{6,}/g) || []).map((t) => normalize(t));
    const userSerialSet = new Set(textTokens);
    for (const d of userDevices) {
      const baseSerials = [d.deviceSerial, d.serial, d.serialNumber]
        .filter(Boolean)
        .map((s: any) => normalize(String(s).trim()));
      const arraySerials = Array.isArray(d.serials)
        ? d.serials.map((e: any) => normalize(String(e?.serialNumber || '').trim())).filter(Boolean)
        : [];
      const allSerials = [...baseSerials, ...arraySerials].filter(Boolean);
      const hit = allSerials.find((s) => s && userSerialSet.has(s));
      if (hit) { deviceInfoMatched = d; break; }
    }
    if (deviceInfoMatched) {
      // Persist matched device and serial for session continuity in device-info flow
      try {
        const rawSerial = (deviceInfoMatched.deviceSerial || deviceInfoMatched.serial || deviceInfoMatched.serialNumber || '').toString();
        await sessionsCol.doc(sessionId).set({
          lastMatchedDeviceId: deviceInfoMatched.id,
          lastMatchedSerial: rawSerial || null,
          lastMatchedAt: Date.now()
        }, { merge: true });
      } catch {}
      const mask = (s: any) => {
        const v = typeof s === 'string' ? s : '';
        if (!v) return '';
        const last4 = v.slice(-4);
        return v.length > 4 ? `***${last4}` : `***${last4}`;
      };
      const serialMasked = mask(deviceInfoMatched.deviceSerial || deviceInfoMatched.serial || deviceInfoMatched.serialNumber || '');
      const name = deviceInfoMatched.deviceName || deviceInfoMatched.name || 'Device';
      const type = deviceInfoMatched.deviceType || deviceInfoMatched.type || 'Device';
      const model = deviceInfoMatched.deviceModel || deviceInfoMatched.model || deviceInfoMatched.modelNumber || '';
      const brand = deviceInfoMatched.brand || deviceInfoMatched.manufacturer || deviceInfoMatched.vendor || deviceInfoMatched.make || '';
      const warranty = deviceInfoMatched.warrantyExpiry || deviceInfoMatched.warrantyEnd || undefined;
      const documentation = deviceInfoMatched.documentation || deviceInfoMatched.manualUrl || undefined;
      const lines = [
        `Here are the device details I found:`,
        `- Name: ${name}`,
        `- Type: ${type}`,
        model ? `- Model: ${model}` : '',
        brand ? `- Brand: ${brand}` : '',
        serialMasked ? `- Serial: ${serialMasked} (masked)` : '',
        warranty ? `- Warranty expiry: ${warranty}` : '',
        documentation ? `- Docs: ${documentation}` : '',
      ].filter(Boolean);
      deviceInfoMessage = lines.join('\n');
    }
    // If not matched by serial, try deterministic name/type/model keyword matching
    if (!deviceInfoMatched) {
      try {
        const lower = String(lastUserMsg || '').toLowerCase();
        const keywordCandidates = ['curtain','blind','shade','drape','shutter','camera','cctv','plug','switch','sensor','thermostat','router','light','bulb','strip','lock'];
        const mentioned = keywordCandidates.filter(k => lower.includes(k));
        if (mentioned.length > 0) {
          const candidates: any[] = [];
          for (const d of userDevices as any[]) {
            const name = String(d.deviceName || d.name || '').toLowerCase();
            const type = String(d.deviceType || d.type || '').toLowerCase();
            const model = String(d.deviceModel || d.model || d.modelNumber || '').toLowerCase();
            const hay = `${name} ${type} ${model}`;
            if (mentioned.some(k => hay.includes(k))) candidates.push(d);
          }
          if (candidates.length === 1) {
            const dev = candidates[0];
            const mask = (s: any) => {
              const v = typeof s === 'string' ? s : '';
              if (!v) return '';
              const last4 = v.slice(-4);
              return v.length > 4 ? `***${last4}` : `***${last4}`;
            };
            const serialMasked = mask(dev.deviceSerial || dev.serial || dev.serialNumber || '');
            const name = dev.deviceName || dev.name || 'Device';
            const type = dev.deviceType || dev.type || 'Device';
            const model = dev.deviceModel || dev.model || dev.modelNumber || '';
            const brand = dev.brand || dev.manufacturer || dev.vendor || dev.make || '';
            const warranty = dev.warrantyExpiry || dev.warrantyEnd || undefined;
            const documentation = dev.documentation || dev.manualUrl || undefined;
            const lines = [
              `Here are the device details I found:`,
              `- Name: ${name}`,
              `- Type: ${type}`,
              model ? `- Model: ${model}` : '',
              brand ? `- Brand: ${brand}` : '',
              serialMasked ? `- Serial: ${serialMasked} (masked)` : '',
              warranty ? `- Warranty expiry: ${warranty}` : '',
              documentation ? `- Docs: ${documentation}` : '',
            ].filter(Boolean);
            deviceInfoMessageByName = lines.join('\n');
          } else if (candidates.length > 1) {
            const mapped = candidates.map((doc: any) => ({
              id: String(doc.id),
              name: doc.deviceName || doc.name || 'Unknown Device',
              type: doc.deviceType || doc.type || 'Unknown Type',
              model: doc.deviceModel || doc.model || '',
              serial: doc.deviceSerial || doc.serial || ''
            }));
            deviceSelectionByName = { devices: mapped };
          }
        }
      } catch {}
    }
  }

  // Build fast lookup for device matching using names, models, and types
  const matchedDeviceIndexList: number[] = [];
  if (isWarrantyQuestion && deviceSummaries.length > 0) {
    const text = String(lastUserMsg).toLowerCase();
    deviceSummaries.forEach((d: any, i: number) => {
      const nameStr = String(d.name || "").toLowerCase();
      const modelStr = String(d.model || "").toLowerCase();
      const typeStr = String(d.type || "").toLowerCase();
      const nameHit = nameStr && text.includes(nameStr);
      const modelHit = modelStr && text.includes(modelStr);
      // allow loose contains for broader type/name keywords
      const tokens = [
        "cctv","camera","plug","light","smart light","bulb","lamp","led","strip","lightstrip","light strip","lighting",
        "sensor","switch","thermostat","router","night vision"
      ]; 
      const anyTokenInText = tokens.some(tk => text.includes(tk));
      const typeHit = typeStr && (text.includes(typeStr) || tokens.some(tk => text.includes(tk) && typeStr.includes(tk)));
      const nameTokenHit = anyTokenInText && tokens.some(tk => nameStr.includes(tk));
      const modelTokenHit = anyTokenInText && tokens.some(tk => modelStr.includes(tk));
      if (nameHit || modelHit || typeHit || nameTokenHit || modelTokenHit) matchedDeviceIndexList.push(i);
    });
  }

  // If exactly one match, prepare deterministic warranty context
  let warrantyContext = "";
  let deterministicWarrantyMessage: string | null = null;
  let multiWarrantyMessage: string | null = null;

  // Track if user's message contains a serial belonging to their devices
  let matchedSerialRaw: string | null = null;
  let matchedBySerial: any = null;

  // First, try to match warranty by explicit serial in the user's message (exact normalized equality)
  if (isWarrantyQuestion && userDevices.length > 0) {
    const text = String(lastUserMsg || '');
    const userTokens = (text.match(/[A-Za-z0-9\-]{6,}/g) || []).map((t) => normalize(t));
    const userSerialSet = new Set(userTokens);
    const userLast4 = extractUserLast4Candidates(text);
    // Prefer exact equality against top-level serialNumber
    for (const d of userDevices) {
      const top = (d.serialNumber || d.serial || d.deviceSerial || '').toString().trim();
      const topN = normalize(top);
      if (topN && userSerialSet.has(topN)) { matchedBySerial = d; matchedSerialRaw = top || null; break; }
    }
    // If not matched by top-level, try any serial fields equality (including legacy array)
    if (!matchedBySerial) {
      for (const d of userDevices) {
        const baseSerials = [d.deviceSerial, d.serial, d.serialNumber]
          .filter(Boolean)
          .map((s: any) => String(s).trim());
        const arraySerials = Array.isArray(d.serials)
          ? d.serials.map((e: any) => String(e?.serialNumber || '').trim()).filter(Boolean)
          : [];
        const allSerials = [...baseSerials, ...arraySerials].filter(Boolean);
        const hit = allSerials.find((s) => s && userSerialSet.has(normalize(s)));
        if (hit) { matchedBySerial = d; matchedSerialRaw = hit; break; }
      }
    }
    // If not found, try unique last-4 resolution across all devices
    if (!matchedBySerial && userLast4.size > 0) {
      type Cand = { device: any; serial: string };
      const matches: Cand[] = [];
      for (const d of userDevices) {
        const baseSerials = [d.deviceSerial, d.serial, d.serialNumber].filter(Boolean).map((s: any) => String(s).trim());
        const arraySerials = Array.isArray(d.serials) ? d.serials.map((e: any) => String(e?.serialNumber || '').trim()).filter(Boolean) : [];
        const allSerials = [...baseSerials, ...arraySerials].filter(Boolean);
        for (const s of allSerials) {
          if (userLast4.has(last4Of(s))) matches.push({ device: d, serial: s });
        }
      }
      if (matches.length === 1) {
        matchedBySerial = matches[0].device;
        matchedSerialRaw = matches[0].serial;
      } else if (matches.length > 1) {
        // Ambiguous last-4: build an explicit message listing candidates and ask for full serial
        const lines: string[] = [
          'I found multiple devices that match the serial ending you provided:'
        ];
        for (const m of matches.slice(0, 5)) {
          const dev = m.device;
          const name = dev.deviceName || dev.name || 'Device';
          const model = dev.deviceModel || dev.model || dev.modelNumber || '';
          const snMasked = `***${String(m.serial).slice(-4)}`;
          lines.push(`- ${name}${model ? ` (${model})` : ''}: ${snMasked}`);
        }
        lines.push('Please enter the full device serial number to fetch the exact warranty.');
        multiWarrantyMessage = lines.join('\n');
      }
    }
    if (!matchedBySerial) {
      // Try name/type/model keywords from current message before using session fallback
      const lower = String(lastUserMsg || '').toLowerCase();
      const keywords = ['alarm','doorbell','curtain','blind','shade','shutter','camera','cctv','plug','switch','sensor','thermostat','router','light','bulb','strip','lock','tv'];
      const mentioned = keywords.filter(k => lower.includes(k));
      if (mentioned.length > 0) {
        const candidates: any[] = [];
        for (const d of userDevices as any[]) {
          const name = String(d.deviceName || d.name || '').toLowerCase();
          const type = String(d.deviceType || d.type || '').toLowerCase();
          const model = String(d.deviceModel || d.model || d.modelNumber || '').toLowerCase();
          const hay = `${name} ${type} ${model}`;
          if (mentioned.some(k => hay.includes(k))) candidates.push(d);
        }
        if (candidates.length === 1) {
          matchedBySerial = candidates[0];
          matchedSerialRaw = null; // device-level match only
        } else if (candidates.length > 1) {
          const lines: string[] = [
            'I found multiple devices related to your request:'
          ];
          for (const dev of candidates.slice(0, 5)) {
            const nm = dev.deviceName || dev.name || 'Device';
            const mdl = dev.deviceModel || dev.model || dev.modelNumber || '';
            const sn = String(dev.serialNumber || dev.serial || dev.deviceSerial || '').trim();
            const masked = sn ? `***${sn.slice(-4)}` : '';
            lines.push(`- ${nm}${mdl ? ` (${mdl})` : ''}${masked ? `: ${masked}` : ''}`);
          }
          lines.push('Please enter the full device serial number to fetch the exact warranty.');
          multiWarrantyMessage = lines.join('\n');
        }
      }
    }

    if (!matchedBySerial && !multiWarrantyMessage) {
      // Also try the last assistant message (which often echoes the user's device name)
      try {
        const lastAssistantRaw = [...clean].reverse().find((m) => m.role === 'assistant')?.content ?? '';
        const la = String(lastAssistantRaw || '').toLowerCase();
        const keywords = ['alarm','doorbell','curtain','blind','shade','shutter','camera','cctv','plug','switch','sensor','thermostat','router','light','bulb','strip','lock','tv'];
        const mentioned = keywords.filter(k => la.includes(k));
        if (mentioned.length > 0) {
          const candidates: any[] = [];
          for (const d of userDevices as any[]) {
            const name = String(d.deviceName || d.name || '').toLowerCase();
            const type = String(d.deviceType || d.type || '').toLowerCase();
            const model = String(d.deviceModel || d.model || d.modelNumber || '').toLowerCase();
            const hay = `${name} ${type} ${model}`;
            if (mentioned.some(k => hay.includes(k))) candidates.push(d);
          }
          if (candidates.length === 1) {
            matchedBySerial = candidates[0];
            matchedSerialRaw = null;
            try {
              await sessionsCol.doc(sessionId).set({ lastMatchedDeviceId: matchedBySerial.id, lastMatchedSerial: null, lastMatchedAt: Date.now() }, { merge: true });
            } catch {}
          } else if (candidates.length > 1) {
            const lines: string[] = [
              'I found multiple devices related to your request:'
            ];
            for (const dev of candidates.slice(0, 5)) {
              const nm = dev.deviceName || dev.name || 'Device';
              const mdl = dev.deviceModel || dev.model || dev.modelNumber || '';
              const sn = String(dev.serialNumber || dev.serial || dev.deviceSerial || '').trim();
              const masked = sn ? `***${sn.slice(-4)}` : '';
              lines.push(`- ${nm}${mdl ? ` (${mdl})` : ''}${masked ? `: ${masked}` : ''}`);
            }
            lines.push('Please enter the full device serial number to fetch the exact warranty.');
            multiWarrantyMessage = lines.join('\n');
          }
        }
      } catch {}
    }

    if (!matchedBySerial && !multiWarrantyMessage) {
      // Session fallback only when no explicit device mention resolved the target
      try {
        const sSnap = await sessionsCol.doc(sessionId).get();
        const sData = sSnap.data();
        const lastId = (sData as any)?.lastMatchedDeviceId;
        const lastSerial = (sData as any)?.lastMatchedSerial;
        const lastN = lastSerial ? normalize(String(lastSerial)) : '';
        if (lastId || lastSerial) {
          // Prefer top-level serialNumber equality first
          for (const d of userDevices) {
            const top = (d.serialNumber || d.serial || d.deviceSerial || '').toString().trim();
            const topN = normalize(top);
            const idHit = lastId && d.id === lastId;
            if ((lastN && topN === lastN) || idHit) { matchedBySerial = d; matchedSerialRaw = lastSerial || top || null; break; }
          }
          // If still not found, try any serial fields equality
          if (!matchedBySerial) {
            for (const d of userDevices) {
              const base = [d.deviceSerial, d.serial, d.serialNumber]
                .filter(Boolean)
                .map((x: any) => String(x).trim());
              const arr = Array.isArray(d.serials)
                ? d.serials.map((e: any) => String(e?.serialNumber || '').trim()).filter(Boolean)
                : [];
              const all = [...base, ...arr];
              const serialHit = lastN && all.some((s) => normalize(s) === lastN);
              if (serialHit) { matchedBySerial = d; matchedSerialRaw = lastSerial || (d.serialNumber || d.serial || d.deviceSerial) || null; break; }
            }
          }
        }
      } catch {}
    }
    if (matchedBySerial) {
      // Persist matched device and serial for session continuity in warranty flow
      try {
        const rawSerial = (matchedSerialRaw || matchedBySerial.deviceSerial || matchedBySerial.serial || matchedBySerial.serialNumber || '').toString();
        await sessionsCol.doc(sessionId).set({
          lastMatchedDeviceId: matchedBySerial.id,
          lastMatchedSerial: rawSerial || null,
          lastMatchedAt: Date.now()
        }, { merge: true });
      } catch {}
      const pickWarrantyVal = (val: any): string => {
        try {
          if (!val) return '';
          const anyVal: any = val as any;
          if (typeof anyVal?.toDate === 'function') {
            return anyVal.toDate().toLocaleDateString();
          }
          if (typeof anyVal === 'number') return new Date(anyVal).toLocaleDateString();
          const parsed = Date.parse(String(anyVal));
          if (!Number.isNaN(parsed)) return new Date(parsed).toLocaleDateString();
          return String(anyVal);
        } catch { return String(val); }
      };
      // Prefer top-level warrantyExpiry on the User_Devices doc (new schema)
      let warrantyVal: string | '' = pickWarrantyVal(matchedBySerial.warrantyExpiry || matchedBySerial.warrantyEnd || undefined);
      // Fallback: if not available, try legacy serials[] matching the provided serial
      if (!warrantyVal && Array.isArray(matchedBySerial.serials) && matchedBySerial.serials.length > 0 && matchedSerialRaw) {
        const entry = matchedBySerial.serials.find((e: any) => String(e?.serialNumber || '').trim().toLowerCase() === String(matchedSerialRaw).toLowerCase());
        if (entry?.warrantyExpiry || entry?.warrantyEnd) {
          warrantyVal = pickWarrantyVal(entry.warrantyExpiry || entry.warrantyEnd);
        }
      }
      const name = matchedBySerial.deviceName || matchedBySerial.name || 'Device';
      const model = matchedBySerial.deviceModel || matchedBySerial.model || matchedBySerial.modelNumber || '';
      const label = `${name}${model ? ` (${model})` : ''}`;
      if (warrantyVal) {
        const brand = matchedBySerial.brand || matchedBySerial.manufacturer || matchedBySerial.vendor || matchedBySerial.make || '';
        const multiSerials = Array.isArray(matchedBySerial.serials) ? matchedBySerial.serials : [];
        // If a specific serial was matched, only show warranty for that serial
        if (multiSerials.length > 1 && matchedSerialRaw) {
          // Find the specific serial that was matched
          const matchedSerial = multiSerials.find((se: any) => {
            const snRaw = String(se?.serialNumber || '').trim();
            return snRaw && normalize(snRaw) === normalize(matchedSerialRaw);
          });
          
          if (matchedSerial) {
            // Show only the warranty for the matched serial
            const snRaw = String(matchedSerial?.serialNumber || '').trim();
            const snMasked = snRaw ? `***${snRaw.slice(-4)}` : '';
            const wv = pickWarrantyVal(matchedSerial?.warrantyExpiry || matchedSerial?.warrantyEnd) || 'Warranty not available';
            deterministicWarrantyMessage = `Warranty for ${label} with serial ${snMasked}: ${wv}`;
            warrantyContext = `\nWARRANTY CONTEXT:\n${deterministicWarrantyMessage}\n`;
          } else {
            // Fallback: show all if specific match not found
            const listLines: string[] = [`Warranties for ${label}:`];
            for (const se of multiSerials) {
              const snRaw = String(se?.serialNumber || '').trim();
              const snMasked = snRaw ? `***${snRaw.slice(-4)}` : '(serial)';
              const wv = pickWarrantyVal(se?.warrantyExpiry || se?.warrantyEnd) || 'Warranty not available';
              listLines.push(`- ${snMasked}: ${wv}`);
            }
            deterministicWarrantyMessage = listLines.join('\n');
            warrantyContext = `\nWARRANTY CONTEXT:\n${deterministicWarrantyMessage}\n`;
          }
        } else if (multiSerials.length > 1) {
          // No specific serial matched, show all for clarity
          const listLines: string[] = [`Warranties for ${label}:`];
          for (const se of multiSerials) {
            const snRaw = String(se?.serialNumber || '').trim();
            const snMasked = snRaw ? `***${snRaw.slice(-4)}` : '(serial)';
            const wv = pickWarrantyVal(se?.warrantyExpiry || se?.warrantyEnd) || 'Warranty not available';
            listLines.push(`- ${snMasked}: ${wv}`);
          }
          deterministicWarrantyMessage = listLines.join('\n');
          warrantyContext = `\nWARRANTY CONTEXT:\n${deterministicWarrantyMessage}\n`;
        } else {
          // Single serial/device-level path
          const serialRaw = matchedBySerial.deviceSerial || matchedBySerial.serial || matchedBySerial.serialNumber || '';
          const serialMasked = typeof serialRaw === 'string' && serialRaw ? `***${String(serialRaw).slice(-4)}` : '';
          const lines: string[] = [
            `Here are the device details based on the provided serial:`,
            `- Name: ${name}`,
            model ? `- Model: ${model}` : '',
            brand ? `- Brand: ${brand}` : '',
            serialMasked ? `- Serial: ${serialMasked} (masked)` : '',
            `- Warranty expiry: ${warrantyVal}`,
          ].filter(Boolean);
          deterministicWarrantyMessage = lines.join('\n');
          warrantyContext = `\nWARRANTY CONTEXT:\n- ${label}: Warranty expiry: ${warrantyVal}\n`;
        }
      }
    }
  }


  const profileContext = userProfile
    ? `USER PROFILE:\n- Name: ${userProfile.displayName || 'User'}\n` +
      `${userProfile.plan ? `- Plan: ${userProfile.plan}\n` : ''}` +
      `${userProfile.city || userProfile.state || userProfile.country ? `- Location: ${[userProfile.city, userProfile.state, userProfile.country].filter(Boolean).join(', ')}\n` : ''}` +
      `${userProfile.timezone ? `- Timezone: ${userProfile.timezone}\n` : ''}`
    : '';

  const deviceContext = deviceSummaries.length > 0
    ? `DEVICES:\n` + deviceSummaries.map((d: any, i: number) => (
        `#${i + 1} ${d.name} (${d.type})\n` +
        `${d.model ? `  - Model: ${d.model}\n` : ''}` +
        `${d.serial ? `  - Serial: ${d.serial} (masked)\n` : ''}` +
        `${d.lastSeen ? `  - Last seen: ${new Date(d.lastSeen?.toDate?.() || d.lastSeen).toLocaleString?.() || d.lastSeen}\n` : ''}` +
        `${d.room ? `  - Location: ${d.room}\n` : ''}` +
        `${d.warrantyCombined ? `  - Warranty expiry: ${d.warrantyCombined}\n` : ''}`
      )).join('')
    : '';

  // DEBUG: Dump user device serial-related fields to logs to verify availability
  try {
    console.log("=== DEBUG USER DEVICES & SERIALS ===");
    console.log("Devices collection:", CONFIG.COLLECTIONS.DEVICES);
    console.log("User devices count:", userDevices.length);
    for (const d of userDevices as any[]) {
      console.log("USER_DEVICE DOC:", d.id, d.deviceName || d.name || d.deviceType || d.type);
      const serialArr = Array.isArray(d.serials) ? d.serials : [];
      // Only log safe summary of serial entries
      const serialSummary = serialArr.map((e: any) => ({ serialNumber: e?.serialNumber, warrantyExpiry: e?.warrantyExpiry || e?.warrantyEnd }));
      console.log("USER_DEVICE serials[]:", JSON.stringify(serialSummary, null, 2));
      console.log("USER_DEVICE deviceSerial:", d.deviceSerial, "serial:", d.serial);
    }
    console.log("=== END DEBUG USER DEVICES & SERIALS ===");
  } catch (e) {
    console.warn("Failed to log user devices serials:", e);
  }

  // Enhanced active tickets context with all required fields
  let ticketContext = "";
  let activeTicket = null;

  try {
    // Determine active ticket strictly by provided ticket or session-bound activeTicketId when not in noTicket mode.
    if (!noTicket && providedTicketId) {
      const ticketDoc = await db.collection(CONFIG.COLLECTIONS.TICKETS).doc(providedTicketId).get();
      const ticketData = ticketDoc.data();
      if (ticketDoc.exists && ticketData && ticketData.uid === uid) {
        activeTicket = { ticketId: providedTicketId, data: ticketData as any };
      }
    } else if (!noTicket) {
      // Try to read session-bound activeTicketId and use it; do NOT fallback to latest unresolved
      try {
        const sSnap = await sessionsCol.doc(sessionId).get();
        const sData = sSnap.data();
        const sessTid = (sData?.activeTicketId as string | undefined) || undefined;
        if (sessTid) {
          const tDoc = await db.collection(CONFIG.COLLECTIONS.TICKETS).doc(sessTid).get();
          const tData = tDoc.data();
          if (tDoc.exists && tData && tData.uid === uid) {
            activeTicket = { ticketId: sessTid, data: tData as any };
          }
        }
      } catch {}
    }

    if (activeTicket) {
      const { ticketId, data: ticketData } = activeTicket;

      // Extract all required fields from your workflow requirements
      const category = ticketData.category || "General";
      const subject = ticketData.subject || "No subject";
      const description = ticketData.description || ticketData.complaint || ticketData.issue || "No description";
      const status = ticketData.status || "Pending";
      const priority = ticketData.priority || "medium";
      // Build comprehensive context with ticket number (removed non-existent device fields)
      const ticketNumber = ticketData.ticketNumber || `#${ticketId.slice(-6).toUpperCase()}`;
      ticketContext = `\n\nACTIVE TICKET CONTEXT:
` +
        `- Ticket Number: ${ticketNumber}\n` +
        `- Ticket ID: #${ticketId}\n` +
        `- Status: ${status} | Priority: ${priority}\n` +
        `- Category: ${category}\n` +
        `- Subject: "${subject}"\n` +
        `- Description: "${description}"\n` +
        `- Created: ${new Date(ticketData.createdAt?.toDate?.() || ticketData.createdAt || Date.now()).toLocaleString()}\n` +
        `\n\nIMPORTANT: Always acknowledge this ticket context in your response.`;
    }
  } catch (error) {
    console.warn("Failed to fetch ticket context:", error);
  }


  // In-chat serial verification disabled by feature flag
  let deviceInfo: any = null;
  if (ENABLE_SERIAL_PARSING) {
    try {
      const lastUserMsgRaw = [...clean].reverse().find((m) => m.role === "user")?.content ?? "";
      const lastUserText = (typeof lastUserMsgRaw === "string" ? lastUserMsgRaw : JSON.stringify(lastUserMsgRaw));
      const serialPattern = /(?:\bserial\b|\bsn\b|s\/n)\s*(?:number)?\s*(?:is|:)?\s*([A-Za-z0-9\-]{4,})/i;
      const sm = lastUserText.match(serialPattern);
      console.log("=== IN-CHAT SERIAL PARSE ===");
      console.log("LAST USER RAW:", lastUserMsgRaw);
      console.log("MATCH RESULT:", sm);
      // Original parsing and return logic intentionally disabled.
    } catch (err) {
      console.warn("In-chat serial verification failed:", err);
    }
  }

  const systemPrompt = {
    role: "system",
    content: `You are the SmartSmile Home Support AI Assistant.

The user is authenticated inside the SmartSmile Home platform. 
You MUST follow all rules below without exception.

────────────────────────────────────────
USER CONTEXT (Dynamic – provided by backend)
- User ID: ${uid}
- User Name: ${userProfile?.displayName || 'Unknown'}
- Purchased Products: ${deviceSummaries && deviceSummaries.length ? deviceSummaries.map((d: any) => `${d.name}${d.model ? ` (${d.model})` : ''}`).slice(0, 10).join(', ') : 'None'}
- Product Specifications / Knowledge Base: ${'N/A'}
- Conversation History: ${clean.map((m: any) => `${m.role}: ${typeof m.content === 'string' ? m.content.slice(0, 160) : ''}`).slice(-6).join(' | ')}

You must use this data to personalize answers.
────────────────────────────────────────

PRIMARY ROLE:
Your job is to provide first-line support for ONLY the products the user owns.

────────────────────────────────────────
RULES FOR SUPPORT:
1. You may ONLY help with products inside ${deviceSummaries && deviceSummaries.length ? 'the user\'s purchased products' : 'the user\'s purchased products'}.
   If a user asks about something else, reply:
   “I can help only with SmartSmile Home products linked to your account.”

2. Provide step-by-step troubleshooting.
   - Be simple  
   - Clear  
   - One step at a time  

3. If the issue is unclear:
   ASK a clarifying question before giving a solution.

4. NEVER escalate yourself.
   You must ALWAYS attempt to resolve the problem first.

5. NEVER mention the evaluator model or internal system logic.

6. ALWAYS answer as “assistant”, NOT “system”, NOT “developer”.

7. If images are included, use them to diagnose the issue.

────────────────────────────────────────
STRUCTURE OF EVERY RESPONSE:
Your output must ONLY be one of the following:
A) A troubleshooting answer  
B) A clarifying question  

NEVER output:
- “I will escalate this.”
- “I will create a ticket.”
- “A human will help you.”

These actions are done by the EVALUATOR model, NOT by you.

────────────────────────────────────────
IF USER ASKS FOR HUMAN SUPPORT:
Still attempt help first.  
Example:
“I understand you want help. Let me guide you through a few steps first.”

────────────────────────────────────────
IMPORTANT LOGIC FOR BACKEND:
After you generate a response, another model (Evaluator AI) will read:

- Last user message
- Your response

and determine:
SOLVED or NOT_SOLVED

You DO NOT make this decision.

────────────────────────────────────────
WRITING STYLE:
- Friendly  
- Warm  
- Supportive  
- Professional  
- No unnecessary long paragraphs  
- Use numbered steps when giving instructions  
────────────────────────────────────────

${profileContext}
${deviceContext}
${ticketContext}
${warrantyContext}

BEGIN ASSISTANT RESPONSE NOW.`,
  };
  console.log("System prompt content:", systemPrompt.content);

  const messagesWithSystem = [systemPrompt, ...clean];

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: messagesWithSystem, temperature: 0.4, max_tokens: 500 }),
    } as any);
    if (!resp.ok) throw new HttpsError("unavailable", `OpenAI error: ${resp.status}`);
    const data = await resp.json();
    let content: string | undefined = data?.choices?.[0]?.message?.content;
    if (!content) throw new HttpsError("data-loss", "No content in OpenAI response");

    // Determine workflow prefixes before cleaning for routing
    const hasRequiresTicket = content.startsWith('REQUIRES_TICKET:');
    const hasTicketVerification = content.startsWith('TICKET_VERIFICATION:');
    const hasDeviceSelection = content.startsWith('DEVICE_SELECTION:');
    const hasComplaintDetected = content.startsWith('COMPLAINT_DETECTED:');

    // Create a cleaned version for persistence (strip technical prefixes)
    let cleanedContent = content
      .replace(/^REQUIRES_TICKET:\s*/i, '')
      .replace(/^TICKET_VERIFICATION:\s*/i, '')
      .replace(/^DEVICE_SELECTION:\s*/i, '')
      .replace(/^COMPLAINT_DETECTED:\s*/i, '')
      .trim();

    // Suppress repeating COMPLAINT_DETECTED after it has been shown once in this conversation.
    try {
      const priorComplaintShown = clean.some(
        (m) => m.role === "assistant" && typeof m.content === "string" && m.content.includes("COMPLAINT_DETECTED:")
      );
      if (priorComplaintShown && hasComplaintDetected) {
        // already cleaned above
      }
    } catch {}

    let assistantMsgDocId: string | null = null;
    try {
      const added = await sessionsCol.doc(sessionId).collection("messages").add({
        role: "assistant",
        content: cleanedContent,
        ts: Date.now(),
        ...(deviceInfo && { deviceInfo })
      });
      assistantMsgDocId = added.id;
      await sessionsCol.doc(sessionId).set({ updatedAt: Date.now(), status: "active" }, { merge: true });
    } catch {}

    // Enhanced response with workflow handling
    let enhancedReply = cleanedContent;
    let requiresTicket = false;
    let ticketDetails = null;
    let deviceSelection = null;

    // Handle workflow responses
    if (hasRequiresTicket) {
      requiresTicket = true;
      enhancedReply = cleanedContent;
    } else if (hasTicketVerification && activeTicket) {
      const ticketNumber = activeTicket.data.ticketNumber || `#${activeTicket.ticketId.slice(-6).toUpperCase()}`;
      ticketDetails = {
        ticketId: activeTicket.ticketId,
        ticketNumber: ticketNumber,
        subject: activeTicket.data.subject,
        description: activeTicket.data.description,
        category: activeTicket.data.category,
        status: activeTicket.data.status,
        createdAt: activeTicket.data.createdAt?.toDate?.()?.toLocaleDateString()
      };
      enhancedReply = cleanedContent;
    } else if (hasDeviceSelection) {
      // Fetch user devices for selection
      try {
        const devicesQuery = await db.collection(CONFIG.COLLECTIONS.DEVICES).where("uid", "==", uid).get();
        const devices = devicesQuery.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.deviceName || data.name || 'Unknown Device',
            type: data.deviceType || data.type || 'Unknown Type',
            model: data.deviceModel || data.model || '',
            serial: data.deviceSerial || data.serial || ''
          };
        });
        deviceSelection = { devices };
        enhancedReply = cleanedContent;
      } catch (error) {
        console.warn('Failed to fetch devices:', error);
      }
    }

    // Auto-trigger ticket verification for users with active tickets
    if (activeTicket && !requiresTicket && !ticketDetails && !deviceSelection) {
      // Check if this is the first interaction or a complaint
      const isFirstInteraction = clean.filter(m => m.role === 'assistant').length === 0;
      const isComplaint = content.toLowerCase().includes('issue') || 
                          content.toLowerCase().includes('problem') || 
                          content.toLowerCase().includes('not working') || 
                          content.toLowerCase().includes('broken') || 
                          content.toLowerCase().includes('help') ||
                          content.toLowerCase().includes('fix');
      
      // If AI didn't trigger verification but should have
      if ((isFirstInteraction || isComplaint) && !content.includes('TICKET_VERIFICATION')) {
        const ticketNumber = activeTicket.data.ticketNumber || `#${activeTicket.ticketId.slice(-6).toUpperCase()}`;
        ticketDetails = {
          ticketId: activeTicket.ticketId,
          ticketNumber: ticketNumber,
          subject: activeTicket.data.subject,
          description: activeTicket.data.description,
          category: activeTicket.data.category,
          status: activeTicket.data.status,
          createdAt: activeTicket.data.createdAt?.toDate?.()?.toLocaleDateString()
        };
        enhancedReply = `I found your active support ticket ${ticketNumber}. Let me verify the details with you first:`;
      }
    }

    // If there's an active ticket and AI didn't acknowledge it, add acknowledgment (only if not in noTicket mode)
    // BUT don't override troubleshooting responses when a device is successfully matched
    const hasSuccessfulTroubleshooting = isProblemIssue && problemMatchedDevice && enhancedReply && !enhancedReply.includes('serial number');
    if (!noTicket && ticketContext && !content.toLowerCase().includes('ticket') && !content.startsWith('COMPLAINT_DETECTED:') && !content.startsWith('REQUIRES_TICKET:') && !hasSuccessfulTroubleshooting) {
      const ticketMatch = ticketContext.match(/Ticket ID: #([^\n]+)/);
      const subjectMatch = ticketContext.match(/Subject: "([^"]+)"/);
      if (ticketMatch && subjectMatch) {
        enhancedReply = `I see you have an active ticket #${ticketMatch[1]} about "${subjectMatch[1]}". ${content}`;
      }
    }

    // Warranty flow finalization: override AI response deterministically
    if (isWarrantyQuestion) {
      if (multiWarrantyMessage) {
        // Ambiguous last-4: show candidates and ask for full serial
        enhancedReply = multiWarrantyMessage;
      } else if (deterministicWarrantyMessage) {
        // Deterministic serial match: replace with concise deterministic message
        enhancedReply = deterministicWarrantyMessage;
      } else {
        // No deterministic match: ask for full serial with brief hint
        console.log("=== DEBUG WARRANTY HINT ===");
        console.log("deviceSummaries count:", deviceSummaries.length);
        deviceSummaries.forEach((d: any, i: number) => {
          console.log(`Device ${i}:`, d.name, d.model, d.type, d.id);
        });
        const options = deviceSummaries
          .slice(0, 3)
          .map((d: any) => `${d.name}${d.model ? ` (${d.model})` : ''}`)
          .filter(Boolean)
          .join(', ');
        console.log("Generated options:", options);
        const hint = options ? ` For reference, I see devices like: ${options}.` : '';
        enhancedReply = `To fetch the exact warranty, please enter the full device serial number.${hint}`;
      }
    }

    // Global serial detection: if user provided a serial but no explicit intent, acknowledge and prompt next action
    // BUT check if user was previously asking for troubleshooting help OR if they're responding to a menu
    if (!isWarrantyQuestion && !isDeviceInfoQuestion && !isProblemIssue && globalSerialMatchedDevice) {
      console.log("=== GLOBAL SERIAL DETECTION ===");
      console.log("Last user message:", lastUserMsg);
      console.log("isWarrantyQuestion:", isWarrantyQuestion);
      console.log("isDeviceInfoQuestion:", isDeviceInfoQuestion);
      console.log("isProblemIssue:", isProblemIssue);
      console.log("globalSerialMatchedDevice:", globalSerialMatchedDevice?.deviceName || globalSerialMatchedDevice?.name);
      try {
        // Check if the bot recently showed a menu with device options
        const recentlyShowedMenu = clean.slice(-2).some((msg: any) => {
          const content = String(msg.content || '').toLowerCase();
          return msg.role === 'assistant' && 
                 content.includes('what would you like to do next') &&
                 content.includes('show device details');
        });

        // Check if user was previously asking for troubleshooting by looking at recent conversation
        // Exclude device info requests from troubleshooting detection
        const wasPreviouslyTroubleshooting = clean.slice(-3).some((msg: any) => {
          const content = String(msg.content || '').toLowerCase();
          // Don't treat device info requests as troubleshooting
          const isDeviceInfoRequest = /\b(device\s*(info|information|details|status)|show\s*(my\s*)?device\s*(info|details)|about\s*(this|the)\s*device|device\s*specs?|give\s*me\s*(the\s*)?details\s*of)\b/i.test(content);
          if (isDeviceInfoRequest) return false;
          
          return content.includes('troubleshoot') || 
                 content.includes('not working') || 
                 content.includes('not turning on') ||
                 content.includes('problem') ||
                 content.includes('issue') ||
                 content.includes('broken') ||
                 content.includes('help with') ||
                 content.includes('fix');
        });

        // Check if bot recently gave troubleshooting advice to avoid repetition
        const recentlyGaveTroubleshooting = clean.slice(-2).some((msg: any) => {
          const content = String(msg.content || '').toLowerCase();
          return msg.role === 'assistant' && 
                 (content.includes('check the battery') || 
                  content.includes('reset the device') ||
                  content.includes('restart the') ||
                  content.includes('troubleshoot') ||
                  content.includes('try the following'));
        });

        // Check if bot recently asked for serial number for device info purposes
        const recentlyAskedForDeviceInfoSerial = clean.slice(-2).some((msg: any) => {
          const content = String(msg.content || '').toLowerCase();
          return msg.role === 'assistant' && 
                 content.includes('serial number') &&
                 (content.includes('details') || 
                  content.includes('information') ||
                  content.includes('fetch') ||
                  content.includes('verify') ||
                  content.includes('show'));
        });

        console.log("recentlyShowedMenu:", recentlyShowedMenu);
        console.log("wasPreviouslyTroubleshooting:", wasPreviouslyTroubleshooting);
        console.log("recentlyGaveTroubleshooting:", recentlyGaveTroubleshooting);
        console.log("recentlyAskedForDeviceInfoSerial:", recentlyAskedForDeviceInfoSerial);

        const isSerialOnlyMessage = isJustSerialNumber;

        if (isSerialOnlyMessage) {
          // When the user only sends a serial that matches their device, always show device details.
          const name = globalSerialMatchedDevice.deviceName || globalSerialMatchedDevice.name || 'Device';
          const type = globalSerialMatchedDevice.deviceType || globalSerialMatchedDevice.type || 'Device';
          const model = globalSerialMatchedDevice.deviceModel || globalSerialMatchedDevice.model || globalSerialMatchedDevice.modelNumber || '';
          const brand = globalSerialMatchedDevice.brand || globalSerialMatchedDevice.manufacturer || globalSerialMatchedDevice.vendor || globalSerialMatchedDevice.make || '';
          const serialMasked = typeof globalSerialMatchedSerialRaw === 'string' && globalSerialMatchedSerialRaw
            ? `***${String(globalSerialMatchedSerialRaw).slice(-4)}`
            : '';
          const warranty = globalSerialMatchedDevice.warrantyExpiry || globalSerialMatchedDevice.warrantyEnd || undefined;
          const documentation = globalSerialMatchedDevice.documentation || globalSerialMatchedDevice.manualUrl || undefined;

          const lines = [
            `Here are the device details I found:`,
            `- Name: ${name}`,
            `- Type: ${type}`,
            model ? `- Model: ${model}` : '',
            brand ? `- Brand: ${brand}` : '',
            serialMasked ? `- Serial: ${serialMasked} (masked)` : '',
            warranty ? `- Warranty expiry: ${warranty}` : '',
            documentation ? `- Docs: ${documentation}` : '',
          ].filter(Boolean);
          enhancedReply = lines.join('\n');
        } else if (recentlyShowedMenu || recentlyGaveTroubleshooting || recentlyAskedForDeviceInfoSerial) {
          // User is responding to the menu with a serial number OR bot recently gave troubleshooting OR bot asked for serial for device info - show device details by default
          const name = globalSerialMatchedDevice.deviceName || globalSerialMatchedDevice.name || 'Device';
          const type = globalSerialMatchedDevice.deviceType || globalSerialMatchedDevice.type || 'Device';
          const model = globalSerialMatchedDevice.deviceModel || globalSerialMatchedDevice.model || globalSerialMatchedDevice.modelNumber || '';
          const brand = globalSerialMatchedDevice.brand || globalSerialMatchedDevice.manufacturer || globalSerialMatchedDevice.vendor || globalSerialMatchedDevice.make || '';
          const serialMasked = typeof globalSerialMatchedSerialRaw === 'string' && globalSerialMatchedSerialRaw
            ? `***${String(globalSerialMatchedSerialRaw).slice(-4)}`
            : '';
          const warranty = globalSerialMatchedDevice.warrantyExpiry || globalSerialMatchedDevice.warrantyEnd || undefined;
          const documentation = globalSerialMatchedDevice.documentation || globalSerialMatchedDevice.manualUrl || undefined;
          
          const lines = [
            `Here are the device details I found:`,
            `- Name: ${name}`,
            `- Type: ${type}`,
            model ? `- Model: ${model}` : '',
            brand ? `- Brand: ${brand}` : '',
            serialMasked ? `- Serial: ${serialMasked} (masked)` : '',
            warranty ? `- Warranty expiry: ${warranty}` : '',
            documentation ? `- Docs: ${documentation}` : '',
          ].filter(Boolean);
          enhancedReply = lines.join('\n');
        } else if (wasPreviouslyTroubleshooting) {
          // Continue with troubleshooting instead of showing menu
          const name = globalSerialMatchedDevice.deviceName || globalSerialMatchedDevice.name || 'Device';
          const type = globalSerialMatchedDevice.deviceType || globalSerialMatchedDevice.type || 'Device';
          const model = globalSerialMatchedDevice.deviceModel || globalSerialMatchedDevice.model || globalSerialMatchedDevice.modelNumber || '';
          const maskedSerial = typeof globalSerialMatchedSerialRaw === 'string' && globalSerialMatchedSerialRaw
            ? `***${String(globalSerialMatchedSerialRaw).slice(-4)}`
            : '';
          
          // Get the troubleshooting issue from recent messages
          const recentUserMsg = clean.slice(-3).find((msg: any) => msg.role === 'user' && 
            (String(msg.content || '').toLowerCase().includes('not turning on') ||
             String(msg.content || '').toLowerCase().includes('not working') ||
             String(msg.content || '').toLowerCase().includes('problem') ||
             String(msg.content || '').toLowerCase().includes('issue')));
          
          const issueText = recentUserMsg ? String(recentUserMsg.content || '').slice(0, 400) : 'device issue';
          
          const prompt = `You are a device troubleshooting assistant for Smile Smart Homes. The user has a verified device and needs help.\n\nDevice: ${type} ${model ? '(' + model + ')' : ''} ${name}\nSerial: ${maskedSerial} (masked - already verified)\n\nUser said: ${issueText}\n\nIMPORTANT: The device is already verified by serial number. Do NOT ask for the serial number again under any circumstances. The user wants troubleshooting help. Provide ONE actionable troubleshooting step (<=80 words), specific to the device and issue. Keep it concise and user-friendly.`;
          
          try {
            const resp2 = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
              body: JSON.stringify({ model: CONFIG.OPENAI.MODEL, messages: [{ role: "user", content: prompt }], temperature: 0.3, max_tokens: 200 }),
            } as any);
            if (resp2.ok) {
              const data2 = await resp2.json();
              const suggestion = (data2?.choices?.[0]?.message?.content || '').trim();
              if (suggestion) {
                enhancedReply = suggestion;
              }
            }
          } catch (e) {
            console.warn('Troubleshooting generation failed:', e);
          }
        } else {
          // Show the normal "What would you like to do next?" menu
          const name = globalSerialMatchedDevice.deviceName || globalSerialMatchedDevice.name || 'Device';
          const model = globalSerialMatchedDevice.deviceModel || globalSerialMatchedDevice.model || globalSerialMatchedDevice.modelNumber || '';
          const brand = globalSerialMatchedDevice.brand || globalSerialMatchedDevice.manufacturer || globalSerialMatchedDevice.vendor || globalSerialMatchedDevice.make || '';
          const masked = typeof globalSerialMatchedSerialRaw === 'string' && globalSerialMatchedSerialRaw ? `***${String(globalSerialMatchedSerialRaw).slice(-4)}` : '';
          const parts = [
            `I detected your device ${name}${model ? ` (${model})` : ''}${brand ? ` by ${brand}` : ''}${masked ? ` with serial ${masked}` : ''}.`,
            `What would you like to do next?`,
            `- Get warranty information`,
            `- Show device details`,
            `- Troubleshoot a problem`
          ];
          enhancedReply = parts.join('\n');
        }
      } catch {}
    }

    // Device information flow: normalized serial match or unique last-4; ambiguity lists; otherwise ask for serial unless already resolved
    if (isDeviceInfoQuestion) {
      // Check for specific brand query
      const isBrandQuery = /^\s*brand\s*$/i.test(String(lastUserMsg).trim());
      if (isBrandQuery && deviceInfoMatched) {
        const deviceName = deviceInfoMatched.deviceName || deviceInfoMatched.name || 'Device';
        const deviceBrand = deviceInfoMatched.brand || deviceInfoMatched.manufacturer || deviceInfoMatched.vendor || deviceInfoMatched.make || '';
        if (deviceBrand) {
          enhancedReply = `The brand of your ${deviceName} is ${deviceBrand}.`;
        } else {
          enhancedReply = `I don't have brand information available for your ${deviceName}.`;
        }
      } else if (multiDeviceInfoMessage) {
        enhancedReply = multiDeviceInfoMessage;
      } else if (deviceInfoMessage) {
        enhancedReply = deviceInfoMessage;
      } else if (deviceInfoMessageByName) {
        // Deterministic single match by name/type/model
        enhancedReply = deviceInfoMessageByName;
      } else if (deviceSelectionByName) {
        // Multiple candidates: return device selection list
        deviceSelection = deviceSelectionByName;
        enhancedReply = 'Please select your device from the list below:';
      } else {
        enhancedReply = `To show the device details, please enter the full device serial number so I can verify the exact device.`;
      }
    }

    // Problem / not working flow
    // But skip if bot recently asked for device info serial (to prevent showing troubleshooting instead of device details)
    const botRecentlyAskedForDeviceInfo = clean.slice(-2).some((msg: any) => {
      const content = String(msg.content || '').toLowerCase();
      return msg.role === 'assistant' && 
             content.includes('serial number') &&
             (content.includes('details') || 
              content.includes('information') ||
              content.includes('fetch') ||
              content.includes('verify') ||
              content.includes('show'));
    });
    
    if (isProblemIssue && !botRecentlyAskedForDeviceInfo) {
      if (problemMatchedDevice) {
        try {
          const name = problemMatchedDevice.deviceName || problemMatchedDevice.name || 'Device';
          const type = problemMatchedDevice.deviceType || problemMatchedDevice.type || 'Device';
          const model = problemMatchedDevice.deviceModel || problemMatchedDevice.model || problemMatchedDevice.modelNumber || '';
          const maskedSerial = typeof problemMatchedSerialRaw === 'string' && problemMatchedSerialRaw
            ? `***${String(problemMatchedSerialRaw).slice(-4)}`
            : '';
          const issueText = String(lastUserMsg || '').slice(0, 400);
          const prompt = `You are a device troubleshooting assistant for Smile Smart Homes. The user has a verified device and needs help.\n\nDevice: ${type} ${model ? '(' + model + ')' : ''} ${name}\nSerial: ${maskedSerial} (masked - already verified)\n\nUser said: ${issueText}\n\nIMPORTANT: The device is already verified by serial number. Do NOT ask for the serial number again under any circumstances. The user wants troubleshooting help. Provide ONE actionable troubleshooting step (<=80 words), specific to the device and issue. Keep it concise and user-friendly.`;
          const resp2 = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ model: CONFIG.OPENAI.MODEL, messages: [{ role: "user", content: prompt }], temperature: 0.3, max_tokens: 200 }),
          } as any);
          if (resp2.ok) {
            const data2 = await resp2.json();
            const suggestion = (data2?.choices?.[0]?.message?.content || '').trim();
            if (suggestion) {
              enhancedReply = suggestion;
            }
          }
        } catch (e) {
          console.warn('Troubleshooting generation failed:', e);
        }
      } else {
        const lower = (enhancedReply || '').toLowerCase();
        const alreadyAskingSerial = /serial/.test(lower);
        if (!alreadyAskingSerial) {
          enhancedReply = `To help with that problem, please enter the full device serial number so I can verify the exact device.`;
        }
      }
    }

    // General device-related questions (broader than explicit "device info"): ask for serial unless already resolved
    if (!isWarrantyQuestion && isDeviceRelatedQuestion && !deviceInfoMessage) {
      const lower = (enhancedReply || '').toLowerCase();
      const alreadyAskingSerial = /serial/.test(lower);
      if (!alreadyAskingSerial) {
        enhancedReply = `To assist with that device, please enter the full device serial number so I can verify the exact device.`;
      }
    }

    // Final guard: for problem/not-working intents, ensure we ask for serial if none matched
    if (isProblemIssue && !problemMatchedDevice) {
      const lower = (enhancedReply || '').toLowerCase();
      if (!/serial/.test(lower)) {
        enhancedReply = `To help with that problem, please enter the full device serial number so I can verify the exact device.`;
      }
    }

    // Persist the enhanced reply back to the existing assistant message if it changed, so the UI sees the enforced serial request
    try {
      if (assistantMsgDocId && enhancedReply !== cleanedContent) {
        await sessionsCol.doc(sessionId).collection("messages").doc(assistantMsgDocId).set({ content: enhancedReply }, { merge: true });
      }
    } catch {}

    // Escalation/troubleshooting step logic
    let troubleshootingStepCount = 0;
    let escalate = false;
    let stepIndex = 0;
    let lastEscalationIdx = -1;

    // Count troubleshooting steps in this session
    for (let i = 0; i < clean.length; ++i) {
      const m = clean[i];
      if (m.role === 'assistant' && typeof m.content === 'string') {
        try {
          const data = JSON.parse(m.content.trim());
          if (data && data.mode === 'troubleshooting' && data.allowTroubleshooting) {
            troubleshootingStepCount++;
            if (data.escalate) lastEscalationIdx = i;
          }
        } catch {}
      }
    }
    // Detect frustration in last user message
    const frustrationPattern = /(still (not working|unsolved|same issue|problem|broken|no)|not working|no|same issue|i'm tired|frustrat|useless|doesn't work|doesnt work|again|does not work|stop|enough|help|can't fix|cant fix|waste|give up)/i;
    const userFrustrated = frustrationPattern.test(String(lastUserMsg));
    // If escalated already, always escalate
    if (lastEscalationIdx >= 0) escalate = true;
    // Escalate if 4 or more steps, or if user is frustrated
    if (troubleshootingStepCount >= 4 || userFrustrated) escalate = true;
    stepIndex = troubleshootingStepCount;

    // If escalation is triggered, ensure a ticket exists and emit escalation message and JSON
    if (escalate) {
      try {
        const deviceIdForTicket = (problemMatchedDevice?.id || globalSerialMatchedDevice?.id) ? String((problemMatchedDevice?.id || globalSerialMatchedDevice?.id)) : undefined;
        const subjectForTicket = 'Support needed for device issue';
        const descriptionForTicket = String(lastUserMsg || '').slice(0, 500) || 'Issue reported via chat';
        const ticket = await ensureSupportTicketForIssue({
          uid,
          subject: subjectForTicket,
          description: descriptionForTicket,
          deviceId: deviceIdForTicket,
          category: 'Chat Escalation',
          priority: 'medium',
        });
        requiresTicket = true;
        ticketDetails = {
          ticketId: ticket.ticketId,
          ticketNumber: ticket.ticketNumber,
          status: ticket.status,
          alreadyExists: ticket.alreadyExists,
        };
        try {
          await sessionsCol.doc(sessionId).set({ activeTicketId: ticket.ticketId, updatedAt: Date.now() }, { merge: true });
        } catch {}
      } catch (err) {
        // If ticket creation/check fails, still proceed with escalation without ticket details
      }
      return {
        reply: JSON.stringify({
          mode: 'troubleshooting',
          allowTroubleshooting: false,
          escalate: true,
          stopAI: true,
          message: "It looks like this needs deeper investigation. I’m transferring this chat to a human support agent now."
        }),
        sessionId,
        ...(requiresTicket && { requiresTicket: true }),
        ...(ticketDetails && { ticketDetails }),
        ...(deviceSelection && { deviceSelection }),
        ...(debugInfo && { debugInfo })
      };
    }
    // If troubleshooting step, emit structured JSON
    if (isProblemIssue && problemMatchedDevice && enhancedReply && !enhancedReply.includes('serial number')) {
      return {
        reply: JSON.stringify({
          mode: 'troubleshooting',
          allowTroubleshooting: true,
          escalate: false,
          stepIndex,
          message: enhancedReply
        }),
        sessionId,
        ...(requiresTicket && { requiresTicket: true }),
        ...(ticketDetails && { ticketDetails }),
        ...(deviceSelection && { deviceSelection }),
        ...(debugInfo && { debugInfo })
      };
    }
    // Otherwise, fallback to default
    return {
      reply: enhancedReply,
      sessionId,
      ...(requiresTicket && { requiresTicket: true }),
      ...(ticketDetails && { ticketDetails }),
      ...(deviceSelection && { deviceSelection }),
      ...(debugInfo && { debugInfo })
    };

  } catch (e) {
    const err = e as { message?: string };
    try {
      await sessionsCol.doc(sessionId).set({ status: "error", updatedAt: Date.now() }, { merge: true });
      await sessionsCol.doc(sessionId).collection("messages").add({ role: "assistant", content: `Exception: ${err?.message || "Chat call failed"}`, ts: Date.now(), error: true });
    } catch {}
    throw new HttpsError("internal", err?.message || "Chat call failed");
  }
  return { reply: "Unable to process your request right now.", sessionId };
});

// Removed fetchLatestUnresolvedTicket – backend no longer falls back to implicit tickets

// ===== Check for active unresolved tickets =====
// removed unused checkActiveUnresolvedTicket callable

// Removed extractSerialFromImage callable – switched to manual serial verification


export const suggestTroubleshootingStep = onCall({secrets: [OPENAI_API_KEY], cors: true}, async (request) => {
  const authCtx = request.auth;
  if (!authCtx) throw new HttpsError("unauthenticated", "Must be authenticated.");
  const ticketId = (request.data?.ticketId as string | undefined)?.trim();
  const docs = (request.data?.docs as string[] | undefined) || [];
  if (!ticketId) throw new HttpsError("invalid-argument", "ticketId is required");

  const tRef = db.collection(CONFIG.COLLECTIONS.TICKETS).doc(ticketId);
  const tSnap = await tRef.get();
  if (!tSnap.exists) throw new HttpsError("not-found", "Ticket not found");
  const t = tSnap.data() as any;
  if (t.uid !== authCtx.uid) throw new HttpsError("permission-denied", "Not your ticket");

  const apiKey = OPENAI_API_KEY.value();
  if (!apiKey) throw new HttpsError("failed-precondition", "OPENAI_API_KEY not configured");

  const attempt = Number(t.troubleshootingAttempts || 0);
  if (attempt >= 3) return {done: true, message: "Max troubleshooting attempts reached."};

  // Enhanced prompt with device model, category, and support docs
  const deviceInfo = `Device: ${t.deviceType || 'Unknown'} ${t.deviceModel || ''}`.trim();
  const issueCategory = t.category || 'General';
  const issueDescription = t.description || t.complaint || t.subject || 'No description provided';
  
  const prompt = `You are a device troubleshooting assistant for Smile Smart Homes. Based on the ticket information and support documents, provide one specific troubleshooting step.

${deviceInfo}
Issue Category: ${issueCategory}
User's Issue: ${issueDescription}

Support Documentation: ${docs.length > 0 ? docs.join('\n') : 'No specific documentation available'}

Provide ONE actionable troubleshooting step (under 80 words). Be specific to the device and issue.`;
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {"Content-Type": "application/json", Authorization: `Bearer ${apiKey}`},
    body: JSON.stringify({model: CONFIG.OPENAI.MODEL, messages: [{role: "user", content: prompt}], temperature: 0.2, max_tokens: 180}),
  } as any);
  if (!resp.ok) throw new HttpsError("unavailable", `OpenAI error: ${resp.status}`);
  const data = await resp.json();
  const suggestion: string = (data?.choices?.[0]?.message?.content || "").trim();

  await tRef.set({troubleshootingAttempts: attempt + 1, lastSuggestion: suggestion, updatedAt: Date.now()}, {merge: true});
  return {done: false, attempt: attempt + 1, suggestion};
});

// removed unused resolveOrEscalate callable

// removed unused recordTicketFeedback callable


// ===== Fetch and analyze latest unresolved ticket for a user =====
// (Removed on request)

// ===== Analyze a specific ticket by ID (fetch from Firestore first, then send to OpenAI) =====
export const analyzeTicketById = onCall({ secrets: [OPENAI_API_KEY], cors: true }, async (request) => {
  const authCtx = request.auth;
  if (!authCtx) throw new HttpsError("unauthenticated", "Must be authenticated.");

  const ticketId = (request.data?.ticketId as string | undefined)?.trim();
  const sessionId = (request.data?.sessionId as string | undefined)?.trim();
  if (!ticketId) throw new HttpsError("invalid-argument", "ticketId is required");

  // Load the ticket from Firestore first
  const tRef = db.collection(CONFIG.COLLECTIONS.TICKETS).doc(ticketId);
  const tSnap = await tRef.get();
  if (!tSnap.exists) throw new HttpsError("not-found", "Ticket not found");
  const t = tSnap.data() as any;
  if (t.uid !== authCtx.uid) throw new HttpsError("permission-denied", "Not your ticket");

  const apiKey = OPENAI_API_KEY.value();
  if (!apiKey) throw new HttpsError("failed-precondition", "OPENAI_API_KEY not configured");

  // Build device context
  let userDevices: Array<{id: string; [key: string]: any}> = [];
  try {
    const devicesSnap = await db.collection(CONFIG.COLLECTIONS.DEVICES).where("uid", "==", authCtx.uid).get();
    userDevices = devicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (e) {
    console.warn("Failed to fetch user devices:", e);
  }

  // Try to resolve a specific device related to the ticket
  let matchedDevice: any = null;
  try {
    if (t.deviceId) {
      const dSnap = await db.collection(CONFIG.COLLECTIONS.DEVICES).doc(String(t.deviceId)).get();
      if (dSnap.exists) {
        const d = dSnap.data() as any;
        if (!d.uid || d.uid === authCtx.uid) {
          matchedDevice = { id: dSnap.id, ...d };
        }
      }
    }
    if (!matchedDevice && userDevices.length > 0) {
      const serialNeedle = String(t.deviceSerial || '').trim();
      const modelNeedle = String(t.deviceModel || '').trim();
      matchedDevice = userDevices.find((d: any) => {
        const serials = [d.deviceSerial, d.serial, d.serialNumber]
          .filter(Boolean)
          .map((x: any) => String(x).trim());
        const models = [d.deviceModel, d.model, d.modelNumber]
          .filter(Boolean)
          .map((x: any) => String(x).trim());
        const serialMatch = serialNeedle && serials.includes(serialNeedle);
        const modelMatch = modelNeedle && models.includes(modelNeedle);
        return serialMatch || modelMatch;
      }) || null;
    }
  } catch (err) {
    console.warn('Failed to resolve matched device:', err);
  }

  // Local serial masker
  const maskSerialLocal = (s: any) => {
    const v = typeof s === 'string' ? s : '';
    if (!v) return '';
    const last4 = v.slice(-4);
    return v.length > 4 ? `***${last4}` : `***${last4}`;
  };

  // Prepare deviceDetails object for UI and a readable message for chat
  let deviceDetails: any = null;
  let deviceDetailsMessage: string | null = null;
  if (matchedDevice) {
    const serialMasked = maskSerialLocal(matchedDevice.deviceSerial || matchedDevice.serial || matchedDevice.serialNumber || '');
    deviceDetails = {
      deviceName: matchedDevice.deviceName || matchedDevice.name || 'Device',
      type: matchedDevice.deviceType || matchedDevice.type || 'Device',
      modelNumber: matchedDevice.deviceModel || matchedDevice.model || matchedDevice.modelNumber || '',
      brand: matchedDevice.brand || undefined,
      serialNumber: serialMasked,
      warrantyExpiry: matchedDevice.warrantyExpiry || matchedDevice.warrantyEnd || undefined,
      documentation: matchedDevice.documentation || matchedDevice.manualUrl || undefined,
      isOnline: typeof matchedDevice.isOnline === 'boolean' ? matchedDevice.isOnline : undefined,
    };
    const parts = [
      `Here are the device details I found:`,
      `- Name: ${deviceDetails.deviceName}`,
      `- Type: ${deviceDetails.type}`,
      deviceDetails.modelNumber ? `- Model: ${deviceDetails.modelNumber}` : '',
      deviceDetails.serialNumber ? `- Serial: ${deviceDetails.serialNumber} (masked)` : '',
      typeof deviceDetails.isOnline === 'boolean' ? `- Status: ${deviceDetails.isOnline ? 'Online' : 'Offline'}` : '',
      deviceDetails.warrantyExpiry ? `- Warranty expiry: ${deviceDetails.warrantyExpiry}` : '',
      deviceDetails.documentation ? `- Docs: ${deviceDetails.documentation}` : '',
    ].filter(Boolean);
    deviceDetailsMessage = parts.join('\n');
  }

  const deviceList = userDevices.length > 0
    ? `User's devices: ${userDevices.map((d: any) => d.deviceName || d.name || d.id).join(", ")}`
    : "User has no registered devices.";

  // Create a robust prompt for analysis using the user's desired template
  const subject = t.subject || t.title || "No subject";
  const description = t.description || t.complaint || t.issue || "No description provided";
  const category = t.category || "General";
  const priority = t.priority || "medium";
  const ticketNumber = t.ticketNumber || `#${ticketId.slice(-6).toUpperCase()}`;
  const createdAt = (() => {
    try {
      return t.createdAt?.toDate?.()?.toISOString?.() || (typeof t.createdAt === 'number' ? new Date(t.createdAt).toISOString() : '') || '';
    } catch { return ''; }
  })();
  const deviceFields = [
    t.deviceId ? `deviceId: ${t.deviceId}` : '',
    t.deviceType ? `deviceType: ${t.deviceType}` : '',
    t.deviceModel ? `deviceModel: ${t.deviceModel}` : '',
    t.deviceSerial ? `deviceSerial: ${t.deviceSerial}` : '',
  ].filter(Boolean).join("\n");
  const attachments = t.imageUrl ? `attachment: ${t.imageUrl}` : '';
  const prior = [
    t.analysisResult ? `previousAnalysis: ${String(t.analysisResult).slice(0, 600)}` : '',
    typeof t.troubleshootingAttempts === 'number' ? `troubleshootingAttempts: ${t.troubleshootingAttempts}` : '',
    t.lastSuggestion ? `lastSuggestion: ${String(t.lastSuggestion).slice(0, 400)}` : '',
  ].filter(Boolean).join("\n");

  const ticketContent = [
    `ticketNumber: ${ticketNumber}`,
    `subject: ${subject}`,
    `category: ${category}`,
    `priority: ${priority}`,
    createdAt ? `createdAt: ${createdAt}` : '',
    `description: ${description}`,
    deviceFields,
    attachments,
    prior,
    deviceList ? `userDevicesContext: ${deviceList}` : ''
  ].filter(Boolean).join("\n");

  const prompt = `You are a technical support assistant for a smart home automation platform.

A user has submitted a support ticket describing an issue they are facing with their smart device. Your job is to:

1. Summarize the core issue clearly and concisely.
2. Identify any missing information or steps needed to proceed.
3. If enough information is provided, suggest a specific, actionable troubleshooting step.
4. Keep your response polite, professional, and written as if addressing the user directly.

Support Ticket Details:
---
${ticketContent}
---

Important guidance:
- If you require the device serial number for verification, include the token 'SERIAL_NEEDED:' followed by a one-line reason.
- Keep total length under 180 words.
- Do not include prefatory phrases or system notes; respond as a message to the user.`;

  // Call OpenAI
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: CONFIG.OPENAI.MODEL, messages: [{ role: "user", content: prompt }], temperature: CONFIG.OPENAI.TEMPERATURE, max_tokens: 350 }),
  } as any);

  if (!resp.ok) throw new HttpsError("unavailable", `OpenAI error: ${resp.status}`);
  const data = await resp.json();
  const content: string = (data?.choices?.[0]?.message?.content || "").trim();

  const needsSerial = content.includes("SERIAL_NEEDED:");

  // Persist results back onto the ticket
  await tRef.set({
    analyzedAt: Date.now(),
    analysisResult: content,
    initialSolution: content,
    needsSerial,
    updatedAt: Date.now(),
  }, { merge: true });

  // Optionally persist this analysis as an assistant message into chat_sessions if a sessionId is provided
  if (sessionId) {
    try {
      const sessionsCol = db.collection(CONFIG.COLLECTIONS.CHAT_SESSIONS);
      await sessionsCol.doc(sessionId).set({
        ownerUid: authCtx.uid,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: "active",
        type: "ai",
        model: CONFIG.OPENAI.MODEL,
      }, { merge: true });
      await sessionsCol.doc(sessionId).collection("messages").add({
        role: "assistant",
        content,
        ts: Date.now(),
        source: "ai",
      });
      if (deviceDetailsMessage) {
        await sessionsCol.doc(sessionId).collection("messages").add({
          role: "assistant",
          content: deviceDetailsMessage,
          ts: Date.now() + 1,
          source: "system",
          deviceInfo: deviceDetails,
        });
      }
      await sessionsCol.doc(sessionId).set({ updatedAt: Date.now() }, { merge: true });
    } catch (e) {
      console.warn("Failed to persist analysis to chat session:", e);
    }
  }

  return {
    status: "analyzed",
    ticketId,
    initialSolution: content,
    needsSerial,
    ...(deviceDetails ? { deviceInfo: deviceDetails } : {}),
  };
});

// ===== Structured strict support endpoint (uses STRICT_SYSTEM_PROMPT) =====
export const structuredSupportAction = onCall({ secrets: [OPENAI_API_KEY], cors: true }, async (request: CallableRequest) => {
  const authCtx = request.auth;
  if (!authCtx) throw new HttpsError("unauthenticated", "Must be authenticated.");

  const data = request.data as any;
  const action = typeof data?.action === "string" ? data.action.trim() : "";
  const deviceData = data?.deviceData;
  const context = data?.context ?? null;

  if (!action) {
    throw new HttpsError("invalid-argument", "'action' (string) is required.");
  }
  if (!deviceData || typeof deviceData !== "object" || Array.isArray(deviceData)) {
    throw new HttpsError("invalid-argument", "'deviceData' (object) is required.");
  }

  const apiKey = OPENAI_API_KEY.value();
  if (!apiKey) throw new HttpsError("failed-precondition", "OPENAI_API_KEY is not configured");

  const payload = {
    action,
    deviceData,
    context,
    userId: authCtx.uid,
  };

  const messages = [
    { role: "system", content: STRICT_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Structured support request:\n${JSON.stringify(payload, null, 2)}`,
    },
  ];

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: CONFIG.OPENAI.MODEL,
      messages,
      temperature: CONFIG.OPENAI.TEMPERATURE,
      max_tokens: CONFIG.OPENAI.MAX_TOKENS,
    }),
  } as any);

  if (!resp.ok) {
    throw new HttpsError("unavailable", `OpenAI error: ${resp.status}`);
  }

  const body = await resp.json();
  const reply: string = (body?.choices?.[0]?.message?.content || "").trim();

  return {
    action,
    reply,
  };
});

/**
 * Callable: Initiate a Live Consultation session
 * Creates a specialized chat session for live expert interaction.
 */
export const initiateLiveConsultation = onCall({
  secrets: [OPENAI_API_KEY],
  cors: true
}, async (request: CallableRequest) => {
  const authCtx = request.auth;
  if (!authCtx) throw new HttpsError("unauthenticated", "Must be authenticated to start a consultation.");

  const uid = authCtx.uid;
  const now = Date.now();
  const sessionId = `consult_${uid}_${now}`;

  try {
    const sessionsCol = db.collection(CONFIG.COLLECTIONS.CHAT_SESSIONS);
    await sessionsCol.doc(sessionId).set({
      ownerUid: uid,
      createdAt: now,
      updatedAt: now,
      status: "waiting", // Waiting for an agent
      type: "live_consultation",
      requestedAt: now,
    }, { merge: true });

    // Add initial system message
    await sessionsCol.doc(sessionId).collection("messages").add({
      role: "assistant", // Using assistant for compatibility with UI
      content: "Thank you for requesting a live consultation. A smart home expert will be with you shortly. Please stay on this page.",
      ts: now,
      source: "system",
    });

    return {
      status: "initialized",
      sessionId,
      message: "Consultation session created successfully.",
    };
  } catch (error: any) {
    console.error("Error initiating live consultation:", error);
    throw new HttpsError("internal", `Failed to start consultation: ${error?.message || error}`);
  }
});

/**
 * Prototype WhatsApp sending function using Twilio API
 * 
 * This function demonstrates how to send WhatsApp messages for quote delivery.
 * To enable, uncomment the code and configure Twilio credentials in Firebase Secrets:
 * - TWILIO_ACCOUNT_SID
 * - TWILIO_AUTH_TOKEN  
 * - TWILIO_WHATSAPP_NUMBER (e.g., whatsapp:+14155238886)
 * 
 * Usage:
 * await sendQuoteWhatsApp('+1234567890', 'Your quote Q-123 is ready! Total: ₹5000');
 * 
 * Note: WhatsApp Business API requires pre-approved message templates for outbound messages.
 * Twilio Sandbox allows testing with joined users.
 */
export async function sendQuoteWhatsApp(phoneNumber: string, message: string): Promise<boolean> {
  try {
    // TODO: Install twilio package: npm install twilio
    // const twilio = require('twilio');
    // const client = twilio(TWILIO_ACCOUNT_SID.value(), TWILIO_AUTH_TOKEN.value());
    // 
    // await client.messages.create({
    //   from: TWILIO_WHATSAPP_NUMBER.value(),
    //   to: `whatsapp:${phoneNumber}`,
    //   body: message,
    // });
    
    console.log(`[WhatsApp Prototype] Would send to ${phoneNumber}: ${message}`);
    console.log('[WhatsApp Prototype] To enable: uncomment code above and install twilio package');
    
    return true;
  } catch (error: any) {
    console.error('[WhatsApp Prototype] Error:', error);
    return false;
  }
}

