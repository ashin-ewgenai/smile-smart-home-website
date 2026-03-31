import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, getFirestore, doc, updateDoc } from 'firebase/firestore';

export function useTicketNotifications(userIdOrParams?: string | null | { userId?: string | null, isAdmin?: boolean }) {
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parse arguments for backward compatibility
  let userId: string | null = null;
  let isAdmin = false;
  if (typeof userIdOrParams === 'string' || userIdOrParams === null) {
    userId = userIdOrParams;
  } else if (userIdOrParams) {
    userId = userIdOrParams.userId ?? null;
    isAdmin = userIdOrParams.isAdmin ?? false;
  }

  useEffect(() => {
    // If not admin and no userId, nothing to listen to
    if (!isAdmin && !userId) {
      setUnresolvedCount(0);
      return;
    }

    setLoading(true);
    const db = getFirestore();
    const ticketsRef = collection(db, 'Support_Tickets');
    
    // Admin listens to all, User listens to their own
    const q = isAdmin 
      ? query(ticketsRef) 
      : query(ticketsRef, where('uid', '==', userId));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
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
  }, [userId, isAdmin]);

  const updateTicketStatus = async (ticketId: string, newStatus: string) => {
    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const functions = getFunctions();
      const updateFn = httpsCallable<any, { status: string }>(functions, 'adminUpdateStatuses');
      await updateFn({
        updates: [{ collection: 'Support_Tickets', id: ticketId, status: newStatus }]
      });
    } catch (err: any) {
      console.error(`Failed to update ticket ${ticketId} status:`, err);
      throw err;
    }
  };

  return { unresolvedCount, updateTicketStatus, loading, error };
}
