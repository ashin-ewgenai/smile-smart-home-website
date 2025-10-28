import { onCall, CallableRequest } from "firebase-functions/v2/https";
import { HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Declare global fetch to satisfy TypeScript without DOM lib in Node runtimes
declare const fetch: any;

// Secret for OpenAI
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

// Ensure Firebase Admin is initialized once per instance
if (!getApps().length) {
  initializeApp();
}

// Firestore reference shared by chatbot functions
const db = getFirestore();

// ===== CENTRALIZED CONFIGURATION =====
const CONFIG = {
  RATE_LIMIT: {
    COOLDOWN_MS: 3000,
    WINDOW_MS: 60000,
    MAX_PER_WINDOW: 15
  },
  OPENAI: {
    MODEL: "gpt-4o-mini",
    TEMPERATURE: 0.4,
    MAX_TOKENS: 300
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



// ===== Full chat with OpenAI including Firestore persistence =====
// request.data: { messages: {role:'system'|'user'|'assistant', content:string}[], model?: string, sessionId?: string, ticketId?: string }
// response: { reply: string, sessionId: string, requiresTicket?: boolean, ticketDetails?: any, deviceSelection?: any }
export const chatWithOpenAI = onCall({ secrets: [OPENAI_API_KEY], cors: true }, async (request: CallableRequest) => {
  const authCtx = request.auth;
  if (!authCtx) throw new HttpsError("unauthenticated", "Must be authenticated.");

  const msgs = request.data?.messages as Array<{ role: string; content: string }> | undefined;
  const model = (request.data?.model as string | undefined) || "gpt-4o-mini";
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

  // Device context for better answers
  const devicesQuery = await db.collection(CONFIG.COLLECTIONS.DEVICES).where("uid", "==", uid).get();
  try {
    console.log("DEBUG User_Devices read for uid:", uid, "docs:", devicesQuery.size);
    for (const d of devicesQuery.docs) {
      const data = d.data() as any;
      console.log("User_Devices doc:", d.id, "stored uid:", data?.uid);
    }
  } catch (e) {
    console.warn("Failed to log User_Devices uid checks:", e);
  }
  const userDevices = devicesQuery.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) })) as Array<{ id: string; deviceName?: string; name?: string }>;
  // Build lightweight debug info for client-side verification
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
  const deviceContext = userDevices.length > 0 ? `User has the following devices installed: ${userDevices.map((d) => d.deviceName || d.name || "Unknown Device").join(", ")}.` : "";

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
    content: `You are a support assistant for Smile Smart Homes, verifying customer devices and helping troubleshoot their issues.

IMPORTANT RULES:
1. ONLY answer questions related to smart home devices, automation, IoT, home security, lighting, climate control, entertainment systems, and Smile Smart Homes products/services.
2. Provide helpful, actionable guidance without asking for serial numbers.
3. Analyze each user message to determine if it's a COMPLAINT or GENERAL QUERY.
4. If the message is unclear, ask ONE concise clarifying question (<=20 words).
5. If no prior assistant message exists, begin with a brief greeting.

WORKFLOW RULES:
- For NEW COMPLAINTS without active ticket: Suggest creating a support ticket and provide helpful guidance
- For users WITH active ticket: Acknowledge the existing ticket and offer to help with troubleshooting
- For GENERAL QUERIES: Provide helpful answers
- NEVER ask for ticket numbers - always automatically fetch unresolved tickets
- If active ticket context is provided, ALWAYS acknowledge the existing ticket first
- Consider troubleshooting history to avoid repeating failed solutions
- If troubleshooting attempts are at 3/3, suggest escalation to human support

RESPONSE FORMAT:
- Provide natural, conversational responses without technical prefixes
- For complaints needing ticket: Explain that they should create a support ticket for better assistance
- For ticket verification: Acknowledge their existing ticket and confirm you can help
- For device selection: Ask them to specify which device needs help
- Keep responses concise and professional (under 150 words)
- NEVER start responses with technical codes like "REQUIRES_TICKET:" or "DEVICE_SELECTION:"

USER CONTEXT:
${deviceContext}${ticketContext}`,
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

    try {
      await sessionsCol.doc(sessionId).collection("messages").add({
        role: "assistant",
        content: cleanedContent,
        ts: Date.now(),
        ...(deviceInfo && { deviceInfo })
      });
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
    if (!noTicket && ticketContext && !content.toLowerCase().includes('ticket') && !content.startsWith('COMPLAINT_DETECTED:') && !content.startsWith('REQUIRES_TICKET:')) {
      const ticketMatch = ticketContext.match(/Ticket ID: #([^\n]+)/);
      const subjectMatch = ticketContext.match(/Subject: "([^"]+)"/);
      if (ticketMatch && subjectMatch) {
        enhancedReply = `I see you have an active ticket #${ticketMatch[1]} about "${subjectMatch[1]}". ${content}`;
      }
    }

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
    body: JSON.stringify({model: "gpt-4o-mini", messages: [{role: "user", content: prompt}], temperature: 0.2, max_tokens: 180}),
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
  };
});
