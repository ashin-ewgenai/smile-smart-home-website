import React, { useEffect, useState } from 'react';
import { db } from '../../../lib/firebase';
import { getDocs, orderBy, query, deleteDoc } from 'firebase/firestore';
import { plannerLeadsCollection, plannerLeadDoc } from '../../../models/Collections';
import { Trash2, FilePlus, AlertTriangle } from 'lucide-react';
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
  formData: FormData;
  planText: string;
  recommendedAreas: string[];
  updatedAt: { toDate: () => Date } | Date | string;
};

const PlanLeads: React.FC = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [columnLeads, setColumnLeads] = useState<[Lead[], Lead[], Lead[]]>([[], [], []]);
  const [leadToDelete, setLeadToDelete] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    // Filter leads based on search term
    const filteredLeads = searchTerm 
      ? leads.filter(lead => 
          lead.email.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : leads;

    // Distribute filtered leads into 3 columns, maintaining their original order
    const newColumnLeads: [Lead[], Lead[], Lead[]] = [[], [], []];
    filteredLeads.forEach((lead, index) => {
      newColumnLeads[index % 3].push(lead);
    });
    setColumnLeads(newColumnLeads);
  }, [leads, searchTerm]);

  const handleLeadClick = (lead: Lead) => {
    setOpenId(openId === lead.id ? null : lead.id);
  };

  const handleDeleteClick = (leadId: string) => {
    setLeadToDelete(leadId);
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

  const handleDeleteCancel = () => {
    setLeadToDelete(null);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const q = query(plannerLeadsCollection(db), orderBy('updatedAt', 'desc'));
        const snap = await getDocs(q);
        if (cancelled) return;
        const list: Lead[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setLeads(list);
      } catch (e: any) {
        setError(e?.message || 'Failed to load plan leads');
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const renderPlan = (lead: Lead) => {
    const { formData } = lead;
    
    if (!formData) {
      return <div className="text-gray-400 text-sm italic">No plan details available</div>;
    }

    return (
      <div className="space-y-3">
        <div>
          <h4 className="font-medium text-gray-900 dark:text-white">Plan Details</h4>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            <span className="font-medium">Space Type:</span> {formData.spaceType || 'N/A'}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            <span className="font-medium">Rooms:</span> {formData.roomCount || 'N/A'}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            <span className="font-medium">Budget:</span> {formData.budget || 'N/A'}
          </p>
        </div>
        
        {formData.goals?.length > 0 && (
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white">Goals</h4>
            <ul className="list-disc pl-5 text-sm text-gray-600 dark:text-gray-300">
              {formData.goals.map((goal, i) => (
                <li key={i}>{goal}</li>
              ))}
            </ul>
          </div>
        )}

        {formData.existingDevices && (
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white">Existing Devices</h4>
            <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line">
              {formData.existingDevices}
            </p>
          </div>
        )}

        {formData.deviceDetails && (
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white">Device Details</h4>
            <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line">
              {formData.deviceDetails}
            </p>
          </div>
        )}

        {lead.planText && (
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white">Recommendations</h4>
            <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line">
              {lead.planText}
            </p>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <section className="p-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">Plan Leads</h1>
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 text-gray-300">Loading…</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="p-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">Plan Leads</h1>
        <div className="rounded-xl border border-red-800 bg-red-900/30 p-6 text-red-200">{error}</div>
      </section>
    );
  }

  return (
    <>
      <section className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Plan Leads</h1>
          <div className="w-full sm:w-auto sm:ml-auto">
            <div className="relative">
              <input
                type="text"
                placeholder="Search by email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:w-80 pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <svg
                className="absolute left-3 top-2.5 h-5 w-5 text-gray-400"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                  clipRule="evenodd"
                />
              </svg>
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  aria-label="Clear search"
                >
                  <svg
                    className="h-5 w-5"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
        {leads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-12 text-center">
          <FilePlus className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No plan leads yet</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Plan leads will appear here once users submit their smart home planning forms.
          </p>
        </div>
      ) : searchTerm && columnLeads.every(column => column.length === 0) ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No matching leads found</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            No plan leads match your search for "{searchTerm}"
          </p>
          <button
            onClick={() => setSearchTerm('')}
            className="mt-4 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {columnLeads.map((column, columnIndex) => (
            <div key={columnIndex} className="space-y-4">
              {column.map((lead) => (
                <div 
                  key={lead.id} 
                  onClick={() => handleLeadClick(lead)}
                  className={`group relative rounded-lg border p-4 transition-colors duration-200 shadow-sm
                    ${openId === lead.id 
                      ? 'bg-gray-50 border-blue-600/40 dark:bg-gray-950 dark:border-blue-600/50' 
                      : 'bg-white hover:bg-gray-50 border-gray-200 dark:bg-gray-950 dark:hover:bg-gray-900 dark:border-gray-900'}`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && handleLeadClick(lead)}
                  aria-expanded={openId === lead.id}
                  aria-controls={`lead-panel-${lead.id}`}
                >
                  <div className="absolute top-2 right-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(lead.id);
                      }}
                      className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-red-500 transition-colors"
                      title="Delete lead"
                      aria-label="Delete lead"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex flex-col gap-2 min-w-0 pr-6">
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {lead.email || 'Unknown Email'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-300 truncate mt-0.5">
                        {lead.complexity} Plan • {lead.formData?.spaceType || 'N/A'}
                      </p>
                      <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {lead.updatedAt 
                          ? new Date(
                              typeof lead.updatedAt === 'object' && 'toDate' in lead.updatedAt 
                                ? lead.updatedAt.toDate() 
                                : lead.updatedAt
                            ).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'numeric',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          : 'No date'}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                        {lead.formData?.goals?.join(', ') || 'No goals specified'}
                      </p>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                        {openId === lead.id ? 'Hide details' : 'View details'}
                      </span>
                    </div>
                  </div>
                  
                  {openId === lead.id && (
                    <div 
                      id={`lead-panel-${lead.id}`}
                      className="pt-3 mt-3 border-t border-gray-200 dark:border-gray-800"
                    >
                      <div className="text-sm text-gray-700 dark:text-gray-300 space-y-3">
                        {renderPlan(lead)}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      </section>
      
      <DeleteConfirmationModal
        isOpen={!!leadToDelete}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </>
  );
};

export default PlanLeads;
