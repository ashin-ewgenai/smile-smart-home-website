import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, getFirestore, doc, updateDoc } from 'firebase/firestore';

export function useTicketNotifications(userIdOrParams?: string | null | { userId?: string | null, isAdmin?: boolean, status?: string }) {
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [tickets, setTickets] = useState<any[]>([]); // New state for Kanban tickets
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parse arguments for backward compatibility
  let userId: string | null = null;
  let isAdmin = false;
  let filterStatus: string | null = null;
  if (typeof userIdOrParams === 'string' || userIdOrParams === null) {
    userId = userIdOrParams;
  } else if (userIdOrParams) {
    userId = userIdOrParams.userId ?? null;
    isAdmin = userIdOrParams.isAdmin ?? false;
    filterStatus = userIdOrParams.status ?? null;
  }

  useEffect(() => {
    // If not admin and no userId, nothing to listen to
    if (!isAdmin && !userId) {
      setUnresolvedCount(0);
      setTickets([]);
      return;
    }

    setLoading(true);
    const db = getFirestore();
    const ticketsRef = collection(db, 'Support_Tickets');
    
    // Admin listens to all, User listens to their own
    let q = isAdmin 
      ? query(ticketsRef) 
      : query(ticketsRef, where('uid', '==', userId));

    // Optional status sub-filtering if provided in hook params
    if (filterStatus) {
      q = query(q, where('status', '==', filterStatus));
    }

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const allDocs = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setTickets(allDocs);

      const unresolved = querySnapshot.docs.filter(doc => {
        const data = doc.data();
        const status = data.status?.toString().toLowerCase();
        return status !== 'resolved' && status !== 'closed';
      });
      
      setUnresolvedCount(unresolved.length);
      setLoading(false);
      setError(null);
    }, (err) => {
      console.error('Error listening to ticket updates:', err);
      setError(err.message || 'Failed to listen to tickets');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId, isAdmin, filterStatus]);

  const updateTicketStatus = async (ticketId: string, newStatus: string) => {
    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const functions = getFunctions();
      const updateFn = httpsCallable<any, { status: string }>(functions, 'adminUpdateStatuses');
      
      // We perform optimistic UI update by manually triggering a small state change if needed
      // but usually the onSnapshot will take care of it very quickly.
      await updateFn({
        updates: [{ collection: 'Support_Tickets', id: ticketId, status: newStatus }]
      });
    } catch (err: any) {
      console.error(`Failed to update ticket ${ticketId} status:`, err);
      throw err;
    }
  };

  return { unresolvedCount, updateTicketStatus, tickets, loading, error };
}
