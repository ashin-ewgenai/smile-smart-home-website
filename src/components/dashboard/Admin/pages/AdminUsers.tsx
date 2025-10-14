import React, { useEffect, useMemo, useState, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth as getClientAuth, createUserWithEmailAndPassword, updateProfile, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { TicketNotificationButton } from '@/components/common/TicketNotificationButton';
import { auth, db, functions, firebaseApp } from '../../../../lib/firebase';
import { accountsCollection, quotesCollection, supportTicketsCollection, quotesParentDoc, createAccountProfileWithLookup, type Account } from '../../../../models/Collections';
import { collection, getDoc, getDocs, limit, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import AdminUserDetail from './AdminUserDetail';
import PhoneInput from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';
import { Eye, EyeOff } from 'lucide-react';

interface User { name: string; email: string }

type AlertsCount = {
  uid: string | null;
  // unresolved counts (used by button label)
  quotes: number;
  services: number;
  tickets: number;
  total: number;
  // Optional fields for future use
  quotesResolved?: number;
  servicesResolved?: number;
  ticketsResolved?: number;
  // Optional total fields (not used in current implementation)
  quotesTotal?: number;
  servicesTotal?: number;
  ticketsTotal?: number;
  loading?: boolean;
  error?: string | null;
};

// No local storage: we load users from Firebase Accounts

const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [nameFilter, setNameFilter] = useState('');
  const [emailFilter, setEmailFilter] = useState('');
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [showAddPassword, setShowAddPassword] = useState(false);
  const [addPhone, setAddPhone] = useState('');
  const [addAddress, setAddAddress] = useState('');
  const [addRole, setAddRole] = useState<Account['Role']>('user');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [alertModal, setAlertModal] = useState<{email: string; counts: AlertsCount} | null>(null);
  const [showAlert, setShowAlert] = useState(false);
  const [alertData, setAlertData] = useState<{email: string; counts: AlertsCount} | null>(null);
  const [addFormKey, setAddFormKey] = useState(0);
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null);
  const [confirmingEmail, setConfirmingEmail] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const closeAdd = () => {
    // Also reset fields on close to avoid retaining values
    setAddName('');
    setAddEmail('');
    setAddPassword('');
    setAddPhone('');
    setAddAddress('');
    setAddRole('user');
    setAddError('');
    setShowAdd(false);
  };
  const openAdd = () => {
    // Reset form fields when opening the modal
    setAddName('');
    setAddEmail('');
    setAddPassword('');
    setAddPhone('');
    setAddAddress('');
    setAddRole('user');
    setAddError('');
    setShowAdd(true);
    setAddFormKey((k) => k + 1); // force form remount
  };
  const closeAlertModal = () => {
    setShowAlert(false);
    setAlertData(null);
  };
  
  const openAlertModal = (email: string) => {
    const counts = alertsMap[email.toLowerCase()] || { quotes: 0, services: 0, tickets: 0, total: 0 };
    setShowAlert(true);
    setAlertData({ email, counts });
  };

  // Delete a user (and all user-owned docs) by email -> resolves to UID, then calls CF
  const deleteUserByEmail = async (email: string) => {
    if (!email) return;
    const confirmed = window.confirm(
      `This will permanently delete the user and all related data (quotes, service requests, tickets, user devices, chat sessions).\n\nUser: ${email}\n\nAre you sure?`
    );
    if (!confirmed) return;
    try {
      setDeletingEmail(email);
      const uid = await resolveUidByEmail(email);
      if (!uid) {
        alert('Could not find UID for this email.');
        return;
      }
      // Client-side guard: ensure authenticated and not deleting self
      const currentUid = auth?.currentUser?.uid;
      if (!currentUid) {
        alert('You must be signed in to perform this action. Please refresh and sign in again.');
        return;
      }
      if (currentUid === uid) {
        alert('You cannot delete your own account.');
        return;
      }
      // console.log('[AdminUsers] Deleting user via CF', { email, resolvedUid: uid });
      const call = httpsCallable(functions, 'adminDeleteUserAndData');
      const res = await call({ uid });
      // Optimistically remove from lists
      setUsers(prev => prev.filter(u => u.email !== email));
      setFilteredUsers(prev => prev.filter(u => u.email !== email));
      // Cleanup any listeners for this email
      const key = email.toLowerCase();
      unsubscribeRefs.current[key]?.forEach(fn => fn());
      delete unsubscribeRefs.current[key];
      // Optional: show summary
      try {
        const summary = (res?.data as any)?.summary;
        // console.log('Delete summary:', summary);
      } catch {}
    } catch (e: any) {
      // Provide richer diagnostics for callable function errors
      const code = e?.code || e?.error?.code || 'unknown';
      const msg = e?.message || e?.error?.message || String(e);
      const details = e?.details ? JSON.stringify(e.details) : '';
      // Capture all own properties for better debugging visibility
      const ownProps = Object.getOwnPropertyNames(e || {}).reduce((acc: any, k) => { try { acc[k] = (e as any)[k]; } catch {} return acc; }, {} as any);
      console.error('adminDeleteUserAndData error', { code, msg, details, raw: e, ownProps });
      alert(`Failed to delete user.\nCode: ${code}\nMessage: ${msg}${details ? `\nDetails: ${details}` : ''}`);
    } finally {
      setDeletingEmail(null);
    }
  };

  // Perform delete without using window.confirm (used by custom modal)
  const performDelete = async (email: string) => {
    if (!email) return;
    try {
      // console.log('[AdminUsers] performDelete start', { email });
      setConfirming(true);
      setDeletingEmail(email);
      const uid = await resolveUidByEmail(email);
      // console.log('[AdminUsers] performDelete uid resolved', { email, uid });
      if (!uid) {
        alert('Could not find UID for this email.');
        return;
      }
      // Client-side guard: ensure authenticated
      const currentUid = auth?.currentUser?.uid;
      // console.log('[AdminUsers] performDelete auth check', { currentUid });
      if (!currentUid) {
        alert('You must be signed in to perform this action. Please refresh and sign in again.');
        return;
      }
      // console.log('[AdminUsers] Proceeding to call CF', { email, resolvedUid: uid });
      const call = httpsCallable(functions, 'adminDeleteUserAndData');
      const res = await call({ uid });
      // Optimistically remove from lists
      setUsers(prev => prev.filter(u => u.email !== email));
      setFilteredUsers(prev => prev.filter(u => u.email !== email));
      // Cleanup any listeners for this email
      const key = email.toLowerCase();
      unsubscribeRefs.current[key]?.forEach(fn => fn());
      delete unsubscribeRefs.current[key];
      try {
        const summary = (res?.data as any)?.summary;
        // console.log('Delete summary:', summary);
      } catch {}
    } catch (e: any) {
      const code = e?.code || e?.error?.code || 'unknown';
      const msg = e?.message || e?.error?.message || String(e);
      const details = e?.details ? JSON.stringify(e.details) : '';
      console.error('adminDeleteUserAndData error', { code, msg, details, raw: e });
      alert(`Failed to delete user.\nCode: ${code}\nMessage: ${msg}${details ? `\nDetails: ${details}` : ''}`);
    } finally {
      setDeletingEmail(null);
      setConfirming(false);
      setConfirmingEmail(null);
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setAddError('');
    
    try {
      // Create a secondary app to avoid switching the current admin session
      const secondaryName = 'admin-secondary';
      const secondaryApp = getApps().find(a => a.name === secondaryName) || initializeApp((firebaseApp as any).options, secondaryName);
      const tempAuth = getClientAuth(secondaryApp);
      // Create auth user on secondary app so current session remains intact
      const cred = await createUserWithEmailAndPassword(tempAuth, addEmail, addPassword);
      if (addName) {
        try { await updateProfile(cred.user, { displayName: addName }); } catch {}
      }
      // Create the Accounts profile in Firestore using primary db
      await createAccountProfileWithLookup(db, {
        uid: cred.user.uid,
        email: cred.user.email,
        fullName: addName || cred.user.displayName || (cred.user.email ? cred.user.email.split('@')[0] : ''),
        role: addRole,
        phoneNumber: addPhone,
        address: addAddress,
      });

      // Send only password reset email (no secrets)
      try {
        const actionCodeSettings = {
          url: `${window.location.origin}/auth`,
          handleCodeInApp: true,
        } as const;
        await sendPasswordResetEmail(tempAuth, addEmail, actionCodeSettings);
      } catch (mailErr) {
        // Non-blocking: log to console is avoided in codebase; optionally set non-fatal UI state
      }
      // Sign out secondary auth to clean up
      try { await signOut(tempAuth); } catch {}
      
      // Refresh users list
      const snap = await getDocs(query(accountsCollection(db), where('Role', '==', 'user')));
      const list: User[] = snap.docs.map(d => {
        const data: any = d.data();
        const email = data?.Email || data?.email;
        const name = data?.FullName || data?.Name || data?.name || (email ? String(email).split('@')[0] : '');
        return email ? { name, email } : null;
      }).filter(Boolean) as User[];
      
      // Ensure the just-added user is present in UI
      let updated = [...list];
      if (addRole === 'user') {
        const newEmailLc = (cred.user.email || '').toLowerCase();
        const exists = updated.some(u => u.email.toLowerCase() === newEmailLc);
        if (!exists && newEmailLc) {
          updated = [{ name: addName || (cred.user.email ? cred.user.email.split('@')[0] : ''), email: cred.user.email || '' }, ...updated];
        }
      }
      setUsers(updated);
      setFilteredUsers(updated);
      // Clear filters so the newly added user is visible
      setNameFilter('');
      setEmailFilter('');
      // If the added role was admin, inform via console since admin accounts are not listed here
      if (addRole !== 'user') {
        // console.info('[AdminUsers] Added an admin account which is intentionally not listed on the Users page.');
      }
      closeAdd();
    } catch (error: any) {
      setAddError(error.message || 'Failed to add user');
    } finally {
      setAdding(false);
    }
  };

  // alerts map keyed by email (lowercased)
  const [alertsMap, setAlertsMap] = useState<Record<string, AlertsCount>>({});
  const unsubscribeRefs = useRef<Record<string, (() => void)[]>>({});

  // Apply filters whenever nameFilter, emailFilter, or users change
  useEffect(() => {
    const filtered = users.filter(user => {
      const nameMatch = user.name.toLowerCase().includes(nameFilter.toLowerCase());
      const emailMatch = user.email.toLowerCase().includes(emailFilter.toLowerCase());
      return nameMatch && emailMatch;
    });
    setFilteredUsers(filtered);
  }, [nameFilter, emailFilter, users]);

  // Clear all filters
  const clearFilters = () => {
    setNameFilter('');
    setEmailFilter('');
  };

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
        if (mounted) {
          setUsers(list);
          setFilteredUsers(list);
        }
      } catch (e) {
        if (mounted) setUsers([]);
      }
    };
    void loadUsers();
    return () => { mounted = false; };
  }, []);

  // Toggle user detail view
  const openDetail = (email: string) => {
    setSelectedUser(email);
  };

  // Handle back from user detail
  const handleBack = () => {
    setSelectedUser(null);
  };

  // helper to resolve UID from Accounts by email
  async function resolveUidByEmail(email: string): Promise<string | null> {
    try {
      // Try canonical field first
      let snap = await getDocs(query(accountsCollection(db), where('Email', '==', email), limit(1)));
      if (!snap.empty) return snap.docs[0].id; // Accounts are stored with uid as doc id
      // Fallback: some older docs may have lowercase 'email'
      snap = await getDocs(query(accountsCollection(db), where('email', '==', email), limit(1)));
      if (!snap.empty) return snap.docs[0].id;
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

      // Set up real-time listeners for each collection
      const quotesQuery = query(collection(db, 'quotes'), where('userUid', '==', uid));
      const serviceRequestsQuery = query(collection(db, 'Request_service'), where('uid', '==', uid));
      const ticketsQuery = query(collection(db, 'Support_Tickets'), where('uid', '==', uid));

      // Unsubscribe from previous listeners if they exist
      if (unsubscribeRefs.current[key]) {
        unsubscribeRefs.current[key].forEach(unsubscribe => unsubscribe());
      }

      // Set up new listeners
      const unsubscribes = [
        onSnapshot(quotesQuery, (snapshot) => {
          const count = snapshot.docs.filter(doc => {
            const d = doc.data();
            const status = (d?.status ?? d?.Status)?.toString().toLowerCase();
            return status !== 'confirmed' && status !== 'cancelled' && status !== 'canceled';
          }).length;
          
          setAlertsMap(prev => {
            const current = prev[key] || { uid, quotes: 0, services: 0, tickets: 0, total: 0 };
            const newTotal = count + current.services + current.tickets;
            return {
              ...prev,
              [key]: {
                ...current,
                quotes: count,
                total: newTotal
              }
            };
          });
        }),

        onSnapshot(serviceRequestsQuery, (snapshot) => {
          const count = snapshot.docs.filter(doc => {
            const d = doc.data();
            const status = (d?.status ?? d?.Status)?.toString().toLowerCase();
            return status !== 'closed' && status !== 'resolved' && status !== 'cancelled' && status !== 'canceled';
          }).length;
          
          setAlertsMap(prev => {
            const current = prev[key] || { uid, quotes: 0, services: 0, tickets: 0, total: 0 };
            const newTotal = current.quotes + count + current.tickets;
            return {
              ...prev,
              [key]: {
                ...current,
                services: count,
                total: newTotal
              }
            };
          });
        }),

        onSnapshot(ticketsQuery, (snapshot) => {
          const count = snapshot.docs.filter(doc => {
            const d = doc.data();
            const status = (d?.status ?? d?.Status)?.toString().toLowerCase();
            return status !== 'resolved' && status !== 'closed' && status !== 'cancelled' && status !== 'canceled';
          }).length;
          
          setAlertsMap(prev => {
            const current = prev[key] || { uid, quotes: 0, services: 0, tickets: 0, total: 0 };
            const newTotal = current.quotes + current.services + count;
            return {
              ...prev,
              [key]: {
                ...current,
                tickets: count,
                total: newTotal
              }
            };
          });
        })
      ];

      // Store unsubscribe functions
      unsubscribeRefs.current[key] = unsubscribes;

      // Initial data load
      const [quotesSnapshot, servicesSnapshot, ticketsSnapshot] = await Promise.all([
        getDocs(quotesQuery),
        getDocs(serviceRequestsQuery),
        getDocs(ticketsQuery)
      ]);

      const quotesUnresolved = quotesSnapshot.docs.filter(doc => {
        const status = doc.data().status?.toString().toLowerCase();
        return status !== 'confirmed' && status !== 'cancelled' && status !== 'canceled';
      }).length;

      const servicesUnresolved = servicesSnapshot.docs.filter(doc => {
        const status = doc.data().status?.toString().toLowerCase();
        return status !== 'closed' && status !== 'resolved' && status !== 'cancelled' && status !== 'canceled';
      }).length;

      const ticketsUnresolved = ticketsSnapshot.docs.filter(doc => {
        const status = doc.data().status?.toString().toLowerCase();
        return status !== 'resolved' && status !== 'closed' && status !== 'cancelled' && status !== 'canceled';
      }).length;

      const data: AlertsCount = {
        uid,
        quotes: quotesUnresolved,
        services: servicesUnresolved,
        tickets: ticketsUnresolved,
        total: quotesUnresolved + servicesUnresolved + ticketsUnresolved,
      };
      
      // Removed sensitive console.log
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
    // Removed logging of user emails
    users.forEach(u => {
      const key = u.email.toLowerCase();
      if (!alertsMap[key]) void fetchAlertsForEmail(u.email);
    });
    
    // Cleanup function to unsubscribe from all listeners
    return () => {
      Object.values(unsubscribeRefs.current).forEach(unsubscribes => {
        unsubscribes.forEach(unsubscribe => unsubscribe());
      });
      unsubscribeRefs.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users]);

  // Debug: log alertsMap changes - removed sensitive data logging
  useEffect(() => {
    // This effect is intentionally left empty as we don't need to log anything
  }, [alertsMap]);

  // Ensure fields are reset whenever the Add modal opens (helps fight browser autofill)
  useEffect(() => {
    if (showAdd) {
      // Clear synchronously
      setAddName('');
      setAddEmail('');
      setAddPassword('');
      setAddPhone('');
      setAddAddress('');
      setAddRole('user');
      // Clear again on next frame in case the browser autofills after paint
      const id = requestAnimationFrame(() => {
        setAddEmail('');
        setAddPassword('');
      });
      // Lock background scroll while modal is open
      try {
        const html = document.documentElement;
        const body = document.body;
        const prevHtmlOverflow = html.style.overflow;
        const prevBodyOverflow = body.style.overflow;
        html.style.overflow = 'hidden';
        body.style.overflow = 'hidden';
        return () => {
          cancelAnimationFrame(id);
          html.style.overflow = prevHtmlOverflow;
          body.style.overflow = prevBodyOverflow;
        };
      } catch {
        return () => cancelAnimationFrame(id);
      }
    }
  }, [showAdd]);

  if (selectedUser) {
    return (
      <AdminUserDetail 
        email={selectedUser}
        onBack={handleBack}
      />
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
      <div className="flex flex-col space-y-4 mb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Users</h1>
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-2 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            <span>Add User</span>
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <label htmlFor="name-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Filter by Name
            </label>
            <svg className="pointer-events-none absolute left-3 top-[2.65rem] h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 103.75 3.75a7.5 7.5 0 0012.9 12.9z" />
            </svg>
            <input
              type="text"
              id="name-filter"
              className="w-full pl-10 pr-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 dark:bg-gray-700 dark:text-white placeholder:text-gray-400"
              placeholder="Search by name..."
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
            />
          </div>
          <div className="relative">
            <label htmlFor="email-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Filter by Email
            </label>
            <svg className="pointer-events-none absolute left-3 top-[2.65rem] h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 12H8m0 0l4-4m-4 4l4 4" />
            </svg>
            <input
              type="text"
              id="email-filter"
              className="w-full pl-10 pr-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 dark:bg-gray-700 dark:text-white placeholder:text-gray-400"
              placeholder="Search by email..."
              value={emailFilter}
              onChange={(e) => setEmailFilter(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={clearFilters}
              className="px-4 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Email</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                  {users.length === 0 ? 'No users found' : 'No users match the current filters'}
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => {
                const alerts = alertsMap[user.email.toLowerCase()] || { quotes: 0, services: 0, tickets: 0, total: 0 };
                return (
                  <tr
                    key={user.email}
                    onClick={() => openDetail(user.email)}
                    className="group cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                    title="View user details"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{user.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500 dark:text-gray-400">{user.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-1">
                        <div
                          className="flex items-center space-x-1"
                          onClick={(e) => { e.stopPropagation(); }}
                          onMouseDown={(e) => { e.stopPropagation(); }}
                        >
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmingEmail(user.email);
                            }}
                            onMouseDown={(e) => { e.stopPropagation(); }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                setConfirmingEmail(user.email);
                              }
                            }}
                            disabled={deletingEmail === user.email}
                            className={`p-1.5 focus:outline-none ${ deletingEmail === user.email ? 'text-gray-400 cursor-not-allowed' : 'text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400'}`}
                            aria-label="Delete user"
                            title="Delete user"
                          >
                            <svg 
                              xmlns="http://www.w3.org/2000/svg" 
                              width="20" 
                              height="20" 
                              viewBox="0 0 24 24" 
                              fill="none" 
                              stroke="currentColor" 
                              strokeWidth="2" 
                              strokeLinecap="round" 
                              strokeLinejoin="round" 
                              className="lucide lucide-trash-2"
                            >
                              <path d="M3 6h18" />
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                              <line x1="10" x2="10" y1="11" y2="17" />
                              <line x1="14" x2="14" y1="11" y2="17" />
                            </svg>
                          </button>
                        </div>
                        <div className="relative">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            openAlertModal(user.email);
                          }}
                          className={`p-1.5 focus:outline-none ${alerts.total > 0 ? 'text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white'}`}
                          aria-label="View alerts"
                        >
                          <svg 
                            xmlns="http://www.w3.org/2000/svg" 
                            width="24" 
                            height="24" 
                            viewBox="0 0 24 24" 
                            fill={alerts.total > 0 ? 'currentColor' : 'none'}
                            stroke="currentColor" 
                            strokeWidth="2" 
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                            className="lucide lucide-bell h-5 w-5"
                          >
                            <path d="M10.268 21a2 2 0 0 0 3.464 0" />
                            <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
                          </svg>
                          {alerts.total > 0 && (
                            <span className="absolute -top-1 -right-1 inline-flex items-center justify-center h-4 w-4 rounded-full bg-red-500 text-white text-[10px] font-medium">
                              {alerts.total > 9 ? '9+' : alerts.total}
                            </span>
                          )}
                        </button>
                      </div>
                    </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden">
          <div
            className="absolute inset-0 bg-black/50 touch-none"
            onClick={closeAdd}
          />
          <div
            className="relative z-10 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100 dark:border-gray-700 max-h-[90vh] flex flex-col overscroll-none touch-none"
            onWheel={(e) => {
              // Prevent background page from scrolling when hovering header/footer
              e.stopPropagation();
            }}
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Add User</h2>
              <button onClick={closeAdd} className="inline-flex items-center justify-center w-8 h-8 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500">✕</button>
            </div>
            <form
              key={addFormKey}
              onSubmit={handleAddSubmit}
              className="p-6 space-y-5 overflow-y-auto overscroll-none flex-1 touch-pan-y"
              autoComplete="off"
              onWheel={(e) => {
                const el = e.currentTarget;
                // Manually scroll the form and block default so the page behind never scrolls
                el.scrollTop += e.deltaY;
                e.preventDefault();
                e.stopPropagation();
              }}
              onWheelCapture={(e) => {
                // Capture phase to guarantee background doesn't see the wheel
                e.stopPropagation();
              }}
              onTouchMove={(e) => {
                // Stop propagation to keep gestures within the modal
                e.stopPropagation();
              }}
            >
              {/* Honeypot fields to absorb browser autofill */}
              <input 
                type="text" 
                name="email" 
                autoComplete="username"
                tabIndex={-1}
                aria-hidden="true"
                className="hidden"
                value=""
                onChange={() => {}}
              />
              <input 
                type="password" 
                name="password" 
                autoComplete="new-password"
                tabIndex={-1}
                aria-hidden="true"
                className="hidden"
                value=""
                onChange={() => {}}
              />
              {addError && <div className="text-red-600 text-sm">{addError}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full name</label>
                <input value={addName} onChange={e => setAddName(e.target.value)} className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500" placeholder="Enter full name" />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">The name will be shown in reports and notifications.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                <input 
                  type="email" 
                  required 
                  value={addEmail} 
                  onChange={e => setAddEmail(e.target.value)} 
                  placeholder="Enter email address"
                  name="new-email"
                  inputMode="email"
                  autoComplete="new-email"
                  readOnly
                  onFocus={(e) => e.currentTarget.removeAttribute('readonly')}
                  className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500" 
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">We’ll send account emails to this address.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                <div className="relative">
                  <input 
                    type={showAddPassword ? 'text' : 'password'} 
                    required 
                    value={addPassword} 
                    onChange={e => setAddPassword(e.target.value)} 
                    placeholder="Enter a strong password"
                    name="new-password"
                    autoComplete="new-password"
                    readOnly
                    onFocus={(e) => e.currentTarget.removeAttribute('readonly')}
                    className="w-full pr-10 px-3 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500" 
                  />
                  <button
                    type="button"
                    aria-label={showAddPassword ? 'Hide password' : 'Show password'}
                    title={showAddPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowAddPassword(v => !v)}
                    className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                  >
                    {showAddPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Use at least 8 characters with a mix of letters and numbers.</p>
              </div>
              <div className="phone-input-container">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone Number</label>
                <div className="relative w-full">
                  <PhoneInput
                    country="in"
                    value={addPhone}
                    onChange={phone => setAddPhone(phone)}
                    disableCountryGuess={true}
                    disableCountryCode={false}
                    disableDropdown={false}
                    inputProps={{
                      name: 'phone',
                      required: true,
                      className: 'w-full !pl-14 !py-2 !border !border-gray-300 dark:!border-gray-600 !rounded-lg focus:!ring-2 focus:!ring-teal-500 focus:!border-transparent dark:!bg-gray-800 dark:!text-white',
                      style: { color: 'inherit' }
                    }}
                    containerClass="w-full"
                    buttonClass="!bg-gray-100 dark:!bg-gray-700 !border-r !border-gray-300 dark:!border-gray-600 !rounded-l-lg !p-0 !w-12 !h-full !flex !items-center !justify-center hover:!bg-gray-200 dark:hover:!bg-gray-600 focus:!ring-2 focus:!ring-teal-500 focus:!outline-none transition-colors duration-200"
                    dropdownClass="!border !border-gray-200 dark:!border-gray-700 !rounded-lg !shadow-lg !bg-white dark:!bg-gray-800 !left-1/2 !-translate-x-1/2 !fixed !z-50 !w-80 [&_.highlight]:!bg-teal-500/20 [&_.highlight]:dark:!bg-teal-400/30 [&_.highlight]:!text-gray-900 dark:[&_.highlight]:!text-white [&_.country.highlight]:!bg-teal-500/10 dark:[&_.country.highlight]:!bg-teal-400/20 [&_.country:hover]:!bg-gray-100 dark:[&_.country:hover]:!bg-gray-700"
                    containerStyle={{ width: '100%' }}
                    inputStyle={{
                      width: '100%',
                      height: 'auto',
                      paddingLeft: '3.5rem',
                      backgroundColor: 'transparent',
                    }}
                    buttonStyle={{
                      backgroundColor: 'transparent',
                      border: 'none',
                    }}
                    searchPlaceholder="Search country..."
                    searchClass="!w-[calc(100%-1rem)] !mx-2 !my-1 !px-3 !py-2 !text-sm !rounded-lg !border !border-gray-300 dark:!border-gray-600 focus:!ring-2 focus:!ring-teal-500 focus:!border-transparent dark:!bg-gray-800 dark:!text-white"
                    searchNotFound="No country found"
                    enableSearch
                    countryCodeEditable={false}
                    disableSearchIcon
                    preferredCountries={['in', 'us', 'gb', 'ca', 'au']}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
                <textarea 
                  value={addAddress} 
                  onChange={e => setAddAddress(e.target.value)} 
                  placeholder="Enter full address"
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Include street, city, state and postal code.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
                <select value={addRole} onChange={e => setAddRole(e.target.value as Account['Role'])} className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500">
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Controls what this user can access.</p>
              </div>
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-4 flex-shrink-0">
                <button type="button" onClick={closeAdd} className="w-full sm:w-auto px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500">Cancel</button>
                <button type="submit" disabled={adding} className="w-full sm:w-auto px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:opacity-60">{adding ? 'Adding...' : 'Add User'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmingEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden">
          <div
            className="absolute inset-0 bg-black/50 touch-none"
            onClick={() => setConfirmingEmail(null)}
          />
          <div
            className="relative z-10 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 dark:border-gray-700 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Delete User</h2>
            </div>
            <div className="p-6 text-gray-700 dark:text-gray-300">
              <p className="mb-2">This will permanently delete the user and all related data (quotes, service requests, tickets, user devices, chat sessions).</p>
              <p><span className="font-medium">User:</span> {confirmingEmail}</p>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingEmail(null)}
                className="px-4 py-2 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  // console.log('[AdminUsers] Delete button clicked', { confirmingEmail });
                  if (confirmingEmail) performDelete(confirmingEmail);
                }}
                disabled={confirming}
                className="px-4 py-2 rounded bg-red-600 hover:bg-red-700 text-white disabled:opacity-60"
              >
                {confirming ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAlert && alertData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-200" 
            onClick={closeAlertModal} 
          />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-gray-100 dark:border-gray-700">
            {/* Header */}
            <div className="px-6 pt-6 pb-2">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Alerts Summary</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">{alertData.email}</p>
            </div>

            {/* Stats Grid */}
            <div className="p-4 space-y-4">
              {/* Quotes */}
              <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-gray-800 dark:text-gray-200">Pending Quotes</h4>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${alertData.counts.quotes > 0 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'}`}>
                    {alertData.counts.quotes > 0 ? `${alertData.counts.quotes} Pending` : 'All Clear'}
                  </span>
                </div>
              </div>

              {/* Services */}
              <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-gray-800 dark:text-gray-200">Service Requests</h4>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${alertData.counts.services > 0 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'}`}>
                    {alertData.counts.services > 0 ? `${alertData.counts.services} Active` : 'None'}
                  </span>
                </div>
              </div>

              {/* Tickets */}
              <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-gray-800 dark:text-gray-200">Support Tickets</h4>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${alertData.counts.tickets > 0 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'}`}>
                    {alertData.counts.tickets > 0 ? `${alertData.counts.tickets} Open` : 'None'}
                  </span>
                </div>
              </div>

              {/* Total */}
              <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-gray-800 dark:text-gray-200">Total Pending Items</h4>
                  <span className={`text-xl font-bold ${alertData.counts.total > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                    {alertData.counts.total}
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
    </div>
  );
};

export default AdminUsers;
