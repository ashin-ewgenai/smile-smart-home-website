import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../../../../lib/firebase';
import { collection, doc, onSnapshot, query, updateDoc, serverTimestamp, getDoc, where, deleteDoc } from 'firebase/firestore';
import { supportTicketsCollection } from '../../../../models/Collections';
import { Search, Filter, MessageCircle, Loader2 } from 'lucide-react';
import { useDevices } from '../../../../contexts/DevicesContext';
import { KanbanBoard } from '../KanbanBoard';

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

const Reports: React.FC = () => {
  const { updateItemStatus } = useDevices();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [replyMap, setReplyMap] = useState<Record<string, string>>({});
  const [userCache, setUserCache] = useState<Record<string, { email?: string; displayName?: string; role?: string }>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');

  const columns = [
    { id: 'Pending', title: 'Pending', color: 'bg-yellow-400' },
    { id: 'In Progress', title: 'In Progress', color: 'bg-blue-400' },
    { id: 'Resolved', title: 'Resolved', color: 'bg-green-500' },
  ];

  // (useEffect for ticket polling and user polling remains same...)
  useEffect(() => {
    let unsub: undefined | (() => void);
    setLoading(true);
    try {
      const qRef = query(supportTicketsCollection(db));
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
            userUid: data.uid,
            imageUrl: data.imageUrl ?? null,
            adminReply: data.adminReply || '',
            adminRepliedAt: data.adminRepliedAt?.toDate ? data.adminRepliedAt.toDate() : (data.adminRepliedAt || null),
          };
        });
        setTickets(arr);
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

  useEffect(() => {
    const missingUids = Array.from(new Set(tickets
      .map(t => t.userUid || (t as any).uid)
      .filter(Boolean) as string[]
    )).filter(uid => !userCache[uid]);

    if (!missingUids.length) return;

    (async () => {
      const updates: Record<string, { email?: string; displayName?: string }> = {};
      for (const uid of missingUids) {
        try {
          const userDoc = await getDoc(doc(db, 'Accounts', uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            updates[uid] = {
              email: userData.Email || userData.email || '',
              displayName: userData.FullName || userData.fullName || userData.displayName || 'User',
            };
          } else {
            updates[uid] = { displayName: 'Unknown User' };
          }
        } catch (e) {
          console.error('Error fetching user data for UID:', uid, e);
          updates[uid] = { displayName: 'Error Loading' };
        }
      }
      if (Object.keys(updates).length > 0) {
        setUserCache(prev => ({ ...prev, ...updates }));
      }
    })();
  }, [tickets]);

  const visible = useMemo(() => {
    return [...tickets].filter(t => (
      (t.subject || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.category || '').toLowerCase().includes(searchTerm.toLowerCase())
    )).filter(t => filterCategory === 'all' || t.category === filterCategory);
  }, [tickets, searchTerm, filterCategory]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    await updateItemStatus('Support_Tickets', id, newStatus);
  };

  const deleteTicket = async (ticket: Ticket) => {
    try {
      const ok = window.confirm('Delete this support ticket? This cannot be undone.');
      if (!ok) return;
      await deleteDoc(doc(db, 'Support_Tickets', ticket.id));
    } catch (e) {
      console.error('Error deleting ticket:', e);
      setError('Failed to delete ticket.');
    }
  };

  const fmt = (v: any) => {
    try { return v ? new Date(v).toLocaleString() : ''; } catch { return ''; }
  };

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Reports</h1>
          <span className="text-sm text-gray-700 dark:text-gray-400 block mt-1">{visible.length} issues tracked</span>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search reports..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-md border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="text-sm px-3 py-2 rounded-md border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="all">All Categories</option>
              <option value="Hardware Issues">Hardware Issues</option>
              <option value="Software/App Troubleshooting">Software/App Troubleshooting</option>
              <option value="Installation Request">Installation Request</option>
              <option value="General Question">General Question</option>
              <option value="Account & Billing">Account & Billing</option>
              <option value="Urgent Technical Support">Urgent Technical Support</option>
              <option value="Feature Inquiry or Request">Feature Inquiry or Request</option>
              <option value="Security Concerns">Security Concerns</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-md border px-3 py-2 text-sm text-red-700 bg-red-50 border-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
        </div>
      ) : (
        <KanbanBoard<Ticket>
          items={visible}
          columns={columns}
          itemType="Support_Tickets"
          onStatusChange={handleStatusChange}
          onReorder={async (id, newIndex) => {
            await updateDoc(doc(db, 'Support_Tickets', id), { dragIndex: newIndex });
          }}
          onDeleteItem={deleteTicket}
          getCardId={(t) => t.id}
          getCardStatus={(t) => t.status}
          getCardTitle={(t) => t.subject}
          getCardSubtitle={(t) => userCache[t.userUid!]?.displayName || 'Unknown User'}
          getCardIndex={(t) => (t as any).dragIndex ?? 0}
          getCardDate={(t) => t.createdAt}
          renderCardDetails={(ticket) => (
            <div className="space-y-4">
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{ticket.description}</p>
              
              {ticket.imageUrl && (
                <div className="rounded-md overflow-hidden border border-gray-200 dark:border-gray-700">
                  <img
                    src={ticket.imageUrl}
                    alt="Ticket attachment"
                    className="w-full h-auto max-h-48 object-cover cursor-zoom-in"
                    onClick={() => window.open(ticket.imageUrl!, '_blank')}
                  />
                </div>
              )}

              {(ticket.adminReply || ticket.adminRepliedAt) && (
                <div className="p-3 rounded-md bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800">
                  <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
                    <span>Admin response</span>
                    {ticket.adminRepliedAt && <span>{fmt(ticket.adminRepliedAt)}</span>}
                  </div>
                  <p className="text-xs text-gray-700 dark:text-gray-300">{ticket.adminReply}</p>
                </div>
              )}
            </div>
          )}
        />
      )}
    </div>
  );
};

export default Reports;
