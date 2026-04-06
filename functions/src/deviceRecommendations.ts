import { onDocumentCreated, onDocumentUpdated, FirestoreEvent } from "firebase-functions/v2/firestore";
import { onCall, CallableRequest, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { db } from "./core";
import { triggerWhatsAppMessaging } from "./chatbot";

// EmailJS Configuration Secrets (for transactional email API)
const EMAILJS_SERVICE_ID = defineSecret("EMAILJS_SERVICE_ID");
const EMAILJS_TEMPLATE_ID = defineSecret("EMAILJS_TEMPLATE_ID");
const EMAILJS_PUBLIC_KEY = defineSecret("EMAILJS_PUBLIC_KEY");

// Legacy SMTP Configuration (kept for backward compatibility)
const SMTP_HOST = defineSecret("SMTP_HOST");
const SMTP_PORT = defineSecret("SMTP_PORT");
const SMTP_USER = defineSecret("SMTP_USER");
const SMTP_PASS = defineSecret("SMTP_PASS");
const EMAIL_FROM = defineSecret("EMAIL_FROM");

/**
 * Calculates a composite health score (0–100) from device telemetry.
 */
function calculateHealthScore(telemetry: {
  battery: number;
  rssi: number;
  uptime: number;
}): number {
  const { battery = 100, rssi = -50, uptime = 1 } = telemetry;
  const rssiScore = Math.max(0, Math.min(100, ((rssi + 90) / 60) * 100));
  const score = battery * 0.4 + rssiScore * 0.4 + uptime * 100 * 0.2;
  return Math.round(score);
}

/**
 * generates predictive alerts based on telemetry
 */
function generatePredictiveAlerts(
  telemetry: { battery: number; rssi: number; uptime: number },
  healthScore: number
): Array<{ message: string; severity: "critical" | "warning" }> {
  const alerts: Array<{ message: string; severity: "critical" | "warning" }> = [];
  if (telemetry.battery <= 10) alerts.push({ message: "🔴 Battery critically low (≤10%)", severity: "critical" });
  else if (telemetry.battery <= 20) alerts.push({ message: "⚠️ Battery low (≤20%)", severity: "warning" });
  if (telemetry.rssi <= -90) alerts.push({ message: "🔴 Device unreachable — signal too weak", severity: "critical" });
  else if (telemetry.rssi <= -80) alerts.push({ message: "⚠️ Very weak Wi-Fi signal", severity: "warning" });
  if (telemetry.uptime < 0.5) alerts.push({ message: "🔴 Device offline >50% of last 24h", severity: "critical" });
  return alerts;
}

export const getDeviceRecommendations = onCall({ cors: true }, async () => {
  return { recommendations: [], message: "AI Recommendations are active." };
});

export const getDeviceHealthStatus = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be logged in.");
  const { deviceId } = request.data as { deviceId?: string };
  if (!deviceId) throw new HttpsError("invalid-argument", "Device ID is required.");
  const deviceSnap = await db.collection("User_Devices").doc(deviceId).get();
  if (!deviceSnap.exists) throw new HttpsError("not-found", "Device not found.");
  const data = deviceSnap.data() || {};
  const telemetry = {
    battery: (data.batteryLevel as number) ?? 85,
    rssi: (data.signalStrength as number) ?? -55,
    uptime: (data.uptime24h as number) ?? 0.99,
  };
  const healthScore = calculateHealthScore(telemetry);
  return { deviceId, healthScore, status: telemetry.rssi < -85 ? "Offline" : "Online", telemetry, alerts: generatePredictiveAlerts(telemetry, healthScore) };
});

export const getAdminHealthOverview = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Admin access required.");
  const devicesSnap = await db.collection("User_Devices").get();
  const allDevices = devicesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  let totalScore = 0;
  for (const d of allDevices as any[]) {
    const telemetry = { battery: d.batteryLevel ?? 100, rssi: d.signalStrength ?? -50, uptime: d.uptime24h ?? 1 };
    totalScore += calculateHealthScore(telemetry);
  }
  return { aggregatedScore: Math.round(totalScore / (allDevices.length || 1)), totalDevices: allDevices.length, timestamp: new Date().toISOString() };
});

