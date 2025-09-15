import React, { useEffect, useMemo, useState } from 'react';
import { auth, db } from '../../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';

export default function NotificationBell() {
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [unread, setUnread] = useState<number>(0);

  const hydrated = useMemo(() => typeof window !== 'undefined', []);

  useEffect(() => {
    if (!hydrated) return;
    const unsub = onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
    return () => unsub();
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (!uid) {
      setUnread(0);
      return;
    }

    const qRef = query(
      collection(db, 'notifications'),
      where('userId', '==', uid),
      where('status', '==', 'unread')
    );

    const unsub = onSnapshot(
      qRef,
      (snap) => setUnread(snap.size),
      (err) => {
        console.error('Failed to fetch unread count:', err);
        setUnread(0);
      }
    );

    return () => unsub();
  }, [uid, hydrated]);

  const navigate = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/user/notifications';
    }
  };

  return (
    <button
      type="button"
      onClick={navigate}
      className="relative inline-flex items-center justify-center p-2 rounded-full text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white transition"
      aria-label="Notifications"
    >
      <span className="text-xl">🔔</span>
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-semibold h-4 min-w-4 px-1 shadow">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );
}
