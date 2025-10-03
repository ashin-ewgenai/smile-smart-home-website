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
  console.log("=== DEVICE FETCHING START ===");
  console.log("Fetching User_Devices for UID:", uid);
  const devicesQuery = await db.collection(CONFIG.COLLECTIONS.DEVICES).where("uid", "==", uid).get();
  console.log("User_Devices query returned:", devicesQuery.size, "documents");
  
  const userDevices = devicesQuery.docs.map((doc) => {
    const data = doc.data();
    console.log("User device document:", doc.id, "data:", data);
    return { id: doc.id, ...data };
  }) as Array<{ id: string; deviceName?: string; name?: string; deviceType?: string; type?: string; deviceModel?: string; model?: string; sourceDeviceId?: string }>;
  
  console.log("Parsed user devices:", userDevices);
  
  // Fetch actual device details from Devices collection using sourceDeviceId
  const deviceDetailsPromises = userDevices
    .filter(ud => {
      console.log("Checking user device:", ud.id, "has sourceDeviceId:", ud.sourceDeviceId);
      return ud.sourceDeviceId;
    })
    .map(async (ud) => {
      try {
        console.log("Fetching device details for sourceDeviceId:", ud.sourceDeviceId);
        const deviceDoc = await db.collection(CONFIG.COLLECTIONS.MAIN_DEVICES).doc(ud.sourceDeviceId!).get();
        console.log("Device document exists:", deviceDoc.exists, "for ID:", ud.sourceDeviceId);
        if (deviceDoc.exists) {
          const deviceData = deviceDoc.data();
          console.log("Device data:", deviceData);
          return { ...deviceData, id: deviceDoc.id, userDeviceId: ud.id };
        }
      } catch (error) {
        console.error(`Failed to fetch device details for ${ud.sourceDeviceId}:`, error);
      }
      return null;
    });
  
  const deviceDetails = (await Promise.all(deviceDetailsPromises)).filter(Boolean) as Array<any>;
  console.log("=== FINAL DEVICE DETAILS ===");
  console.log("Total device details fetched:", deviceDetails.length);
  console.log("Device details:", JSON.stringify(deviceDetails, null, 2));
  
  // If no device details were fetched via sourceDeviceId, use the user devices directly
  const finalDeviceList = deviceDetails.length > 0 ? deviceDetails : userDevices;
  console.log("Using device list:", finalDeviceList.length > 0 ? "device details" : "user devices");
  
  const deviceContext = finalDeviceList.length > 0 
    ? `User has the following devices installed: ${finalDeviceList.map((d) => `${d.deviceName || d.name || "Unknown Device"} (Type: ${d.deviceType || d.type || "Unknown"}, Model: ${d.deviceModel || d.model || d.modelNumber || "Unknown"})`).join(", ")}.` 
    : "";
  console.log("Device context for AI:", deviceContext);
  let finalDeviceContext = deviceContext;

  // Fallback: If no devices found, try fetching specific known document (e.g., for debugging)
  if (deviceDetails.length === 0 && userDevices.length === 0) {
    try {
      const fallbackDoc = await db.collection(CONFIG.COLLECTIONS.DEVICES).doc("0AE3Q2mJnr5JOw4fytKY").get();
      if (fallbackDoc.exists) {
        const fallbackUserDevice = { id: fallbackDoc.id, ...fallbackDoc.data() } as any;
        console.log("Fallback user device fetched:", fallbackUserDevice);
        
        // Try to fetch device details using sourceDeviceId from fallback
        if (fallbackUserDevice.sourceDeviceId) {
          try {
            const deviceDoc = await db.collection(CONFIG.COLLECTIONS.MAIN_DEVICES).doc(fallbackUserDevice.sourceDeviceId).get();
            if (deviceDoc.exists) {
              const deviceData = { ...deviceDoc.data(), id: deviceDoc.id } as any;
              finalDeviceContext = `User has the following devices installed: ${deviceData.deviceName || deviceData.name || "Unknown Device"} (Type: ${deviceData.deviceType || deviceData.type || "Unknown"}, Model: ${deviceData.deviceModel || deviceData.model || "Unknown"}).`;
              console.log("Fallback device details fetched:", deviceData);
            }
          } catch (error) {
            console.warn("Failed to fetch fallback device details:", error);
          }
        }
      }
    } catch (error) {
      console.warn("Fallback device fetch failed:", error);
    }
  }

  // Enhanced active tickets context with all required fields
  console.log("Fetching tickets for UID:", uid);
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
      console.log("Active ticket found:", ticketId, ticketContext);
    } else {
      console.log("No active ticket found for UID:", uid);
    }
  } catch (error) {
    console.warn("Failed to fetch ticket context:", error);
  }

  // Quick deterministic answers for device info queries (before calling OpenAI)
  // Uses device data we already fetched (finalDeviceList) to answer directly when possible.
  try {
    const lastUserMsgRaw = [...clean].reverse().find((m) => m.role === "user")?.content ?? "";
    const lastUserText = (typeof lastUserMsgRaw === "string" ? lastUserMsgRaw : JSON.stringify(lastUserMsgRaw)).toLowerCase();

    let quickReply: string | null = null;

    // 1) List device names
    const listDevicesRegex = /(names?|list)\s+(of\s+)?(my\s+)?devices|what\s+devices\s+do\s+i\s+have|list\s+my\s+devices/;
    if (listDevicesRegex.test(lastUserText)) {
      const lines = (finalDeviceList as any[]).map((d: any, i: number) => `${i + 1}. ${d.deviceName || d.name || d.deviceType || d.type || d.id}`).join("\n");
      if (lines) quickReply = `You have the following devices installed:\n\n${lines}`;
    }

    // 2) Model number lookup (e.g., "model number of CCTV")
    if (!quickReply && /(model(\s*number)?|modelno|model no)/.test(lastUserText)) {
      const normalize = (s: any) => String(s || "").toLowerCase();
      const wanted = (() => {
        // Try variants: "model number of X", "model of X", or "model X"
        const m1 = lastUserText.match(/model(?:\s*number)?\s*(?:of|for)\s+([a-z0-9 \-&]+)/i);
        const m2 = lastUserText.match(/model(?:\s*number)?\s+([a-z0-9 \-&]+)/i);
        return (m1?.[1] || m2?.[1] || "").trim().toLowerCase();
      })();

      const candidates = (finalDeviceList as any[]).filter((d: any) => {
        const hay = `${normalize(d.deviceName)} ${normalize(d.name)} ${normalize(d.deviceType)} ${normalize(d.type)}`;
        if (wanted) return hay.includes(wanted);
        if (lastUserText.includes("cctv") || lastUserText.includes("camera")) return /cctv|camera|cam/.test(hay);
        return false;
      });

      const pick: any | null = candidates[0] || ((finalDeviceList as any[]).length === 1 ? (finalDeviceList as any[])[0] : null);

      if (pick) {
        const modelFromSerials = Array.isArray(pick.serials)
          ? (pick.serials.find((s: any) => s?.modelNumber)?.modelNumber || pick.serials[0]?.modelNumber)
          : undefined;
        const model = pick.deviceModel || pick.model || pick.modelNumber || modelFromSerials;
        const name = pick.deviceName || pick.name || pick.deviceType || pick.type || "your device";
        if (model) quickReply = `The model number of ${name} is ${model}.`;
        else quickReply = `I couldn't find a saved model number for ${name}. Please check the device label.`;
      }
    }

    // 3) Warranty status lookup (e.g., "is my CCTV under warranty")
    if (!quickReply && /(warranty|under warranty|warranty status|warranty check)/.test(lastUserText)) {
      const normalize = (s: any) => String(s || "").toLowerCase();
      const wanted = (() => {
        const m = lastUserText.match(/(?:warranty|warranty status|warranty check)\s+(?:of|for|on)\s+([a-z0-9 \-&]+)/i);
        return m?.[1]?.trim()?.toLowerCase() || "";
      })();

      const candidates = (finalDeviceList as any[]).filter((d: any) => {
        const hay = `${normalize(d.deviceName)} ${normalize(d.name)} ${normalize(d.deviceType)} ${normalize(d.type)}`;
        if (wanted) return hay.includes(wanted);
        if (lastUserText.includes("cctv") || lastUserText.includes("camera")) return /cctv|camera|cam/.test(hay);
        return false;
      });

      const pick: any | null = candidates[0] || ((finalDeviceList as any[]).length === 1 ? (finalDeviceList as any[])[0] : null);

      if (pick) {
        // Check if this device has serials with warranty info
        const serialsWithWarranty = Array.isArray(pick.serials) ? pick.serials.filter((s: any) =>
          s?.warrantyEnd || s?.warrantyExpiry || s?.warrantyExpires
        ) : [];

        if (serialsWithWarranty.length > 0) {
          const warrantyInfo = serialsWithWarranty[0]; // Use first serial with warranty info
          const warrantyEnd = warrantyInfo.warrantyEnd || warrantyInfo.warrantyExpiry || warrantyInfo.warrantyExpires;

          try {
            const expiryDate = new Date(warrantyEnd);
            const now = new Date();
            const timeDiff = expiryDate.getTime() - now.getTime();
            const daysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24));

            if (daysRemaining > 0) {
              quickReply = `Yes, your ${pick.deviceName || pick.name || "device"} is under warranty! It expires on ${expiryDate.toLocaleDateString()} (${daysRemaining} days remaining).`;
            } else {
              quickReply = `Your ${pick.deviceName || pick.name || "device"} warranty expired on ${expiryDate.toLocaleDateString()} (${Math.abs(daysRemaining)} days ago).`;
            }
          } catch (error) {
            quickReply = `I found warranty information for your ${pick.deviceName || pick.name || "device"}, but couldn't determine the exact expiry date.`;
          }
        } else {
          quickReply = `I couldn't find warranty information for your ${pick.deviceName || pick.name || "device"}. Please check your purchase receipt or contact support.`;
        }
      }
    }

    // 4) Solved/resolved detection - update ticket status
    const solvedRegex = /(?:^|\s)(solved|fixed|resolved|working|good|thank you|thanks)(?:\s|$)/i;
    if (solvedRegex.test(lastUserText)) {
      // Update active ticket status to resolved if exists
      if (activeTicket) {
        try {
          await db.collection(CONFIG.COLLECTIONS.TICKETS).doc(activeTicket.ticketId).set({
            status: 'resolved',
            resolvedAt: Date.now(),
            updatedAt: Date.now()
          }, { merge: true });
          console.log("Ticket marked as resolved:", activeTicket.ticketId);
          quickReply = "Great! I've marked your ticket as resolved. If you need help with anything else, feel free to ask!";
        } catch (error) {
          console.warn("Failed to update ticket status:", error);
        }
      }
    }

    if (quickReply) {
      let ticketDetails: any = null;
      if (activeTicket) {
        const ticketNumber = activeTicket.data.ticketNumber || `#${activeTicket.ticketId.slice(-6).toUpperCase()}`;
        ticketDetails = {
          ticketId: activeTicket.ticketId,
          ticketNumber,
          subject: activeTicket.data.subject,
          description: activeTicket.data.description,
          category: activeTicket.data.category,
          status: activeTicket.data.status,
          createdAt: activeTicket.data.createdAt?.toDate?.()?.toLocaleDateString(),
        };
      }

      return {
        reply: quickReply,
        sessionId,
        ...(ticketDetails && { ticketDetails }),
      };
    }
  } catch {}

  const systemPrompt = {
    role: "system",
    content: `You are a support assistant for Smile Smart Homes, verifying customer devices and helping troubleshoot their issues.

IMPORTANT RULES:
1. ONLY answer questions related to smart home devices, automation, IoT, home security, lighting, climate control, entertainment systems, and Smile Smart Homes products/services.
2. When handling device verification, compare user-typed serial numbers with registered devices and state clearly if they match or not.
3. Analyze each user message to determine if it's a COMPLAINT or GENERAL QUERY.
4. If the message is unclear, ask ONE concise clarifying question (<=20 words).
5. If no prior assistant message exists, begin with a brief greeting.

SERIAL VERIFICATION WORKFLOW (TEXT ONLY):
- Ask the user to TYPE the serial number
- Compare the provided serial with their registered devices
- If serials match: ✅ Confirm verification and proceed with troubleshooting
- If serials don't match: ⚠️ Mention politely and suggest rechecking the label; still provide basic troubleshooting
- Keep verification responses short, clear, and professional
- Don't exceed what's needed to move the support process forward

WORKFLOW RULES:
- For NEW COMPLAINTS without active ticket: Suggest creating a support ticket and provide helpful guidance
- For users WITH active ticket: Acknowledge the existing ticket and offer to help with troubleshooting
- For GENERAL QUERIES: Provide helpful answers
- NEVER ask for ticket numbers - always automatically fetch unresolved tickets
- If active ticket context is provided, ALWAYS acknowledge the existing ticket first
- Consider troubleshooting history to avoid repeating failed solutions
- If troubleshooting attempts are at 3/3, suggest escalation to human support
- When device needs serial verification: Ask the user to type the serial number in the chat

RESPONSE FORMAT:
- Provide natural, conversational responses without technical prefixes
- For complaints needing ticket: Explain that they should create a support ticket for better assistance
- For ticket verification: Acknowledge their existing ticket and confirm you can help
- For device selection: Ask them to specify which device needs help
- For serial verification: Ask user to enter their device serial number as text
- When providing serial verification results, be clear about match status
- Keep responses concise and professional (under 150 words)
- NEVER start responses with technical codes like "REQUIRES_TICKET:" or "DEVICE_SELECTION:"

USER CONTEXT:
${finalDeviceContext}${ticketContext}`,
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
      await sessionsCol.doc(sessionId).collection("messages").add({ role: "assistant", content: cleanedContent, ts: Date.now() });
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


// Removed fetchLatestUnresolvedTicket – backend no longer falls back to implicit tickets

// ===== Check for active unresolved tickets =====
// removed unused checkActiveUnresolvedTicket callable

// Removed extractSerialFromImage callable – switched to manual serial verification

export const verifySerialAndFetchDocs = onCall({ cors: true }, async (request) => {
  const authCtx = request.auth;
  if (!authCtx) throw new HttpsError("unauthenticated", "Must be authenticated.");
  const ticketId = (request.data?.ticketId as string | undefined)?.trim();
  const serial = (request.data?.serial as string | undefined)?.trim();
  if (!ticketId || !serial) throw new HttpsError("invalid-argument", "ticketId and serial are required");

  const tRef = db.collection(CONFIG.COLLECTIONS.TICKETS).doc(ticketId);
  const tSnap = await tRef.get();
  if (!tSnap.exists) throw new HttpsError("not-found", "Ticket not found");
  const t = tSnap.data() as any;
  if (t.uid !== authCtx.uid) throw new HttpsError("permission-denied", "Not your ticket");

  // Attempt to locate the serial within the user's registered devices
  let matchedDeviceDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  let matchedDeviceData: Record<string, any> | null = null;
  let matchedSerialEntry: Record<string, any> | null = null;

  console.log("=== SERIAL VERIFICATION START ===");
  console.log("Looking for serial number:", serial);
  console.log("User UID:", authCtx.uid);

  try {
    const userDevicesSnap = await db
      .collection(CONFIG.COLLECTIONS.DEVICES)
      .where("uid", "==", authCtx.uid)
      .get();

    console.log("Found", userDevicesSnap.size, "user device documents");

    for (const doc of userDevicesSnap.docs) {
      const data = doc.data() as Record<string, any>;
      const serials: Array<Record<string, any>> = Array.isArray(data.serials) ? data.serials : [];

      console.log("=== Checking device:", doc.id, "===");
      console.log("Device data keys:", Object.keys(data));
      console.log("Serials array length:", serials.length);
      console.log("Serials array contents:", JSON.stringify(serials, null, 2));

      // Check if document has serials field and it's not empty
      if (serials.length > 0) {
        console.log("Device has serials, checking each entry...");

        // Check each serial entry for exact match
        for (let i = 0; i < serials.length; i++) {
          const entry = serials[i];
          console.log(`  Serial entry ${i}:`, entry);

          if (typeof entry?.serialNumber === "string") {
            console.log(`  Comparing "${entry.serialNumber.trim().toLowerCase()}" with "${serial.trim().toLowerCase()}"`);

            if (entry.serialNumber.trim().toLowerCase() === serial.trim().toLowerCase()) {
              matchedDeviceDoc = doc;
              matchedDeviceData = data;
              matchedSerialEntry = entry;
              console.log("✅ SERIAL MATCH FOUND!");
              console.log("Matched entry:", entry);
              break;
            } else {
              console.log("❌ No match for this entry");
            }
          } else {
            console.log("❌ Serial entry doesn't have valid serialNumber field");
          }
        }
      } else {
        console.log("❌ Device", doc.id, "has no serials array or it's empty");
      }

      if (matchedDeviceDoc) break; // Exit loop once we find a match
    }

    if (!matchedDeviceDoc) {
      console.log("❌ No serial match found in any device");
    }

  } catch (error) {
    console.warn("Failed to search user devices for serial:", error);
  }

  let deviceType: string = "generic";
  let deviceModel: string = "unknown";
  let deviceUID: string | undefined;

  if (matchedDeviceDoc && matchedDeviceData) {
    deviceType = matchedDeviceData.type || matchedDeviceData.deviceType || "generic";
    deviceModel = matchedDeviceData.modelNumber || matchedDeviceData.deviceModel || matchedDeviceData.model || "unknown";
    deviceUID = matchedDeviceData.sourceDeviceId || matchedDeviceDoc.id;
  } else {
    // Fallback to legacy main devices collection if present
    const devSnap = await db.collection(CONFIG.COLLECTIONS.MAIN_DEVICES).doc(serial).get();
    if (!devSnap.exists) {
      return { valid: false, message: "This product is not recognized." };
    }
    const dev = devSnap.data() as any;
    if (dev.ownerUid !== authCtx.uid) {
      return { valid: false, message: "This product is not recognized." };
    }
    matchedDeviceData = dev;
    deviceType = dev.deviceType || "generic";
    deviceModel = dev.deviceModel || dev.model || "unknown";
    deviceUID = dev.deviceUID || serial;
  }

  // Check warranty status from the matched serial entry
  let warrantyStatus: { isValid: boolean; daysRemaining?: number; expiryDate?: string } = { isValid: false };

  console.log("=== WARRANTY STATUS CHECK ===");
  if (matchedSerialEntry) {
    console.log("Found matched serial entry:", matchedSerialEntry);
    const warrantyEnd = matchedSerialEntry.warrantyEnd || matchedSerialEntry.warrantyExpiry || matchedSerialEntry.warrantyExpires;

    if (warrantyEnd) {
      console.log("Warranty end date found:", warrantyEnd);
      try {
        const expiryDate = new Date(warrantyEnd);
        const now = new Date();
        const timeDiff = expiryDate.getTime() - now.getTime();
        const daysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24));

        console.log("Current date:", now.toISOString());
        console.log("Expiry date:", expiryDate.toISOString());
        console.log("Days remaining:", daysRemaining);

        warrantyStatus = {
          isValid: daysRemaining > 0,
          daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
          expiryDate: expiryDate.toISOString().split('T')[0]
        };

        console.log("Calculated warranty status:", warrantyStatus);
      } catch (error) {
        console.warn("Error parsing warranty date:", warrantyEnd, error);
        warrantyStatus = { isValid: false };
      }
    } else {
      console.log("No warranty date found in serial entry");
    }
  } else {
    console.log("No matched serial entry found for warranty check");
  }

  console.log("Final warranty status:", warrantyStatus);

  await tRef.set({
    deviceSerial: serial,
    deviceType,
    deviceModel,
    warrantyStatus,
    updatedAt: Date.now()
  }, { merge: true });

  // Fetch device-specific support documents using the proper path structure
  let supportDocs: any[] = [];

  try {
    if (deviceUID) {
      const userDeviceDocsSnap = await db
        .collection(CONFIG.COLLECTIONS.DEVICES)
        .where("uid", "==", authCtx.uid)
        .where("sourceDeviceId", "==", deviceUID)
        .get();

      if (!userDeviceDocsSnap.empty) {
        supportDocs = userDeviceDocsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      }
    }

    // If no additional docs were found, fall back to the matched device doc itself (if available)
    if (supportDocs.length === 0 && matchedDeviceDoc && matchedDeviceData) {
      supportDocs = [{ id: matchedDeviceDoc.id, ...matchedDeviceData }];
    }
  } catch (error) {
    console.warn("Failed to fetch support documents:", error);
  }

  console.log("=== VERIFICATION RESULT ===");
  console.log("Serial verification valid:", matchedDeviceDoc ? "YES" : "NO");
  console.log("Device type:", deviceType);
  console.log("Device model:", deviceModel);
  console.log("Device UID:", deviceUID);
  console.log("Warranty status:", warrantyStatus);
  console.log("Support docs count:", supportDocs.length);

  return {
    valid: true,
    deviceType,
    deviceModel,
    deviceUID,
    warrantyStatus,
    supportDocs,
    // Legacy compatibility
    links: supportDocs.map((doc) => doc.url || doc.link).filter(Boolean),
  };
});

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