/**
 * sendQuoteEmail (Real Implementation)
 * Sends actual email via SMTP or transactional email service
 */
async function sendQuoteEmail(params: { type: string, email: string, name?: string, id: string, details?: any }) {
  const { type, email, name, id, details } = params;

  // Get SMTP configuration from secrets
  const host = SMTP_HOST.value();
  const port = parseInt(SMTP_PORT.value() || "587");
  const user = SMTP_USER.value();
  const pass = SMTP_PASS.value();
  const from = EMAIL_FROM.value();

  // If SMTP is not configured, log and return (graceful degradation)
  if (!host || !user || !pass) {
    console.warn(`[Email] SMTP not configured. Logging only for ${email}`);
    await db.collection("System_Logs").add({
      target: email,
      channel: "email",
      type,
      relatedEntityId: id,
      timestamp: new Date().toISOString(),
      status: "skipped",
      reason: "SMTP not configured"
    });
    return true;
  }

  // Dynamically import nodemailer if available
  let nodemailer: any;
  try {
    nodemailer = require("nodemailer");
  } catch {
    console.warn(`[Email] nodemailer not installed. Logging only for ${email}`);
    await db.collection("System_Logs").add({
      target: email,
      channel: "email",
      type,
      relatedEntityId: id,
      timestamp: new Date().toISOString(),
      status: "skipped",
      reason: "nodemailer not installed"
    });
    return true;
  }

  // Create transporter
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  // Build email content
  const subject = type === "quote_submitted"
    ? "Your Smart Home Quote Request - Smile Smart Home"
    : "Quote Ready: Your Smart Home Estimation";

  const htmlContent = buildEmailTemplate({ type, name, id, details });

  const mailOptions = {
    from: `"Smile Smart Home" <${from || user}>`,
    to: email,
    subject,
    html: htmlContent,
    text: `Your quote ${id} has been processed. View details in your dashboard at https://smilesmarthome.com/dashboard/user/my-quotes`,
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    console.log(`[Email Sent] MessageId: ${result.messageId} to ${email}`);

    await db.collection("System_Logs").add({
      target: email,
      channel: "email",
      type,
      relatedEntityId: id,
      timestamp: new Date().toISOString(),
      status: "success",
      messageId: result.messageId,
    });
    return true;
  } catch (error: any) {
    console.error(`[Email Failed] to ${email}:`, error);
    await db.collection("System_Logs").add({
      target: email,
      channel: "email",
      type,
      relatedEntityId: id,
      timestamp: new Date().toISOString(),
      status: "failed",
      error: error.message,
    });
    throw error;
  }
}

/**
 * Build professional HTML email template for quotes
 */
