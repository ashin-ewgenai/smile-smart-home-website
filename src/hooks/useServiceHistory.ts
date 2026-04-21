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
  startDate?: Date | null;
  endDate?: Date | null;
}

export function useServiceHistory(options: UseServiceHistoryOptions = {}) {
  const { userEmail, uid, limitCount = 20, startDate, endDate } = options;
  
  const [events, setEvents] = useState<ServiceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    setLoading(true);
    const unsubscribers: (() => void)[] = [];
    const sources: Record<string, ServiceEvent[]> = {};

    const initialized = new Set<ServiceEventType>();
    const updateEvents = (type: ServiceEventType) => {
      initialized.add(type);
      
      const allEvents = Object.values(sources).flat();
      // Chronological sort: Newest first
      allEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      
      // Determine if we might have more data
      const mightHaveMore = Object.values(sources).some(s => s.length >= limitCount);
      setHasMore(mightHaveMore);
      
      setEvents(allEvents);

      // Only stop loading when all 5 sources have emitted at least once
      if (initialized.size >= 5) {
        setLoading(false);
      }
    };

    const processSnapshot = (snap: any, type: ServiceEventType, mapper: (data: any) => ServiceEvent) => {
      const mapped = snap.docs.map((doc: any) => mapper({ id: doc.id, ...doc.data() }));
      sources[type] = mapped;
      updateEvents(type);
    };

    // Shared Date Filters - Fix: Inclusive end date
    const dateFilters = [];
    if (startDate) dateFilters.push(where('createdAt', '>=', startDate));
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilters.push(where('createdAt', '<=', end));
    }

    // Special case for Billing where field name is issueDate
    const billingDateFilters = [];
    if (startDate) billingDateFilters.push(where('issueDate', '>=', startDate));
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      billingDateFilters.push(where('issueDate', '<=', end));
    }

    try {
      // 1. Support Tickets
      const supportQ = query(
        collection(db, 'Support_Tickets'),
        ...(uid ? [where('uid', '==', uid)] : []),
        ...dateFilters,
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
      }, (err) => {
        console.warn('[useServiceHistory] Support_Tickets query failed:', err);
        setError(err);
        updateEvents('support');
      }));

      // 2. Planner Leads (Installation)
      const leadsQ = query(
        collection(db, 'Planner_Leads'),
        ...(userEmail ? [where('email', '==', userEmail)] : []),
        ...dateFilters,
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );
      unsubscribers.push(onSnapshot(leadsQ, (snap) => {
        processSnapshot(snap, 'installation', (data) => ({
          id: data.id,
          type: 'installation',
          title: 'Project Lead',
          description: `House Size: ${data.formData?.houseSize || 'N/A'}`,
          status: data.status || 'new',
          timestamp: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || Date.now()),
          customerEmail: data.email || data.formData?.email || ''
        }));
      }, (err) => {
        console.warn('[useServiceHistory] Planner_Leads query failed:', err);
        updateEvents('installation');
      }));

      // 3. Quotes
      const quotesQ = query(
        collection(db, 'quotes'),
        ...(userEmail ? [where('customerEmail', '==', userEmail)] : []),
        ...dateFilters,
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
      }, (err) => {
        console.warn('[useServiceHistory] quotes query failed:', err);
        updateEvents('quote');
      }));

      // 4. Billing (Estimation_Quote)
      const billingQ = query(
        collection(db, 'Estimation_Quote'),
        ...(userEmail ? [where('customerEmail', '==', userEmail)] : []),
        ...billingDateFilters,
        orderBy('issueDate', 'desc'),
        limit(limitCount)
      );
      unsubscribers.push(onSnapshot(billingQ, (snap) => {
        processSnapshot(snap, 'billing', (data) => ({
          id: data.id,
          type: 'billing',
          title: 'Bill Generated',
          description: `Total Amount: ₹${data.grandTotal || 0}`,
          status: data.status || 'Draft',
          timestamp: data.issueDate?.toDate ? data.issueDate.toDate() : new Date(data.issueDate || Date.now()),
          customerEmail: data.customerEmail || ''
        }));
      }, (err) => {
        console.warn('[useServiceHistory] Estimation_Quote query failed:', err);
        updateEvents('billing');
      }));

      // 5. Interaction (Request_service)
      const serviceQ = query(
        collection(db, 'Request_service'),
        ...(uid ? [where('uid', '==', uid)] : []),
        ...dateFilters,
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );
      unsubscribers.push(onSnapshot(serviceQ, (snap) => {
        processSnapshot(snap, 'interaction', (data) => ({
          id: data.id,
          type: 'interaction',
          title: `Service: ${data.service}`,
          description: data.description || 'Service request interaction',
          status: data.status || 'open',
          timestamp: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || Date.now()),
          customerEmail: data.userEmail || ''
        }));
      }, (err) => {
        console.warn('[useServiceHistory] Request_service query failed:', err);
        updateEvents('interaction');
      }));

    } catch (err: any) {
      console.error('[useServiceHistory] Query setup failed:', err);
      setError(err);
      setLoading(false);
    }

    return () => unsubscribers.forEach(unsub => unsub());
  }, [userEmail, uid, limitCount, startDate, endDate]);

  return { events, loading, error, hasMore };
}
