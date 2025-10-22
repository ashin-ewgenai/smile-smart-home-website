import React, { useEffect, useState } from 'react';
import DashboardLayout from '../DashboardLayout';
import { BrowserRouter, useInRouterContext } from 'react-router-dom';
import { db } from '../../../../lib/firebase';
import { collection, onSnapshot, getDocs, query, where, limit, deleteDoc, doc } from 'firebase/firestore';
import { CircleUserRound } from 'lucide-react';

const AdminContactSubmissions: React.FC = () => {
  // Read from localStorage only on client
  let userName = 'Admin';
  try {
    if (typeof window !== 'undefined') {
      userName = localStorage.getItem('userName') || 'Admin';
    }
  } catch {}

  // Local state for independent rendering of contact submissions
  const [contactRequests, setContactRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  // Accordion: track only one open card id
  const [openId, setOpenId] = useState<string | null>(null);
  // Cache of planner leads by email to avoid refetching
  const [planByEmail, setPlanByEmail] = useState<Record<string, any>>({});
  const [planLoading, setPlanLoading] = useState<Record<string, boolean>>({});
  const [planOpen, setPlanOpen] = useState<Record<string, boolean>>({});
  // 3-column distribution to mirror PlanLeads grid structure
  const [columnRequests, setColumnRequests] = useState<[any[], any[], any[]]>([[], [], []]);
  // Search functionality
  const [searchTerm, setSearchTerm] = useState<string>('');
  // Confirmation modal state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const ref = collection(db, 'contactRequests');
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // Sort newest first using createdAt if present
        rows.sort((a: any, b: any) => {
          const ta = a?.createdAt?.toMillis?.() ?? (a?.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
          const tb = b?.createdAt?.toMillis?.() ?? (b?.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
          return tb - ta;
        });
        setContactRequests(rows);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsubscribe();
  }, []);

  // Distribute requests into 3 columns to avoid uneven stretching, same as PlanLeads
  useEffect(() => {
    const filteredRequests = contactRequests.filter((request) => {
      const term = searchTerm.toLowerCase();
      return (
        (request.email || '').toLowerCase().includes(term) ||
        (request.fullName || '').toLowerCase().includes(term) ||
        (request.phone || '').toLowerCase().includes(term)
      );
    });
    const cols: [any[], any[], any[]] = [[], [], []];
    filteredRequests.forEach((r, i) => cols[i % 3].push(r));
    setColumnRequests(cols);
  }, [contactRequests, searchTerm]);

  const toggleOpen = (id: string) => setOpenId((cur) => (cur === id ? null : id));

  // Fetch a planner lead for a given email (if exists) and cache it
  const ensurePlanForEmail = async (email?: string | null) => {
    const key = (email || '').trim().toLowerCase();
    if (!key) return;
    if (planByEmail[key] || planLoading[key]) return;
    setPlanLoading((s) => ({ ...s, [key]: true }));
    try {
      const plannerRef = collection(db, 'Planner_Leads');
      const q = query(plannerRef, where('email', '==', key), limit(1));
      const snap = await getDocs(q);
      const doc = snap.docs[0];
      if (doc) {
        setPlanByEmail((m) => ({ ...m, [key]: { id: doc.id, ...doc.data() } }));
      } else {
        setPlanByEmail((m) => ({ ...m, [key]: null }));
      }
    } catch {
      // swallow – this section is optional
      setPlanByEmail((m) => ({ ...m, [key]: null }));
    } finally {
      setPlanLoading((s) => ({ ...s, [key]: false }));
    }
  };

  const handleDelete = (id: string) => {
    setDeleteTargetId(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (deleteTargetId) {
      try {
        await deleteDoc(doc(db, 'contactRequests', deleteTargetId));
        setIsDeleteModalOpen(false);
        setDeleteTargetId(null);
      } catch (error) {
        console.error('Error deleting contact submission:', error);
        alert('Failed to delete the submission. Please try again.');
        setIsDeleteModalOpen(false);
        setDeleteTargetId(null);
      }
    }
  };

  const cancelDelete = () => {
    setIsDeleteModalOpen(false);
    setDeleteTargetId(null);
  };

  const formatCreatedAt = (v: any) => {
    try {
      const d = v?.toDate?.() || (v?.seconds ? new Date(v.seconds * 1000) : null);
      if (!d) return null;
      return {
        date: d.toLocaleDateString(),
        time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        full: d.toLocaleString(),
      };
    } catch {
      return null;
    }
  };

  const Content = (
    <section className="p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center px-2 md:px-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white inline-flex items-center gap-2">
            Contact Submissions
            <CircleUserRound className="h-4 w-4" aria-hidden="true" />
          </h2>
        </div>
        {/* Search Input */}
        <div className="mt-4 px-2 md:px-0">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search by name, email, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-white dark:placeholder-gray-400 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-all duration-200"
            />
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="max-w-6xl mx-auto mt-4">
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 dark:bg-gray-900 dark:border-gray-700">
          {loading ? (
            <div className="text-gray-400">Loading…</div>
          ) : contactRequests.length === 0 ? (
            <div className="text-gray-400">No contact requests.</div>
          ) : (
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {columnRequests.map((column, columnIndex) => (
                <div key={columnIndex} className="space-y-4">
                  {column.map((r: any) => {
                    const id = String(r.id);
                    const isOpen = openId === id;
                    const created = formatCreatedAt(r.createdAt);
                    const createdStr = created
                      ? `${created.date}, ${created.time}`
                      : 'No date';
                    const emailKey = (r.email || '').toLowerCase();
                    const plan = planByEmail[emailKey];
                    const isPlanLoading = !!planLoading[emailKey];
                    const isPlanOpen = !!planOpen[id];
                    return (
                      <div
                        key={id}
                        onClick={() => {
                          toggleOpen(id);
                          ensurePlanForEmail(r.email);
                        }}
                        className={`group relative rounded-lg border p-4 transition-colors duration-200 shadow-sm
                          ${isOpen
                            ? 'bg-gray-50 border-blue-600/40 dark:bg-gray-950 dark:border-blue-600/50'
                            : 'bg-white hover:bg-gray-50 border-gray-200 dark:bg-gray-950 dark:hover:bg-gray-900 dark:border-gray-900'}`}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && (toggleOpen(id), ensurePlanForEmail(r.email))}
                        aria-expanded={isOpen}
                        aria-controls={`contact-panel-${id}`}
                      >
                        <div className="relative flex flex-col gap-2 mb-3 min-w-0">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                {r.email || 'No Email'}
                              </span>
                            </div>
                            <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              {createdStr}
                            </span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(id);
                            }}
                            className="absolute top-0 right-0 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 transition-colors"
                            aria-label="Delete contact submission"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                              {isOpen ? 'Hide details' : 'View details'}
                            </span>
                          </div>
                        </div>

                        {isOpen && (
                          <div
                            id={`contact-panel-${id}`}
                            className="pt-3 mt-3 border-t border-gray-200 dark:border-gray-800"
                          >
                            <div className="text-sm text-gray-700 dark:text-gray-300 space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                                <div>
                                  <div className="text-gray-500">Full Name</div>
                                  <div className="text-gray-900 dark:text-gray-100">{r.fullName || '—'}</div>
                                </div>
                                <div>
                                  <div className="text-gray-500">Phone</div>
                                  <div className="text-gray-900 dark:text-gray-100">{r.phone || '—'}</div>
                                </div>
                                <div className="sm:col-span-2">
                                  <div className="text-gray-500">Email</div>
                                  <div className="text-gray-900 dark:text-gray-100 break-all">{r.email || '—'}</div>
                                </div>
                                <div>
                                  <div className="text-gray-500">Service</div>
                                  <div className="text-gray-900 dark:text-gray-100">{r.service || '—'}</div>
                                </div>
                                {created && (
                                  <div>
                                    <div className="text-gray-500">Created</div>
                                    <div className="text-gray-900 dark:text-gray-100">{created.full}</div>
                                  </div>
                                )}
                              </div>
                              <div>
                                <div className="text-gray-500">Message</div>
                                <div className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{r.message || '—'}</div>
                              </div>

                              {/* Plan Detail (optional) */}
                              {isPlanLoading && (
                                <div className="text-gray-500">Loading plan detail…</div>
                              )}
                              {!isPlanLoading && plan && (
                                <div>
                                  <button
                                    type="button"
                                    className="w-full text-left px-3 py-2 rounded-md bg-white/60 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-between"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPlanOpen((m) => ({ ...m, [id]: !m[id] }));
                                    }}
                                    aria-expanded={isPlanOpen}
                                  >
                                    <span className="text-gray-700 dark:text-gray-200 font-medium">Plan Detail</span>
                                    <span className={`transition-transform duration-200 text-gray-500 ${isPlanOpen ? 'rotate-90' : 'rotate-0'}`}>
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"/></svg>
                                    </span>
                                  </button>
                                  {isPlanOpen && (
                                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-gray-900 dark:text-gray-100">
                                      {Object.entries(plan)
                                        .filter(([k]) => !['id','updatedAt','formData','recommendedAreas'].includes(k))
                                        .map(([k, v]) => {
                                          const label = k.replace(/[_-]+/g, ' ');
                                          if (k === 'planText') {
                                            return (
                                              <div key={k} className="flex flex-col sm:col-span-2">
                                                <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
                                                <span className="break-words whitespace-pre-wrap">{String(v)}</span>
                                              </div>
                                            );
                                          }
                                          return (
                                            <div key={k} className="flex flex-col">
                                              <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
                                              <span className="break-words">{String(v)}</span>
                                            </div>
                                          );
                                        })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-sm mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Confirm Deletion
            </h3>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-6">
              Are you sure you want to delete this contact submission? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelDelete}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );

  const inRouter = useInRouterContext();
  if (inRouter) {
    // Already inside AdminApp's BrowserRouter and DashboardLayout
    return Content;
  }
  // Standalone usage
  return (
    <BrowserRouter basename="/dashboard/admin">
      <DashboardLayout userType="admin" userName={userName}>{Content}</DashboardLayout>
    </BrowserRouter>
  );
};

export default AdminContactSubmissions;
