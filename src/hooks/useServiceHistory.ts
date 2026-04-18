import { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export type ServiceEventType = 'installation' | 'support' | 'quote' | 'billing' | 'interaction';

export interface ServiceEvent {
  id: string;
  type: ServiceEventType;
  title: string;
  description: string;
  status: string;
  timestamp: Date;
  customerEmail?: string;
  customerName?: string;
  metadata?: any;
}

interface UseServiceHistoryOptions {
  userEmail?: string;
  uid?: string;
  limitCount?: number;
}

export function useServiceHistory(options: UseServiceHistoryOptions = {}) {
  const { userEmail, uid, limitCount = 20 } = options;
  
  const [events, setEvents] = useState<ServiceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsubscribers: (() => void)[] = [];
    const sources: Record<string, ServiceEvent[]> = {};

    const updateEvents = () => {
      const allEvents = Object.values(sources).flat();
      allEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setEvents(allEvents.slice(0, limitCount * 2));
      setLoading(false);
    };

    const processSnapshot = (snap: any, type: ServiceEventType, mapper: (doc: any) => ServiceEvent) => {
      const mapped = snap.docs.map((doc: any) => mapper({ id: doc.id, ...doc.data() }));
      sources[type] = mapped;
      updateEvents();
    };

    // 1. Support Tickets
    const supportQ = query(
      collection(db, 'Support_Tickets'),
      ...(uid ? [where('uid', '==', uid)] : []),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    unsubscribers.push(onSnapshot(supportQ, (snap) => {
      processSnapshot(snap, 'support', (data) => ({
        id: data.id,
        type: 'support',
        title: data.subject || 'Support Ticket',
        description: data.description || '',
        status: data.status || 'open',
        timestamp: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || Date.now()),
        customerEmail: data.userEmail || ''
      }));
    }, setError));

    // 2. Planner Leads
    const leadsQ = query(
      collection(db, 'Planner_Leads'),
      ...(userEmail ? [where('email', '==', userEmail)] : []),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    unsubscribers.push(onSnapshot(leadsQ, (snap) => {
      processSnapshot(snap, 'installation', (data) => ({
        id: data.id,
        type: 'installation',
        title: 'Project Lead',
        description: `Home Size: ${data.formData?.houseSize || 'N/A'}`,
        status: data.status || 'new',
        timestamp: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || Date.now()),
        customerEmail: data.email || data.formData?.email || ''
      }));
    }, setError));

    // 3. Quotes
    const quotesQ = query(
      collection(db, 'quotes'),
      ...(userEmail ? [where('customerEmail', '==', userEmail)] : []),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    unsubscribers.push(onSnapshot(quotesQ, (snap) => {
      processSnapshot(snap, 'quote', (data) => ({
        id: data.id,
        type: 'quote',
        title: 'Quote Request',
        description: data.details || 'New quote request',
        status: data.status || 'pending',
        timestamp: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || Date.now()),
        customerEmail: data.customerEmail || ''
      }));
    }, setError));

    // 4. Estimation Quote (Billing)
    const billingQ = query(
      collection(db, 'Estimation_Quote'),
      ...(userEmail ? [where('customerEmail', '==', userEmail)] : []),
      orderBy('issueDate', 'desc'),
      limit(limitCount)
    );
    unsubscribers.push(onSnapshot(billingQ, (snap) => {
      processSnapshot(snap, 'billing', (data) => ({
        id: data.id,
        type: 'billing',
        title: 'Bill Generated',
        description: `Total: ₹${data.grandTotal || 0}`,
        status: data.status || 'Draft',
        timestamp: data.issueDate?.toDate ? data.issueDate.toDate() : new Date(data.issueDate || Date.now()),
        customerEmail: data.customerEmail || ''
      }));
    }, setError));

    // 5. Request Service
    const serviceQ = query(
      collection(db, 'Request_service'),
      ...(uid ? [where('uid', '==', uid)] : []),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    unsubscribers.push(onSnapshot(serviceQ, (snap) => {
      processSnapshot(snap, 'interaction', (data) => ({
        id: data.id,
        type: 'interaction',
        title: `Service: ${data.service}`,
        description: data.description || 'Service request',
        status: data.status || 'open',
        timestamp: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || Date.now()),
        customerEmail: data.userEmail || ''
      }));
    }, setError));

    return () => unsubscribers.forEach(unsub => unsub());
  }, [userEmail, uid, limitCount]);

  return { events, loading, error };
}
