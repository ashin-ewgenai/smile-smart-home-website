import React, { useEffect, useState } from 'react';
import DashboardLayout from '../DashboardLayout';
import { BrowserRouter, useInRouterContext } from 'react-router-dom';
import { db } from '../../../../lib/firebase';
import { collection, onSnapshot, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { useDevices } from '../../../../contexts/DevicesContext';
import { CircleUserRound, Search, GripVertical, Trash2, AlertTriangle, ChevronDown } from 'lucide-react';

type ContactRequest = {
  id: string;
  email: string;
  fullName?: string;
  phone?: string;
  message?: string;
  service?: string;
  status?: string;
  source?: string;
  createdAt?: any;
};

type ColumnId = 'new' | 'review' | 'replied' | 'closed';

const COLUMNS: { id: ColumnId; label: string; topColor: string; dot: string }[] = [
  { id: 'new',     label: 'New',       topColor: 'border-t-blue-500',   dot: 'bg-blue-500' },
  { id: 'review',  label: 'In Review', topColor: 'border-t-amber-500',  dot: 'bg-amber-500' },
  { id: 'replied', label: 'Replied',   topColor: 'border-t-purple-500', dot: 'bg-purple-500' },
  { id: 'closed',  label: 'Closed',    topColor: 'border-t-gray-400',   dot: 'bg-gray-400' },
];

function getStatus(r: ContactRequest): ColumnId {
  const s = (r.status || 'new').toLowerCase();
  if (s === 'review' || s === 'in review') return 'review';
  if (s === 'replied') return 'replied';
  if (s === 'closed') return 'closed';
  return 'new';
}

function formatDate(v: any): string {
  try {
    const d = v?.toDate?.() ?? (v?.seconds ? new Date(v.seconds * 1000) : new Date(v));
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return '—'; }
}

const AdminContactSubmissions: React.FC = () => {
  let userName = 'Admin';
  try { if (typeof window !== 'undefined') userName = localStorage.getItem('userName') || 'Admin'; } catch {}

  const { filteredContactSubmissions, searchQuery, setSearchQuery, isFloorplanItem, adminLoading: contextLoading } = useDevices();

  const [openId, setOpenId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<ColumnId | null>(null);

  // Derived state mimicking original sorting
  const requests = [...(filteredContactSubmissions as unknown as ContactRequest[])].sort((a, b) => {
    const ta = a.createdAt?.toMillis?.() ?? (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
    const tb = b.createdAt?.toMillis?.() ?? (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
    return tb - ta;
  });

  const byColumn = (col: ColumnId) => requests.filter(r => getStatus(r) === col);

  const moveCard = async (id: string, newStatus: ColumnId) => {
    try {
      await updateDoc(doc(db, 'contactRequests', id), { status: newStatus });
    } catch (e) { console.error(e); }
  };

  const handleDrop = (e: React.DragEvent, col: ColumnId) => {
    e.preventDefault();
    setDragOver(null);
    if (dragging) moveCard(dragging, col);
    setDragging(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDoc(doc(db, 'contactRequests', deleteTarget));
      setDeleteTarget(null);
    } catch { console.error('Delete failed'); }
  };

  const Content = (
    <section className="p-6 min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <CircleUserRound className="h-6 w-6 text-teal-500" /> Contact Submissions
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{requests.length} submissions across {COLUMNS.length} stages</p>
        </div>
        <div className="relative max-w-xs w-full">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            id="contact-submissions-search"
            type="text"
            placeholder="Search by email or service…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      </div>

      {contextLoading && <div className="text-gray-400 text-sm py-12 text-center">Loading submissions…</div>}

      {!contextLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
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

                {/* Cards */}
                <div className="p-3 space-y-3 min-h-[120px]">
                  {cards.length === 0 && (
                    <div className="text-center text-xs text-gray-400 dark:text-gray-600 py-8 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl">
                      Drop here
                    </div>
                  )}
                  {cards.map(req => {
                    const isFloorplan = isFloorplanItem(req);
                    const isOpen = openId === req.id;
                    return (
                      <div
                        key={req.id}
                        draggable
                        onDragStart={() => setDragging(req.id)}
                        onDragEnd={() => setDragging(null)}
                        className={`group bg-gray-50 dark:bg-gray-800/80 rounded-xl border border-gray-200 dark:border-gray-700 p-3 cursor-grab active:cursor-grabbing transition-all duration-150 ${dragging === req.id ? 'opacity-40 scale-95' : 'hover:shadow-md hover:-translate-y-0.5'}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <GripVertical className="h-4 w-4 text-gray-300 dark:text-gray-600 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{req.email || 'No email'}</p>
                              {isFloorplan && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 rounded-full font-semibold">Floorplan</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {req.service && <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded-full text-gray-600 dark:text-gray-300">{req.service}</span>}
                              <span className="text-[10px] text-gray-400">{formatDate(req.createdAt)}</span>
                            </div>
                          </div>
                          <button
                            id={`delete-contact-${req.id}`}
                            onClick={e => { e.stopPropagation(); setDeleteTarget(req.id); }}
                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
                            aria-label="Delete submission"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <button
                          onClick={() => setOpenId(isOpen ? null : req.id)}
                          className="mt-2 text-xs text-teal-600 dark:text-teal-400 flex items-center gap-1 hover:underline"
                        >
                          {isOpen ? 'Hide details' : 'View details'}
                          <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isOpen && (
                          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300 space-y-1.5">
                            {req.fullName && <div><span className="text-gray-400">Name: </span>{req.fullName}</div>}
                            {req.phone && <div><span className="text-gray-400">Phone: </span>{req.phone}</div>}
                            {req.service && <div><span className="text-gray-400">Service: </span>{req.service}</div>}
                            {req.message && (
                              <div><span className="text-gray-400 block mb-0.5">Message:</span>
                                <p className="line-clamp-4 text-gray-700 dark:text-gray-300">{req.message}</p>
                              </div>
                            )}
                            <div className="pt-2 flex flex-wrap gap-1">
                              {COLUMNS.filter(c => c.id !== col.id).map(c => (
                                <button
                                  key={c.id}
                                  onClick={() => moveCard(req.id, c.id)}
                                  className={`text-[10px] px-2 py-1 rounded-full border font-medium transition-colors text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700`}
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
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Delete Submission?</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
              <button onClick={handleDeleteConfirm} className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );

  const inRouter = useInRouterContext();
  if (inRouter) return Content;
  return (
    <BrowserRouter basename="/dashboard/admin">
      <DashboardLayout userType="admin" userName={userName}>{Content}</DashboardLayout>
    </BrowserRouter>
  );
};

export default AdminContactSubmissions;
