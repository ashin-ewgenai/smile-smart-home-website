// Chatbot workflow orchestrator for the front-end chat UI
// Uses callable Cloud Functions implemented in functions/src/index.ts
// Ensures clear decision points, finite retries, and Firestore-backed counters

import { functions } from './firebase';
import { httpsCallable } from 'firebase/functions';

export type TicketId = string;

export type StartComplaintResult =
  | { status: 'need_ticket'; message: string }
  | { status: 'ticket_ready'; ticketId: TicketId };

export async function ensureTicketOrPrompt(complaint: string, existingTicketId?: TicketId): Promise<StartComplaintResult> {
  // Step 1: If user complains and no ticket exists, instruct them to use Raise Tickets page.
  if (!existingTicketId) {
    return { status: 'need_ticket', message: 'Please create a support ticket before we can help.' };
  }
  return { status: 'ticket_ready', ticketId: existingTicketId };
}

export async function analyzeComplaint(ticketId: TicketId): Promise<{ analysis: string }>{
  const callable = httpsCallable(functions, 'analyzeComplaint');
  const res = await callable({ ticketId });
  return res.data as { analysis: string };
}

// Gate image upload attempts, returns remaining attempts
export async function beginSerialImageAttempt(ticketId: TicketId): Promise<{ allowed: boolean; remaining: number }>{
  const callable = httpsCallable(functions, 'requestSerialImage');
  const res = await callable({ ticketId });
  return res.data as { allowed: boolean; remaining: number };
}

export async function extractSerialFromImage(ticketId: TicketId, imageUrl: string): Promise<{ serial: string | null }>{
  const callable = httpsCallable(functions, 'extractSerialFromImage');
  const res = await callable({ ticketId, imageUrl });
  return res.data as { serial: string | null };
}

export async function verifySerialAndFetchDocs(ticketId: TicketId, serial: string): Promise<
  { valid: false; message: string } | { valid: true; deviceType: string; links: string[] }
>{
  const callable = httpsCallable(functions, 'verifySerialAndFetchDocs');
  const res = await callable({ ticketId, serial });
  return res.data as any;
}

export async function suggestTroubleshootingStep(ticketId: TicketId, docs: string[]): Promise<
  { done: true; message: string } | { done: false; attempt: number; suggestion: string }
>{
  const callable = httpsCallable(functions, 'suggestTroubleshootingStep');
  const res = await callable({ ticketId, docs });
  return res.data as any;
}

export async function resolveOrEscalate(ticketId: TicketId, solved: boolean): Promise<{ status: 'resolved' | 'escalated' }>{
  const callable = httpsCallable(functions, 'resolveOrEscalate');
  const res = await callable({ ticketId, solved });
  return res.data as { status: 'resolved' | 'escalated' };
}

export async function adminCloseTicket(ticketId: TicketId): Promise<{ status: 'closed' }>{
  const callable = httpsCallable(functions, 'adminCloseTicket');
  const res = await callable({ ticketId });
  return res.data as { status: 'closed' };
}

export async function recordTicketFeedback(ticketId: TicketId, rating: number, comment?: string): Promise<{ ok: boolean }>{
  const callable = httpsCallable(functions, 'recordTicketFeedback');
  const res = await callable({ ticketId, rating, comment });
  return res.data as { ok: boolean };
}

// Triage a single message (no Firestore writes). If kind is 'faq' or 'general', answer is provided.
export async function triageChat(message: string): Promise<{ kind: 'faq' | 'general' | 'complaint'; answer?: string }>{
  const callable = httpsCallable(functions, 'triageChat');
  const res = await callable({ message });
  return res.data as { kind: 'faq' | 'general' | 'complaint'; answer?: string };
}

// Example UI-driving helper encapsulating decision points
export async function runTroubleshootingFlow(params: {
  complaint: string;
  ticketId?: TicketId;
  getImageUrl: (attempt: number) => Promise<string | null>; // caller uploads to Storage and returns public URL
  askUserIfSolved: (suggestion: string) => Promise<boolean>; // true if solved
  showMessage?: (m: string) => void;
}) {
  const { complaint, ticketId: existingId, getImageUrl, askUserIfSolved, showMessage } = params;

  // Step 1
  const ticketStatus = await ensureTicketOrPrompt(complaint, existingId);
  if (ticketStatus.status === 'need_ticket') {
    showMessage?.(ticketStatus.message);
    return { status: 'waiting_for_ticket' as const };
  }

  let ticketId = ticketStatus.ticketId;

  // Step 2
  const analysis = await analyzeComplaint(ticketId);
  showMessage?.(analysis.analysis);

  // Step 3-4: up to 2 image attempts for serial extraction
  let serial: string | null = null;
  for (let i = 0; i < 2 && !serial; i++) {
    const gate = await beginSerialImageAttempt(ticketId);
    if (!gate.allowed) break;
    showMessage?.('Please upload an image of the device with the serial number visible.');
    const url = await getImageUrl(i + 1);
    if (!url) break;
    const ex = await extractSerialFromImage(ticketId, url);
    serial = ex.serial;
    if (!serial && gate.remaining === 0) {
      break;
    }
  }

  if (!serial) {
    showMessage?.('This product is not recognized.');
    return { status: 'unrecognized' as const };
  }

  // Step 5-7
  const verify = await verifySerialAndFetchDocs(ticketId, serial);
  if (!verify.valid) {
    showMessage?.(verify.message);
    return { status: 'unrecognized' as const };
  }

  // Step 8-11: up to 3 troubleshooting attempts
  let docs = verify.links || [];
  for (let i = 0; i < 3; i++) {
    const s = await suggestTroubleshootingStep(ticketId, docs);
    if (s.done) break;
    showMessage?.(s.suggestion);
    const solved = await askUserIfSolved(s.suggestion);
    if (solved) {
      await resolveOrEscalate(ticketId, true);
      showMessage?.('Glad it’s resolved!');
      return { status: 'resolved' as const };
    }
  }

  // If still not resolved
  await resolveOrEscalate(ticketId, false);
  showMessage?.('I will connect you with human support.');
  return { status: 'escalated' as const };
}
