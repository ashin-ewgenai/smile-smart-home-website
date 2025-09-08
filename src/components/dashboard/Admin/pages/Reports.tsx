import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../../../../lib/firebase';
import { collection, doc, onSnapshot, query, updateDoc, serverTimestamp, getDoc, where } from 'firebase/firestore';
import { supportTicketsCollection } from '../../../../models/Collections';
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
  adminRepliedAt?: any;
};

// (Removed COLORS used by the pie chart)

const Reports: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [replyMap, setReplyMap] = useState<Record<string, string>>({});
  const [userCache, setUserCache] = useState<Record<string, { email?: string; displayName?: string; role?: string }>>({});
  // Load only tickets with status In Progress from Firestore
  useEffect(() => {
    let unsub: undefined | (() => void);
    setLoading(true);
    try {
      // Read all user tickets from flat Support_Tickets collection
      // We'll filter for 'in progress' status in the client to catch all case variations
      const qRef = query(
        supportTicketsCollection(db)
      );
      unsub = onSnapshot(qRef, async (snap) => {
        const arr: Ticket[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            subject: data.subject || '',
            category: data.category || 'Other',
            description: data.description || '',
            status: data.status || 'Pending',
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt || null),
            userUid: data.uid, // uid field from flat collection
            imageUrl: data.imageUrl ?? null,
            adminReply: data.adminReply || '',
            adminRepliedAt: data.adminRepliedAt?.toDate ? data.adminRepliedAt.toDate() : (data.adminRepliedAt || null),
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

  // Fetch user details from Accounts collection using UID
  useEffect(() => {
    const missingUids = Array.from(new Set(tickets
      .map(t => t.userUid)
      .filter(Boolean) as string[]
    )).filter(uid => !userCache[uid]);

    if (!missingUids.length) return;

    (async () => {
      const updates: Record<string, { email?: string; displayName?: string }> = {};
      
      for (const uid of missingUids) {
        try {
          // Directly fetch user details from Accounts collection using UID
          const userDoc = await getDoc(doc(db, 'Accounts', uid));
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            updates[uid] = {
              email: userData.Email || '',
              displayName: userData.FullName || 'User',
            };
            // console.log('Fetched user data:', uid, updates[uid]);
          } else {
            // console.log('No user found for UID:', uid);
            updates[uid] = {};
          }
        } catch (e) {
          console.error('Error fetching user data for UID:', uid, e);
          updates[uid] = {};
        }
      }

      if (Object.keys(updates).length > 0) {
        setUserCache(prev => ({
          ...prev,
          ...updates
        }));
      }
    })();
  }, [tickets, userCache]);

  // Sort and filter tickets
  const visible = useMemo(() => {
    return [...tickets]
      .filter(t => t.status && t.status.toLowerCase() !== 'resolved')
      .sort((a, b) => {
        const dateA = a.createdAt?.getTime() || 0;
        const dateB = b.createdAt?.getTime() || 0;
        return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
      });
  }, [tickets, sortOrder]);

  // Group tickets by user details for collapsible list
  // Group tickets by user details for collapsible list
  const groups = useMemo(() => {
    const map = new Map<string, { displayName: string, tickets: Ticket[] }>();
    
    for (const t of visible) {
      if (!t.userUid) continue;
      const user = userCache[t.userUid] || {};
      const key = user.displayName || 'Unknown User';
      
      if (!map.has(key)) {
        map.set(key, {
          displayName: key,
          tickets: []
        });
      }
      
      map.get(key)!.tickets.push(t);
    }
    
    return Array.from(map.values());
  }, [visible, userCache]);

  const fmt = (v: any) => {
    try { return v ? new Date(v).toLocaleString() : ''; } catch { return ''; }
  };

  const updateTicketStatus = async (ticket: Ticket, newStatus: string) => {
    try {
      if (!ticket.userUid) throw new Error('Missing user UID on ticket.');
      
      await updateDoc(
        doc(db, 'Support_Tickets', ticket.id),
        {
          status: newStatus,
          updatedAt: serverTimestamp(),
        }
      );
    } catch (e) {
      console.error('Error updating ticket status:', e);
      setError('Failed to update ticket status.');
    }
  };

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Support Tickets</h1>
          <span className="text-sm text-gray-400">{visible.length} active tickets</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-300">Sort by:</span>
          <div className="inline-flex rounded-md shadow-sm" role="group">
            <button
              type="button"
              onClick={() => setSortOrder('newest')}
              className={`px-3 py-1.5 text-xs font-medium rounded-l-md ${
                sortOrder === 'newest'
                  ? 'bg-teal-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              } transition-colors`}
            >
              Newest First
            </button>
            <button
              type="button"
              onClick={() => setSortOrder('oldest')}
              className={`px-3 py-1.5 text-xs font-medium rounded-r-md ${
                sortOrder === 'oldest'
                  ? 'bg-teal-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              } transition-colors`}
            >
              Oldest First
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-md border px-3 py-2 text-sm text-red-700 bg-red-50 border-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 text-gray-300">Loading complaints…</div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 text-gray-300">No active tickets found.</div>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((ticket) => (
            <div key={ticket.id} className="group relative rounded-lg border border-gray-800 bg-gray-900/40 p-4 hover:bg-gray-900/60 transition-colors duration-200">
              {/* Header with user info and timestamp */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">
                      {userCache[ticket.userUid!]?.displayName || 'User'}
                    </span>
                  </div>
                  {userCache[ticket.userUid!]?.email && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">
                      {userCache[ticket.userUid!]?.email}
                    </p>
                  )}
                </div>
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  {fmt(ticket.createdAt)}
                </span>
              </div>

              {/* Ticket content */}
              <div className="space-y-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium text-white">{ticket.subject}</h4>
                    <span className="text-xs text-gray-400">• {ticket.category}</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-300 line-clamp-3" title={ticket.description}>
                    {ticket.description}
                  </p>
                </div>

                {/* Image preview */}
                {ticket.imageUrl && (
                  <div className="mt-2 rounded-md overflow-hidden border border-gray-800">
                    <img 
                      src={ticket.imageUrl} 
                      alt="Ticket attachment" 
                      className="w-full h-32 object-cover hover:scale-105 transition-transform duration-200 cursor-pointer"
                      onClick={() => ticket.imageUrl && window.open(ticket.imageUrl, '_blank')}
                    />
                  </div>
                )}

                {/* Admin reply section */}
                {(ticket.adminReply || ticket.adminRepliedAt) && (
                  <div className="mt-3 p-3 rounded-md bg-gray-900/50 border border-gray-800">
                    <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                      <span>Admin response</span>
                      {ticket.adminRepliedAt && (
                        <span>{fmt(ticket.adminRepliedAt)}</span>
                      )}
                    </div>
                    {ticket.adminReply && (
                      <p className="text-sm text-gray-200 mt-1 whitespace-pre-wrap">
                        {ticket.adminReply}
                      </p>
                    )}
                  </div>
                )}

                {/* Status update */}
                <div className="mt-3 pt-3 border-t border-gray-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-300">Update Status</span>
                    <select
                      value={ticket.status}
                      onChange={(e) => updateTicketStatus(ticket, e.target.value)}
                      className="text-xs px-3 py-1.5 rounded-md border border-gray-700 bg-gray-900 text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors"
                    >
                      <option value="Pending">Pending</option>
                      <option value="Resolved">Resolved</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Reports;
