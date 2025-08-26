import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../../../../lib/firebase';
import { collectionGroup, doc, onSnapshot, orderBy, query, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
// Admin complaints table (Recharts removed per request)

type Ticket = {
  id: string;
  subject: string;
  category: string;
  description: string;
  status: 'Pending' | 'In Progress' | 'Resolved' | string;
  createdAt?: any;
  userUid?: string;
  imageUrl?: string | null;
  adminReply?: string;
};

// (Removed COLORS used by the pie chart)

const Reports: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [replyMap, setReplyMap] = useState<Record<string, string>>({});
  const [userCache, setUserCache] = useState<Record<string, { email?: string; displayName?: string; role?: string }>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Load data from Firestore with localStorage fallback
  useEffect(() => {
    let unsub: undefined | (() => void);
    setLoading(true);
    try {
      // Read all user tickets via collection group query over supportTickets/{uid}/ticket
      const qRef = query(collectionGroup(db, 'ticket'), orderBy('createdAt', 'desc'));
      unsub = onSnapshot(qRef, async (snap) => {
        const arr: Ticket[] = snap.docs.map((d) => {
          const data = d.data() as any;
          const parentUid = d.ref.parent.parent?.id; // supportTickets/{uid}/ticket/{ticketId}
          return {
            id: d.id,
            subject: data.subject || '',
            category: data.category || 'Other',
            description: data.description || '',
            status: data.status || 'Pending',
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt || null),
            userUid: parentUid,
            imageUrl: data.imageUrl ?? null,
            adminReply: data.adminReply || '',
          };
        });
        setTickets(arr);
        // seed reply inputs with existing replies
        const seed: Record<string, string> = {};
        arr.forEach(t => { if (t.adminReply) seed[t.id] = t.adminReply; });
        setReplyMap(seed);
        setLoading(false);
      }, (err) => {
        console.error(err);
        setError('Unable to load complaints.');
        setLoading(false);
      });
    } catch (e) {
      console.error(e);
      setError('Unable to connect to Firebase.');
      setLoading(false);
    }
    return () => { if (typeof unsub === 'function') unsub(); };
  }, []);

  // Light user enrichment: look up displayName/email/role for UIDs we haven't seen
  useEffect(() => {
    const missing = Array.from(new Set(tickets.map(t => t.userUid).filter(Boolean) as string[]))
      .filter(uid => !(uid in userCache));
    if (!missing.length) return;
    (async () => {
      const updates: Record<string, { email?: string; displayName?: string; role?: string }> = {};
      for (const uid of missing) {
        try {
          const snap = await getDoc(doc(db, 'users', uid));
          if (snap.exists()) {
            const d: any = snap.data();
            updates[uid] = { email: d.email, displayName: d.displayName || d.name, role: d.role };
          } else {
            updates[uid] = {};
          }
        } catch {
          updates[uid] = {};
        }
      }
      setUserCache(prev => ({ ...prev, ...updates }));
    })();
  }, [tickets]);

  const sorted = useMemo(() => {
    return [...tickets].sort((a, b) => (new Date(b.createdAt || 0).getTime()) - (new Date(a.createdAt || 0).getTime()));
  }, [tickets]);

  // Only include complaints where the author's role is 'user'
  const visible = useMemo(() => {
    return sorted.filter((t) => {
      const uid = t.userUid;
      if (!uid) return false;
      const u = userCache[uid];
      if (!u) return false; // wait until user doc is fetched
      return (u.role || 'user') === 'user';
    });
  }, [sorted, userCache]);

  // Group tickets by user email (or UID) for collapsible list
  const groups = useMemo(() => {
    const map = new Map<string, Ticket[]>();
    for (const t of visible) {
      const email = t.userUid ? (userCache[t.userUid]?.email || t.userUid) : 'unknown';
      const key = String(email);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries());
  }, [visible, userCache]);

  const toggle = (email: string) => setExpanded((e) => ({ ...e, [email]: !e[email] }));

  const fmt = (v: any) => {
    try { return v ? new Date(v).toLocaleString() : ''; } catch { return ''; }
  };

  const saveReply = async (t: Ticket) => {
    try {
      const reply = replyMap[t.id] || '';
      if (!t.userUid) throw new Error('Missing user UID on ticket.');
      await updateDoc(doc(db, 'supportTickets', t.userUid, 'ticket', t.id), {
        adminReply: reply,
        adminRepliedAt: serverTimestamp(),
        status: reply ? (t.status === 'Resolved' ? 'Resolved' : 'In Progress') : t.status,
      });
    } catch (e) {
      console.error(e);
      setError('Failed to save reply.');
    }
  };

  return (
    <section className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold text-white">Reports</h1>
        <span className="text-sm text-gray-400">{visible.length} complaints</span>
      </div>

      {error && (
        <div className="mb-3 rounded-md border px-3 py-2 text-sm text-red-700 bg-red-50 border-red-200 dark:text-yellow-300 dark:bg-yellow-900/20 dark:border-yellow-700/40">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 text-gray-300">Loading complaints…</div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 text-gray-300">No complaints found.</div>
      ) : (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 divide-y divide-gray-800">
          {groups.map(([email, list]) => (
            <div key={email} className="p-6 flex flex-col gap-3">
              <button
                type="button"
                className="text-left text-sm text-gray-400 hover:text-gray-200 flex items-center gap-2 focus:outline-none"
                aria-expanded={!!expanded[email]}
                aria-controls={`complaints-${email}`}
                onClick={() => toggle(email)}
              >
                <span className={`transition-transform duration-200 inline-block ${expanded[email] ? 'rotate-90' : 'rotate-0'}`} aria-hidden="true">▶</span>
                <span>{email}</span>
                <span className="ml-2 text-xs text-gray-500">({list.length})</span>
              </button>

              {expanded[email] && (
                <div id={`complaints-${email}`} className="mt-2 space-y-4">
                  {list.map((t) => (
                    <div key={t.id} className="rounded border border-gray-800 bg-gray-900/40 p-4">
                      <div className="flex items-center justify-between text-sm text-gray-400">
                        <span>{fmt(t.createdAt)}</span>
                        <span className={`px-2 py-0.5 rounded ${String(t.status).toLowerCase()==='resolved'?'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300':String(t.status).toLowerCase()==='in progress'?'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300':'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'}`}>{t.status}</span>
                      </div>
                      <div className="mt-2">
                        <p className="text-gray-200 font-medium">{t.subject} <span className="text-xs text-gray-400">• {t.category}</span></p>
                        <p className="text-sm text-gray-300 mt-1 whitespace-pre-wrap">{t.description}</p>
                        {t.imageUrl && (
                          <div className="mt-2"><img src={t.imageUrl} alt="attachment" className="h-24 w-24 object-cover rounded border border-gray-700" /></div>
                        )}
                      </div>
                      <div className="mt-3">
                        <label className="block text-xs text-gray-400 mb-1">Reply</label>
                        <textarea
                          value={replyMap[t.id] ?? ''}
                          onChange={(e) => setReplyMap((m) => ({ ...m, [t.id]: e.target.value }))}
                          rows={3}
                          placeholder="Type a reply to the customer…"
                          className="w-full px-3 py-2 rounded border border-gray-600 bg-gray-900 text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                        <div className="mt-2 flex justify-end">
                          <button onClick={() => saveReply(t)} className="px-4 py-1.5 rounded-none bg-teal-600 text-white hover:bg-teal-700">Submit reply</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default Reports;
