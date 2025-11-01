import { 
  collection, 
  doc, 
  serverTimestamp, 
  Timestamp, 
  type CollectionReference, 
  type DocumentReference, 
  type FieldValue, 
  type Firestore,
  getDocs,
  getDoc,
  query,
  where,
  increment,
  limit,
  setDoc,
  addDoc
} from 'firebase/firestore';
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

// Contact Requests Collection (new, for notifications)
export interface ContactRequest {
  name?: string;
  email?: string;
  phone?: string;
  service?: string;
  message?: string;
  createdAt?: Timestamp | null;
  adminRead?: boolean;
  [key: string]: any;
}

export const COLLECTION_CONTACT_REQUESTS = 'contactRequests';

export function contactRequestsCollection(db: Firestore): CollectionReference<ContactRequest> {
  return collection(db, COLLECTION_CONTACT_REQUESTS) as CollectionReference<ContactRequest>;
}

export function contactRequestDoc(db: Firestore, id: string): DocumentReference<ContactRequest> {
  return doc(db, COLLECTION_CONTACT_REQUESTS, id) as DocumentReference<ContactRequest>;
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
  phoneNumber?: string;
  address?: string;
  consultationId?: string | null;
}): Promise<void> {
  const { uid, email, fullName, role, consultationId = null } = params;
  const accountData = newAccountPayload({ uid, email, fullName, role, consultationId });
  const accountWithContact = {
    ...accountData,
    ...(params.phoneNumber && { phoneNumber: params.phoneNumber }),
    ...(params.address && { address: params.address })
  };
  
  await setDoc(
    accountDoc(db, uid),
    accountWithContact
  );
}

export async function createAccountProfileWithLookup(db: Firestore, params: {
  uid: string;
  email: string | null;
  fullName: string;
  role: Account['Role'];
  phoneNumber?: string;
  address?: string;
}): Promise<void> {
  const { uid, email, fullName, role, phoneNumber, address } = params;
  const consultationId = email ? await findConsultationIdByEmail(db, email) : null;
  await createAccountProfile(db, { 
    uid, 
    email, 
    fullName, 
    role, 
    phoneNumber, 
    address, 
    consultationId 
  });
}

// Combined helper: Auth + Profile creation in one call
export async function registerUserWithProfile(
  auth: Auth,
  db: Firestore,
  params: { 
    email: string; 
    password: string; 
    fullName: string; 
    role: Account['Role'];
    phoneNumber?: string;
    address?: string;
  }
): Promise<UserCredential> {
  const { email, password, fullName, role, phoneNumber, address } = params;
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
      phoneNumber,
      address
    });
  } catch {}
  return cred;
}

// Request Service Collection
export interface RequestService {
  uid: string;
  service: string;
  devices: string[];  // Array of device IDs
  date: string;
  time: string;
  priority: 'high' | 'normal' | 'low';
  description: string;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  assignedTo?: string;
  assignedAt?: Timestamp | null;
  completedAt?: Timestamp | null;
  notes?: string;
}

export const COLLECTION_REQUEST_SERVICES = 'Request_service';

export function requestServicesCollection(db: Firestore): CollectionReference<RequestService> {
  return collection(db, COLLECTION_REQUEST_SERVICES) as CollectionReference<RequestService>;
}

