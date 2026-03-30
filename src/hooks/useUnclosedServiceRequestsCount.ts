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
    let q;
    
    if (userId === 'admin') {
      q = query(collection(db, 'Request_service'), where('status', '!=', 'closed'));
    } else {
      q = query(
        collection(db, 'Service_Requests', userId, 'Requests_List'),
        where('status', '!=', 'closed')
      );
    }

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

export function useAdminServiceRequestsStats() {
  const [stats, setStats] = useState({ 
    totalCount: 0, 
    unclosedCount: 0, 
    loading: true, 
    error: null as Error | null 
  });

  useEffect(() => {
    const db = getFirestore();
    const q = query(collection(db, 'Request_service'), where('status', '!=', 'closed'));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      setStats({
        totalCount: querySnapshot.size,
        unclosedCount: querySnapshot.size, // in this admin query, all are unclosed
        loading: false,
        error: null
      });
    }, (error) => {
      console.error('Error loading service requests stats:', error);
      setStats(prev => ({ ...prev, loading: false, error: error as Error }));
    });
    
    return () => unsubscribe();
  }, []);

  return stats;
}
