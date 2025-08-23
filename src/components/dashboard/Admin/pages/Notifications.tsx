import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../../../../lib/firebase';
import { collection, query, orderBy, onSnapshot, updateDoc, doc, getDoc, getDocs, where } from 'firebase/firestore';
import { showToast } from '../../../../lib/toast';

type Priority = 'High' | 'Normal' | 'Low' | string;
type Status = 'new' | 'ack' | 'done' | string;

type ServiceRequest = {
  id?: string;
  createdAt?: Date | string | number;
  created_at?: Date | string | number;
  ts?: Date | string | number;
  preferredDate?: string;
  preferred_date?: string;
  preferredTime?: string;
  preferred_time?: string;
  priority?: Priority;
  status?: Status;
  userEmail?: string;
  email?: string;
  userName?: string;
  displayName?: string;
  service?: string;
  type?: string;
  device?: string;
  userId?: string;
  uid?: string;
  user?: string;
};

const fmt = (ts?: Date | string | number | null) => {
  try {
    if (!ts) return '';
    const d = ts instanceof Date ? ts : new Date(ts);
    return d.toLocaleString();
  } catch {
    return '';
  }
};

const Notifications: React.FC = () => {
  const [items, setItems] = useState<ServiceRequest[]>([]);
  const [loaded, setLoaded] = useState(false);

  // cache user lookups
  const userCache = useMemo(() => new Map<string, { displayName: string; email: string } | null>(), []);

  useEffect(() => {
    let unsub: undefined | (() => void);
    const localKeyCandidates = ['serviceRequests', 'smile-service-requests', 'service_requests'];

    const tryLocal = () => {
      for (const key of localKeyCandidates) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
              setItems(arr);
              showToast('Loaded local requests.', 'info');
              setLoaded(true);
              return;
            }
          }
        } catch {}
      }
      setItems([]);
      showToast('No requests found.', 'info');
      setLoaded(true);
    };

    const enrichWithUsers = async (list: ServiceRequest[]): Promise<ServiceRequest[]> => {
      try {
        const uniqueUids = Array.from(new Set(list.map((x) => x.userId || x.uid).filter(Boolean))) as string[];
        const fetches: Promise<void>[] = [];
        for (const uid of uniqueUids) {
          if (!userCache.has(uid)) {
            fetches.push((async () => {
              try {
                const snap = await getDoc(doc(db, 'users', uid));
                if (snap.exists()) {
                  const data: any = snap.data();
                  userCache.set(uid, { displayName: data.displayName || data.name || '', email: data.email || '' });
                } else {
                  userCache.set(uid, null);
                }
              } catch { userCache.set(uid, null); }
            })());
          }
        }
        // Lookup by email for records missing uid
        const emailsNeedingLookup = Array.from(new Set(list
          .filter((x) => !(x.userId || x.uid) && (x.userEmail || x.email))
          .map((x) => (x.userEmail || x.email))
          .filter(Boolean))) as string[];
        const emailCache = new Map<string, { displayName: string; email: string } | null>();
        for (const email of emailsNeedingLookup) {
          if (!emailCache.has(email)) {
            fetches.push((async () => {
              try {
                const q = query(collection(db, 'users'), where('email', '==', email));
                const snaps = await getDocs(q);
                const docSnap = snaps.docs[0];
                if (docSnap) {
                  const data: any = docSnap.data();
                  emailCache.set(email, { displayName: data.displayName || data.name || '', email: data.email || '' });
                } else {
                  emailCache.set(email, null);
                }
              } catch { emailCache.set(email, null); }
            })());
          }
        }
        if (fetches.length) await Promise.all(fetches);
        return list.map((x) => {
          const uid = (x.userId || x.uid) as string | undefined;
          const cached = uid ? userCache.get(uid) : null;
          const email = x.userEmail || x.email || '';
          const cachedByEmail = (!uid && email) ? emailCache.get(email) : null;
          return {
            ...x,
            userName: x.userName || x.displayName || (cached?.displayName || cachedByEmail?.displayName || ''),
            userEmail: x.userEmail || x.email || (cached?.email || cachedByEmail?.email || x.userEmail || x.email || ''),
          };
        });
      } catch {
        return list;
      }
    };

    (async () => {
      try {
        const q = query(collection(db, 'service_requests'), orderBy('createdAt', 'desc'));
        unsub = onSnapshot(q, async (snap) => {
          const raw = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
          const list = await enrichWithUsers(raw);
          setItems(list);
          setLoaded(true);
          // Cache for offline/Reports parity
          try { localStorage.setItem('service_requests', JSON.stringify(list)); } catch {}
        }, (err) => {
          console.warn('Firestore listener failed:', err);
          showToast('Realtime updates unavailable. Using local data.', 'warn');
          tryLocal();
        });
      } catch (e) {
        showToast('Using local data (no Firebase config).', 'warn');
        tryLocal();
      }
    })();

    return () => { if (typeof unsub === 'function') unsub(); };
  }, [db, userCache]);

  const summary = useMemo(() => {
    const newCount = items.filter((x) => (x.status || 'new') === 'new').length;
    return `${items.length} requests • ${newCount} new`;
  }, [items]);

  const handleUpdate = async (id: string, action: 'ack' | 'done') => {
    try {
      await updateDoc(doc(db, 'service_requests', id), { status: action === 'ack' ? 'ack' : 'done' });
      showToast(action === 'ack' ? 'Request acknowledged' : 'Request marked done', 'success');
    } catch {
      showToast('Update failed. Please retry.', 'error');
    }
  };

  return (
    <section className="p-6">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-2xl font-semibold text-white">Notifications</h1>
        <span className="text-sm text-gray-400">{loaded && items.length ? summary : ''}</span>
      </div>

      {!loaded ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 text-gray-300">Loading…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 text-gray-300">No requests yet.</div>
      ) : (
        <div className="rounded-xl border border-gray-800 bg-gray-900/30 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-800">
              <thead className="bg-gray-800/60">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">User</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Service</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Device</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Preferred</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Priority</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 text-gray-300">
                {items.map((item) => {
                  const id = item.id || '';
                  const createdAt = item.createdAt || item.created_at || item.ts || null;
                  const preferredDate = item.preferredDate || item.preferred_date || '';
                  const preferredTime = item.preferredTime || item.preferred_time || '';
                  const priority = (item.priority || 'Normal') as Priority;
                  const status = (item.status || 'new') as Status;
                  const email = item.userEmail || item.email || item.user || '';
                  const name = item.userName || item.displayName || '';
                  const user = name ? `${name} (${email || '—'})` : (email || 'Unknown');
                  const service = item.service || item.type || '-';
                  const device = item.device || '-';
                  return (
                    <tr key={id}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{fmt(createdAt)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{user}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{service}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{device}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{preferredDate} {preferredTime}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <span className={`px-2 py-0.5 rounded text-white ${String(priority).toLowerCase()==='high'?'bg-red-600':String(priority).toLowerCase()==='low'?'bg-gray-500':'bg-amber-600'}`}>{priority}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <span className={`px-2 py-0.5 rounded ${status==='done'?'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300':status==='ack'?'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300':'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'}`}>{status}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                        <button onClick={() => id && handleUpdate(id, 'ack')} className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 mr-2 hover:bg-gray-100 dark:hover:bg-gray-700">Acknowledge</button>
                        <button onClick={() => id && handleUpdate(id, 'done')} className="px-2 py-1 rounded bg-teal-600 text-white hover:bg-teal-700">Mark Done</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};

export default Notifications;
