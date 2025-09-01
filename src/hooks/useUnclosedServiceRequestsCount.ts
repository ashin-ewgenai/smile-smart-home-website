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
      console.log('Service requests update:', {
        total: querySnapshot.docs.length,
        requests: querySnapshot.docs.map(d => ({
          id: d.id,
          status: d.data().status,
          title: d.data().title || 'Untitled Request'
        }))
      });
      
      setUnclosedCount(querySnapshot.docs.length);
    }, (error) => {
      console.error('Error listening to service requests:', error);
    });

    return () => unsubscribe();
  }, [userId]);

  return unclosedCount;
}
