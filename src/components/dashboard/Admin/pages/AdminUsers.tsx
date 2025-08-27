import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { auth, db } from '../../../../lib/firebase';
import { accountsCollection, quotesCollection, supportTicketsCollection, userServiceRequestsCollection, quotesParentDoc, userServiceRequestsParentDoc, supportTicketsParentDoc, registerUserWithProfile, type Account } from '../../../../models/Collections';
import { getDoc, getDocs, limit, query, where } from 'firebase/firestore';

interface User { name: string; email: string }

type AlertsCount = {
  uid: string | null;
  // unresolved counts (used by button label)
  quotes: number;
  services: number;
  tickets: number;
  total: number;
  // details for modal
  quotesResolved?: number;
  quotesTotal?: number;
  servicesResolved?: number;
  servicesTotal?: number;
  ticketsResolved?: number;
  ticketsTotal?: number;
  loading?: boolean;
  error?: string | null;
};

// No local storage: we load users from Firebase Accounts

const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);

  // alerts map keyed by email (lowercased)
  const [alertsMap, setAlertsMap] = useState<Record<string, AlertsCount>>({});

  // removed add/edit/delete flows; only reading from Firebase

  // Load users from Firebase Accounts
  useEffect(() => {
    let mounted = true;
    const loadUsers = async () => {
      try {
        // Only list Accounts with Role == 'user'
        const snap = await getDocs(query(accountsCollection(db), where('Role', '==', 'user')));
        const list: User[] = snap.docs.map(d => {
          const data: any = d.data();
          const email = data?.Email || data?.email;
          const name = data?.FullName || data?.Name || data?.name || (email ? String(email).split('@')[0] : '');
          return email ? { name, email } : null;
        }).filter(Boolean) as User[];
        if (mounted) setUsers(list);
      } catch (e) {
        if (mounted) setUsers([]);
      }
    };
    void loadUsers();
    return () => { mounted = false; };
  }, []);

  // Selected user detail is now opened as a full page under dashboard layout
  const openDetail = (email: string) => {
    // Navigate to the dedicated page that renders within the main dashboard layout
    const url = `/dashboard/admin/user?userEmail=${encodeURIComponent(email)}`;
    try {
      // Prefer SPA navigation if router is present
      (window as any).history?.pushState?.({}, '', url);
      // Dispatch a popstate for frameworks that listen to history changes
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch {
      window.location.href = url;
    }
  };
  // no local overlay, navigation only

  // helper to resolve UID from Accounts by email
  async function resolveUidByEmail(email: string): Promise<string | null> {
    try {
      const q = query(accountsCollection(db), where('Email', '==', email), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) return snap.docs[0].id; // Accounts are stored with uid as doc id
    } catch (e) {}
    return null;
  }

  // fetch alert counts for a given email (unresolved only)
  async function fetchAlertsForEmail(email: string): Promise<AlertsCount> {
    const key = email.toLowerCase();
    // optimistic mark as loading
    setAlertsMap(prev => ({
      ...prev,
      [key]: { ...(prev[key] || { uid: null, quotes: 0, services: 0, tickets: 0, total: 0 }), loading: true, error: null },
    }));
    try {
      const uid = (await resolveUidByEmail(email)) || '';
      if (!uid) {
        const empty: AlertsCount = { uid: null, quotes: 0, services: 0, tickets: 0, total: 0 };
        setAlertsMap(prev => ({ ...prev, [key]: empty }));
        return empty;
      }

      // Try to use aggregate fields on parent docs
      const [qParent, sParent, tParent] = await Promise.all([
        getDoc(quotesParentDoc(db, uid)),
        getDoc(userServiceRequestsParentDoc(db, uid)),
        getDoc(supportTicketsParentDoc(db, uid)),
      ]);

      // Helper to compute unresolved from parent snapshot with given resolvedKey
      const unresolvedFromParent = (snap: any, resolvedKey: 'approved_no' | 'review_no' | 'solved_no') => {
        const d = snap?.exists?.() ? snap.data() as any : null;
        if (!d) return null as number | null;
        const total = Number(d.total_no ?? NaN);
        const resolved = Number(d[resolvedKey] ?? NaN);
        if (Number.isFinite(total) && Number.isFinite(resolved)) return Math.max(0, total - resolved);
        return null as number | null;
      };

      let quotesUnresolved = unresolvedFromParent(qParent, 'approved_no');
      let servicesUnresolved = unresolvedFromParent(sParent, 'review_no');
      let ticketsUnresolved = unresolvedFromParent(tParent, 'solved_no');

      let quotesResolved: number | null = qParent?.exists?.() ? Number((qParent.data() as any)?.approved_no ?? NaN) : null;
      let quotesTotal: number | null = qParent?.exists?.() ? Number((qParent.data() as any)?.total_no ?? NaN) : null;
      let servicesResolved: number | null = sParent?.exists?.() ? Number((sParent.data() as any)?.review_no ?? NaN) : null; // closed
      let servicesTotal: number | null = sParent?.exists?.() ? Number((sParent.data() as any)?.total_no ?? NaN) : null;
      let ticketsResolved: number | null = tParent?.exists?.() ? Number((tParent.data() as any)?.solved_no ?? NaN) : null;
      let ticketsTotal: number | null = tParent?.exists?.() ? Number((tParent.data() as any)?.total_no ?? NaN) : null;

      // Fallback to live queries if aggregates are missing
      if (quotesUnresolved === null) {
        const qCol = quotesCollection(db, uid);
        const [allSnap, approvedSnap] = await Promise.all([
          getDocs(qCol),
          getDocs(query(qCol, where('status', '==', 'approved'))),
        ]);
        quotesUnresolved = Math.max(0, allSnap.size - approvedSnap.size);
        quotesResolved = approvedSnap.size;
        quotesTotal = allSnap.size;
      }
      if (servicesUnresolved === null) {
        const sCol = userServiceRequestsCollection(db, uid);
        const [allSnap, closedSnap] = await Promise.all([
          getDocs(sCol),
          getDocs(query(sCol, where('status', '==', 'closed'))),
        ]);
        servicesUnresolved = Math.max(0, allSnap.size - closedSnap.size);
        servicesResolved = closedSnap.size;
        servicesTotal = allSnap.size;
      }
      if (ticketsUnresolved === null) {
        const tCol = supportTicketsCollection(db, uid);
        const [allSnap, solvedSnap] = await Promise.all([
          getDocs(tCol),
          // Support different status vocabularies; prefer 'Resolved'
          getDocs(query(tCol, where('status', 'in', ['Resolved', 'closed'] as any))),
        ]);
        ticketsUnresolved = Math.max(0, allSnap.size - solvedSnap.size);
        ticketsResolved = solvedSnap.size;
        ticketsTotal = allSnap.size;
      }

      const data: AlertsCount = {
        uid,
        quotes: quotesUnresolved ?? 0,
        services: servicesUnresolved ?? 0,
        tickets: ticketsUnresolved ?? 0,
        total: (quotesUnresolved ?? 0) + (servicesUnresolved ?? 0) + (ticketsUnresolved ?? 0),
        quotesResolved: Number.isFinite(quotesResolved as any) ? (quotesResolved as number) : undefined,
        quotesTotal: Number.isFinite(quotesTotal as any) ? (quotesTotal as number) : undefined,
        servicesResolved: Number.isFinite(servicesResolved as any) ? (servicesResolved as number) : undefined,
        servicesTotal: Number.isFinite(servicesTotal as any) ? (servicesTotal as number) : undefined,
        ticketsResolved: Number.isFinite(ticketsResolved as any) ? (ticketsResolved as number) : undefined,
        ticketsTotal: Number.isFinite(ticketsTotal as any) ? (ticketsTotal as number) : undefined,
      };
      setAlertsMap(prev => ({ ...prev, [key]: data }));
      return data;
    } catch (e: any) {
      const err: AlertsCount = { uid: null, quotes: 0, services: 0, tickets: 0, total: 0, error: String(e) };
      setAlertsMap(prev => ({ ...prev, [key]: err }));
      return err;
    }
  }

  // prefetch alerts when users list loads/changes
  useEffect(() => {
    if (!users.length) return;
    users.forEach(u => {
      const key = u.email.toLowerCase();
      if (!alertsMap[key]) void fetchAlertsForEmail(u.email);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users]);

  const rows = useMemo(() => users.map((u, idx) => ({ ...u, idx })), [users]);

  // removed add/edit/delete handlers

  // modal for showing alert breakdown
  const [alertModal, setAlertModal] = useState<{ email: string; counts: AlertsCount } | null>(null);
  const openAlertModal = async (email: string) => {
    const counts = alertsMap[email.toLowerCase()] || (await fetchAlertsForEmail(email));
    setAlertModal({ email, counts });
  };
  const closeAlertModal = () => setAlertModal(null);

  // Add User modal state
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addRole, setAddRole] = useState<Account['Role']>('user');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const openAdd = () => { setShowAdd(true); setAddError(null); };
  const closeAdd = () => { setShowAdd(false); setAddName(''); setAddEmail(''); setAddPassword(''); setAddRole('user'); setAddError(null); };

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!addEmail || !addPassword) return;
    setAdding(true);
    setAddError(null);
    try {
      await registerUserWithProfile(auth, db, {
        email: addEmail,
        password: addPassword,
        fullName: addName || addEmail.split('@')[0],
        role: addRole,
      });
      // Refresh users
      const snap = await getDocs(query(accountsCollection(db), where('Role', '==', 'user')));
      const list: User[] = snap.docs.map(d => {
        const data: any = d.data();
        const email = data?.Email || data?.email;
        const name = data?.FullName || data?.Name || data?.name || (email ? String(email).split('@')[0] : '');
        return email ? { name, email } : null;
      }).filter(Boolean) as User[];
      setUsers(list);
      closeAdd();
    } catch (err: any) {
      setAddError(err?.message || 'Failed to add user');
    } finally {
      setAdding(false);
    }
  }

  return (
    <section className="bg-white/0 p-0">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Users</h1>
          <button onClick={openAdd} className="inline-flex items-center gap-2 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            <span>Add User</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Email</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {rows.map(({ name, email }) => (
                <tr
                  key={email}
                  onClick={() => openDetail(email)}
                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                  title="View user details"
                >
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm font-medium text-gray-900 dark:text-white">{name}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500 dark:text-gray-400">{email}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end w-full">
                      {(() => {
                        const counts = alertsMap[email.toLowerCase()];
                        const loading = !counts || counts.loading;
                        if (loading) {
                          return (
                            <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" aria-label="Loading alerts" title="Loading alerts" />
                          );
                        }
                        const total = counts?.total || 0;
                        const hasAlerts = total > 0;
                        const btnClass = 'bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700';
                        const iconClass = hasAlerts ? 'text-red-600' : 'text-gray-500 dark:text-gray-400';
                        return (
                          <button
                            onClick={(e) => { e.stopPropagation(); openAlertModal(email); }}
                            className={`relative w-8 h-8 rounded-full transition-colors duration-150 inline-flex items-center justify-center ${btnClass}`}
                            aria-label={hasAlerts ? `You have ${total} notifications` : 'No notifications'}
                            title={hasAlerts ? `${total} notifications` : 'No notifications'}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={hasAlerts ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`lucide lucide-bell h-5 w-5 ${iconClass}`}>
                              <path d="M10.268 21a2 2 0 0 0 3.464 0"></path>
                              <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"></path>
                            </svg>
                            {hasAlerts && (
                              <span className="absolute -top-1 -right-1 min-w-[1.1rem] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center shadow">{total}</span>
                            )}
                          </button>
                        );
                      })()}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* User details open in dedicated page; no inline overlay here */}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closeAdd} />
          <div className="relative z-10 bg-white dark:bg-gray-800 rounded-lg shadow-lg w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Add User</h2>
              <button onClick={closeAdd} className="text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white">✕</button>
            </div>
            <form onSubmit={handleAddSubmit} className="space-y-4">
              {addError && <div className="text-red-600 text-sm">{addError}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full name</label>
                <input value={addName} onChange={e => setAddName(e.target.value)} className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                <input type="email" required value={addEmail} onChange={e => setAddEmail(e.target.value)} className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                <input type="password" required value={addPassword} onChange={e => setAddPassword(e.target.value)} className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
                <select value={addRole} onChange={e => setAddRole(e.target.value as Account['Role'])} className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                  <option value="Super Admin">Super Admin</option>
                </select>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={closeAdd} className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300">Cancel</button>
                <button type="submit" disabled={adding} className="px-3 py-2 rounded bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-60">{adding ? 'Adding...' : 'Add User'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {alertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-200" 
            onClick={closeAlertModal} 
          />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-gray-100 dark:border-gray-700">
            {/* Header */}
            <div className="px-6 pt-6 pb-2">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Alerts Summary</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">{alertModal.email}</p>
            </div>

            {/* Stats Grid */}
            <div className="p-4 space-y-4">
              {/* Quotes Card */}
              <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-gray-800 dark:text-gray-200">Quotes</h4>
                  <span className="px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                    {alertModal.counts.quotes} Unresolved
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <div>Approved: <span className="font-medium text-gray-800 dark:text-gray-200">{alertModal.counts.quotesResolved ?? '0'}</span></div>
                  <div className="text-right">Total: <span className="font-medium text-gray-800 dark:text-gray-200">{alertModal.counts.quotesTotal ?? '0'}</span></div>
                </div>
              </div>

              {/* Service Requests Card */}
              <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-gray-800 dark:text-gray-200">Service Requests</h4>
                  <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                    {alertModal.counts.services} Unresolved
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <div>Closed: <span className="font-medium text-gray-800 dark:text-gray-200">{alertModal.counts.servicesResolved ?? '0'}</span></div>
                  <div className="text-right">Total: <span className="font-medium text-gray-800 dark:text-gray-200">{alertModal.counts.servicesTotal ?? '0'}</span></div>
                </div>
              </div>

              {/* Tickets Card */}
              <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-gray-800 dark:text-gray-200">Tickets</h4>
                  <span className="px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                    {alertModal.counts.tickets} Unresolved
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <div>Solved: <span className="font-medium text-gray-800 dark:text-gray-200">{alertModal.counts.ticketsResolved ?? '0'}</span></div>
                  <div className="text-right">Total: <span className="font-medium text-gray-800 dark:text-gray-200">{alertModal.counts.ticketsTotal ?? '0'}</span></div>
                </div>
              </div>

              {/* Total Unresolved */}
              <div className={`mt-4 p-4 rounded-xl ${alertModal.counts.total > 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-gray-50 dark:bg-gray-700/30'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-800 dark:text-gray-200">Total Unresolved</span>
                  <span className={`text-xl font-bold ${alertModal.counts.total > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-200'}`}>
                    {alertModal.counts.total}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700 rounded-b-2xl">
              <button 
                onClick={closeAlertModal}
                className="w-full py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default AdminUsers;