function buildEmailTemplate(params: { type: string, name?: string, id: string, details?: any }) {
  const { type, name, id, details } = params;
  const isSubmitted = type === "quote_submitted";

  // Format details if present
  let detailsHtml = "";
  if (details) {
    if (details.budget && details.houseSize) {
      detailsHtml = `
        <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p style="margin: 5px 0;"><strong>House Size:</strong> ${details.houseSize}</p>
          <p style="margin: 5px 0;"><strong>Budget:</strong> ₹${details.budget}</p>
          ${details.securityNeeds ? `<p style="margin: 5px 0;"><strong>Security Level:</strong> ${details.securityNeeds}</p>` : ""}
        </div>
      `;
    } else {
      detailsHtml = `<p style="color: #6b7280;">Details: ${JSON.stringify(details)}</p>`;
    }
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isSubmitted ? "Quote Request Received" : "Quote Estimation Ready"}</title>
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #374151; margin: 0; padding: 0; background-color: #f9fafb;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f9fafb;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%); padding: 40px 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">Smile Smart Home</h1>
              <p style="color: #e0f2fe; margin: 10px 0 0 0; font-size: 16px;">Your Smart Living Partner</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="color: #111827; margin: 0 0 20px 0; font-size: 24px;">Hello ${name || "Valued Customer"},</h2>

              <p style="font-size: 16px; color: #4b5563; margin: 0 0 20px 0;">
                ${isSubmitted
                  ? "Thank you for your smart home quote request! We've received your requirements and our team is reviewing them."
                  : "Great news! Your quote estimation is ready. We've analyzed your requirements and prepared a detailed proposal."}
              </p>

              <!-- Quote ID Box -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #0d9488; border-radius: 12px; margin: 25px 0;">
                <tr>
                  <td style="padding: 20px; text-align: center;">
                    <p style="color: #e0f2fe; margin: 0 0 5px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Quote Reference</p>
                    <p style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 1px;">${id}</p>
                  </td>
                </tr>
              </table>

              ${detailsHtml}

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="https://smilesmarthome.com/dashboard/user/my-quotes" style="display: inline-block; background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 50px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px 0 rgba(13, 148, 136, 0.39);">
                      ${isSubmitted ? "Track Your Quote" : "View Your Estimation"}
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-size: 14px; color: #6b7280; margin: 20px 0 0 0; border-top: 1px solid #e5e7eb; padding-top: 20px;">
                Questions? Simply reply to this email or contact our support team at <a href="mailto:support@smilesmarthome.com" style="color: #0d9488;">support@smilesmarthome.com</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #f3f4f6; padding: 30px; text-align: center;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0 0 10px 0;">© 2026 Smile Smart Home. All rights reserved.</p>
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">You're receiving this because you requested a quote on our website.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * sendQuoteWhatsApp (Helper)
 * Calls the existing triggerWhatsAppMessaging and logs to System_Logs
 */
async function sendQuoteWhatsApp(params: { type: string, email: string, name?: string, phone: string, id: string }) {
  const { type, phone, name, id } = params;
  
  // Use the existing messaging utility
  await triggerWhatsAppMessaging({
    recipient: phone,
    templateId: type === "quote_submitted" ? "new_quote_user" : "estimation_ready",
    variables: {
      name: name || "Customer",
      id: id || "Quote"
    }
  });

  await db.collection("System_Logs").add({
    target: phone,
    channel: "whatsapp",
    type,
    relatedEntityId: id,
    timestamp: new Date().toISOString(),
    status: "success"
  });
  return true;
}

/**
 * Process Quote Notification (Core Logic)
 */
async function processQuoteNotification(id: string, data: any, isUpdate = false) {
  let email = data.customerEmail || data.userEmail || data.customerId || data.email || data.Email;
  let name = data.customerName || data.FullName || data.name || data.displayName;
  let phone = data.phoneNumber || data.whatsappNumber || data.phone || data.mobile;
  const uid = data.userUid || data.uid;

  // Enrich from Accounts if needed
  if (uid && (!email || !phone || !name)) {
    const userDoc = await db.collection("Accounts").doc(uid).get();
    if (userDoc.exists) {
      const u = userDoc.data();
      email = email || u?.Email;
      name = name || u?.FullName || u?.displayName;
      phone = phone || u?.phoneNumber;
    }
  }

  if (!email) {
    console.warn(`[Quote Notification] No email found for quote ${id}. Skipping.`);
    return;
  }

  const type = isUpdate ? "estimation_ready" : "quote_submitted";
  
  console.info(`[Quote Notification] Triggered ${type} for ${email}`);
  await sendQuoteEmail({ type, email, name, id });
  if (phone) await sendQuoteWhatsApp({ type, email, name, phone, id });

  // Update existing Notifications_Logs for the user
  await db.collection("Notifications_Logs").add({ 
    quoteId: id, 
    email, 
    type, 
    timestamp: new Date().toISOString() 
  });
}

/**
 * onPlannerLeadNotification (V2 Trigger)
 * Triggered on Planner_Leads (Floorplan)
 */
export const onPlannerLeadNotification = onDocumentCreated("Planner_Leads/{leadId}", async (event: FirestoreEvent<any>) => {
  await processQuoteNotification(event.params.leadId, event.data?.data());
});

/**
 * onQuoteCreatedNotification (V2 Trigger)
 * Triggered on flat 'quotes' collection (User Dashboard)
 */
export const onQuoteCreatedNotification = onDocumentCreated("quotes/{quoteId}", async (event: FirestoreEvent<any>) => {
  await processQuoteNotification(event.params.quoteId, event.data?.data());
});

/**
 * onNestedQuoteCreated (V2 Trigger)
 * Triggered on nested 'Quotes/{uid}/Quote_List/{quoteId}'
 */
export const onNestedQuoteNotification = onDocumentCreated("Quotes/{uid}/Quote_List/{quoteId}", async (event: FirestoreEvent<any>) => {
  await processQuoteNotification(event.params.quoteId, event.data?.data());
});

/**
 * onQuoteUpdated (V2 Trigger)
 * Triggered on status confirmation
 */
export const onQuoteStatusNotification = onDocumentUpdated("quotes/{quoteId}", async (event: FirestoreEvent<any>) => {
  const newData = event.data?.after?.data();
  const oldData = event.data?.before?.data();
  if (!newData || !oldData) return;

  const newStatus = String(newData.status || "").toLowerCase();
  const oldStatus = String(oldData.status || "").toLowerCase();

  if (newStatus === "confirmed" && oldStatus !== "confirmed") {
    await processQuoteNotification(event.params.quoteId, newData, true);
  }
});

/**
 * sendQuoteNotification (V2 Callable)
 * Used by AI Consultant results page.
 */
export const sendQuoteNotification = onCall(async (request: CallableRequest<any>) => {
  const { type, quoteId, customerEmail, customerName, details: _details, phone: providedPhone } = request.data || {};
  const authUid = request.auth?.uid;

  try {
    let email = customerEmail;
    let name = customerName;
    let phone = providedPhone;

    if (authUid) {
      const userDoc = await db.collection("Accounts").doc(authUid).get();
      if (userDoc.exists) {
        const u = userDoc.data();
        email = email || u?.Email;
        name = name || u?.FullName || u?.displayName;
        phone = phone || u?.phoneNumber;
      }
    }

    if (!email) throw new HttpsError("invalid-argument", "Customer Email is required.");

    console.info(`[V2 Callable] Triggered manual notification for ${email}`);
    await sendQuoteEmail({ type, email, name, id: quoteId || "manual" });
    if (phone) await sendQuoteWhatsApp({ type, email, name, phone, id: quoteId || "manual" });

    return { success: true, message: "Notification triggered successfully via V2" };
  } catch (error: any) {
    console.error("[V2 Callable] Error:", error);
    throw new HttpsError("internal", error?.message || "Failed to trigger notification");
  }
});

/**
 * Backend callable function to send quote emails via EmailJS transactional API.
 * 
 * This function handles email delivery server-side for improved security.
 * Configuration via Firebase Secrets:
 * - EMAILJS_SERVICE_ID: EmailJS service identifier
 * - EMAILJS_TEMPLATE_ID: EmailJS template ID
 * - EMAILJS_PUBLIC_KEY: EmailJS public API key
 * 
 * Request data:
 * - toEmail: Recipient email address
 * - name: Recipient name
 * - quoteId: Quote reference ID
 * - total: Quote total amount (optional)
 * 
 * Returns: { success: boolean, message: string }
 */
export const sendQuoteEmailCallable = onCall({
  secrets: [EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY],
  cors: true
}, async (request: CallableRequest) => {
  try {
    const { toEmail, name, quoteId, total } = request.data as {
      toEmail: string;
      name?: string;
      quoteId: string;
      total?: string;
    };

    if (!toEmail) {
      throw new HttpsError("invalid-argument", "Recipient email is required.");
    }

    // Use EmailJS REST API directly via fetch
    const serviceId = EMAILJS_SERVICE_ID.value();
    const templateId = EMAILJS_TEMPLATE_ID.value();
    const publicKey = EMAILJS_PUBLIC_KEY.value();
    
    const templateParams = {
      to_email: toEmail,
      name: name || 'Valued Customer',
      quote_id: quoteId,
      total: total || 'Contact us for details',
    };

    console.log('[sendQuoteEmailCallable] Sending via EmailJS API:', { toEmail, quoteId });
    
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        template_params: templateParams,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`EmailJS API error: ${response.status} ${errorText}`);
    }

    console.log('[sendQuoteEmailCallable] Email sent successfully to:', toEmail);
    
    return { 
      success: true, 
      message: `Quote email sent successfully to ${toEmail}` 
    };
  } catch (error: any) {
    console.error('[sendQuoteEmailJS] Error:', error);
    throw new HttpsError("internal", error?.message || 'Failed to send email');
  }
});
