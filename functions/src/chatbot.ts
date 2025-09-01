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

// ===== In-memory rate limiter for triageChat =====
const triageRateMap: Map<string, number[]> = new Map();

/**
 * triageChat: Classify a single user message and optionally answer simple FAQs.
 * request.data: { message: string }
 * response: { kind: 'faq'|'general'|'complaint', answer?: string }
 */
export const triageChat = onCall({secrets: [OPENAI_API_KEY]}, async (request: CallableRequest) => {
  const authCtx = request.auth;
  const message = (request.data?.message as string | undefined)?.trim();
  if (!message) throw new HttpsError("invalid-argument", "message is required");

  // In-memory rate limit: up to 10 calls per 60 s, 3 s cooldown
  const COOLDOWN_MS = 3000;
  const WINDOW_MS = 60_000;
  const MAX_PER_WINDOW = 10;
  const uid = authCtx?.uid || `anon_${request.rawRequest.ip || "unknown"}`;
  const now = Date.now();
  const recent = (triageRateMap.get(uid) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length > 0 && now - recent[recent.length - 1] < COOLDOWN_MS) {
    const waitSec = Math.ceil((COOLDOWN_MS - (now - recent[recent.length - 1])) / 1000);
    throw new HttpsError("resource-exhausted", `Please wait ${waitSec}s before trying again.`);
  }
  if (recent.length >= MAX_PER_WINDOW) {
    throw new HttpsError("resource-exhausted", "Rate limit exceeded. Try again in a minute.");
  }
  recent.push(now);
  triageRateMap.set(uid, recent);

  const apiKey = OPENAI_API_KEY.value();
  if (!apiKey) throw new HttpsError("failed-precondition", "OPENAI_API_KEY is not configured");

  const system = `You are Smile Smart Home support triage.
Classify the user's single message as one of: faq, general, complaint.
- faq: product or account questions with clear factual answer (e.g., warranty, pricing, how to reset device, app navigation).
- general: small talk or generic questions to the assistant.
- complaint: reports of issues, malfunctions, or requests for help that likely need a support ticket.
If faq or general, provide a concise helpful answer (<=80 words).
Output strict JSON: {"kind":"faq|general|complaint","answer":"..."?}`;

  const body = {
    model: "gpt-4o-mini",
    messages: [
      {role: "system", content: system},
      {role: "user", content: message},
    ],
    temperature: 0.2,
    max_tokens: 200,
  };

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {"Content-Type": "application/json", Authorization: `Bearer ${apiKey}`},
      body: JSON.stringify(body),
    } as any);
    if (!resp.ok) throw new HttpsError("unavailable", `OpenAI error: ${resp.status}`);
    const data = await resp.json();
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    if (!content) return {kind: "complaint"} as const;

    // Parse JSON strictly; fallback to complaint on failure
    let parsed: {kind?: string; answer?: string} = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) {
        try { parsed = JSON.parse(m[0]); } catch {}
      }
    }
    const kind = parsed.kind === "faq" || parsed.kind === "general" || parsed.kind === "complaint" ? parsed.kind : "complaint";
    if (kind === "faq" || kind === "general") {
      const answer = typeof parsed.answer === "string" && parsed.answer.trim() ? parsed.answer.trim() : "";
      return {kind, answer} as const;
    }
    return {kind: "complaint"} as const;
  } catch (e) {
    const err = e as {message?: string};
    throw new HttpsError("internal", err?.message || "Triage failed");
  }
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

  // ---- Per-user Firestore rate limiting ----
  const COOLDOWN_MS = 3000;
  const WINDOW_MS = 60_000;
  const MAX_PER_WINDOW = 15;
  const uid = authCtx.uid;
  const rlRef = db.collection("rate_limits").doc(uid);
  const nowTs = Date.now();
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(rlRef);
      const data = (snap.exists ? (snap.data() as any) : {}) || {};
      const lastTs = Number(data.lastTs ?? 0);
      const windowStart = Number(data.windowStart ?? 0);
      const count = Number(data.count ?? 0);
      if (nowTs - lastTs < COOLDOWN_MS) {
        const waitSec = Math.ceil((COOLDOWN_MS - (nowTs - lastTs)) / 1000);
        throw new HttpsError("resource-exhausted", `Please wait ${waitSec}s before trying again.`);
      }
      if (nowTs - windowStart >= WINDOW_MS) {
        tx.set(rlRef, {lastTs: nowTs, windowStart: nowTs, count: 1}, {merge: true});
      } else {
        if (count >= MAX_PER_WINDOW) {
          throw new HttpsError("resource-exhausted", "Rate limit exceeded. Try again in a minute.");
        }
        tx.set(rlRef, {lastTs: nowTs, count: count + 1}, {merge: true});
      }
    });
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

  // Active tickets context
  let ticketContext = "";
  try {
    const ticketsQuery = await db.collection("Support_Tickets").where("uid", "==", uid).where("status", "!=", "closed").get();
    const userTickets = ticketsQuery.docs.map((doc) => ({id: doc.id, ...doc.data()}));
    if (userTickets.length > 0) {
      const latest = userTickets[0] as any;
      const issueText = (latest.complaint || latest.issue || latest.description || "").toString();
      const deviceText = (latest.deviceType || latest.deviceModel || "Unknown").toString();
      ticketContext = `\n\nIMPORTANT: User has an active ticket #${latest.id} with issue: "${issueText}". Device: ${deviceText}. Priority: ${latest.priority || "medium"}.`;
    }
  } catch {}

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
- If active ticket context is provided, acknowledge the ticket and tailor guidance.
- Keep responses concise and professional${ticketContext}\n- ${deviceContext}`,
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
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    if (!content) throw new HttpsError("data-loss", "No content in OpenAI response");

    try {
      await sessionsCol.doc(sessionId).collection("messages").add({role: "assistant", content, ts: Date.now()});
      await sessionsCol.doc(sessionId).set({updatedAt: Date.now(), status: "active"}, {merge: true});
    } catch {}

    return {reply: content, sessionId};
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
export const analyzeComplaint = onCall({secrets: [OPENAI_API_KEY]}, async (request) => {
  const authCtx = request.auth;
  if (!authCtx) throw new HttpsError("unauthenticated", "Must be authenticated.");
  const ticketId = (request.data?.ticketId as string | undefined)?.trim();
  if (!ticketId) throw new HttpsError("invalid-argument", "ticketId is required");

  const snap = await db.collection("Support_Tickets").doc(ticketId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Ticket not found");
  const t = snap.data() as any;
  if (t.uid !== authCtx.uid) throw new HttpsError("permission-denied", "Not your ticket");

  const apiKey = OPENAI_API_KEY.value();
  if (!apiKey) throw new HttpsError("failed-precondition", "OPENAI_API_KEY not configured");
  const prompt = `You are a support triage assistant. Summarize the user complaint in 1-2 concise sentences and list likely root causes as bullet points (max 4).\n\nComplaint:\n${t.complaint}`;
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {"Content-Type": "application/json", Authorization: `Bearer ${apiKey}`},
    body: JSON.stringify({model: "gpt-4o-mini", messages: [{role: "user", content: prompt}], temperature: 0.2, max_tokens: 250}),
  } as RequestInit);
  if (!resp.ok) throw new HttpsError("unavailable", `OpenAI error: ${resp.status}`);
  const data = await resp.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  return {analysis: content || ""};
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
  await tRef.set({deviceSerial: serial, deviceType, updatedAt: Date.now()}, {merge: true});

  const docsSnap = await db.collection("product_docs").doc(deviceType).get();
  const links: string[] = (docsSnap.exists ? (docsSnap.data()?.links as string[]) : []) || [];
  return {valid: true, deviceType, links};
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

  const prompt = `You are a device troubleshooting assistant. Based on the user's complaint and the provided documentation links, suggest one precise next step they can try now. Keep it under 80 words and actionable.\n\nComplaint: ${t.complaint}\nDocs: ${docs.join("\n")}`;
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
  const ticketId = (request.data?.ticketId as string | undefined)?.trim();
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
