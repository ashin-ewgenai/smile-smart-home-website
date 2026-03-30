import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../../../../lib/firebase';
import { collection, doc, onSnapshot, query, updateDoc, serverTimestamp, getDoc, deleteDoc } from 'firebase/firestore';
import { supportTicketsCollection } from '../../../../models/Collections';
import { useDevices } from '../../../../contexts/DevicesContext';
import { useTicketNotifications } from '../../../../hooks/useTicketNotifications';
import { 
  Search, Ticket as TicketIcon, Filter, Calendar, GripVertical, Trash2, 
  ChevronDown, AlertTriangle, Send 
} from 'lucide-react';

type Ticket = {
  id: string;
  subject: string;
  category: string;
  description: string;
  status: string;
  createdAt?: any;
  userUid?: string;
  imageUrl?: string | null;
  adminReply?: string;
  adminRepliedAt?: any;
};

type ColumnId = 'Pending' | 'In Progress' | 'Resolved';

const COLUMNS: { id: ColumnId; label: string; topColor: string; dot: string }[] = [
  { id: 'Pending',     label: 'Pending',     topColor: 'border-t-red-500',    dot: 'bg-red-500' },
  { id: 'In Progress', label: 'In Progress', topColor: 'border-t-amber-500',  dot: 'bg-amber-500' },
  { id: 'Resolved',    label: 'Resolved',    topColor: 'border-t-teal-500',   dot: 'bg-teal-500' },
];

function normalizeStatus(s: string): ColumnId {
  const lower = (s || '').toLowerCase();
  if (lower === 'in progress' || lower === 'inprogress') return 'In Progress';
  if (lower === 'resolved') return 'Resolved';
  return 'Pending';
}

function formatDate(v: any): string {
  try {
    const d = v instanceof Date ? v : (v?.toDate?.() ?? (v?.seconds ? new Date(v.seconds * 1000) : new Date(v)));
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return '—'; }
}

const FALLBACK_IMG = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="80"><rect width="100%" height="100%" fill="%23e5e7eb"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%236b7280" font-family="Arial" font-size="14">No image</text></svg>';

