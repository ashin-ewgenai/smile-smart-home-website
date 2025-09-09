import {onCall, HttpsError, CallableRequest} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import {initializeApp, getApps} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";

// Declare global fetch to satisfy TypeScript without DOM lib in Node runtimes
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const fetch: any;

// Secret for OpenAI
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

// Ensure Firebase Admin is initialized once per instance
if (!getApps().length) {
  initializeApp();
}

// Firestore reference shared by chatbot functions
const db = getFirestore();

// ===== Consolidated rate limiting utility =====
const applyRateLimit = async (uid: string, cooldownMs: number, windowMs: number, maxPerWindow: number, useFirestore = true) => {
  if (useFirestore) {
    // Firestore-based rate limiting for authenticated users
    const rlRef = db.collection("rate_limits").doc(uid);
    const nowTs = Date.now();
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(rlRef);
      const data = (snap.exists ? (snap.data() as any) : {}) || {};
      const lastTs = Number(data.lastTs ?? 0);
      const windowStart = Number(data.windowStart ?? 0);
      const count = Number(data.count ?? 0);
      if (nowTs - lastTs < cooldownMs) {
        const waitSec = Math.ceil((cooldownMs - (nowTs - lastTs)) / 1000);
        throw new HttpsError("resource-exhausted", `Please wait ${waitSec}s before trying again.`);
      }
      if (nowTs - windowStart >= windowMs) {
        tx.set(rlRef, {lastTs: nowTs, windowStart: nowTs, count: 1}, {merge: true});
      } else {
        if (count >= maxPerWindow) {
          throw new HttpsError("resource-exhausted", "Rate limit exceeded. Try again in a minute.");
        }
        tx.set(rlRef, {lastTs: nowTs, count: count + 1}, {merge: true});
      }
    });
  } else {
    // In-memory rate limiting for unauthenticated users (legacy triageChat)
    const triageRateMap: Map<string, number[]> = new Map();
    const now = Date.now();
    const recent = (triageRateMap.get(uid) || []).filter((t) => now - t < windowMs);
    if (recent.length > 0 && now - recent[recent.length - 1] < cooldownMs) {
      const waitSec = Math.ceil((cooldownMs - (now - recent[recent.length - 1])) / 1000);
      throw new HttpsError("resource-exhausted", `Please wait ${waitSec}s before trying again.`);
    }
    if (recent.length >= maxPerWindow) {
      throw new HttpsError("resource-exhausted", "Rate limit exceeded. Try again in a minute.");
    }
    recent.push(now);
    triageRateMap.set(uid, recent);
  }
};

/**
 * DEPRECATED: triageChat function - functionality now integrated into chatWithOpenAI
 * Keeping for backward compatibility but should be removed in future versions
 */
export const triageChat = onCall({secrets: [OPENAI_API_KEY]}, async (request: CallableRequest) => {
  console.warn("triageChat is deprecated. Use chatWithOpenAI instead.");
  const authCtx = request.auth;
  const message = (request.data?.message as string | undefined)?.trim();
  if (!message) throw new HttpsError("invalid-argument", "message is required");

  const uid = authCtx?.uid || `anon_${request.rawRequest.ip || "unknown"}`;
  await applyRateLimit(uid, 3000, 60000, 10, false);

  // Simplified response - redirect to main chat
  return {kind: "complaint", answer: "Please use the main chat for assistance."} as const;
});

