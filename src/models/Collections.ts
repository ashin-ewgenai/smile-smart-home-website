import { Firestore, Timestamp, doc, collection, CollectionReference, DocumentReference, serverTimestamp, FieldValue, increment, setDoc, getDocs, where, limit, query } from 'firebase/firestore';
import { type Auth, type UserCredential, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';

// Accounts Collection
export interface Account {
  Uid: string;
  Email: string | null;
  FullName: string;
  Role: 'user' | 'admin' | 'Super Admin' | string;
  CreatedAt: Timestamp | null;
  LastLoginAt: Timestamp | null;
  LoginCount: number;
  Status: 'online' | 'offline' | string;
  StatusUpdatedAt: Timestamp | null;
  ConsultationId: string | null;
}

export const COLLECTION_ACCOUNTS = 'Accounts';

export function accountsCollection(db: Firestore): CollectionReference<Account> {
  return collection(db, COLLECTION_ACCOUNTS) as CollectionReference<Account>;
}

export function accountDoc(db: Firestore, uid: string): DocumentReference<Account> {
  return doc(db, COLLECTION_ACCOUNTS, uid) as DocumentReference<Account>;
}

// Builders to avoid duplicating field objects in components
export function newAccountPayload(params: {
  uid: string;
  email: string | null;
  fullName: string;
  role: Account['Role'];
  consultationId: string | null;
}): Pick<Account, 'Uid' | 'Email' | 'FullName' | 'Role' | 'LoginCount' | 'Status' | 'ConsultationId'> & {
  CreatedAt: FieldValue;
  LastLoginAt: null;
  StatusUpdatedAt: FieldValue;
} {
  const { uid, email, fullName, role, consultationId } = params;
  return {
    Uid: uid,
    Email: email,
    FullName: fullName,
    Role: role,
    CreatedAt: serverTimestamp(),
    LastLoginAt: null,
    LoginCount: 0,
    Status: 'offline',
    StatusUpdatedAt: serverTimestamp(),
    ConsultationId: consultationId,
  };
}

export function accountLoginMergePayload(): {
  LastLoginAt: FieldValue;
  LoginCount: FieldValue;
  Status: Account['Status'];
  StatusUpdatedAt: FieldValue;
} {
  return {
    LastLoginAt: serverTimestamp(),
    LoginCount: increment(1),
    Status: 'online',
    StatusUpdatedAt: serverTimestamp(),
  };
}

// Contact Messages Collection
export interface ContactMessage {
  name: string;
  email: string;
  phone: string;
  service: string;
  message: string;
  createdAt: Timestamp | null;
}

export const COLLECTION_CONTACT_MESSAGES = 'Contact_Messages';

export function contactMessagesCollection(db: Firestore): CollectionReference<ContactMessage> {
  return collection(db, COLLECTION_CONTACT_MESSAGES) as CollectionReference<ContactMessage>;
}

export function contactMessageDoc(db: Firestore, id: string): DocumentReference<ContactMessage> {
  return doc(db, COLLECTION_CONTACT_MESSAGES, id) as DocumentReference<ContactMessage>;
}

export type ContactMessageInput = Omit<ContactMessage, 'createdAt'>;

export function contactMessagePayload(input: ContactMessageInput): ContactMessage & { createdAt: FieldValue } {
  return {
    ...input,
    createdAt: serverTimestamp(),
  } as any;
}

// High-level helpers for components
export async function findConsultationIdByEmail(db: Firestore, email: string): Promise<string | null> {
  try {
    const q = query(contactMessagesCollection(db), where('email', '==', email), limit(1));
    const res = await getDocs(q);
    if (!res.empty) return res.docs[0].id;
    return null;
  } catch {
    return null;
  }
}

export async function createAccountProfile(db: Firestore, params: {
  uid: string;
  email: string | null;
  fullName: string;
  role: Account['Role'];
  consultationId?: string | null;
}): Promise<void> {
  const { uid, email, fullName, role, consultationId = null } = params;
  await setDoc(
    accountDoc(db, uid),
    newAccountPayload({ uid, email, fullName, role, consultationId })
  );
}

export async function createAccountProfileWithLookup(db: Firestore, params: {
  uid: string;
  email: string | null;
  fullName: string;
  role: Account['Role'];
}): Promise<void> {
  const { uid, email, fullName, role } = params;
  const consultationId = email ? await findConsultationIdByEmail(db, email) : null;
  await createAccountProfile(db, { uid, email, fullName, role, consultationId });
}

// Combined helper: Auth + Profile creation in one call
export async function registerUserWithProfile(
  auth: Auth,
  db: Firestore,
  params: { email: string; password: string; fullName: string; role: Account['Role'] }
): Promise<UserCredential> {
  const { email, password, fullName, role } = params;
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (fullName) {
    try { await updateProfile(cred.user, { displayName: fullName }); } catch {}
  }
  try {
    await createAccountProfileWithLookup(db, {
      uid: cred.user.uid,
      email: cred.user.email,
      fullName: fullName || cred.user.displayName || '',
      role,
    });
  } catch {}
  return cred;
}

// =====================
// Additional Collections
// =====================

// Devices
export interface Device {
  deviceName?: string; // preferred
  name?: string; // legacy
  type?: string;
  status?: 'Active' | 'Inactive' | string;
  serial?: string;
  modelNumber?: string;
  imageUrl?: string;
  assignedToEmail?: string;
  location?: string;
  price?: number | null;
  stock?: number | null;
  description?: string;
  brand?: string;
  rating?: number | null;
  discount?: number | null;
  warranty?: string | number | null;
  createdAt?: Timestamp | null;
  createdByUid?: string | null;
  createdByEmail?: string | null;
}

export const COLLECTION_DEVICES = 'Devices';
export function devicesCollection(db: Firestore): CollectionReference<Device> {
  return collection(db, COLLECTION_DEVICES) as CollectionReference<Device>;
}
export function deviceDoc(db: Firestore, id: string): DocumentReference<Device> {
  return doc(db, COLLECTION_DEVICES, id) as DocumentReference<Device>;
}

// Admin Service Requests (flat collection used by Notifications)
export interface AdminServiceRequest {
  createdAt?: Timestamp | Date | string | number | null;
  created_at?: Timestamp | Date | string | number | null;
  ts?: Timestamp | Date | string | number | null;
  preferredDate?: string;
  preferred_date?: string;
  preferredTime?: string;
  preferred_time?: string;
  priority?: 'High' | 'Normal' | 'Low' | string;
  status?: 'new' | 'ack' | 'done' | string;
  userEmail?: string;
  email?: string;
  userName?: string;
  displayName?: string;
  service?: string;
  type?: string;
  device?: string;
  userId?: string;
  uid?: string;
  user?: string;
}

export const COLLECTION_SERVICE_REQUESTS = 'service_requests';
export function serviceRequestsCollection(db: Firestore): CollectionReference<AdminServiceRequest> {
  return collection(db, COLLECTION_SERVICE_REQUESTS) as CollectionReference<AdminServiceRequest>;
}
export function serviceRequestDoc(db: Firestore, id: string): DocumentReference<AdminServiceRequest> {
  return doc(db, COLLECTION_SERVICE_REQUESTS, id) as DocumentReference<AdminServiceRequest>;
}

// Users (basic profile lookups)
export interface UserProfile {
  displayName?: string;
  name?: string;
  email?: string;
  [key: string]: any;
}

export const COLLECTION_USERS = 'users';
export function usersCollection(db: Firestore): CollectionReference<UserProfile> {
  return collection(db, COLLECTION_USERS) as CollectionReference<UserProfile>;
}
export function userDoc(db: Firestore, uid: string): DocumentReference<UserProfile> {
  return doc(db, COLLECTION_USERS, uid) as DocumentReference<UserProfile>;
}

// Planner Leads
export interface PlannerLead {
  updatedAt?: Timestamp | null;
  createdAt?: Timestamp | null;
  [key: string]: any;
}

export const COLLECTION_PLANNER_LEADS = 'Planner_Leads';
export function plannerLeadsCollection(db: Firestore): CollectionReference<PlannerLead> {
  return collection(db, COLLECTION_PLANNER_LEADS) as CollectionReference<PlannerLead>;
}
export function plannerLeadDoc(db: Firestore, id: string): DocumentReference<PlannerLead> {
  return doc(db, COLLECTION_PLANNER_LEADS, id) as DocumentReference<PlannerLead>;
}

// Alerts
export interface AlertDoc {
  message?: string;
  level?: 'info' | 'warn' | 'error' | string;
  createdAt?: Timestamp | null;
  [key: string]: any;
}

export const COLLECTION_ALERTS = 'Alerts';
export function alertsCollection(db: Firestore): CollectionReference<AlertDoc> {
  return collection(db, COLLECTION_ALERTS) as CollectionReference<AlertDoc>;
}
export function alertDoc(db: Firestore, id: string): DocumentReference<AlertDoc> {
  return doc(db, COLLECTION_ALERTS, id) as DocumentReference<AlertDoc>;
}

// Nested: serviceRequests/{uid}/requests
export const COLLECTION_USER_SERVICE_REQUESTS_ROOT = 'Service_Requests';
export const SUBCOLLECTION_USER_REQUESTS = 'Requests_List';

export interface UserServiceRequest {
  createdAt?: Timestamp | null;
  service?: string;
  device?: string;
  preferredDate?: string;
  preferredTime?: string;
  priority?: 'High' | 'Normal' | 'Low' | string;
  status?: 'new' | 'ack' | 'done' | string;
  [key: string]: any;
}

export function userServiceRequestsParentDoc(db: Firestore, uid: string): DocumentReference {
  return doc(db, COLLECTION_USER_SERVICE_REQUESTS_ROOT, uid);
}
export function userServiceRequestsCollection(db: Firestore, uid: string): CollectionReference<UserServiceRequest> {
  return collection(db, COLLECTION_USER_SERVICE_REQUESTS_ROOT, uid, SUBCOLLECTION_USER_REQUESTS) as CollectionReference<UserServiceRequest>;
}
export function userServiceRequestDoc(db: Firestore, uid: string, requestId: string): DocumentReference<UserServiceRequest> {
  return doc(db, COLLECTION_USER_SERVICE_REQUESTS_ROOT, uid, SUBCOLLECTION_USER_REQUESTS, requestId) as DocumentReference<UserServiceRequest>;
}

// Nested: quotes/{uid}/quote
export const COLLECTION_QUOTES_ROOT = 'Quotes';
export const SUBCOLLECTION_QUOTE = 'Quote_List';

export interface QuoteItem {
  createdAt?: Timestamp | null;
  [key: string]: any;
}

export function quotesParentDoc(db: Firestore, uid: string): DocumentReference {
  return doc(db, COLLECTION_QUOTES_ROOT, uid);
}
export function quotesCollection(db: Firestore, uid: string): CollectionReference<QuoteItem> {
  return collection(db, COLLECTION_QUOTES_ROOT, uid, SUBCOLLECTION_QUOTE) as CollectionReference<QuoteItem>;
}
export function quoteDoc(db: Firestore, uid: string, id: string): DocumentReference<QuoteItem> {
  return doc(db, COLLECTION_QUOTES_ROOT, uid, SUBCOLLECTION_QUOTE, id) as DocumentReference<QuoteItem>;
}

// Nested: supportTickets/{uid}/ticket
export const COLLECTION_SUPPORT_TICKETS_ROOT = 'Support_Tickets';
export const SUBCOLLECTION_TICKET = 'Tickets_List';

export interface SupportTicket {
  title?: string;
  description?: string;
  imageUrl?: string;
  createdAt?: Timestamp | null;
  status?: 'open' | 'closed' | 'pending' | string;
  [key: string]: any;
}

export function supportTicketsParentDoc(db: Firestore, uid: string): DocumentReference {
  return doc(db, COLLECTION_SUPPORT_TICKETS_ROOT, uid);
}
export function supportTicketsCollection(db: Firestore, uid: string): CollectionReference<SupportTicket> {
  return collection(db, COLLECTION_SUPPORT_TICKETS_ROOT, uid, SUBCOLLECTION_TICKET) as CollectionReference<SupportTicket>;
}
export function supportTicketDoc(db: Firestore, uid: string, id: string): DocumentReference<SupportTicket> {
  return doc(db, COLLECTION_SUPPORT_TICKETS_ROOT, uid, SUBCOLLECTION_TICKET, id) as DocumentReference<SupportTicket>;
}
