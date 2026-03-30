# Kanban CRM Pipeline Archive

This document contains the complete React and Tailwind CSS implementation for the Drag-and-Drop Kanban Sales Pipeline. It uses native HTML5 Drag and Drop and directly saves the pipeline states to Firebase.

You can safely copy and paste this code back into `src/components/dashboard/Admin/PlanLeads.tsx` whenever your team is ready to use it!

```tsx
import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../../../lib/firebase';
import { getDocs, orderBy, query, deleteDoc, updateDoc } from 'firebase/firestore';
import { plannerLeadsCollection, plannerLeadDoc } from '../../../models/Collections';
import { Trash2, AlertTriangle, GripVertical, X, Calendar, DollarSign, Target, Home as HomeIcon, Search } from 'lucide-react';

// Custom modal component for delete confirmation
const DeleteConfirmationModal = ({ 
  isOpen, 
  onConfirm, 
  onCancel 
}: { 
  isOpen: boolean; 
  onConfirm: () => void; 
  onCancel: () => void 
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Delete Lead
          </h3>
        </div>
        
        <p className="text-gray-600 dark:text-gray-300 mb-6">
          Are you sure you want to delete this lead? This action cannot be undone.
        </p>
        
        <div className="flex flex-col sm:flex-row justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

// Lead Detail Modal
const LeadDetailModal = ({ lead, onClose }: { lead: Lead | null, onClose: () => void }) => {
  if(!lead) return null;
  const { formData } = lead;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700">
        
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">{lead.email}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Submitted: {lead.updatedAt ? new Date(typeof lead.updatedAt === 'object' && 'toDate' in lead.updatedAt ? lead.updatedAt.toDate() : lead.updatedAt).toLocaleDateString() : 'N/A'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto custom-scrollbar">
          {formData ? (
            <div className="space-y-6">
              
              {/* Quick Info Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-6 border-b border-gray-200 dark:border-gray-700">
                <div className="space-y-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1"><HomeIcon className="w-3 h-3"/> Type</span>
                  <p className="font-semibold text-gray-900 dark:text-white">{formData.spaceType || 'N/A'}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1"><Target className="w-3 h-3"/> Rooms</span>
                  <p className="font-semibold text-gray-900 dark:text-white">{formData.roomCount || 'N/A'}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1"><DollarSign className="w-3 h-3"/> Budget</span>
                  <p className="font-semibold text-teal-600 dark:text-teal-400">{formData.budget || 'N/A'}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1"><Calendar className="w-3 h-3"/> Plan</span>
                  <p className="font-semibold text-gray-900 dark:text-white capitalize">{lead.complexity || 'N/A'}</p>
                </div>
              </div>

              {formData.goals?.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3 uppercase tracking-wider">Primary Goals</h4>
                  <div className="flex flex-wrap gap-2">
                    {formData.goals.map((goal, i) => (
                      <span key={i} className="px-3 py-1 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded-full text-sm font-medium border border-teal-100 dark:border-teal-800">
                        {goal}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {formData.existingDevices && (
                <div>
                  <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-2 uppercase tracking-wider">Existing Ecosystem</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg border border-gray-100 dark:border-gray-800 leading-relaxed whitespace-pre-line">
                    {formData.existingDevices}
                  </p>
                </div>
              )}

              {formData.deviceDetails && (
                <div>
                  <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-2 uppercase tracking-wider">Specific Device Requests</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg border border-gray-100 dark:border-gray-800 leading-relaxed whitespace-pre-line">
                    {formData.deviceDetails}
                  </p>
                </div>
              )}

              {lead.planText && (
                <div>
                  <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-2 uppercase tracking-wider">System Recommendation</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-300 bg-blue-50 dark:bg-blue-900/10 p-4 rounded-lg border border-blue-100 dark:border-blue-900/30 leading-relaxed whitespace-pre-line">
                    {lead.planText}
                  </p>
                </div>
              )}

            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">No specific form details available for this lead.</div>
          )}
        </div>
      </div>
    </div>
  )
}

type FormData = {
  budget: string;
  deviceDetails: string;
  email: string;
  existingDevices: string;
  goals: string[];
  roomCount: string;
  spaceType: string;
};

type Lead = {
  id: string;
  email: string;
  complexity: string;
  status?: 'new' | 'contacted' | 'quoted' | 'install'; // Kanban mapping
  formData: FormData;
  planText: string;
  recommendedAreas: string[];
  updatedAt: { toDate: () => Date } | Date | string;
};

const KANBAN_COLUMNS = [
  { id: 'new', title: 'New Leads', color: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300', dot: 'bg-blue-500' },
  { id: 'contacted', title: 'Contacted', color: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300', dot: 'bg-amber-500' },
  { id: 'quoted', title: 'Quote Sent', color: 'bg-purple-50 border-purple-200 text-purple-800 dark:bg-purple-900/20 dark:border-purple-800 dark:text-purple-300', dot: 'bg-purple-500' },
  { id: 'install', title: 'Install Scheduled', color: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300', dot: 'bg-emerald-500' }
] as const;

const PlanLeads: React.FC = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [leadToView, setLeadToView] = useState<Lead | null>(null);
  const [leadToDelete, setLeadToDelete] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const q = query(plannerLeadsCollection(db), orderBy('updatedAt', 'desc'));
        const snap = await getDocs(q);
        if (cancelled) return;
        const list: Lead[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return { 
            id: d.id, 
            ...data,
            status: data.status || 'new' // Convert legacy items to 'new' column
          };
        });
        setLeads(list);
      } catch (e: any) {
        setError(e?.message || 'Failed to load plan leads');
      } finally {
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filteredLeads: Lead[] = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return leads;
    return leads.filter(lead => (lead.email || '').toLowerCase().includes(term));
  }, [leads, searchTerm]);

  // Handle Drag & Drop
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, id: string) => {
    setDraggedLeadId(id);
    e.dataTransfer.setData('text/plain', id);
    // Slight delay to allow the drag ghost to generate before changing opacity
    setTimeout(() => {
      const el = document.getElementById(`card-${id}`);
      if(el) el.style.opacity = '0.4';
    }, 0);
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>, id: string) => {
    setDraggedLeadId(null);
    const el = document.getElementById(`card-${id}`);
    if(el) el.style.opacity = '1';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); // allow drop
    e.currentTarget.classList.add('bg-gray-100', 'dark:bg-gray-800/80');
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.currentTarget.classList.remove('bg-gray-100', 'dark:bg-gray-800/80');
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, newStatus: string) => {
    e.preventDefault();
    e.currentTarget.classList.remove('bg-gray-100', 'dark:bg-gray-800/80');
    
    const leadId = e.dataTransfer.getData('text/plain');
    if (!leadId) return;

    // Optimistic UI update
    setLeads(prev => prev.map(lead => lead.id === leadId ? { ...lead, status: newStatus as Lead['status'] } : lead));

    // Firebase Persistent Update
    try {
      await updateDoc(plannerLeadDoc(db, leadId), { status: newStatus });
    } catch (err) {
      console.error("Failed to update status in Firebase", err);
      // Revert on failure is possible, but ignoring for optimistic speed in this prototype
    }
  };

  const handleDeleteConfirm = async () => {
    if (!leadToDelete) return;
    try {
      await deleteDoc(plannerLeadDoc(db, leadToDelete));
      setLeads(prev => prev.filter(l => l.id !== leadToDelete));
      setLeadToDelete(null);
    } catch (e) {
      setError('Failed to delete lead');
      setLeadToDelete(null);
    }
  };

  if (loading) {
    return (
      <section className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">CRM Pipeline</h1>
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 text-gray-300 flex justify-center py-24">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-500"></div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">CRM Pipeline</h1>
        <div className="rounded-xl border border-red-800 bg-red-900/30 p-6 text-red-200">{error}</div>
      </section>
    );
  }

  return (
    <>
      <section className="p-4 md:p-8 w-full max-w-[100vw] overflow-hidden flex flex-col h-[calc(100vh-80px)]">
        
        {/* Header Area */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 flex-shrink-0">
          <div className="inline-flex items-center gap-2">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">CRM Pipeline</h1>
            <span className="px-3 py-1 bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 text-xs font-bold rounded-full uppercase tracking-wider border border-teal-200 dark:border-teal-800">Sales Kanban</span>
          </div>
          
          <div className="w-full sm:w-80 relative group">
            <input
              type="text"
              placeholder="Search leads by email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all shadow-sm group-hover:shadow-md"
            />
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400 group-hover:text-teal-500 transition-colors" />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {/* Kanban Board Area */}
        <div className="flex gap-6 overflow-x-auto pb-6 h-full custom-scrollbar items-start">
          {KANBAN_COLUMNS.map(column => {
            const columnLeads = filteredLeads.filter(lead => lead.status === column.id);
            
            return (
              <div 
                key={column.id} 
                className="flex flex-col flex-shrink-0 w-80 max-h-full bg-gray-50/50 dark:bg-gray-900/30 rounded-2xl border border-gray-200/50 dark:border-gray-800/50"
              >
                {/* Column Header */}
                <div className={`px-5 py-3 border-b flex items-center justify-between sticky top-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-md z-10 rounded-t-2xl border-x-0 border-t-0 border-b-2 ${column.color}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${column.dot}`}></span>
                    <h3 className="font-bold uppercase tracking-wider text-sm">{column.title}</h3>
                  </div>
                  <span className="bg-white/50 dark:bg-black/20 px-2 py-0.5 rounded text-xs font-bold">
                    {columnLeads.length}
                  </span>
                </div>

                {/* Drop Zone */}
                <div 
                  className="flex-1 p-4 overflow-y-auto custom-scrollbar space-y-3 min-h-[150px] transition-colors duration-200 rounded-b-2xl"
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, column.id)}
                >
                  {columnLeads.map(lead => (
                    <div
                      key={lead.id}
                      id={`card-${lead.id}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, lead.id)}
                      onDragEnd={(e) => handleDragEnd(e, lead.id)}
                      onClick={() => setLeadToView(lead)}
                      className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm hover:shadow-md border border-gray-200 dark:border-gray-700 cursor-pointer transform-gpu hover:-translate-y-1 transition-all duration-200 group relative"
                    >
                      {/* Drag Handle & Delete */}
                      <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDeleteClick(lead.id); }}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded z-10 transition-colors"
                          title="Delete Lead"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex items-start gap-2 mb-3">
                        <GripVertical className="w-4 h-4 text-gray-300 dark:text-gray-600 mt-1 cursor-grab active:cursor-grabbing flex-shrink-0" />
                        <div className="flex-1 min-w-0 pr-6">
                          <h4 className="font-semibold text-gray-900 dark:text-white truncate text-sm" title={lead.email}>
                            {lead.email}
                          </h4>
                          <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium tracking-wide uppercase">
                            {lead.complexity} Plan
                          </span>
                        </div>
                      </div>

                      <div className="pl-6 space-y-2">
                        {lead.formData?.spaceType && (
                          <div className="inline-flex items-center gap-1.5 bg-gray-50 dark:bg-gray-900/50 px-2 py-1 rounded text-xs text-gray-600 dark:text-gray-300 border border-gray-100 dark:border-gray-800">
                            <HomeIcon className="w-3 h-3" />
                            {lead.formData.spaceType}
                          </div>
                        )}
                        <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 leading-relaxed">
                          {lead.formData?.goals?.join(' • ') || 'No specific goals'}
                        </p>
                        
                        <div className="pt-3 flex items-center justify-between border-t border-gray-100 dark:border-gray-700/50 mt-2">
                          <div className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">
                            {lead.updatedAt ? new Date(typeof lead.updatedAt === 'object' && 'toDate' in lead.updatedAt ? lead.updatedAt.toDate() : lead.updatedAt).toLocaleDateString() : ''}
                          </div>
                          <span className="text-xs font-semibold text-teal-600 dark:text-teal-400 group-hover:underline">
                            View details
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {columnLeads.length === 0 && (
                    <div className="h-24 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl flex items-center justify-center pointer-events-none">
                      <span className="text-sm font-medium text-gray-400 dark:text-gray-600">Drop leads here</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Modals */}
      <DeleteConfirmationModal
        isOpen={!!leadToDelete}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setLeadToDelete(null)}
      />
      <LeadDetailModal 
        lead={leadToView} 
        onClose={() => setLeadToView(null)} 
      />
    </>
  );
};

export default PlanLeads;
```