// ===== Full chat with OpenAI including Firestore persistence =====
// request.data: { messages: {role:'system'|'user'|'assistant', content:string}[], model?: string, sessionId?: string }
// response: { reply: string, sessionId: string }
export const chatWithOpenAI = onCall({secrets: [OPENAI_API_KEY]}, async (request: CallableRequest) => {
  const authCtx = request.auth;
  if (!authCtx) throw new HttpsError("unauthenticated", "Must be authenticated.");

  const msgs = request.data?.messages as Array<{role: string; content: string}> | undefined;
  const model = (request.data?.model as string | undefined) || "gpt-4o-mini";
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
    await applyRateLimit(uid, 3000, 60000, 15, true);
  } catch (e) {
    if (e instanceof HttpsError && e.code === "resource-exhausted") throw e;
  }

  // Persist chat session
  const sessionsCol = db.collection("chat_sessions");
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
      },
      {merge: true},
    );
    const lastUser = [...clean].reverse().find((m) => m.role === "user");
    if (lastUser) {
      await sessionsCol.doc(sessionId).collection("messages").add({role: "user", content: lastUser.content, ts: now});
    }
  } catch {}

  // Device context for better answers
  const devicesQuery = await db.collection("devices").where("ownerUid", "==", uid).get();
  const userDevices = devicesQuery.docs.map((doc) => ({id: doc.id, ...(doc.data() as Record<string, unknown>)})) as Array<{ id: string; deviceName?: string }>;
  const deviceContext = userDevices.length > 0 ? `User has the following devices installed: ${userDevices.map((d) => d.deviceName || "Unknown Device").join(", ")}.` : "";

  // Enhanced active tickets context with all required fields
  let ticketContext = "";
  try {
    const ticket = await fetchLatestUnresolvedTicket(uid);
    
    if (ticket) {
      const { ticketId, data: ticketData } = ticket;
      
      // Extract all required fields from your workflow requirements
      const category = ticketData.category || "General";
      const subject = ticketData.subject || "No subject";
      const description = ticketData.description || ticketData.complaint || ticketData.issue || "No description";
      const status = ticketData.status || "Pending";
      const priority = ticketData.priority || "medium";
      const createdAt = ticketData.createdAt?.toDate?.()?.toLocaleDateString() || "Unknown date";
      
      // Device information
      const deviceType = ticketData.deviceType || "Unknown device";
      const deviceModel = ticketData.deviceModel || "";
      const deviceSerial = ticketData.deviceSerial || "";
      const deviceInfo = `${deviceType}${deviceModel ? ` ${deviceModel}` : ""}${deviceSerial ? ` (Serial: ${deviceSerial})` : ""}`;
      
      // Troubleshooting history
      const troubleshootingAttempts = ticketData.troubleshootingAttempts || 0;
      const lastSuggestion = ticketData.lastSuggestion || "";
      const analysisResult = ticketData.analysisResult || ticketData.initialSolution || "";
      
      // Build comprehensive context
      ticketContext = `\n\nACTIVE TICKET CONTEXT:
` +
        `- Ticket ID: #${ticketId}\n` +
        `- Status: ${status} | Priority: ${priority}\n` +
        `- Category: ${category}\n` +
        `- Subject: "${subject}"\n` +
        `- Issue Description: "${description}"\n` +
        `- Device: ${deviceInfo}\n` +
        `- Created: ${createdAt}\n` +
        `- Troubleshooting Attempts: ${troubleshootingAttempts}/3\n` +
        (lastSuggestion ? `- Last Suggestion: "${lastSuggestion}"\n` : "") +
        (analysisResult ? `- AI Analysis: "${analysisResult.slice(0, 200)}..."\n` : "") +
        `\nIMPORTANT: Acknowledge this existing ticket and provide relevant assistance based on the context above.`;
    }
  } catch (error) {
    console.warn("Failed to fetch ticket context:", error);
  }

  const systemPrompt = {
    role: "system",
    content: `You are a support assistant for Smile Smart Homes, a smart home automation company.

IMPORTANT RULES:
1. ONLY answer questions related to smart home devices, automation, IoT, home security, lighting, climate control, entertainment systems, and Smile Smart Homes products/services.
2. If asked about anything unrelated, respond: "Sorry, I don't know how I could help you with that. I'm a support assistant for Smile Smart Homes. Please make queries only related to smart home automation and our products."
3. Analyze each user message to determine if it's a COMPLAINT or GENERAL QUERY.
4. If the message is unclear, ask ONE concise clarifying question (<=20 words).
5. If no prior assistant message exists, begin with a brief greeting.

RESPONSE FORMAT:
- For COMPLAINTS: Start with "COMPLAINT_DETECTED:" then next step or clarifying question.
- For GENERAL QUERIES: Provide helpful answers.
- If active ticket context is provided, ALWAYS acknowledge the existing ticket first and provide relevant assistance.
- Consider troubleshooting history to avoid repeating failed solutions.
- If troubleshooting attempts are at 3/3, suggest escalation to human support.
- Keep responses concise and professional.

USER CONTEXT:
${deviceContext}${ticketContext}`,
  };

  const messagesWithSystem = [systemPrompt, ...clean];

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {"Content-Type": "application/json", Authorization: `Bearer ${apiKey}`},
      body: JSON.stringify({model, messages: messagesWithSystem, temperature: 0.4, max_tokens: 500}),
    } as any);
    if (!resp.ok) throw new HttpsError("unavailable", `OpenAI error: ${resp.status}`);
    const data = await resp.json();
    let content: string | undefined = data?.choices?.[0]?.message?.content;
    if (!content) throw new HttpsError("data-loss", "No content in OpenAI response");

    // Suppress repeating COMPLAINT_DETECTED after it has been shown once in this conversation.
    try {
      const priorComplaintShown = clean.some(
        (m) => m.role === "assistant" && typeof m.content === "string" && m.content.includes("COMPLAINT_DETECTED:")
      );
      if (priorComplaintShown && content.startsWith("COMPLAINT_DETECTED:")) {
        content = content.replace(/^COMPLAINT_DETECTED:\s*/i, "").trim();
      }
    } catch {}

    try {
      await sessionsCol.doc(sessionId).collection("messages").add({role: "assistant", content, ts: Date.now()});
      await sessionsCol.doc(sessionId).set({updatedAt: Date.now(), status: "active"}, {merge: true});
    } catch {}

    // Enhanced response with ticket context awareness
    let enhancedReply = content;
    
    // If there's an active ticket and AI didn't acknowledge it, add acknowledgment
    if (ticketContext && !content.toLowerCase().includes('ticket') && !content.startsWith('COMPLAINT_DETECTED:')) {
      const ticketMatch = ticketContext.match(/Ticket ID: #([^\n]+)/);
      const subjectMatch = ticketContext.match(/Subject: "([^"]+)"/);
      if (ticketMatch && subjectMatch) {
        enhancedReply = `I see you have an active ticket #${ticketMatch[1]} about "${subjectMatch[1]}". ${content}`;
      }
    }
    
    return {reply: enhancedReply, sessionId};
  } catch (e) {
    const err = e as {message?: string};
    try {
      await sessionsCol.doc(sessionId).set({status: "error", updatedAt: Date.now()}, {merge: true});
      await sessionsCol.doc(sessionId).collection("messages").add({role: "assistant", content: `Exception: ${err?.message || "Chat call failed"}`, ts: Date.now(), error: true});
    } catch {}
    throw new HttpsError("internal", err?.message || "Chat call failed");
  }
});

