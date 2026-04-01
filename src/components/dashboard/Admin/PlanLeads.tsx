import React, { useState } from 'react';
import { db } from '../../../lib/firebase';
import { deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { plannerLeadDoc } from '../../../models/Collections';
import { FilePlus, Loader2 } from 'lucide-react';
import { useDevices } from '../../../contexts/DevicesContext';
import { KanbanBoard } from './KanbanBoard';

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
  status: string;
};

const PlanLeads: React.FC = () => {
  const { filteredPlanLeads, updateItemStatus, adminLoading } = useDevices();
  const [error, setError] = useState<string | null>(null);

  const columns = [
    { id: 'new', title: 'New', color: 'bg-yellow-400' },
    { id: 'contacted', title: 'Contacted', color: 'bg-blue-400' },
    { id: 'qualified', title: 'Qualified', color: 'bg-purple-500' },
    { id: 'closed', title: 'Closed', color: 'bg-gray-500' },
  ];

  const handleDelete = async (lead: Lead) => {
    try {
      const ok = window.confirm('Delete this lead? This cannot be undone.');
      if (!ok) return;
      await deleteDoc(plannerLeadDoc(db, lead.id));
    } catch (e) {
      console.error('Error deleting lead:', e);
      setError('Failed to delete lead');
    }
  };

  const renderPlan = (lead: any) => {
    const formData = lead.formData as FormData | undefined;
    if (!formData) return <div className="text-gray-400 text-xs italic">No plan details available</div>;

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-600 dark:text-gray-400">
          <div className="bg-gray-50 dark:bg-gray-800/50 p-1.5 rounded">
            CPX: <span className="text-gray-900 dark:text-white font-medium">{lead.complexity}</span>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800/50 p-1.5 rounded">
            Space: <span className="text-gray-900 dark:text-white font-medium">{formData.spaceType}</span>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800/50 p-1.5 rounded">
            Rooms: <span className="text-gray-900 dark:text-white font-medium">{formData.roomCount}</span>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800/50 p-1.5 rounded">
            Budget: <span className="text-gray-900 dark:text-white font-medium">{formData.budget}</span>
          </div>
        </div>
        
        {formData.goals?.length > 0 && (
          <div className="p-2 bg-teal-50/50 dark:bg-teal-900/10 rounded border border-teal-100/50 dark:border-teal-900/20">
            <h5 className="text-[10px] font-semibold text-teal-700 dark:text-teal-400 mb-1 uppercase tracking-wider">Goals</h5>
            <p className="text-[10px] text-gray-700 dark:text-gray-300">
              {formData.goals.join(', ')}
            </p>
          </div>
        )}
        
        {lead.planText && (
          <div className="mt-2 text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed border-t border-gray-100 dark:border-gray-800 pt-2">
            <p className="whitespace-pre-line">{lead.planText}</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white inline-flex items-center gap-2">
            Plan Leads
            <FilePlus className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </h1>
          <div className="mt-1 text-sm text-gray-700 dark:text-gray-400">{filteredPlanLeads.length} total leads</div>
        </div>
      </div>
      
      {error && (
        <div className="mb-4 p-3 rounded-lg border border-red-800 bg-red-900/30 text-red-200 text-sm">
          {error}
        </div>
      )}

      {adminLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
        </div>
      ) : (
        <KanbanBoard<any>
          items={filteredPlanLeads}
          columns={columns}
          itemType="Planner_Leads"
          onStatusChange={(id, newStatus) => updateItemStatus('Planner_Leads', id, newStatus)}
          onReorder={async (id, newIndex) => {
            await updateDoc(doc(db, 'Planner_Leads', id), { dragIndex: newIndex });
          }}
          onDeleteItem={handleDelete}
          getCardId={(l) => l.id}
          getCardStatus={(l) => l.status || 'new'}
          getCardTitle={(l) => l.email || 'Anonymous'}
          getCardSubtitle={(l) => `${l.complexity || 'Standard'} Plan`}
          getCardIndex={(l) => l.dragIndex ?? 0}
          getCardDate={(l) => l.updatedAt || l.createdAt}
          renderCardDetails={renderPlan}
        />
      )}
    </div>
  );
};

export default PlanLeads;
