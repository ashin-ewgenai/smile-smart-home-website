import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const unsub = onAuthStateChanged(auth, (u) => {
        setUser(u);
        setLoading(false);
      });
      return () => unsub();
    } catch {
      setLoading(false);
    }
  }, []);

  return { user, loading };
}