// ===== Ticket-related helper callables used by chatbot workflow =====
// DEPRECATED: analyzeComplaint function - replaced by analyzeUserUnresolvedTicket
// Keeping for backward compatibility but functionality is redundant
export const analyzeComplaint = onCall({secrets: [OPENAI_API_KEY]}, async (request) => {
  console.warn("analyzeComplaint is deprecated. Use analyzeUserUnresolvedTicket instead.");
  const authCtx = request.auth;
  if (!authCtx) throw new HttpsError("unauthenticated", "Must be authenticated.");
  const ticketId = (request.data?.ticketId as string | undefined)?.trim();
  if (!ticketId) throw new HttpsError("invalid-argument", "ticketId is required");

  // Use the consolidated ticket fetching utility
  const ticket = await fetchLatestUnresolvedTicket(authCtx.uid);
  if (!ticket) {
    return { analysis: "No active ticket found for analysis." };
  }
  
  return { analysis: `Ticket found: ${ticket.data.subject || 'No subject'}. Please use the main chat interface for assistance.` };
});

export const requestSerialImage = onCall(async (request) => {
  const authCtx = request.auth;
  if (!authCtx) throw new HttpsError("unauthenticated", "Must be authenticated.");
  const ticketId = (request.data?.ticketId as string | undefined)?.trim();
  if (!ticketId) throw new HttpsError("invalid-argument", "ticketId is required");

  const ref = db.collection("Support_Tickets").doc(ticketId);
  let attempts = 0;
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) throw new HttpsError("not-found", "Ticket not found");
    const t = s.data() as any;
    if (t.uid !== authCtx.uid) throw new HttpsError("permission-denied", "Not your ticket");
    attempts = Number(t.imageUploadAttempts || 0);
    if (attempts >= 2) throw new HttpsError("failed-precondition", "Max image uploads reached");
    tx.set(ref, {imageUploadAttempts: attempts + 1, updatedAt: Date.now()}, {merge: true});
  });
  return {allowed: true, remaining: Math.max(0, 2 - (attempts + 1))};
});

