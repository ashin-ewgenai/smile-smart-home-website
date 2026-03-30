import React, { useEffect, useState } from 'react';
import { db } from '../../../lib/firebase';
import { collection, onSnapshot, updateDoc, deleteDoc, doc, orderBy, query } from 'firebase/firestore';
import { plannerLeadsCollection, plannerLeadDoc } from '../../../models/Collections';
import { useDevices } from '../../../contexts/DevicesContext';
import { Trash2, FilePlus, AlertTriangle, Search, GripVertical, X, ChevronDown } from 'lucide-react';

type FormData = {
  budget: string;
  deviceDetails: string;
  email: string;
  existingDevices: string;
  goals: string[];
  roomCount: string;
  spaceType: string;
  roomTitle?: string;
  source?: string;
};

type Lead = {
  id: string;
  email: string;
  complexity: string;
  formData: FormData;
  planText: string;
  recommendedAreas: string[];
  status?: string;
  updatedAt: { toDate: () => Date } | Date | string;
};

type ColumnId = 'new' | 'contacted' | 'quoted' | 'install';

const COLUMNS: { id: ColumnId; label: string; color: string; dot: string }[] = [
  { id: 'new',       label: 'New Leads',        color: 'border-t-blue-500',   dot: 'bg-blue-500' },
  { id: 'contacted', label: 'Contacted',         color: 'border-t-amber-500',  dot: 'bg-amber-500' },
  { id: 'quoted',    label: 'Quote Sent',         color: 'border-t-purple-500', dot: 'bg-purple-500' },
  { id: 'install',   label: 'Install Scheduled', color: 'border-t-teal-500',   dot: 'bg-teal-500' },
];

function getStatus(lead: Lead): ColumnId {
  const s = (lead.status || 'new').toLowerCase();
  if (s === 'contacted') return 'contacted';
  if (s === 'quoted' || s === 'quote sent') return 'quoted';
  if (s === 'install' || s === 'install scheduled') return 'install';
  return 'new';
}

function formatDate(v: any): string {
  try {
    const d = v?.toDate?.() ?? (v?.seconds ? new Date(v.seconds * 1000) : new Date(v));
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return '—'; }
}

const PlanLeads: React.FC = () => {
  const { filteredPlanLeads, searchQuery, setSearchQuery, isFloorplanItem, adminLoading: contextLoading } = useDevices();
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<ColumnId | null>(null);

  // Derived state mimicking original sorting
  const leads = [...(filteredPlanLeads as unknown as Lead[])].sort((a, b) => {
    const getTime = (v: any) => v?.toDate?.()?.getTime?.() ?? (v?.seconds ? v.seconds * 1000 : 0);
    return getTime(b.updatedAt) - getTime(a.updatedAt);
  });

  const byColumn = (col: ColumnId) => leads.filter(l => getStatus(l) === col);

  const moveCard = async (leadId: string, newStatus: ColumnId) => {
    try {
      await updateDoc(plannerLeadDoc(db, leadId), { status: newStatus });
    } catch { setError('Failed to update status.'); }
  };

  const handleDrop = (e: React.DragEvent, col: ColumnId) => {
    e.preventDefault();
    setDragOver(null);
    if (dragging) moveCard(dragging, col);
    setDragging(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDoc(plannerLeadDoc(db, deleteTarget));
      setDeleteTarget(null);
    } catch { setError('Failed to delete lead.'); }
  };

  return (
    <div className="p-6 min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <FilePlus className="h-6 w-6 text-teal-500" /> Plan Leads
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{leads.length} leads across {COLUMNS.length} stages</p>
        </div>
        <div className="relative max-w-xs w-full">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            id="plan-leads-search"
            type="text"
            placeholder="Search by email…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      </div>

      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</div>}
      {contextLoading && <div className="text-gray-400 text-sm py-12 text-center">Loading leads…</div>}

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
                className={`rounded-2xl border-t-4 ${col.color} bg-white dark:bg-gray-900 shadow-sm transition-all duration-150 ${isOver ? 'ring-2 ring-teal-400 shadow-teal-100' : ''}`}
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
                      Drop a lead here
                    </div>
                  )}
                  {cards.map(lead => {
                    const isFloorplan = isFloorplanItem(lead);
                    const isOpen = openId === lead.id;
                    return (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={() => setDragging(lead.id)}
                        onDragEnd={() => setDragging(null)}
                        className={`group bg-gray-50 dark:bg-gray-800/80 rounded-xl border border-gray-200 dark:border-gray-700 p-3 cursor-grab active:cursor-grabbing transition-all duration-150 ${dragging === lead.id ? 'opacity-40 scale-95' : 'hover:shadow-md hover:-translate-y-0.5'}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <GripVertical className="h-4 w-4 text-gray-300 dark:text-gray-600 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{lead.email}</p>
                              {isFloorplan && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 rounded-full font-semibold">Floorplan</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {lead.complexity && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded-full text-gray-600 dark:text-gray-300">{lead.complexity}</span>
                              )}
                              <span className="text-[10px] text-gray-400">{formatDate(lead.updatedAt)}</span>
                            </div>
                          </div>
                          <button
                            id={`delete-lead-${lead.id}`}
                            onClick={e => { e.stopPropagation(); setDeleteTarget(lead.id); }}
                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
                            aria-label="Delete lead"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* Expand toggle */}
                        <button
                          onClick={() => setOpenId(isOpen ? null : lead.id)}
                          className="mt-2 text-xs text-teal-600 dark:text-teal-400 flex items-center gap-1 hover:underline"
                        >
                          {isOpen ? 'Hide details' : 'View details'}
                          <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isOpen && (
                          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300 space-y-2">
                            {lead.formData?.spaceType && <div><span className="text-gray-400">Space: </span>{lead.formData.spaceType}</div>}
                            {lead.formData?.roomTitle && <div><span className="text-gray-400">Room: </span>{lead.formData.roomTitle}</div>}
                            {lead.formData?.budget && <div><span className="text-gray-400">Budget: </span>{lead.formData.budget}</div>}
                            {lead.formData?.roomCount && <div><span className="text-gray-400">Rooms: </span>{lead.formData.roomCount}</div>}
                            {lead.recommendedAreas?.length > 0 && (
                              <div><span className="text-gray-400">Areas: </span>{lead.recommendedAreas.join(', ')}</div>
                            )}
                            {lead.formData?.goals?.length > 0 && (
                              <div><span className="text-gray-400">Goals: </span>{lead.formData.goals.join(', ')}</div>
                            )}
                            {lead.planText && (
                              <div><span className="text-gray-400 block mb-0.5">Plan:</span>
                                <p className="line-clamp-3 text-gray-700 dark:text-gray-300">{lead.planText}</p>
                              </div>
                            )}
                            {/* Move buttons */}
                            <div className="pt-2 flex flex-wrap gap-1">
                              {COLUMNS.filter(c => c.id !== col.id).map(c => (
                                <button
                                  key={c.id}
                                  onClick={() => moveCard(lead.id, c.id)}
                                  className={`text-[10px] px-2 py-1 rounded-full border font-medium transition-colors hover:opacity-90 ${c.dot.replace('bg-', 'border-')} text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700`}
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
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Delete Lead?</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
              <button onClick={handleDelete} className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlanLeads;
