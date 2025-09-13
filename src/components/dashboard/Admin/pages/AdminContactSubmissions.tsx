import React, { useEffect, useState } from 'react';
import DashboardLayout from '../DashboardLayout';
import { BrowserRouter, useInRouterContext } from 'react-router-dom';
import { db } from '../../../../lib/firebase';
import { collection, onSnapshot, getDocs, query, where, limit } from 'firebase/firestore';

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
          {/* Header */}
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between px-2 md:px-0">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Contact Submissions</h2>
              <a href="/dashboard/admin/users" className="text-teal-600 hover:underline">Back to Users</a>
            </div>
          </div>

          {/* Cards */}
          <div className="max-w-6xl mx-auto mt-4">
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 dark:bg-gray-900 dark:border-gray-700">
              <div className="space-y-4">
                {loading && <div className="text-gray-300">Loading...</div>}
                {!loading && contactRequests.length === 0 && (
                  <div className="text-gray-300">No contact requests.</div>
                )}
                {!loading && contactRequests.length > 0 && (
                  <div className="columns-1 md:columns-2 lg:columns-3 gap-4 [column-fill:_balance]">
                    {/* Masonry-style columns to avoid stretching siblings */}
                    {contactRequests.map((r: any) => {
                      const id = String(r.id);
                      const isOpen = openId === id;
                      const created = formatCreatedAt(r.createdAt);
                      const emailKey = (r.email || '').toLowerCase();
                      const plan = planByEmail[emailKey];
                      const isPlanLoading = !!planLoading[emailKey];
                      const isPlanOpen = !!planOpen[id];
                      return (
                        <div
                          key={id}
                          className="mb-4 break-inside-avoid bg-white rounded-lg border border-gray-200 overflow-hidden transition-all hover:border-teal-500/50 hover:bg-gray-50 dark:bg-gray-800/50 dark:border-gray-700"
                        >
                          <button
                            type="button"
                            className="w-full text-left p-4 flex justify-between items-center hover:bg-gray-50 transition-colors dark:hover:bg-gray-700/50"
                            aria-expanded={isOpen}
                            aria-controls={`contact-panel-${id}`}
                            onClick={() => {
                              toggleOpen(id);
                              ensurePlanForEmail(r.email);
                            }}
                          >
                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium truncate text-gray-900 dark:text-gray-200">{r.email || 'No Email'}</h3>
                              {created && (
                                <p className="text-xs text-gray-500 mt-1">
                                  {created.date} • {created.time}
                                </p>
                              )}
                            </div>
                            <span className={`transition-transform duration-200 text-gray-500 ${isOpen ? 'rotate-90' : 'rotate-0'}`}>
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                              </svg>
                            </span>
                          </button>
                          {isOpen && (
                            <div id={`contact-panel-${id}`} className="text-sm text-gray-700 p-4 bg-gray-50 dark:text-gray-300 dark:bg-gray-800/30">
                              <div className="space-y-3">
                                <div>
                                  <div className="text-gray-500">Full Name</div>
                                  <div className="text-gray-900 dark:text-gray-100">{r.fullName || '—'}</div>
                                </div>
                                <div>
                                  <div className="text-gray-500">Email</div>
                                  <div className="text-gray-900 dark:text-gray-100 break-all">{r.email || '—'}</div>
                                </div>
                                <div>
                                  <div className="text-gray-500">Phone</div>
                                  <div className="text-gray-900 dark:text-gray-100">{r.phone || '—'}</div>
                                </div>
                                <div>
                                  <div className="text-gray-500">Service</div>
                                  <div className="text-gray-900 dark:text-gray-100">{r.service || '—'}</div>
                                </div>
                                <div>
                                  <div className="text-gray-500">Message</div>
                                  <div className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{r.message || '—'}</div>
                                </div>
                                {created && (
                                  <div>
                                    <div className="text-gray-500">Created</div>
                                    <div className="text-gray-900 dark:text-gray-100">{created.full}</div>
                                  </div>
                                )}
                                {/* Plan Detail (optional) */}
                                {isPlanLoading && (
                                  <div className="text-gray-500">Loading plan detail…</div>
                                )}
                                {!isPlanLoading && plan && (
                                  <div>
                                    <button
                                      type="button"
                                      className="w-full text-left px-3 py-2 rounded-md bg-white/60 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-between"
                                      onClick={() => setPlanOpen((m) => ({ ...m, [id]: !m[id] }))}
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
                )}
              </div>
            </div>
          </div>
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
