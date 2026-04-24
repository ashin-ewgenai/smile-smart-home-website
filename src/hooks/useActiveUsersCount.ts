import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, getFirestore } from 'firebase/firestore';

export function useActiveUsersCount() {
  const [stats, setStats] = useState({ 
    activeUsers: 0, 
    totalUsers: 0, 
    loading: true, 
    error: null as Error | null 
  });

  useEffect(() => {
    const db = getFirestore();
    const q = query(collection(db, 'Accounts'), where('Role', '==', 'user'));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      try {
        let activeUsers = 0;
        querySnapshot.forEach(doc => {
          const data = doc.data();
          if (data.Status === 'online') {
            activeUsers++;
          }
        });
        setStats({
          totalUsers: querySnapshot.size,
          activeUsers,
          loading: false,
          error: null
        });
      } catch (err) {
        console.error('Error processing user snapshot:', err);
        setStats(prev => ({ ...prev, loading: false, error: err as Error }));
      }
    }, (error) => {
      console.error('Snapshot listener failed:', error);
      // Don't reset counts on temporary errors, just report the error
      setStats(prev => ({ ...prev, loading: false, error: error as Error }));
    });
    
    return () => unsubscribe();
  }, []);

  return stats;
}