// ===== Consolidated ticket fetching utility =====
const fetchLatestUnresolvedTicket = async (uid: string) => {
  try {
    const ticketsQuery = await db.collection("Support_Tickets")
      .where("uid", "==", uid)
      .where("status", "in", ["Pending", "In Progress"])
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    if (ticketsQuery.empty) {
      return null;
    }

    const ticketDoc = ticketsQuery.docs[0];
    return { ticketDoc, ticketId: ticketDoc.id, data: ticketDoc.data() as any };
  } catch (error) {
    console.error("Error fetching unresolved ticket:", error);
    throw new HttpsError("internal", "Failed to fetch ticket information");
  }
};

// ===== Check for active unresolved tickets =====
export const checkActiveUnresolvedTicket = onCall(async (request) => {
  const authCtx = request.auth;
  if (!authCtx) throw new HttpsError("unauthenticated", "Must be authenticated.");

  const ticket = await fetchLatestUnresolvedTicket(authCtx.uid);
  
  if (!ticket) {
    return {hasActiveTicket: false};
  }

  return {
    hasActiveTicket: true,
    ticketId: ticket.ticketId,
    subject: ticket.data.subject,
    description: ticket.data.description
  };
});

export const extractSerialFromImage = onCall({secrets: [OPENAI_API_KEY]}, async (request) => {
  const authCtx = request.auth;
  if (!authCtx) throw new HttpsError("unauthenticated", "Must be authenticated.");
  const ticketId = (request.data?.ticketId as string | undefined)?.trim();
  const imageUrl = (request.data?.imageUrl as string | undefined)?.trim();
  if (!ticketId || !imageUrl) throw new HttpsError("invalid-argument", "ticketId and imageUrl are required");

  const tRef = db.collection("Support_Tickets").doc(ticketId);
  const s = await tRef.get();
  if (!s.exists) throw new HttpsError("not-found", "Ticket not found");
  const t = s.data() as any;
  if (t.uid !== authCtx.uid) throw new HttpsError("permission-denied", "Not your ticket");

  const apiKey = OPENAI_API_KEY.value();
  if (!apiKey) throw new HttpsError("failed-precondition", "OPENAI_API_KEY not configured");

  const messages = [
    {
      role: "user",
      content: [
        {type: "text", text: "Extract the product serial number visible in this image. Return only the serial string. If unclear, say: NONE"},
        {type: "image_url", image_url: {url: imageUrl}},
      ],
    },
  ];

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {"Content-Type": "application/json", Authorization: `Bearer ${apiKey}`},
    body: JSON.stringify({model: "gpt-4o", messages, temperature: 0.0, max_tokens: 50}),
  } as any);
  if (!resp.ok) throw new HttpsError("unavailable", `OpenAI error: ${resp.status}`);
  const data = await resp.json();
  const content: string = (data?.choices?.[0]?.message?.content || "").trim();
  const serial = content === "NONE" ? "" : content.replace(/[^A-Za-z0-9\-\/ _]/g, "").slice(0, 64);
  if (!serial) return {serial: null};

  await tRef.set({deviceSerial: serial, updatedAt: Date.now()}, {merge: true});
  return {serial};
});

