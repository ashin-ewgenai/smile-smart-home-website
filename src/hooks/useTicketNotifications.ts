import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, getFirestore } from 'firebase/firestore';

export function useTicketNotifications(userId: string | null) {
  const [unresolvedCount, setUnresolvedCount] = useState(0);

  useEffect(() => {
    if (!userId) {
      setUnresolvedCount(0);
      return;
    }

    const db = getFirestore();
    // Listen to all tickets for this user
    const q = query(
      collection(db, 'Support_Tickets'),
      where('uid', '==', userId)
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      // Manually filter out resolved tickets on the client side
      const unresolved = querySnapshot.docs.filter(doc => {
        const data = doc.data();
        const status = data.status?.toString().toLowerCase();
        return status !== 'resolved' && status !== 'closed';
      });
      
      setUnresolvedCount(unresolved.length);
    }, (error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error listening to ticket updates:', error);
      }
    });

    // Clean up the listener when the component unmounts
    return () => unsubscribe();
  }, [userId]);

  return unresolvedCount;
}
