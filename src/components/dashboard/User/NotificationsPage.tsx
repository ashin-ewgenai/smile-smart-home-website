import React, { useEffect, useMemo, useState } from 'react';
import { auth, db } from '../../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  onSnapshot,
  // orderBy, // removed to avoid composite index requirement
  query,
  where,
  doc,
  updateDoc,
  Timestamp,
  getDoc,
} from 'firebase/firestore';
import { estimationQuotesCollection, accountDoc } from '../../../models/Collections';

// Firestore Document Shape
// Collection: notifications
// Fields: id, userId, title, message, type (warranty | quote), status (read | unread), createdAt (timestamp)
export type NotificationItem = {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'warranty' | 'quote' | string;
  status: 'read' | 'unread';
  createdAt?: Timestamp | { seconds: number; nanoseconds: number } | null;
};

function formatRelative(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const sec = Math.floor(diffMs / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (sec < 60) return `${sec}s ago`;
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  if (day < 7) return `${day}d ago`;
  return date.toLocaleString();
}

function toDate(ts?: NotificationItem['createdAt']): Date | null {
  if (!ts) return null;
  // Firestore Timestamp
  if (typeof (ts as any)?.toDate === 'function') return (ts as any).toDate();
  // Plain object with seconds
  if (typeof (ts as any)?.seconds === 'number')
    return new Date((ts as any).seconds * 1000);
  return null;
}

export default function NotificationsPage() {
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [userEmail, setUserEmail] = useState<string | null>(auth.currentUser?.email ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [quoteItems, setQuoteItems] = useState<NotificationItem[]>([]);

  // Hydration guard for SSR
  const hydrated = useMemo(() => typeof window !== 'undefined', []);

  useEffect(() => {
    if (!hydrated) return;
    const unsub = onAuthStateChanged(auth, (u) => {
      const newUid = u?.uid ?? null;
      console.info('[Notifications] Auth state changed. uid =', newUid);
      setUid(newUid);
      setUserEmail(u?.email ?? null);
    });
    return () => unsub();
  }, [hydrated]);

  // Resolve user's email from Accounts/{uid} if not present on auth
  useEffect(() => {
    if (!hydrated) return;
    if (!uid) return;
    if (userEmail) return; // already known
    (async () => {
      try {
        const acc = await getDoc(accountDoc(db, uid));
        const email = (acc.exists() ? (acc.data() as any)?.Email : null) || null;
        if (email) {
          console.info('[Notifications] Resolved user email from Accounts:', email);
          setUserEmail(email);
        }
      } catch (e) {
        // ignore
      }
    })();
  }, [hydrated, uid, userEmail]);

  // Subscribe to notifications for the current user
  useEffect(() => {
    if (!hydrated) return;
    if (!uid) {
      setItems([]);
      setLoading(false);
      console.info('[Notifications] No user UID. Skipping Firestore subscription.');
      return;
    }

    setLoading(true);
    setError(null);

    const qRef = query(
      collection(db, 'notifications'),
      where('userId', '==', uid)
    );

    const unsub = onSnapshot(
      qRef,
      (snap) => {
        console.groupCollapsed('[Notifications] Snapshot received');
        console.debug('Query userId ==', uid);
        console.debug('Snapshot size:', snap.size);
        const rows: NotificationItem[] = [];
        snap.forEach((d) => {
          const data = d.data();
          console.debug('Doc:', d.id, data);
          rows.push({ id: d.id, ...(data as any) });
        });
        // Sort client-side by createdAt desc to avoid Firestore composite index requirements
        rows.sort((a, b) => {
          const da = toDate(a.createdAt)?.getTime() ?? 0;
          const dbt = toDate(b.createdAt)?.getTime() ?? 0;
          return dbt - da;
        });
        setItems(rows);
        setLoading(false);
        console.debug('Parsed rows (sorted):', rows);
        console.groupEnd();
      },
      (err) => {
        console.error('Failed to load notifications:', err);
        setError(err?.message || 'Failed to load notifications');
        setLoading(false);
      }
    );

    return () => unsub();
  }, [uid, hydrated]);

  // Subscribe to Estimation Quote docs for this user and transform them as quote notifications
  useEffect(() => {
    if (!hydrated) return;
    if (!uid && !userEmail) {
      setQuoteItems([]);
      return;
    }

    const unsubs: Array<() => void> = [];
    const dedupe = new Map<string, NotificationItem>();

    const handleSnap = (snap: any, label: string) => {
      snap.forEach((d: any) => {
        const data: any = d.data();
        const createdAt = data?.updatedAt || data?.createdAt || null;
        const baseId = d.id;
        const item: NotificationItem = {
          id: `estq_${baseId}`,
          userId: uid || data?.uid || 'unknown',
          title: 'Estimation received',
          message: data?.grandTotal
            ? `Your quote has been sent. Grand total: ${Number(data.grandTotal).toFixed(2)}`
            : 'Your quote has been sent.',
          type: 'quote',
          status: 'read',
          createdAt,
        };
        dedupe.set(baseId, item);
      });
      const rows = Array.from(dedupe.values()).sort((a, b) => {
        const da = toDate(a.createdAt)?.getTime() ?? 0;
        const dbt = toDate(b.createdAt)?.getTime() ?? 0;
        return dbt - da;
      });
      setQuoteItems(rows);
      console.info(`[Notifications] Estimation Quote (${label}) snapshot size:`, snap.size);
    };

    // Query by uid
    if (uid) {
      const qByUid = query(
        estimationQuotesCollection(db),
        where('uid', '==', uid),
        where('status', '==', 'Confirmed')
      );
      unsubs.push(onSnapshot(qByUid, (snap) => handleSnap(snap, 'uid'), (err) => {
        console.error('Failed to load estimation quotes by uid:', err);
      }));
    }

    // Query by customerEmail
    if (userEmail) {
      const qByEmail = query(
        estimationQuotesCollection(db),
        where('customerEmail', '==', userEmail),
        where('status', '==', 'Confirmed')
      );
      unsubs.push(onSnapshot(qByEmail, (snap) => handleSnap(snap, 'email'), (err) => {
        console.error('Failed to load estimation quotes by email:', err);
      }));
    }

    return () => {
      unsubs.forEach((fn) => {
        try { fn(); } catch {}
      });
    };
  }, [uid, userEmail, hydrated]);

  const markAsRead = async (id: string) => {
    try {
      // Skip for Estimation Quote-derived notifications
      if (id.startsWith('estq_')) return;
      await updateDoc(doc(db, 'notifications', id), { status: 'read' });
    } catch (e: any) {
      console.error('Failed to mark as read:', e);
    }
  };

  // Merge notifications (from 'notifications' collection) with quote-derived items
  const displayItems = React.useMemo(() => {
    const merged = [...items, ...quoteItems];
    merged.sort((a, b) => {
      const da = toDate(a.createdAt)?.getTime() ?? 0;
      const dbt = toDate(b.createdAt)?.getTime() ?? 0;
      return dbt - da;
    });
    return merged;
  }, [items, quoteItems]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      <header className="mb-4 sm:mb-6">
        <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-white">Notifications</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Stay updated on your quotes and warranties.</p>
      </header>

      {loading && (
        <div className="flex items-center justify-center py-10 text-gray-500 dark:text-gray-400">Loading...</div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {!loading && displayItems.length === 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 text-center text-gray-600 dark:text-gray-300">
          No notifications yet.
        </div>
      )}

      <ul className="space-y-3">
        {displayItems.map((n) => {
          const created = toDate(n.createdAt);
          const rel = created ? formatRelative(created) : '';
          const isUnread = String(n.status || 'unread') === 'unread';
          return (
            <li
              key={n.id}
              className={
                `rounded-xl border transition-colors cursor-pointer ` +
                (isUnread
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                  : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800')
              }
              onClick={() => markAsRead(n.id)}
            >
              <div className="p-4 sm:p-5 flex items-start gap-3">
                <div className={`mt-0.5 text-lg ${n.type === 'quote' ? 'text-teal-600' : 'text-indigo-600'}`}>🔔</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                      {n.title || (n.type === 'quote' ? 'Quote Update' : 'Notification')}
                    </h3>
                    {rel && <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{rel}</span>}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    {isUnread && (
                      <span className="inline-flex items-center rounded-full bg-blue-600 text-white px-2 py-0.5 text-[10px]">Unread</span>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
