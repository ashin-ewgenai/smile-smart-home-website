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
    DEVICES: "User_Devices", // Standardize on User_Devices
    TICKETS: "Support_Tickets",
    CHAT_SESSIONS: "chat_sessions",
    RATE_LIMITS: "rate_limits"
  }
};

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
 * DEPRECATED: triageChat function - functionality now integrated into chatWithOpenAI
 * Keeping for backward compatibility but should be removed in future versions
 */
// removed unused triageChat callable

// ===== Full chat with OpenAI including Firestore persistence =====
// request.data: { messages: {role:'system'|'user'|'assistant', content:string}[], model?: string, sessionId?: string, ticketId?: string }
// response: { reply: string, sessionId: string, requiresTicket?: boolean, ticketDetails?: any, deviceSelection?: any }
export const chatWithOpenAI = onCall({ secrets: [OPENAI_API_KEY], cors: true }, async (request: CallableRequest) => {
  const authCtx = request.auth;
  if (!authCtx) throw new HttpsError("unauthenticated", "Must be authenticated.");

  const msgs = request.data?.messages as Array<{ role: string; content: string }> | undefined;
  const model = (request.data?.model as string | undefined) || "gpt-4o-mini";
  const providedTicketId = (request.data?.ticketId as string | undefined)?.trim();
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
      { merge: true },
    );
    const lastUser = [...clean].reverse().find((m) => m.role === "user");
    if (lastUser) {
      await sessionsCol.doc(sessionId).collection("messages").add({ role: "user", content: lastUser.content, ts: now });
    }
  } catch {}

  // Device context for better answers
  const devicesQuery = await db.collection("User_Devices").where("uid", "==", uid).get();
  const userDevices = devicesQuery.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) })) as Array<{ id: string; deviceName?: string; name?: string }>;
  const deviceContext = userDevices.length > 0 ? `User has the following devices installed: ${userDevices.map((d) => d.deviceName || d.name || "Unknown Device").join(", ")}.` : "";

  // Enhanced active tickets context with all required fields
  let ticketContext = "";
  let activeTicket = null;

  try {
    // Use provided ticket ID or fetch latest unresolved ticket
    if (providedTicketId) {
      const ticketDoc = await db.collection("Support_Tickets").doc(providedTicketId).get();
      const ticketData = ticketDoc.data();
      if (ticketDoc.exists && ticketData && ticketData.uid === uid) {
        activeTicket = { ticketId: providedTicketId, data: ticketData as any };
      }
    } else {
      activeTicket = await fetchLatestUnresolvedTicket(uid);
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

  const systemPrompt = {
    role: "system",
    content: `You are a support assistant for Smile Smart Homes, verifying customer devices and helping troubleshoot their issues.

IMPORTANT RULES:
1. ONLY answer questions related to smart home devices, automation, IoT, home security, lighting, climate control, entertainment systems, and Smile Smart Homes products/services.
2. When handling device verification, compare extracted serial numbers with registered devices and state clearly if they match or not.
3. Analyze each user message to determine if it's a COMPLAINT or GENERAL QUERY.
4. If the message is unclear, ask ONE concise clarifying question (<=20 words).
5. If no prior assistant message exists, begin with a brief greeting.

SERIAL VERIFICATION WORKFLOW:
- When a user uploads an image for serial verification, extract the serial number using OCR
- Compare extracted serial with their registered devices
- If serials match: ✅ Confirm verification and proceed with troubleshooting
- If serials don't match: ⚠️ Mention politely, suggest rechecking the label, still provide basic troubleshooting
- Keep verification responses short, clear, and professional
- Don't exceed what's needed to move the support process forward

WORKFLOW RULES:
- For NEW COMPLAINTS without active ticket: Respond with "REQUIRES_TICKET:" followed by explanation
- For users WITH active ticket: First respond with "TICKET_VERIFICATION:" to confirm ticket details
- After ticket verification: Respond with "DEVICE_SELECTION:" to prompt device selection
- For GENERAL QUERIES: Provide helpful answers
- NEVER ask for ticket numbers - always automatically fetch unresolved tickets
- If active ticket context is provided, ALWAYS acknowledge the existing ticket first
- Consider troubleshooting history to avoid repeating failed solutions
- If troubleshooting attempts are at 3/3, suggest escalation to human support
- When device needs serial verification: Ask user to upload image of device serial number

RESPONSE FORMAT:
- For complaints needing ticket: Start response with "REQUIRES_TICKET:" followed by explanation
- For ticket verification: Start response with "TICKET_VERIFICATION:" followed by confirmation message
- For device selection: Start response with "DEVICE_SELECTION:" followed by prompt to select device
- For serial verification: Ask user to "Please upload an image of your device showing the serial number"
- When providing serial verification results, be clear about match status
- Keep responses concise and professional (under 150 words)

USER CONTEXT:
${deviceContext}${ticketContext}`,
  };

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
      await sessionsCol.doc(sessionId).collection("messages").add({ role: "assistant", content, ts: Date.now() });
      await sessionsCol.doc(sessionId).set({ updatedAt: Date.now(), status: "active" }, { merge: true });
    } catch {}

    // Enhanced response with workflow handling
    let enhancedReply = content;
    let requiresTicket = false;
    let ticketDetails = null;
    let deviceSelection = null;

    // Handle workflow responses
    if (content.startsWith('REQUIRES_TICKET:')) {
      requiresTicket = true;
      enhancedReply = content.replace('REQUIRES_TICKET:', '').trim();
    } else if (content.startsWith('TICKET_VERIFICATION:') && activeTicket) {
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
      enhancedReply = content.replace('TICKET_VERIFICATION:', '').trim();
    } else if (content.startsWith('DEVICE_SELECTION:')) {
      // Fetch user devices for selection
      try {
        const devicesQuery = await db.collection("User_Devices").where("uid", "==", uid).get();
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
        enhancedReply = content.replace('DEVICE_SELECTION:', '').trim();
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

    // If there's an active ticket and AI didn't acknowledge it, add acknowledgment
    if (ticketContext && !content.toLowerCase().includes('ticket') && !content.startsWith('COMPLAINT_DETECTED:') && !content.startsWith('REQUIRES_TICKET:')) {
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
      ...(deviceSelection && { deviceSelection })
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


// ===== Ticket-related helper callables used by chatbot workflow =====
// DEPRECATED: analyzeComplaint function - replaced by analyzeUserUnresolvedTicket
// Keeping for backward compatibility but functionality is redundant
// removed unused analyzeComplaint callable

// removed unused requestSerialImage callable
// ===== Consolidated ticket fetching utility =====
// Utility function to fetch the latest unresolved ticket for a user
async function fetchLatestUnresolvedTicket(uid: string) {
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
// removed unused checkActiveUnresolvedTicket callable

export const extractSerialFromImage = onCall({secrets: [OPENAI_API_KEY], cors: true}, async (request) => {
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

  console.log(`[extractSerialFromImage] Processing image for ticket ${ticketId}: ${imageUrl}`);

  const messages = [
    {
      role: "user",
      content: [
        {type: "text", text: "Extract the product serial number visible in this image. Return only the serial string. If unclear, say: NONE"},
        {type: "image_url", image_url: {url: imageUrl}},
      ],
    },
  ];

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {"Content-Type": "application/json", Authorization: `Bearer ${apiKey}`},
      body: JSON.stringify({model: "gpt-4o", messages, temperature: 0.0, max_tokens: 50}),
    } as any);
    
    if (!resp.ok) {
      const errorText = await resp.text();
      console.error(`[extractSerialFromImage] OpenAI API error: ${resp.status} - ${errorText}`);
      throw new HttpsError("unavailable", `OpenAI error: ${resp.status}`);
    }
    
    const data = await resp.json();
    const content: string = (data?.choices?.[0]?.message?.content || "").trim();
    const extractedSerial = content === "NONE" ? "" : content.replace(/[^A-Za-z0-9\-\/ _]/g, "").slice(0, 64);
    
    console.log(`[extractSerialFromImage] Extracted serial: "${extractedSerial}"`);
    
    if (!extractedSerial) {
      await tRef.set({deviceSerial: null, updatedAt: Date.now()}, {merge: true});
      return {
        serial: null,
        verificationStatus: "No serial number could be detected from the uploaded image.",
        deviceVerified: false
      };
    }

    // Verify device ownership
    console.log(`[extractSerialFromImage] Verifying device ownership for serial: ${extractedSerial}`);
    
    const userDevicesSnap = await db.collection("User_Devices")
      .where("uid", "==", authCtx.uid)
      .where("serial", "==", extractedSerial)
      .get();

    let deviceDetails: any = null;
    let verificationStatus = "";
    
    if (!userDevicesSnap.empty) {
      deviceDetails = {id: userDevicesSnap.docs[0].id, ...userDevicesSnap.docs[0].data()};
      verificationStatus = `✅ Device verified: The serial number ${extractedSerial} matches your registered ${deviceDetails.deviceName || deviceDetails.name}.`;
      console.log(`[extractSerialFromImage] Device verified: ${deviceDetails.deviceName || deviceDetails.name}`);
    } else {
      verificationStatus = `⚠️ Serial number ${extractedSerial} was found in your image, but it doesn't match any registered devices. Please double-check the serial label on your device.`;
      console.log(`[extractSerialFromImage] Device not found in user's registered devices`);
    }

    // Update ticket with serial and verification info
    await tRef.set({
      deviceSerial: extractedSerial, 
      deviceVerified: !!deviceDetails,
      deviceDetails: deviceDetails,
      updatedAt: Date.now()
    }, {merge: true});

    return {
      serial: extractedSerial,
      verificationStatus,
      deviceVerified: !!deviceDetails,
      deviceDetails
    };
    
  } catch (error) {
    console.error(`[extractSerialFromImage] Error processing image:`, error);
    throw error;
  }
});

export const verifySerialAndFetchDocs = onCall({ cors: true }, async (request) => {
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

export const suggestTroubleshootingStep = onCall({secrets: [OPENAI_API_KEY], cors: true}, async (request) => {
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

// removed unused resolveOrEscalate callable

// removed unused recordTicketFeedback callable


// ===== Fetch and analyze latest unresolved ticket for a user =====
export const analyzeUserUnresolvedTicket = onCall({secrets: [OPENAI_API_KEY], cors: true}, async (request) => {
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