export const verifySerialAndFetchDocs = onCall(async (request) => {
  const authCtx = request.auth;
  if (!authCtx) throw new HttpsError("unauthenticated", "Must be authenticated.");
  const ticketId = (request.data?.ticketId as string | undefined)?.trim();
  const serial = (request.data?.serial as string | undefined)?.trim();
  if (!ticketId || !serial) throw new HttpsError("invalid-argument", "ticketId and serial are required");

  const tRef = db.collection("Support_Tickets").doc(ticketId);
  const tSnap = await tRef.get();
  if (!tSnap.exists) throw new HttpsError("not-found", "Ticket not found");
  const t = tSnap.data() as any;
  if (t.uid !== authCtx.uid) throw new HttpsError("permission-denied", "Not your ticket");

  const devSnap = await db.collection("devices").doc(serial).get();
  if (!devSnap.exists) return {valid: false, message: "This product is not recognized."};
  const dev = devSnap.data() as any;
  if (dev.ownerUid !== authCtx.uid) return {valid: false, message: "This product is not recognized."};

  const deviceType: string = dev.deviceType || "generic";
  const deviceModel: string = dev.deviceModel || dev.model || "unknown";
  await tRef.set({deviceSerial: serial, deviceType, deviceModel, updatedAt: Date.now()}, {merge: true});

  // Fetch device-specific support documents using the proper path structure
  const deviceUID = dev.deviceUID || serial;
  let supportDocs: any[] = [];
  
  try {
    // Primary: Fetch user-specific device documents from flat collection
    const userDeviceDocsSnap = await db.collection("User_Devices").where("uid", "==", authCtx.uid).where("sourceDeviceId", "==", deviceUID).get();
    if (!userDeviceDocsSnap.empty) {
      supportDocs = userDeviceDocsSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));
    } else {
      // Fallback: Fetch generic product documents
      const productDocsSnap = await db.collection("product_docs").doc(deviceType).get();
      if (productDocsSnap.exists) {
        const data = productDocsSnap.data();
        supportDocs = data?.documents || data?.links?.map((link: string) => ({url: link})) || [];
      }
    }
  } catch (error) {
    console.warn("Failed to fetch support documents:", error);
  }

  return {
    valid: true, 
    deviceType, 
    deviceModel,
    deviceUID,
    supportDocs,
    // Legacy compatibility
    links: supportDocs.map(doc => doc.url || doc.link).filter(Boolean)
  };
});

