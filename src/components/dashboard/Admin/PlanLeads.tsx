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
  formData: any;
  planText: string;
  recommendedAreas: string[];
  updatedAt: { toDate: () => Date } | Date | string;
  status: string;
  source?: 'ai_consultant' | 'floorplan' | 'smart_home_planner';
};

const PlanLeads: React.FC = () => {
  const { filteredPlanLeads, updateItemStatus, updateItemDragIndex, adminLoading } = useDevices();
  const [error, setError] = useState<string | null>(null);

  const columns = [
    { id: 'new', title: 'New', color: 'bg-yellow-400' },
    { id: 'contacted', title: 'Contacted', color: 'bg-blue-400' },
    { id: 'qualified', title: 'Qualified', color: 'bg-purple-500' },
    { id: 'accepted', title: 'Accepted', color: 'bg-emerald-500' },
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
    const formData = lead.formData;
    if (!formData && !lead.planText) return <div className="text-gray-400 text-xs italic">No plan details available</div>;

    return (
      <div className="space-y-3">
        {formData && (
          <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-600 dark:text-gray-400">
            <div className="bg-gray-50 dark:bg-gray-800/50 p-1.5 rounded">
              CPX: <span className="text-gray-900 dark:text-white font-medium">{lead.complexity || 'Standard'}</span>
            </div>
            {formData.spaceType && (
              <div className="bg-gray-50 dark:bg-gray-800/50 p-1.5 rounded">
                Space: <span className="text-gray-900 dark:text-white font-medium">{formData.spaceType}</span>
              </div>
            )}
            {formData.roomCount && (
              <div className="bg-gray-50 dark:bg-gray-800/50 p-1.5 rounded">
                Rooms: <span className="text-gray-900 dark:text-white font-medium">{formData.roomCount}</span>
              </div>
            )}
            {formData.budget && (
              <div className="bg-gray-50 dark:bg-gray-800/50 p-1.5 rounded">
                Budget: <span className="text-gray-900 dark:text-white font-medium">₹{formData.budget}</span>
              </div>
            )}
          </div>
        )}
        
        {formData?.goals?.length > 0 && (
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

        {lead.imageUrl && (
          <div className="mt-2 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
            <img src={lead.imageUrl} alt="Room Photo" className="w-full h-auto object-cover max-h-48" />
          </div>
        )}
      </div>
    );
  };

  const renderSourceBadge = (lead: Lead) => {
    const source = lead.source || 'smart_home_planner';
    const configs = {
      ai_consultant: { icon: '🤖', label: 'AI Consultant', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' },
      floorplan: { icon: '🎨', label: 'Floorplan', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
      smart_home_planner: { icon: '📑', label: 'Home Planner', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' }
    };

    const config = configs[source as keyof typeof configs] || configs.smart_home_planner;

    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${config.color}`}>
        <span className="mr-1">{config.icon}</span>
        {config.label}
      </span>
    );
  };

  const renderActions = (lead: Lead) => {
    const status = (lead.status || 'new').toLowerCase();
    
    if (status === 'new') {
      return (
        <button
          onClick={(e) => { e.stopPropagation(); updateItemStatus('Planner_Leads', lead.id, 'contacted'); }}
          className="px-2 py-0.5 rounded bg-teal-600 text-white text-[10px] hover:bg-teal-700 transition-colors"
        >
          Acknowledge Lead
        </button>
      );
    }
    
    if (status === 'contacted') {
      return (
        <button
          onClick={(e) => { e.stopPropagation(); updateItemStatus('Planner_Leads', lead.id, 'qualified'); }}
          className="px-2 py-0.5 rounded bg-indigo-600 text-white text-[10px] hover:bg-indigo-700 transition-colors"
        >
          Qualify
        </button>
      );
    }

    if (status === 'qualified') {
      return (
        <div className="flex gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); updateItemStatus('Planner_Leads', lead.id, 'accepted'); }}
            className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] hover:bg-emerald-700 transition-colors"
          >
            Accept Requirement
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); updateItemStatus('Planner_Leads', lead.id, 'closed'); }}
            className="px-2 py-0.5 rounded bg-gray-600 text-white text-[10px] hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      );
    }

    return null;
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
          disableDrag={false}
          onStatusChange={(id, newStatus) => updateItemStatus('Planner_Leads', id, newStatus)}
          onReorder={(id, newIndex) => updateItemDragIndex('Planner_Leads', id, newIndex)}
          onDeleteItem={handleDelete}
          getCardId={(l) => l.id}
          getCardStatus={(l) => l.status || 'new'}
          getCardTitle={(l) => l.email || 'Anonymous'}
          getCardSubtitle={(l) => `${l.complexity || 'Standard'} Plan`}
          getCardIndex={(l) => l.dragIndex ?? 0}
          getCardDate={(l) => l.updatedAt || l.createdAt}
          renderCardDetails={renderPlan}
          renderSourceBadge={renderSourceBadge}
          renderActions={renderActions}
        />
      )}
    </div>
  );
};

export default PlanLeads;
