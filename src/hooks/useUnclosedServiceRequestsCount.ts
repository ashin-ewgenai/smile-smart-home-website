import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, getFirestore } from 'firebase/firestore';

export function useUnclosedServiceRequestsCount(userId: string | null) {
  const [unclosedCount, setUnclosedCount] = useState(0);

  useEffect(() => {
    if (!userId) {
      setUnclosedCount(0);
      return;
    }

    const db = getFirestore();
    const q = query(
      collection(db, 'Service_Requests', userId, 'Requests_List'),
      where('status', '!=', 'closed')
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      setUnclosedCount(querySnapshot.docs.length);
    }, (error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error listening to service requests:', error);
      }
    });

    return () => unsubscribe();
  }, [userId]);

  return unclosedCount;
}
