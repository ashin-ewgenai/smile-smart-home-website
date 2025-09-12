import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";

const db = admin.firestore();
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

/**
 * Processes a newly submitted ticket and generates immediate AI response
 * Called right after ticket creation to provide instant support
 * 
 * Flow:
 * 1. Validate ticket exists and belongs to user
 * 2. Extract serial from image (if provided)
 * 3. Verify device ownership and get device details
 * 4. Generate AI response with troubleshooting steps
 * 5. Create chat session with AI response
 * 
 * request.data: { ticketId: string }
 * response: { success: boolean, chatSessionId: string, aiResponse: string }
 */
export const processTicketSubmission = onCall({
  region: "us-central1",
  secrets: [OPENAI_API_KEY]
}, async (request) => {
  const { data } = request;
  const { ticketId, ticketData: providedTicketData } = data;

  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }

  const userId = request.auth.uid;
  console.log(`[processTicketSubmission] Starting processing for ticket: ${ticketId}, user: ${userId}`);

  try {
    let ticketData;
    
    // Use provided ticket data if available, otherwise fetch from database
    if (providedTicketData) {
      console.log(`[processTicketSubmission] Using provided ticket data: ${providedTicketData.subject} (${providedTicketData.category})`);
      ticketData = providedTicketData;
      
      // Verify ownership
      if (ticketData.userId !== userId) {
        console.error(`[processTicketSubmission] Access denied for provided ticket data`);
        throw new HttpsError("permission-denied", "Access denied");
      }
    } else {
      // Fallback to database fetch
      console.log(`[processTicketSubmission] Fetching ticket from database: ${ticketId}`);
      const ticketRef = db.collection("Support_Tickets").doc(ticketId);
      const ticketSnap = await ticketRef.get();
      
      if (!ticketSnap.exists) {
        console.error(`[processTicketSubmission] Ticket not found: ${ticketId}`);
        throw new HttpsError("not-found", "Ticket not found");
      }

      ticketData = ticketSnap.data();
      if (!ticketData || ticketData.userId !== userId) {
        console.error(`[processTicketSubmission] Access denied for ticket: ${ticketId}`);
        throw new HttpsError("permission-denied", "Access denied");
      }
      console.log(`[processTicketSubmission] Ticket fetched: ${ticketData.subject} (${ticketData.category})`);
    }

    // 2. Extract serial from image if provided
    let extractedSerial: string | null = null;
    if (ticketData.imageUrl) {
      console.log(`[processTicketSubmission] Extracting serial from image: ${ticketData.imageUrl}`);
      try {
        const serialResult = await extractSerialFromImage(ticketData.imageUrl);
        extractedSerial = serialResult.serial;
        console.log(`[processTicketSubmission] Serial extraction result: ${extractedSerial || 'none'}`);
      } catch (error) {
        console.warn(`[processTicketSubmission] Serial extraction failed:`, error);
      }
    } else {
      console.log(`[processTicketSubmission] No image provided for serial extraction`);
    }

    // 3. Fetch user's devices for context
    const userDevicesSnap = await db
      .collection("User_Devices")
      .where("uid", "==", userId)
      .get();
    
    const userDevices = userDevicesSnap.docs.map((doc: any) => ({id: doc.id, ...doc.data()}));
    console.log(`[processTicketSubmission] Found ${userDevices.length} user devices`);

    // 4. Verify device if serial was extracted
    let deviceDetails = null;
    if (extractedSerial) {
      console.log(`[processTicketSubmission] Verifying device with serial: ${extractedSerial}`);
      deviceDetails = await verifyDeviceOwnership(userId, extractedSerial);
      console.log(`[processTicketSubmission] Device verification result: ${deviceDetails ? 'verified' : 'not found'}`);
    }

    // 5. Generate immediate AI response
    console.log(`[processTicketSubmission] Generating AI response...`);
    const aiResponse = await generateImmediateResponse({
      subject: ticketData.subject,
      description: ticketData.description,
      category: ticketData.category,
      extractedSerial,
      deviceDetails,
      userDevices,
      ticketNumber: ticketData.ticketNumber
    });
    console.log(`[processTicketSubmission] AI response generated: ${aiResponse.substring(0, 100)}...`);

    // 6. Create or get chat session and post AI message
    const chatSessionId = `ticket_${ticketId}`;
    const chatSessionRef = db.collection("chat_sessions").doc(chatSessionId);
    
    await chatSessionRef.set({
      userId,
      ticketId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      type: "support"
    }, { merge: true });
    console.log(`[processTicketSubmission] Chat session created/updated: ${chatSessionId}`);

    const messageRef = await chatSessionRef.collection("messages").add({
      content: aiResponse,
      timestamp: Date.now(),
      sender: "ai",
      role: "assistant"
    });
    console.log(`[processTicketSubmission] AI message added to chat: ${messageRef.id}`);

    // 7. Update ticket with processing status (only if we have a database ticket)
    if (!providedTicketData) {
      const ticketRef = db.collection("Support_Tickets").doc(ticketId);
      await ticketRef.update({
        processedAt: Date.now(),
        initialResponseGenerated: true,
        chatSessionId: chatSessionId,
        updatedAt: Date.now()
      });
      console.log(`[processTicketSubmission] Ticket updated with processing status`);
    } else {
      // Update the ticket in database with processing info
      const ticketRef = db.collection("Support_Tickets").doc(ticketId);
      await ticketRef.update({
        processedAt: Date.now(),
        initialResponseGenerated: true,
        chatSessionId: chatSessionId,
        updatedAt: Date.now()
      });
      console.log(`[processTicketSubmission] Ticket updated with processing status`);
    }

    console.log(`[processTicketSubmission] Successfully completed processing for ticket: ${ticketId}`);
    
    return {
      success: true,
      chatSessionId,
      aiResponse,
      extractedSerial,
      deviceVerified: !!deviceDetails
    };

  } catch (error: any) {
    console.error(`[processTicketSubmission] Error processing ticket ${ticketId}:`, error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", `Failed to process ticket: ${error?.message || error}`);
  }
});

