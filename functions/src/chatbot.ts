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
export const chatWithOpenAI = onCall(
  { secrets: [OPENAI_API_KEY], cors: true },
  async (request: CallableRequest): Promise<{
    reply: string;
    sessionId: string;
    requiresTicket?: boolean;
    ticketDetails?: any;
    deviceSelection?: any;
    debugInfo?: any;
  }> => {
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

  // Device and profile context for better answers
  const devicesQuery = await db.collection(CONFIG.COLLECTIONS.DEVICES).where("uid", "==", uid).get();
  const userDevices = devicesQuery.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) })) as Array<any>;

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

  // Mask serial number for safety: keep last 4 characters
  const maskSerial = (s: any) => {
    const v = typeof s === 'string' ? s : '';
    if (!v) return '';
    const last4 = v.slice(-4);
    return v.length > 4 ? `***${last4}` : `***${last4}`;
  };

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

  // Summarize devices with useful fields commonly present in User_Devices
  const deviceSummaries = userDevices.map((d: any) => {
    const serialCandidates = [d.deviceSerial, d.serial, d.serialNumber].filter(Boolean);
    const serialMasked = serialCandidates.length > 0 ? maskSerial(serialCandidates[0]) : '';
    const serialArray = Array.isArray(d.serials) ? d.serials : [];
    const serialsMasked = serialArray
      .map((e: any) => ({
        serialNumber: maskSerial(e?.serialNumber),
        warrantyExpiry: e?.warrantyExpiry || e?.warrantyEnd || undefined,
      }))
      .filter((e: any) => e.serialNumber);
    // Compute combined warranty: prefer device-level, else first available from serials[]
    const serialWarranty = (serialsMasked.find((e: any) => e?.warrantyExpiry)?.warrantyExpiry) || undefined;
    const warrantyCombined = d.warrantyExpiry || d.warrantyEnd || serialWarranty || undefined;
    return {
      id: d.id,
      name: d.deviceName || d.name || 'Unknown Device',
      type: d.deviceType || d.type || 'Device',
      model: d.deviceModel || d.model || d.modelNumber || '',
      serial: serialMasked,
      isOnline: typeof d.isOnline === 'boolean' ? d.isOnline : undefined,
      lastSeen: d.lastSeen || d.lastActive || undefined,
      room: d.room || d.location || undefined,
      installedAt: d.installedAt || d.addedAt || undefined,
      warrantyExpiry: d.warrantyExpiry || d.warrantyEnd || undefined,
      warrantyCombined,
      serials: serialsMasked,
    };
  });

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
  const isDeviceInfoQuestion = /\b(device\s*(info|information|details|status)|show\s*(my\s*)?device\s*(info|details)|about\s*(this|the)\s*device|device\s*specs?)\b/i.test(String(lastUserMsg));
  // Broader device-related intent detection (e.g., "show camera details", "what about my bulb")
  const deviceTokenRe = /(light|bulb|camera|cctv|plug|switch|sensor|thermostat|router|device|smart\s+light|strip|lock)/i;
  const intentTokenRe = /(info|information|details|status|spec|specs|manual|documentation|about|show|what|how|guide|help)/i;
  const isDeviceRelatedQuestion = deviceTokenRe.test(String(lastUserMsg)) && intentTokenRe.test(String(lastUserMsg));
  // Problem / not-working detection (expanded coverage)
  const isProblemIssue = /(\bnot\s*working\b|doesn['’]?t\s*work|doesnt\s*work|\bproblem\b|\bissue\b|\bbroken\b|malfunction(ing)?|stopped\s*working|not\s*respond(ing)?|unresponsive|offline|disconnected|disconnect(ing)?|cannot\s*connect|can't\s*connect|won'?t\s*turn\s*on|no\s*power|error|fault|crash(ed)?|freeze|frozen|lag(gy)?|slow|overheat(ing)?) /i.test(String(lastUserMsg));

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
  }

  // Determine device info match ONLY by full serial equality (case-insensitive, ignoring non-alphanumerics).
  // If no exact serial is present in the user's message, ask for full serial.
  let deviceInfoMatched: any = null;
  let deviceInfoMessage: string | null = null;
  let multiDeviceInfoMessage: string | null = null; // kept for API compatibility; unused now
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
    // If user didn't include a serial in this message, try session-persisted last match
    if (!deviceInfoMatched) {
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
              deviceInfoMatched = d;
              break;
            }
          }
        }
      } catch {}
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
      const isOnline = typeof deviceInfoMatched.isOnline === 'boolean' ? deviceInfoMatched.isOnline : undefined;
      const warranty = deviceInfoMatched.warrantyExpiry || deviceInfoMatched.warrantyEnd || undefined;
      const documentation = deviceInfoMatched.documentation || deviceInfoMatched.manualUrl || undefined;
      const lines = [
        `Here are the device details I found:`,
        `- Name: ${name}`,
        `- Type: ${type}`,
        model ? `- Model: ${model}` : '',
        brand ? `- Brand: ${brand}` : '',
        serialMasked ? `- Serial: ${serialMasked} (masked)` : '',
        typeof isOnline === 'boolean' ? `- Status: ${isOnline ? 'Online' : 'Offline'}` : '',
        warranty ? `- Warranty expiry: ${warranty}` : '',
        documentation ? `- Docs: ${documentation}` : '',
      ].filter(Boolean);
      deviceInfoMessage = lines.join('\n');
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
        // If legacy docs contain more than one serial, list all for clarity
        if (multiSerials.length > 1) {
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
        `${typeof d.isOnline === 'boolean' ? `  - Status: ${d.isOnline ? 'Online' : 'Offline'}\n` : ''}` +
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
    content: `You are a support assistant for Smile Smart Homes, verifying customer devices and helping troubleshoot their issues.

IMPORTANT RULES:
1. ONLY answer questions related to smart home devices, automation, IoT, home security, lighting, climate control, entertainment systems, and Smile Smart Homes products/services.
2. Provide helpful, actionable guidance without asking for serial numbers, EXCEPT for:
   - Explicit device information requests (info/specs/status/details): you MUST ask for the full device serial to verify the exact device before showing its details.
   - Warranty questions: you MUST ask for the full device serial to fetch the warranty for that specific device. If a serial appears in the message, use it to answer.
3. Analyze each user message to determine if it's a COMPLAINT or GENERAL QUERY.
4. If the message is unclear, ask ONE concise clarifying question (<=20 words).
5. If no prior assistant message exists, begin with a brief greeting.
6. For device problems/troubleshooting: you MUST ask for the full device serial number to verify the exact device before suggesting steps. If a serial appears in the message, use it.

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
${profileContext}
${deviceContext}
${ticketContext}
${warrantyContext}

PRIVACY & SAFETY:
- Never reveal full serial numbers. Only masked serials are available in the context and replies.
- Use the provided device list and user profile to tailor answers.
- If the user asks about a specific device, match by name or model from DEVICES and answer accordingly.`,
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
    if (!noTicket && ticketContext && !content.toLowerCase().includes('ticket') && !content.startsWith('COMPLAINT_DETECTED:') && !content.startsWith('REQUIRES_TICKET:')) {
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
        const options = deviceSummaries
          .slice(0, 3)
          .map((d: any) => `${d.name}${d.model ? ` (${d.model})` : ''}`)
          .filter(Boolean)
          .join(', ');
        const hint = options ? ` For reference, I see devices like: ${options}.` : '';
        enhancedReply = `To fetch the exact warranty, please enter the full device serial number.${hint}`;
      }
    }

    // Global serial detection: if user provided a serial but no explicit intent, acknowledge and prompt next action
    if (!isWarrantyQuestion && !isDeviceInfoQuestion && !isProblemIssue && globalSerialMatchedDevice) {
      try {
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
      } catch {}
    }

    // Device information flow: normalized serial match or unique last-4; ambiguity lists; otherwise ask for full serial
    if (isDeviceInfoQuestion) {
      if (multiDeviceInfoMessage) {
        enhancedReply = multiDeviceInfoMessage;
      } else if (deviceInfoMessage) {
        enhancedReply = deviceInfoMessage;
      } else {
        enhancedReply = `To show the device details, please enter the full device serial number so I can verify the exact device.`;
      }
    }

    // Problem / not working flow
    if (isProblemIssue) {
      if (problemMatchedDevice) {
        try {
          const name = problemMatchedDevice.deviceName || problemMatchedDevice.name || 'Device';
          const type = problemMatchedDevice.deviceType || problemMatchedDevice.type || 'Device';
          const model = problemMatchedDevice.deviceModel || problemMatchedDevice.model || problemMatchedDevice.modelNumber || '';
          const maskedSerial = typeof problemMatchedSerialRaw === 'string' && problemMatchedSerialRaw
            ? `***${String(problemMatchedSerialRaw).slice(-4)}`
            : '';
          const issueText = String(lastUserMsg || '').slice(0, 400);
          const prompt = `You are a device troubleshooting assistant for Smile Smart Homes. The user reports a problem.\n\nDevice: ${type} ${model ? '(' + model + ')' : ''} ${name}\nSerial: ${maskedSerial} (masked)\n\nUser said: ${issueText}\n\nProvide ONE actionable troubleshooting step (<=80 words), specific to the device and issue. Keep it concise and user-friendly.`;
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
