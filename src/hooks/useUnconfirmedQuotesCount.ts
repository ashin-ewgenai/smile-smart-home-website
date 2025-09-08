import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, getFirestore } from 'firebase/firestore';

export function useUnconfirmedQuotesCount(userId: string | null) {
  const [unconfirmedCount, setUnconfirmedCount] = useState(0);

  useEffect(() => {
    if (!userId) {
      setUnconfirmedCount(0);
      return;
    }

    const db = getFirestore();
    const q = query(
      collection(db, 'quotes'),
      where('userUid', '==', userId)
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const unconfirmed = querySnapshot.docs.filter(doc => {
        const data = doc.data();
        const status = data.status?.toString().toLowerCase();
        return status !== 'confirmed';
      });
      
      setUnconfirmedCount(unconfirmed.length);
    }, (error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error listening to quotes updates:', error);
      }
    });

    return () => unsubscribe();
  }, [userId]);

  return unconfirmedCount;
}