/**
 * Extract serial number from uploaded image
 */
async function extractSerialFromImage(imageUrl: string): Promise<{serial: string | null}> {
  console.log(`[extractSerialFromImage] Starting serial extraction from: ${imageUrl}`);
  
  const apiKey = OPENAI_API_KEY.value();
  if (!apiKey) {
    console.error(`[extractSerialFromImage] OPENAI_API_KEY not configured`);
    throw new Error("OPENAI_API_KEY not configured");
  }

  const messages = [
    {
      role: "user",
      content: [
        {type: "text", text: "Extract the product serial number visible in this image. Return only the serial string. If unclear, say: NONE"},
        {type: "image_url", image_url: {url: imageUrl}},
      ],
    },
  ];

  console.log(`[extractSerialFromImage] Making OpenAI vision API call...`);

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {"Content-Type": "application/json", Authorization: `Bearer ${apiKey}`},
      body: JSON.stringify({model: "gpt-4o", messages, temperature: 0.0, max_tokens: 50}),
    } as any);
    
    console.log(`[extractSerialFromImage] OpenAI vision API response status: ${resp.status}`);
    
    if (!resp.ok) {
      const errorText = await resp.text();
      console.error(`[extractSerialFromImage] OpenAI vision API error: ${resp.status} - ${errorText}`);
      throw new Error(`OpenAI error: ${resp.status} - ${errorText}`);
    }
    
    const data = await resp.json();
    const content: string = (data?.choices?.[0]?.message?.content || "").trim();
    const serial = content === "NONE" ? null : content.replace(/[^A-Za-z0-9\-\/ _]/g, "").slice(0, 64);
    
    console.log(`[extractSerialFromImage] Raw response: "${content}", processed serial: "${serial}"`);
    return {serial};
    
  } catch (error) {
    console.error(`[extractSerialFromImage] Error during serial extraction:`, error);
    throw error;
  }
}

/**
 * Verify device ownership and get device details
 */