export const suggestTroubleshootingStep = onCall({secrets: [OPENAI_API_KEY]}, async (request) => {
  const authCtx = request.auth;
  if (!authCtx) throw new HttpsError("unauthenticated", "Must be authenticated.");
  const ticketId = (request.data?.ticketId as string | undefined)?.trim();
  const docs = (request.data?.docs as string[] | undefined) || [];
  if (!ticketId) throw new HttpsError("invalid-argument", "ticketId is required");

  const tRef = db.collection("Support_Tickets").doc(ticketId);
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

export const resolveOrEscalate = onCall(async (request) => {
  const authCtx = request.auth;
  if (!authCtx) throw new HttpsError("unauthenticated", "Must be authenticated.");
  const ticketId = (request.data?.ticketId as string | undefined)?.trim();
  const solved = Boolean(request.data?.solved);
  if (!ticketId) throw new HttpsError("invalid-argument", "ticketId is required");

  const tRef = db.collection("Support_Tickets").doc(ticketId);
  const snap = await tRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Ticket not found");
  const t = snap.data() as any;
  if (t.uid !== authCtx.uid) throw new HttpsError("permission-denied", "Not your ticket");

  const now = Date.now();
  if (solved) {
    await tRef.set({status: "resolved", updatedAt: now}, {merge: true});
    return {status: "resolved"};
  }

  await tRef.set({status: "escalated", updatedAt: now}, {merge: true});
  await db.collection("admin_notifications").add({
    type: "ticket_escalated",
    ticketId,
    ownerUid: authCtx.uid,
    createdAt: now,
    payload: {lastSuggestion: t.lastSuggestion || null, deviceSerial: t.deviceSerial || null},
  });
  return {status: "escalated"};
});

export const recordTicketFeedback = onCall(async (request) => {
  const authCtx = request.auth;
  if (!authCtx) throw new HttpsError("unauthenticated", "Must be authenticated.");
  const ticketId = (request.data?.ticketId as string | undefined)?.trim() || "";
  const rating = Number(request.data?.rating ?? 0);
  const comment = (request.data?.comment as string | undefined)?.trim() || "";
  if (!ticketId) throw new HttpsError("invalid-argument", "ticketId is required");

  const tRef = db.collection("Support_Tickets").doc(ticketId);
  const s = await tRef.get();
  if (!s.exists) throw new HttpsError("not-found", "Ticket not found");
  const t = s.data() as any;
  if (t.uid !== authCtx.uid) throw new HttpsError("permission-denied", "Not your ticket");

  await tRef.collection("feedback").add({rating, comment, ts: Date.now()});
  return {ok: true};
});

// ===== Fetch and analyze latest unresolved ticket for a user =====
export const analyzeUserUnresolvedTicket = onCall({secrets: [OPENAI_API_KEY]}, async (request) => {
  const authCtx = request.auth;
  if (!authCtx) throw new HttpsError("unauthenticated", "Must be authenticated.");

  const ticket = await fetchLatestUnresolvedTicket(authCtx.uid);
  
  if (!ticket) {
    return {status: "no_unresolved_tickets"};
  }

  const { ticketDoc, ticketId, data: t } = ticket;

  // Skip if already analyzed
  if (t.analyzedAt) {
    return {
      ticketId,
      subject: t.subject,
      initialSolution: t.initialSolution,
      needsSerial: t.needsSerial,
      status: "already_analyzed"
    };
  }

  const apiKey = OPENAI_API_KEY.value();
  if (!apiKey) throw new HttpsError("failed-precondition", "OPENAI_API_KEY not configured");

  // Get user's devices for context
  let userDevices: Array<{id: string; [key: string]: any}> = [];
  try {
    const devicesSnap = await db.collection("devices").where("ownerUid", "==", authCtx.uid).get();
    userDevices = devicesSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));
  } catch (e) {
    console.warn("Failed to fetch user devices:", e);
  }

  // Analyze the ticket complaint and provide initial solution
  const deviceList = userDevices.length > 0 
    ? `User's devices: ${userDevices.map((d: any) => d.deviceName || d.name || d.id).join(", ")}`
    : "User has no registered devices.";

  const prompt = `You are a support assistant for Smile Smart Homes. Analyze this support ticket and provide an initial solution or troubleshooting steps.

${deviceList}

Ticket Subject: ${t.subject}
Ticket Description: ${t.description}

Provide a helpful response that includes:
1. Acknowledgment of their issue
2. Initial troubleshooting steps or solution
3. Indicate if you need the device serial number (respond with "SERIAL_NEEDED: " followed by reason)
4. Keep response concise but helpful

If you can solve it directly, provide clear steps. If you need more info, ask specific questions.`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {"Content-Type": "application/json", Authorization: `Bearer ${apiKey}`},
    body: JSON.stringify({model: "gpt-4o-mini", messages: [{role: "user", content: prompt}], temperature: 0.4, max_tokens: 300}),
  } as RequestInit);

  if (!resp.ok) throw new HttpsError("unavailable", `OpenAI error: ${resp.status}`);
  const data = await resp.json();
  const content: string = (data?.choices?.[0]?.message?.content || "").trim();

  // Determine if serial is needed from response
  const needsSerial = content.includes("SERIAL_NEEDED:");

  // Update ticket with analysis and initial solution
  await ticketDoc.ref.set({
    analyzedAt: Date.now(),
    analysisResult: content,
    needsSerial: needsSerial,
    initialSolution: content,
    updatedAt: Date.now()
  }, {merge: true});

  return {
    ticketId,
    subject: t.subject,
    initialSolution: content,
    needsSerial,
    status: "analyzed"
  };
});