export function requestServiceDoc(db: Firestore, id: string): DocumentReference<RequestService> {
  return doc(db, COLLECTION_REQUEST_SERVICES, id) as DocumentReference<RequestService>;
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
  troubleshooting?: Array<{
    problem: string;
    solution: string;
  }>;
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

// Nested: quotes/{uid}/quote
export const COLLECTION_QUOTES_ROOT = 'Quotes';
export const SUBCOLLECTION_QUOTE = 'Quote_List';

export interface QuoteItem {
  // Common fields used by Quote form
  uid?: string;
  userEmail?: string | null;
  location?: string;
  sqft?: number | null;
  area?: string;
  details?: string;
  status?: 'submitted' | 'approved' | string;
  createdAt?: Timestamp | null;
  estimationQuoteId?: string; // Reference to Estimation Quote collection
  hasEstimation?: boolean; // Flag to indicate if estimation exists
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

// Flat: supportTickets collection with uid field
export const COLLECTION_SUPPORT_TICKETS = 'Support_Tickets';

export interface SupportTicket {
  // User identification
  uid: string;
  // New fields used by TicketCenter
  subject?: string;
  category?: 'Device Issue' | 'Connectivity' | 'Billing' | 'Other' | string;
  // Legacy/alternative title field
  title?: string;
  description?: string;
  imageUrl?: string;
  createdAt?: Timestamp | null;
  // Normalize to TicketCenter statuses while preserving legacy values used elsewhere
  status?: 'Pending' | 'In Progress' | 'Resolved' | 'open' | 'closed' | 'pending' | string;
  [key: string]: any;
}

export function supportTicketsCollection(db: Firestore): CollectionReference<SupportTicket> {
  return collection(db, COLLECTION_SUPPORT_TICKETS) as CollectionReference<SupportTicket>;
}
export function supportTicketDoc(db: Firestore, id: string): DocumentReference<SupportTicket> {
  return doc(db, COLLECTION_SUPPORT_TICKETS, id) as DocumentReference<SupportTicket>;
}

// Flat: User_Devices collection with uid field
export const COLLECTION_USER_DEVICES = 'User_Devices';

export interface UserDevice {
  // User identification
  uid: string;
  // linkage
  sourceDeviceId?: string; // id of the document in top-level Devices

  // requested tracking fields
  UpdatedAt?: Timestamp | null;
  DeviceCount?: number | null;
  status?: 'Pending' | 'In Progress' | 'Resolved' | 'open' | 'closed' | 'pending' | string;
  [key: string]: any; // allow copied fields from Devices document
}

export function userDevicesCollection(db: Firestore): CollectionReference<UserDevice> {
  return collection(db, COLLECTION_USER_DEVICES) as CollectionReference<UserDevice>;
}
export function userDeviceDoc(db: Firestore, id: string): DocumentReference<UserDevice> {
  return doc(db, COLLECTION_USER_DEVICES, id) as DocumentReference<UserDevice>;
}

// User Notifications collection
export const COLLECTION_USER_NOTIFICATIONS = 'User_Notifications';

export interface UserNotification {
  uid: string;
  title: string;
  message: string;
  type: 'system' | 'device' | 'billing' | 'support' | string;
  status: 'read' | 'unread' | string;
  createdAt: Timestamp;
  [key: string]: any;
}

export function userNotificationsCollection(db: Firestore): CollectionReference<UserNotification> {
  return collection(db, COLLECTION_USER_NOTIFICATIONS) as CollectionReference<UserNotification>;
}

export function userNotificationDoc(db: Firestore, id: string): DocumentReference<UserNotification> {
  return doc(db, COLLECTION_USER_NOTIFICATIONS, id) as DocumentReference<UserNotification>;
}

export async function createWarrantyExpiryNotification(db: Firestore, params: { uid: string; message: string; title?: string; [key: string]: any; }): Promise<void> {
  const { uid, message, title = 'Warranty Expiry', ...rest } = params;
  const payload = {
    uid,
    title,
    message,
    type: 'warranty_expiry',
    status: 'unread',
    createdAt: serverTimestamp(),
    ...rest,
  } as any;
  await addDoc(userNotificationsCollection(db), payload);
}

// Admin Notifications collection
export const COLLECTION_ADMIN_NOTIFICATIONS = 'Admin_Notifications';

export interface AdminNotification {
  adminUid?: string; // Optional: specific admin, or null for all admins
  title: string;
  message?: string;
  type: 'estimation_quote' | 'user_action' | 'system' | 'quote_request' | 'support_ticket' | 'contact_request' | string;
  status: 'read' | 'unread' | string;
  createdAt: Timestamp;
  // Additional context fields
  relatedEntityId?: string; // ID of related quote, ticket, etc.
  relatedEntityType?: string; // 'quote', 'ticket', 'user', etc.
  customerEmail?: string;
  customerUid?: string;
  priority?: 'high' | 'medium' | 'low';
  [key: string]: any;
}

export function adminNotificationsCollection(db: Firestore): CollectionReference<AdminNotification> {
  return collection(db, COLLECTION_ADMIN_NOTIFICATIONS) as CollectionReference<AdminNotification>;
}

export function adminNotificationDoc(db: Firestore, id: string): DocumentReference<AdminNotification> {
  return doc(db, COLLECTION_ADMIN_NOTIFICATIONS, id) as DocumentReference<AdminNotification>;
}

export function userDevicePayloadFromDevice(device: Device & { id?: string }, uid: string): UserDevice & { UpdatedAt: FieldValue; status: string; DeviceCount: number } {
  return {
    uid,
    sourceDeviceId: device.id,
    deviceName: device.deviceName,
    name: device.name,
    type: device.type,
    status: 'pending',
    serial: device.serial,
    modelNumber: device.modelNumber,
    imageUrl: device.imageUrl,
    price: device.price ?? null,
    stock: device.stock ?? null,
    rating: device.rating ?? null,
    discount: device.discount ?? null,
    warranty: device.warranty ?? null,
    UpdatedAt: serverTimestamp(),
    DeviceCount: 1,
  } as any;
}

// Estimation Quotes Collection
export interface EstimationQuote {
  quoteId: string;
  originalQuoteId?: string; // Reference to the original quote in 'quotes' collection
  customerEmail: string;
  uid?: string; // UID from Accounts for the customer
  status: 'Pending' | 'Confirmed' | 'Draft' | string;
  issueDate: Date | Timestamp | null;
  expiryDate?: Date | Timestamp | null;
  attachments?: string[];
  items: Array<{
    id: string;
    name: string;
    description: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    taxPercent: number;
  }>;
  subtotal: number;
  taxes: number;
  overallDiscount: number;
  shippingCharges: number;
  installationCharges: number;
  grandTotal: number;
  // Tax configuration
  taxType?: string; // e.g., GST, Custom
  taxPercent?: number; // main tax percent
  taxBreakdown?: Array<{ name: string; percent: number; amount: number }>;
  paymentTerms: string;
  warranty?: string;
  deliveryTimeline?: string;
  notes?: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  createdByUid?: string;
  createdByEmail?: string;
}

export const COLLECTION_ESTIMATION_QUOTES = 'Estimation_Quote';

export function estimationQuotesCollection(db: Firestore): CollectionReference<EstimationQuote> {
  return collection(db, COLLECTION_ESTIMATION_QUOTES) as CollectionReference<EstimationQuote>;
}

export function estimationQuoteDoc(db: Firestore, id: string): DocumentReference<EstimationQuote> {
  return doc(db, COLLECTION_ESTIMATION_QUOTES, id) as DocumentReference<EstimationQuote>;
}

export function estimationQuotePayload(data: Partial<EstimationQuote>): EstimationQuote {
  return {
    quoteId: data.quoteId || '',
    originalQuoteId: data.originalQuoteId || '',
    customerEmail: data.customerEmail || '',
    uid: data.uid || '',
    status: data.status || 'Draft',
    issueDate: data.issueDate || Timestamp.now(),
    expiryDate: data.expiryDate || null,
    attachments: data.attachments || [],
    items: data.items || [],
    subtotal: data.subtotal || 0,
    taxes: data.taxes || 0,
    overallDiscount: data.overallDiscount || 0,
    shippingCharges: data.shippingCharges || 0,
    installationCharges: data.installationCharges || 0,
    grandTotal: data.grandTotal || 0,
    taxType: data.taxType || '',
    taxPercent: data.taxPercent || 0,
    taxBreakdown: data.taxBreakdown || [],
    paymentTerms: data.paymentTerms || '',
    warranty: data.warranty || '',
    deliveryTimeline: data.deliveryTimeline || '',
    notes: data.notes || '',
    createdAt: data.createdAt || Timestamp.now(),
    updatedAt: Timestamp.now(),
    createdByUid: data.createdByUid || '',
    createdByEmail: data.createdByEmail || '',
  };
}

// Helper functions to query related documents
export async function getQuoteWithEstimation(db: Firestore, quoteId: string) {
  const quoteDoc = await getDoc(doc(db, 'quotes', quoteId));
  const quote = quoteDoc.data();
  
  if (quote?.estimationQuoteId) {
    const estimationDoc = await getDoc(estimationQuoteDoc(db, quote.estimationQuoteId));
    return {
      quote: quote,
      estimation: estimationDoc.data()
    };
  }
  
  return { quote, estimation: null };
}

export async function getCustomerQuotesAndEstimations(db: Firestore, customerEmail: string) {
  const [quotesSnap, estimationsSnap] = await Promise.all([
    getDocs(query(
      collection(db, 'quotes'), 
      where('customerEmail', '==', customerEmail)
    )),
    getDocs(query(
      estimationQuotesCollection(db),
      where('customerEmail', '==', customerEmail)
    ))
  ]);
  
  return {
    quotes: quotesSnap.docs.map(d => ({id: d.id, ...d.data()})),
    estimations: estimationsSnap.docs.map(d => ({id: d.id, ...d.data()}))
  };
}
