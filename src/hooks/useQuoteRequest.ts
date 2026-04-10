/**
 * useQuoteRequest — handles automated notifications and status tracking
 * for the Smile Smart Home Quote Portal.
 * 
 * This hook manages email delivery via EmailJS transactional email API.
 * Email configuration:
 * - Service ID: service_fd3vtgc (Microsoft/Outlook)
 * - Template ID: template_d6hadva
 * - Public Key: R0tIXRXubwM-BqDDW
 * 
 * Implementation follows the quote email delivery acceptance criteria:
 * - Quote emails sent automatically after quote creation
 * - UI provides confirmation feedback after sending
 * - Error handling for delivery failures
 */
import { useState } from 'react';
import { addDoc, collection, serverTimestamp, getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../lib/firebase';
import emailjs from '@emailjs/browser';
import { useDevices, getFriendlyErrorMessage } from '../contexts/DevicesContext';

// EmailJS Configuration - Environment variables would be preferred for production
const EMAILJS_SERVICE_ID = 'service_fd3vtgc';
const EMAILJS_TEMPLATE_ID = 'template_d6hadva';
const EMAILJS_PUBLIC_KEY = 'R0tIXRXubwM-BqDDW';

export type SpaceType = 'home' | 'office' | 'apartment';

export interface NotifyParams {
  type: 'quote_submitted' | 'estimation_sent',
  quoteId: string,
  email: string,
  phone?: string,
  name?: string,
  details?: any
}

export interface NotifyResult {
  emailSent: boolean;
  whatsappSent?: boolean;
  whatsappSkipped?: boolean;
  whatsappLink?: string;
}

export interface SpaceRequestPayload {
  email: string;
  phone?: string;
  spaceType: SpaceType;
  roomTitle: string;
  roomDescription: string;
  roomTags: string[];
}

/**
 * Global helper for one-off floorplan requests
 */
export async function submitSpaceRequest(payload: SpaceRequestPayload): Promise<void> {
  const db = getFirestore();

  const spaceLabel: Record<SpaceType, string> = {
    home: 'Home',
    office: 'Office',
    apartment: 'Apartment',
  };

  // Ensure optional fields are handled correctly to avoid Firestore 'undefined' errors.
  const roomData: Record<string, any> = {
    spaceType: payload.spaceType,
    roomTitle: payload.roomTitle,
    roomDescription: payload.roomDescription,
    roomTags: payload.roomTags,
  };
  
  if (payload.phone) {
    roomData.phone = payload.phone;
  }

  const auth = getAuth();
  
  await addDoc(collection(db, 'Planner_Leads'), {
    email: payload.email.toLowerCase().trim(),
    uid: auth.currentUser?.uid || '',
    phoneNumber: payload.phone || '', 
    whatsappNumber: payload.phone || '', // Standardized field for WhatsApp triggers
    source: 'floorplan',
    status: 'new',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    complexity: 'Interactive Tour',
    roomType: payload.spaceType,
    roomTitle: payload.roomTitle,
    planText: `[Floorplan Request — ${spaceLabel[payload.spaceType]}] ${payload.roomTitle}: ${payload.roomDescription}\n\nFeatures: ${payload.roomTags.join(', ')}`,
    formData: roomData
  });
}

/**
 * Generates a manual WhatsApp Web link for fallback delivery
 */
export function generateWhatsAppLink(params: {
  phone: string;
  type: 'quote_submitted' | 'estimation_sent';
  quoteId: string;
  name?: string;
}): string {
  const { phone, type, quoteId, name } = params;
  const isSubmitted = type === 'quote_submitted';
  
  // Clean phone number (remove +, spaces, etc)
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  
  const firstName = name?.split(' ')[0] || 'there';
  const message = isSubmitted
    ? `👋 Hi ${firstName}! %0A%0AYour Smart Home quote request (${quoteId}) has been received. 🏠%0A%0AOur team will review your requirements and send a detailed estimation soon.%0A%0AView your quote: https://smilesmarthome.com/dashboard/user/my-quotes%0A%0A- Smile Smart Home Team`
    : `🎉 Great news, ${firstName}! %0A%0AYour quote estimation for ${quoteId} is ready!%0A%0ACheck your email for full details or view it in your dashboard.%0A%0AQuestions? Reply here or call our support team.%0A%0A- Smile Smart Home Team`;

  return `https://wa.me/${cleanPhone}?text=${message}`;
}

/**
 * Builds HTML email template for quote notifications
 */
function buildEmailHtml(params: {
  type: 'quote_submitted' | 'estimation_sent',
  quoteId: string,
  name?: string,
  details?: any
}): string {
  const { type, quoteId, name, details } = params;
  const isSubmitted = type === 'quote_submitted';
  
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isSubmitted ? 'Quote Request Received' : 'Quote Estimation Ready'}</title>
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #374151; margin: 0; padding: 0; background-color: #f9fafb;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f9fafb;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%); padding: 40px 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">Smile Smart Home</h1>
              <p style="color: #e0f2fe; margin: 10px 0 0 0; font-size: 16px;">Your Smart Living Partner</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="color: #111827; margin: 0 0 20px 0; font-size: 24px;">Hello ${name || 'Valued Customer'},</h2>
              <p style="font-size: 16px; color: #4b5563; margin: 0 0 20px 0;">
                ${isSubmitted
                  ? "Thank you for your smart home quote request! We've received your requirements and our team is reviewing them."
                  : "Great news! Your quote estimation is ready. We've analyzed your requirements and prepared a detailed proposal."}
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #0d9488; border-radius: 12px; margin: 25px 0;">
                <tr>
                  <td style="padding: 20px; text-align: center;">
                    <p style="color: #e0f2fe; margin: 0 0 5px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Quote Reference</p>
                    <p style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 1px;">${quoteId}</p>
                  </td>
                </tr>
              </table>
              ${details ? `<div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 15px 0;">
                <p style="margin: 5px 0;"><strong>Details:</strong> ${JSON.stringify(details)}</p>
              </div>` : ''}
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="https://smilesmarthome.com/dashboard/user/my-quotes" style="display: inline-block; background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 50px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px 0 rgba(13, 148, 136, 0.39);">
                      ${isSubmitted ? 'Track Your Quote' : 'View Your Estimation'}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background: #f3f4f6; padding: 30px; text-align: center;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0 0 10px 0;">© 2026 Smile Smart Home. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
export function useQuoteRequest() {
  const { showNotification } = useDevices();
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [whatsappStatus, setWhatsappStatus] = useState<'idle' | 'sending' | 'sent' | 'skipped' | 'failed'>('idle');

  /**
   * notifyQuoteAction
   * Sends email via EmailJS and triggers backend for WhatsApp delivery
   */
  const notifyQuoteAction = async (params: NotifyParams): Promise<NotifyResult> => {
    console.log('[notifyQuoteAction] START - email:', params.email, 'phone:', params.phone);
    setIsSending(true);
    setSendError(null);
    setSendSuccess(false);
    setWhatsappStatus('idle');

    const result: NotifyResult = { emailSent: false };

    try {
      // Check auth first
      const auth = getAuth();
      const currentUser = auth.currentUser;
      
      if (!currentUser) {
        throw new Error('You must be logged in to send emails. Please sign in and try again.');
      }

      // Step 1: Send email via EmailJS
      const templateParams = {
        to_email: params.email,
        name: params.name || 'Valued Customer',
        quote_id: params.quoteId,
        total: params.details?.budget || 'Contact us for details',
      };
      
      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        templateParams,
        EMAILJS_PUBLIC_KEY
      );
      
      result.emailSent = true;
      setSendSuccess(true);

      // Step 2: Client-Side WhatsApp Redirect
      if (params.phone) {
        setWhatsappStatus('sent');
        
        const waLink = generateWhatsAppLink({
          phone: params.phone,
          type: params.type,
          quoteId: params.quoteId,
          name: params.name
        });
        
        result.whatsappLink = waLink;

        // Auto-open WhatsApp in a new tab after a brief delay
        setTimeout(() => {
          window.open(waLink, '_blank');
        }, 1500);

      } else {
        setWhatsappStatus('skipped');
        result.whatsappSkipped = true;
      }

      showNotification({ 
        message: 'Your details have been sent to your email. Opening WhatsApp...', 
        type: 'success' 
      });

      return result;
    } catch (err: any) {
      console.error('[notifyQuoteAction] ERROR:', err);
      const message = getFriendlyErrorMessage(err);
      setSendError(message);
      setWhatsappStatus('failed');
      
      showNotification({ 
        message: 'Delivery Error: ' + message, 
        type: 'error'
      });
      
      throw err;
    } finally {
      setIsSending(false);
    }
  };

  /** Legacy scroll helper — kept for UI compatibility */
  const requestQuote = (spaceType?: SpaceType) => {
    if (typeof window !== 'undefined') {
      const plannerEl = document.getElementById('planner');
      if (plannerEl) {
        if (spaceType) {
          const url = new URL(window.location.href);
          url.searchParams.set('space', spaceType);
          window.history.replaceState({}, '', url.toString());
        }
        plannerEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  return { 
    requestQuote, 
    notifyQuoteAction, 
    isSending, 
    sendSuccess, 
    sendError,
    whatsappStatus
  };
}