const Reports: React.FC = () => {
  const { 
    filteredReports, searchQuery, setSearchQuery, 
    filterCriteria, setFilterCriteria,
    isFloorplanItem, adminLoading: contextLoading 
  } = useDevices();
  const { updateTicketStatus } = useTicketNotifications(null);

  const tickets = filteredReports as unknown as Ticket[];

  const [error, setError] = useState<string | null>(null);
  const [userCache, setUserCache] = useState<Record<string, { email?: string; displayName?: string }>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [replyMap, setReplyMap] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<Ticket | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<ColumnId | null>(null);
  const [sendingReply, setSendingReply] = useState<string | null>(null);

  // Still want to safely sync the dynamic reply map when new tickets drop in
  useEffect(() => {
    setReplyMap(prev => {
      const next = { ...prev };
      tickets.forEach(t => { if (next[t.id] === undefined) next[t.id] = ''; });
      return next;
    });
  }, [tickets]);

  // Fetch user info for new UIDs
  useEffect(() => {
    const missing = [...new Set(tickets.map(t => t.userUid).filter(Boolean) as string[])].filter(uid => !userCache[uid]);
    if (!missing.length) return;
    (async () => {
      const updates: typeof userCache = {};
      for (const uid of missing) {
        try {
          const snap = await getDoc(doc(db, 'Accounts', uid));
          if (snap.exists()) {
            const d = snap.data();
            updates[uid] = { email: d.Email || '', displayName: d.FullName || 'User' };
          } else { updates[uid] = {}; }
        } catch { updates[uid] = {}; }
      }
      setUserCache(prev => ({ ...prev, ...updates }));
    })();
  }, [tickets]);

  const byColumn = (col: ColumnId) => tickets.filter(t => normalizeStatus(t.status) === col);

  const moveCard = async (id: string, newStatus: ColumnId) => {
    try {
      await updateTicketStatus(id, newStatus);
    } catch { setError('Status update failed.'); }
  };

  const handleDrop = (e: React.DragEvent, col: ColumnId) => {
    e.preventDefault();
    setDragOver(null);
    if (dragging) moveCard(dragging, col);
    setDragging(null);
  };

  const sendReply = async (ticket: Ticket) => {
    const text = (replyMap[ticket.id] || '').trim();
    if (!text) return;
    setSendingReply(ticket.id);
    try {
      await updateDoc(doc(db, 'Support_Tickets', ticket.id), {
        adminReply: text,
        adminRepliedAt: serverTimestamp(),
        status: normalizeStatus(ticket.status) === 'Pending' ? 'In Progress' : ticket.status,
      });
      setReplyMap(prev => ({ ...prev, [ticket.id]: '' }));
    } catch { setError('Failed to send reply.'); }
    setSendingReply(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDoc(doc(db, 'Support_Tickets', deleteTarget.id));
      setDeleteTarget(null);
    } catch { setError('Delete failed.'); }
  };

  return (
    <div className="p-6 min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <TicketIcon className="h-6 w-6 text-teal-500" /> Support Tickets
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{tickets.length} tickets across {COLUMNS.length} stages</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {/* Search */}
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              id="reports-search"
              type="text"
              placeholder="Search tickets…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Date Filter */}
          <div className="flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-1.5 min-w-[140px]">
            <Calendar className="h-4 w-4 text-gray-400" />
            <select
              value={filterCriteria.dateRange}
              onChange={e => setFilterCriteria({ ...filterCriteria, dateRange: e.target.value })}
              className="bg-transparent text-sm text-gray-700 dark:text-gray-200 focus:outline-none w-full"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">Last 7 Days</option>
              <option value="month">This Month</option>
            </select>
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-1.5 min-w-[140px]">
            <Filter className="h-4 w-4 text-gray-400" />
            <select
              value={filterCriteria.itemType}
              onChange={e => setFilterCriteria({ ...filterCriteria, itemType: e.target.value })}
              className="bg-transparent text-sm text-gray-700 dark:text-gray-200 focus:outline-none w-full"
            >
              <option value="all">All Tickets</option>
              <option value="floorplan">Floorplan Related</option>
              <option value="standard">Standard Issues</option>
            </select>
          </div>
        </div>
      </div>

      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</div>}
      {contextLoading && <div className="text-gray-400 text-sm py-12 text-center">Loading tickets…</div>}

      {!contextLoading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLUMNS.map(col => {
                    const cards = byColumn(col.id);
                    const isOver = dragOver === col.id;
                    return (
                      <div
                        key={col.id}
                        onDragOver={e => { e.preventDefault(); setDragOver(col.id); }}
                        onDragLeave={() => setDragOver(null)}
                        onDrop={e => handleDrop(e, col.id)}
                        className={`rounded-2xl border-t-4 ${col.topColor} bg-white dark:bg-gray-900 shadow-sm transition-all duration-150 ${isOver ? 'ring-2 ring-teal-400' : ''}`}
                      >
                        {/* Column header */}
                        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
                            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{col.label}</span>
                          </div>
                          <span className="text-xs font-bold text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">{cards.length}</span>
                        </div>

                        <div className="p-3 space-y-3 min-h-[120px]">
                          {cards.length === 0 && (
                            <div className="text-center text-xs text-gray-400 dark:text-gray-600 py-8 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl">
                              Drop ticket here
                            </div>
                          )}
                          {cards.map(ticket => {
                            const user = ticket.userUid ? userCache[ticket.userUid] : null;
                            const isOpen = openId === ticket.id;
                            const isFloorplan = isFloorplanItem(ticket);
                            return (
                      <div
                        key={ticket.id}
                        draggable
                        onDragStart={() => setDragging(ticket.id)}
                        onDragEnd={() => setDragging(null)}
                        className={`group bg-gray-50 dark:bg-gray-800/80 rounded-xl border border-gray-200 dark:border-gray-700 p-3 cursor-grab active:cursor-grabbing transition-all duration-150 ${dragging === ticket.id ? 'opacity-40 scale-95' : 'hover:shadow-md hover:-translate-y-0.5'}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <GripVertical className="h-4 w-4 text-gray-300 dark:text-gray-600 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{ticket.subject || 'No subject'}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {ticket.category && <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded-full text-gray-600 dark:text-gray-300">{ticket.category}</span>}
                              {isFloorplan && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 rounded-full font-semibold">Floorplan</span>
                              )}
                              {user?.displayName && <span className="text-[10px] text-gray-500 truncate">{user.displayName}</span>}
                              <span className="text-[10px] text-gray-400">{formatDate(ticket.createdAt)}</span>
                            </div>
                          </div>
                          <button
                            id={`delete-ticket-${ticket.id}`}
                            onClick={e => { e.stopPropagation(); setDeleteTarget(ticket); }}
                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
                            aria-label="Delete ticket"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <button
                          onClick={() => setOpenId(isOpen ? null : ticket.id)}
                          className="mt-2 text-xs text-teal-600 dark:text-teal-400 flex items-center gap-1 hover:underline"
                        >
                          {isOpen ? 'Hide details' : 'View & reply'}
                          <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isOpen && (
                          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
                            {/* User info */}
                            {user && (
                              <div className="text-xs text-gray-500">
                                {user.displayName && <span className="block text-gray-700 dark:text-gray-300 font-medium">{user.displayName}</span>}
                                {user.email && <span>{user.email}</span>}
                              </div>
                            )}
                            {/* Description */}
                            <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-4">{ticket.description}</p>
                            {/* Image */}
                            {ticket.imageUrl && (
                              <img
                                src={ticket.imageUrl}
                                alt="Attachment"
                                className="w-full h-24 object-cover rounded-lg cursor-pointer hover:opacity-90"
                                onClick={() => window.open(ticket.imageUrl!, '_blank')}
                                onError={e => { (e.currentTarget as HTMLImageElement).src = FALLBACK_IMG; }}
                              />
                            )}
                            {/* Previous reply */}
                            {ticket.adminReply && (
                              <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg p-2 text-xs text-teal-800 dark:text-teal-300">
                                <span className="font-medium block mb-0.5">Admin reply:</span>
                                {ticket.adminReply}
                              </div>
                            )}
                            {/* Reply textarea */}
                            <div className="space-y-1.5">
                              <textarea
                                className="w-full text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y min-h-[56px]"
                                placeholder="Reply to user…"
                                value={replyMap[ticket.id] || ''}
                                onChange={e => setReplyMap(prev => ({ ...prev, [ticket.id]: e.target.value }))}
                              />
                              <button
                                onClick={() => sendReply(ticket)}
                                disabled={sendingReply === ticket.id}
                                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-xs font-medium transition-colors"
                              >
                                <Send className="h-3 w-3" />
                                {sendingReply === ticket.id ? 'Sending…' : 'Send Reply'}
                              </button>
                            </div>
                            {/* Move buttons */}
                            <div className="flex flex-wrap gap-1 pt-1">
                              {COLUMNS.filter(c => c.id !== col.id).map(c => (
                                <button
                                  key={c.id}
                                  onClick={() => moveCard(ticket.id, c.id)}
                                  className="text-[10px] px-2 py-1 rounded-full border border-gray-300 dark:border-gray-700 font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >
                                  → {c.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-3">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Delete Ticket?</h3>
            </div>
            <p className="text-sm text-gray-400 mb-1 truncate">{deleteTarget.subject}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
              <button onClick={confirmDelete} className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
