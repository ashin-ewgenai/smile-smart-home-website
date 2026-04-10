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
  const { updateItemStatus, updateItemDragIndex, filteredReports, adminLoading } = useDevices();
  const [error, setError] = useState<string | null>(null);
  const [userCache, setUserCache] = useState<Record<string, { email?: string; displayName?: string; role?: string }>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');

  const columns = [
    { id: 'Pending', title: 'Pending', color: 'bg-yellow-400' },
    { id: 'In Progress', title: 'In Progress', color: 'bg-blue-400' },
    { id: 'Resolved', title: 'Resolved', color: 'bg-green-500' },
  ];

  // Sync search term to context if needed? Actually DevicesContext already has searchQuery.
  // But Reports has its own search input. Let's keep it local for now or sync it.

  useEffect(() => {
    const missingUids = Array.from(new Set(filteredReports
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
  }, [filteredReports]);

  const visible = useMemo(() => {
    return [...filteredReports].filter(t => (
      (t.subject || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.category || '').toLowerCase().includes(searchTerm.toLowerCase())
    )).filter(t => filterCategory === 'all' || t.category === filterCategory);
  }, [filteredReports, searchTerm, filterCategory]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    await updateItemStatus('Support_Tickets', id, newStatus);
  };

  const deleteTicket = async (ticket: any) => {
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

      {adminLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
        </div>
      ) : (
        <KanbanBoard<any>
          items={visible}
          columns={columns}
          itemType="Support_Tickets"
          onStatusChange={handleStatusChange}
          onReorder={(id, newIndex) => updateItemDragIndex('Support_Tickets', id, newIndex)}
          onDeleteItem={deleteTicket}
          getCardId={(t) => t.id}
          getCardStatus={(t) => t.status}
          getCardTitle={(t) => t.subject}
          getCardSubtitle={(t) => userCache[t.userUid!]?.displayName || 'Unknown User'}
          getCardIndex={(t) => (t as any).dragIndex ?? 0}
          getCardDate={(t) => t.createdAt}
          disableDrag={false}
          renderActions={(ticket) => {
            const status = ticket.status;
            if (status === 'Pending') {
              return (
                <button
                  onClick={(e) => { e.stopPropagation(); handleStatusChange(ticket.id, 'In Progress'); }}
                  className="px-2 py-0.5 rounded bg-blue-600 text-white text-[10px] hover:bg-blue-700 transition-colors"
                >
                  Acknowledge
                </button>
              );
            }
            if (status === 'In Progress') {
              return (
                <button
                  onClick={(e) => { e.stopPropagation(); handleStatusChange(ticket.id, 'Resolved'); }}
                  className="px-2 py-0.5 rounded bg-green-600 text-white text-[10px] hover:bg-green-700 transition-colors"
                >
                  Resolve
                </button>
              );
            }
            return null;
          }}
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
