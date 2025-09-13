import React, { useEffect, useState } from 'react';
import { db } from '../../../lib/firebase';
import { getDocs, orderBy, query } from 'firebase/firestore';
import { plannerLeadsCollection } from '../../../models/Collections';

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

  useEffect(() => {
    // Distribute leads into 3 columns, maintaining their original order
    const newColumnLeads: [Lead[], Lead[], Lead[]] = [[], [], []];
    leads.forEach((lead, index) => {
      newColumnLeads[index % 3].push(lead);
    });
    setColumnLeads(newColumnLeads);
  }, [leads]);

  const handleLeadClick = (lead: Lead) => {
    setOpenId(openId === lead.id ? null : lead.id);
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

  const renderPlan = (lead: Lead) => {
    const { formData } = lead;
    
    if (!formData) {
      return <div className="text-gray-400 text-sm italic">No plan details available</div>;
    }

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-sm text-gray-700 dark:text-gray-300">
          <div>Complexity: <span className="text-gray-900 dark:text-white">{lead.complexity}</span></div>
          <div>Space: <span className="text-gray-900 dark:text-white">{formData.spaceType}</span></div>
          <div>Rooms: <span className="text-gray-900 dark:text-white">{formData.roomCount}</span></div>
          <div>Budget: <span className="text-gray-900 dark:text-white">{formData.budget}</span></div>
        </div>
        
        {formData.goals?.length > 0 && (
          <div>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <span className="font-medium">Goals: </span>
              {formData.goals.join(', ')}
            </p>
          </div>
        )}
        
        {lead.planText && (
          <div className="mt-2">
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">
              {lead.planText}
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Plan Leads</h1>
          <span className="text-sm text-gray-700 dark:text-gray-400">{leads.length} total leads</span>
        </div>
      </div>
      
      {leads.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-800 p-8 text-center">
          <p className="text-gray-400">No plan leads found</p>
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
                  <div className="flex flex-col gap-2 mb-3 min-w-0">
                    <div className="min-w-0">
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
    </div>
  );
};

export default PlanLeads;
