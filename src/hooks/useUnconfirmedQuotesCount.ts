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
      
      console.log('Quotes update:', {
        total: querySnapshot.docs.length,
        unconfirmed: unconfirmed.length,
        quotes: querySnapshot.docs.map(d => ({
          id: d.id,
          status: d.data().status,
          quoteType: d.data().quoteType
        }))
      });
      
      setUnconfirmedCount(unconfirmed.length);
    }, (error) => {
      console.error('Error listening to quotes updates:', error);
    });

    return () => unsubscribe();
  }, [userId]);

  return unconfirmedCount;
}
