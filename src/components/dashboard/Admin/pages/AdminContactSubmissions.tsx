import React, { useState } from 'react';
import { db } from '../../../../lib/firebase';
import { deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { CircleUserRound, Loader2 } from 'lucide-react';
import { useDevices } from '../../../../contexts/DevicesContext';
import { KanbanBoard } from '../KanbanBoard';

const AdminContactSubmissions: React.FC = () => {
  const { filteredContactSubmissions, updateItemStatus, adminLoading, searchQuery, setSearchQuery } = useDevices();
  const [error, setError] = useState<string | null>(null);

  const columns = [
    { id: 'new', title: 'New', color: 'bg-yellow-400' },
    { id: 'in_review', title: 'In Review', color: 'bg-blue-400' },
    { id: 'follow_up', title: 'Follow Up', color: 'bg-purple-500' },
    { id: 'resolved', title: 'Resolved', color: 'bg-green-500' },
  ];

  const handleDelete = async (request: any) => {
    try {
      const ok = window.confirm('Delete this contact submission? This cannot be undone.');
      if (!ok) return;
      await deleteDoc(doc(db, 'contactRequests', request.id));
    } catch (e) {
      console.error('Error deleting contact submission:', e);
      setError('Failed to delete submission');
    }
  };

  const renderDetails = (request: any) => {
    return (
      <div className="space-y-3 pt-2">
        <div className="grid grid-cols-1 gap-y-2 text-[11px] text-gray-700 dark:text-gray-300">
          <div className="flex flex-col">
            <span className="text-gray-500 dark:text-gray-500 font-medium uppercase tracking-tighter text-[9px]">Full Name</span>
            <span className="text-gray-900 dark:text-gray-100 font-medium">{request.fullName || '—'}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-gray-500 dark:text-gray-500 font-medium uppercase tracking-tighter text-[9px]">Phone</span>
            <span className="text-gray-900 dark:text-gray-100">{request.phone || '—'}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-gray-500 dark:text-gray-500 font-medium uppercase tracking-tighter text-[9px]">Service Requested</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 border border-teal-100 dark:border-teal-900/30 w-fit">
              {request.service || 'General Inquiry'}
            </span>
          </div>
          <div className="flex flex-col mt-1">
            <span className="text-gray-500 dark:text-gray-500 font-medium uppercase tracking-tighter text-[9px] mb-1">Message</span>
            <div className="p-2 bg-gray-50 dark:bg-gray-800/50 rounded border border-gray-100 dark:border-gray-800 italic leading-relaxed">
              "{request.message || 'No message provided'}"
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white inline-flex items-center gap-2">
            Contact Submissions
            <CircleUserRound className="h-5 w-5 text-teal-600" />
          </h2>
          <div className="mt-1 text-sm text-gray-700 dark:text-gray-400">{filteredContactSubmissions.length} active submissions</div>
        </div>
        
        <div className="relative w-full sm:w-64">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-4 w-4 text-gray-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search submissions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg shadow-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 sm:text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:placeholder-gray-400 transition-all"
          />
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
          items={filteredContactSubmissions}
          columns={columns}
          itemType="contactRequests"
          onStatusChange={(id, newStatus) => updateItemStatus('contactRequests', id, newStatus)}
          onReorder={async (id, newIndex) => {
            await updateDoc(doc(db, 'contactRequests', id), { dragIndex: newIndex });
          }}
          onDeleteItem={handleDelete}
          getCardId={(r) => r.id}
          getCardStatus={(r) => r.status || 'new'}
          getCardTitle={(r) => r.fullName || 'Anonymous'}
          getCardSubtitle={(r) => r.email || 'No Email'}
          getCardIndex={(r) => r.dragIndex ?? 0}
          getCardDate={(r) => r.createdAt}
          renderCardDetails={renderDetails}
        />
      )}
    </section>
  );
};

export default AdminContactSubmissions;
