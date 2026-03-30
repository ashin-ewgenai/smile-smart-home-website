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
    let q;
    if (userId === 'admin') {
      q = collection(db, 'quotes');
    } else {
      q = query(collection(db, 'quotes'), where('userUid', '==', userId));
    }

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

export function useAdminQuotesStats() {
  const [stats, setStats] = useState({ 
    totalCount: 0, 
    unconfirmedCount: 0, 
    loading: true, 
    error: null as Error | null 
  });

  useEffect(() => {
    const db = getFirestore();
    const unsubscribe = onSnapshot(collection(db, 'quotes'), (querySnapshot) => {
      let unconfirmedCount = 0;
      querySnapshot.forEach(doc => {
        const data = doc.data();
        const status = data.status?.toString().toLowerCase();
        if (status !== 'confirmed') unconfirmedCount++;
      });
      setStats({
        totalCount: querySnapshot.size,
        unconfirmedCount,
        loading: false,
        error: null
      });
    }, (error) => {
      console.error('Error loading quotes stats:', error);
      setStats(prev => ({ ...prev, loading: false, error: error as Error }));
    });
    return () => unsubscribe();
  }, []);

  return stats;
}