async function verifyDeviceOwnership(uid: string, serial: string): Promise<any> {
  console.log(`[verifyDeviceOwnership] Checking serial: ${serial} for user: ${uid}`);
  
  // Get all user devices since serials are stored in nested arrays
  const devicesSnap = await db.collection("User_Devices")
    .where("uid", "==", uid)
    .get();
  
  console.log(`[verifyDeviceOwnership] Found ${devicesSnap.docs.length} devices for user`);
  
  // Search through each device's serials array
  for (const deviceDoc of devicesSnap.docs) {
    const deviceData = deviceDoc.data();
    const serials = deviceData.serials || [];
    
    console.log(`[verifyDeviceOwnership] Checking device ${deviceData.deviceName} with ${serials.length} serials`);
    
    // Check if any serial in the array matches
    const matchingSerial = serials.find((serialObj: any) => 
      serialObj.serialNumber === serial
    );
    
    if (matchingSerial) {
      console.log(`[verifyDeviceOwnership] Serial match found in device: ${deviceData.deviceName}`);
      return {
        id: deviceDoc.id, 
        ...deviceData,
        matchedSerial: matchingSerial
      };
    }
  }
  
  console.log(`[verifyDeviceOwnership] No matching serial found for: ${serial}`);
  return null;
}

/**
 * Generate immediate AI response for ticket
 */
async function generateImmediateResponse(context: {
  subject: string;
  description: string;
  category: string;
  extractedSerial: string | null;
  deviceDetails: any;
  userDevices: any[];
  ticketNumber: string;
}): Promise<string> {
  console.log(`[generateImmediateResponse] Starting AI response generation for ticket: ${context.ticketNumber}`);
  
  const apiKey = OPENAI_API_KEY.value();
  if (!apiKey) {
    console.error(`[generateImmediateResponse] OPENAI_API_KEY not configured`);
    throw new Error("OPENAI_API_KEY not configured");
  }

  const serialVerificationText = context.extractedSerial && context.deviceDetails
    ? `✅ Device verified: The serial number ${context.extractedSerial} matches your registered ${context.deviceDetails.deviceName || context.deviceDetails.name}.`
    : context.extractedSerial 
    ? `⚠️ Serial number ${context.extractedSerial} was found in your image, but it doesn't match any registered devices. Please double-check the serial label on your device.`
    : "No serial number could be detected from the uploaded image.";

  const prompt = `You are a support assistant providing immediate help for a customer's support ticket.

TICKET SUMMARY:
📋 Ticket Number: ${context.ticketNumber}
📝 Subject: ${context.subject}
🏷️ Category: ${context.category}
📄 Issue Description: ${context.description}

DEVICE VERIFICATION:
${serialVerificationText}

REGISTERED DEVICES: ${context.userDevices.length > 0 ? context.userDevices.map((d: any) => d.deviceName || d.name || d.id).join(", ") : "None"}

Your response should include:

1. **TICKET CONFIRMATION**: Start with "Thank you for submitting ticket ${context.ticketNumber}. Here's a summary of your request:"

2. **TICKET SUMMARY**: Briefly restate their issue in a clear, organized way

3. **DEVICE VERIFICATION**: Clearly state the serial verification result

4. **IMMEDIATE ASSISTANCE**: Provide 2-3 specific troubleshooting steps based on their issue

5. **NEXT STEPS**: Mention that you'll continue to assist them and they can ask follow-up questions

Format your response professionally with clear sections. Keep it under 200 words but comprehensive enough to show you understand their issue completely.`;

  console.log(`[generateImmediateResponse] Prompt prepared, making OpenAI API call...`);
  console.log(`[generateImmediateResponse] Context - Subject: ${context.subject}, Category: ${context.category}, Devices: ${context.userDevices.length}, Serial: ${context.extractedSerial ? 'found' : 'none'}`);

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {"Content-Type": "application/json", Authorization: `Bearer ${apiKey}`},
      body: JSON.stringify({
        model: "gpt-4o-mini", 
        messages: [{role: "user", content: prompt}], 
        temperature: 0.4, 
        max_tokens: 400
      }),
    } as any);

    console.log(`[generateImmediateResponse] OpenAI API response status: ${resp.status}`);

    if (!resp.ok) {
      const errorText = await resp.text();
      console.error(`[generateImmediateResponse] OpenAI API error: ${resp.status} - ${errorText}`);
      throw new Error(`OpenAI error: ${resp.status} - ${errorText}`);
    }
    
    const data = await resp.json();
    const aiResponse = (data?.choices?.[0]?.message?.content || "Thank you for your ticket. Our support team will assist you shortly.").trim();
    
    console.log(`[generateImmediateResponse] AI response generated successfully: ${aiResponse.substring(0, 100)}...`);
    return aiResponse;
    
  } catch (error) {
    console.error(`[generateImmediateResponse] Error during AI generation:`, error);
    throw error;
  }
}
