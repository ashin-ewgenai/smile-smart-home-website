import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getDocs, query, orderBy, deleteDoc } from 'firebase/firestore';
import { auth, db, functions } from '../../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { SUPER_ADMIN_BASE_PATH } from '../../lib/constants';
import CreateUserModal from './CreateUserModal';
import { Trash2, Plus, AlertTriangle } from 'lucide-react';
import { accountsCollection, accountDoc } from '../../models/Collections';

interface UserDoc {
  uid: string;
  email?: string;
  displayName?: string;
  role?: string;
  createdAt?: any;
  lastLoginAt?: any;
}

export default function User_Admin_List() {
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingUid, setDeletingUid] = useState<string | null>(null);
  const [confirmUid, setConfirmUid] = useState<string | null>(null);
  const [confirmLabel, setConfirmLabel] = useState<string>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [minDelayDone, setMinDelayDone] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const seg = (params.get('seg') || '').toLowerCase();
  const adminsOnly = seg === 'admins';
  const usersOnly = seg === 'users';
  const peakSeg = seg === 'peak';
  const lastWeekSeg = seg === 'lastweek';
  const admins24hSeg = seg === 'admins24h';
  const users24hSeg = seg === 'users24h';
  const adminLogins12hSeg = seg === 'adminlogins12h';
  const userLogins12hSeg = seg === 'userlogins12h';

  // Ensure loader shows for at least 0.5s
  useEffect(() => {
    const t = setTimeout(() => setMinDelayDone(true), 500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    try {
      const role = localStorage.getItem('userRole');
      if (role !== 'Super Admin') {
        window.location.href = '/admin_login';
      }
    } catch {}

    (async () => {
      setLoading(true);
      try {
        const q = query(accountsCollection(db), orderBy('CreatedAt', 'desc'));
        const snap = await getDocs(q);
        const list: UserDoc[] = snap.docs.map((d) => {
          const data: any = d.data();
          return {
            uid: d.id,
            email: data?.Email,
            displayName: data?.FullName,
            role: data?.Role,
            createdAt: data?.CreatedAt,
            lastLoginAt: data?.LastLoginAt,
          };
        });
        setUsers(list);
      } catch (e: any) {
        setError(e?.message || 'Failed to load users');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function openConfirm(uid: string) {
    const target = users.find((u) => u.uid === uid);
    const label = target?.email || target?.displayName || uid;
    // Block prohibited deletions here so the modal doesn't open for forbidden targets
    const isTargetSuperAdmin = (target?.role || '').toLowerCase() === 'super admin' || (target?.role || '').toLowerCase() === 'super_admin';
    const currentUid = auth.currentUser?.uid || null;
    if (isTargetSuperAdmin) {
      alert('You cannot delete a Super Admin account.');
      return;
    }
    if (currentUid && currentUid === uid) {
      alert('You cannot delete your own account.');
      return;
    }
    setConfirmUid(uid);
    setConfirmLabel(label);
  }

  function closeConfirm() {
    setConfirmUid(null);
    setConfirmLabel('');
  }

  async function handleDelete(uid: string) {
    if (!uid) return;
    const currentUid = auth.currentUser?.uid;
    try {
      setDeletingUid(uid);
      setError(null);
      // Ensure user is authenticated and token is fresh so callable gets request.auth
      const user = auth.currentUser;
      if (!user) {
        setError('Must be authenticated.');
        window.location.href = '/admin_login';
        return;
      }
      try { await user.getIdToken(true); } catch {}
      // Try Cloud Function to delete both Auth user and Firestore doc
      try {
        const fn = httpsCallable(functions, 'superAdminDeleteUser');
        await fn({ uid });
        // Function succeeded: update UI
        setUsers(prev => prev.filter(u => u.uid !== uid));
        closeConfirm();
        return;
      } catch (fnErr: any) {
        // If function is not deployed or blocked, fallback to Firestore-only delete
        const code = fnErr?.code || '';
        const msg = fnErr?.message || '';
        if (code === 'functions/unauthenticated' || /unauthenticated/i.test(msg)) {
          setError('Must be authenticated.');
          window.location.href = '/admin_login';
          return;
        }
        const isNotFound = code === 'functions/not-found' || /not found/i.test(msg);
        const isUnavailable = code === 'unavailable' || /unavailable/i.test(msg);
        if (!isNotFound && !isUnavailable) {
          // If it's another error from function, surface it to user
          throw fnErr;
        }
        await deleteDoc(accountDoc(db, uid));
        setUsers(prev => prev.filter(u => u.uid !== uid));
        closeConfirm();
      }
    } catch (e: any) {
      const code = e?.code || '';
      if (String(code).includes('permission-denied')) {
        setError('Permission denied. Only Super Admin can delete users.');
      } else {
        setError(e?.message || 'Failed to delete user');
      }
    } finally {
      setDeletingUid(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <Link to={`${SUPER_ADMIN_BASE_PATH}/dashboard`} className="text-gray-600 hover:underline dark:text-gray-300">Dashboard</Link>
          <span className="text-gray-400">\</span>
          <span className="font-semibold text-gray-900 dark:text-white">{adminsOnly ? 'Admins' : usersOnly ? 'Users' : peakSeg ? 'Peak Weekly Signups' : lastWeekSeg ? 'Last Week Signups' : admins24hSeg ? 'Recent Admins (24h)' : users24hSeg ? 'Recent Users (24h)' : adminLogins12hSeg ? 'Recent Admin Logins (12h)' : userLogins12hSeg ? 'Recent User Logins (12h)' : 'All Members'}</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e)=>setSearch(e.target.value)}
            placeholder="Search name or email…"
            className="hidden sm:block w-56 rounded-md border border-gray-300 bg-white text-gray-900 placeholder:text-gray-500 px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-400 dark:border-gray-700"
          />
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center justify-center h-9 w-9 rounded-md bg-teal-600 text-white hover:bg-teal-700"
            aria-label="Add user"
            title="Add user"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 text-red-800 px-3 py-2 text-sm dark:border-red-800 dark:bg-red-900/30 dark:text-red-200">
          {error}
        </div>
      )}

      {(!minDelayDone || loading) ? (
        /* Skeleton loader for 0.5s minimum and while fetching */
        <div className="space-y-4">
          <div className="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </div>
        </div>
      ) : (
        (() => {
          const normalized = users.filter((u) => {
            const currentUid = auth.currentUser?.uid;
            if (u.uid === currentUid) return false;
            const role = (u.role || '').toLowerCase();
            if (role === 'super admin' || role === 'super_admin') return false; // hide Super Admin accounts
            return true;
          });
          const byQuery = (u: UserDoc) => {
            if (!search.trim()) return true;
            const q = search.toLowerCase();
            return (
              (u.displayName || '').toLowerCase().includes(q) ||
              (u.email || '').toLowerCase().includes(q)
            );
          };
          // Build base role-segmented arrays
          let admins = normalized.filter((u) => (u.role || '').toLowerCase() === 'admin' && byQuery(u));
          let regularUsers = normalized.filter((u) => (u.role || '').toLowerCase() !== 'admin' && byQuery(u));

          // If peak segment is requested, reduce to only the peak signup week across all accounts
          if (peakSeg) {
            const toDate = (v: any): Date | null => {
              if (!v) return null;
              try { return typeof v.toDate === 'function' ? v.toDate() : new Date(v); } catch { return null; }
            };
            const weekKey = (d: Date) => {
              // ISO week start (Monday)
              const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
              const day = date.getUTCDay();
              const diff = (day === 0 ? -6 : 1) - day; // move to Monday
              const monday = new Date(date);
              monday.setUTCDate(date.getUTCDate() + diff);
              const y = monday.getUTCFullYear();
              const m = String(monday.getUTCMonth() + 1).padStart(2, '0');
              const dd = String(monday.getUTCDate()).padStart(2, '0');
              return `${y}-${m}-${dd}`; // key by Monday date
            };
            const counts = new Map<string, number>();
            for (const u of normalized) {
              const dt = toDate(u.createdAt);
              if (!dt || isNaN(dt.getTime())) continue;
              const k = weekKey(dt);
              counts.set(k, (counts.get(k) || 0) + 1);
            }
            // Find peak key
            let peakKey: string | null = null;
            let peakVal = -1;
            for (const [k, v] of counts) {
              if (v > peakVal) { peakVal = v; peakKey = k; }
            }
            if (peakKey) {
              const inPeak = (u: UserDoc) => {
                const dt = toDate(u.createdAt);
                return !!dt && weekKey(dt) === peakKey;
              };
              admins = admins.filter(inPeak);
              regularUsers = regularUsers.filter(inPeak);
            }
          }

          // If lastweek segment is requested, keep only those created in the previous ISO week (Mon-Sun)
          if (lastWeekSeg) {
            const toDate = (v: any): Date | null => {
              if (!v) return null;
              try { return typeof v.toDate === 'function' ? v.toDate() : new Date(v); } catch { return null; }
            };
            const startOfISOWeek = (d: Date) => {
              const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
              const day = date.getUTCDay();
              const diff = (day === 0 ? -6 : 1) - day; // to Monday
              const monday = new Date(date);
              monday.setUTCDate(date.getUTCDate() + diff);
              monday.setUTCHours(0, 0, 0, 0);
              return monday;
            };
            const endOfISOWeek = (monday: Date) => {
              const sunday = new Date(monday);
              sunday.setUTCDate(monday.getUTCDate() + 6);
              sunday.setUTCHours(23, 59, 59, 999);
              return sunday;
            };
            const now = new Date();
            const thisWeekStart = startOfISOWeek(now);
            const lastWeekStart = new Date(thisWeekStart);
            lastWeekStart.setUTCDate(thisWeekStart.getUTCDate() - 7);
            const lastWeekEnd = endOfISOWeek(lastWeekStart);
            const inLastWeek = (u: UserDoc) => {
              const dt = toDate(u.createdAt);
              return !!dt && dt >= lastWeekStart && dt <= lastWeekEnd;
            };
            admins = admins.filter(inLastWeek);
            regularUsers = regularUsers.filter(inLastWeek);
          }

          // If admins24h segment is requested, filter admins to last 24 hours (rolling window)
          if (admins24hSeg) {
            const toDate = (v: any): Date | null => {
              if (!v) return null;
              try { return typeof v.toDate === 'function' ? v.toDate() : new Date(v); } catch { return null; }
            };
            const nowMs = Date.now();
            const oneDayMs = 24 * 60 * 60 * 1000;
            const in24h = (u: UserDoc) => {
              const dt = toDate(u.createdAt);
              return !!dt && (nowMs - dt.getTime()) <= oneDayMs && (nowMs - dt.getTime()) >= 0;
            };
            admins = admins.filter(in24h);
          }

          // If users24h segment is requested, filter regular users to last 24 hours (rolling window)
          if (users24hSeg) {
            const toDate = (v: any): Date | null => {
              if (!v) return null;
              try { return typeof v.toDate === 'function' ? v.toDate() : new Date(v); } catch { return null; }
            };
            const nowMs = Date.now();
            const oneDayMs = 24 * 60 * 60 * 1000;
            const in24h = (u: UserDoc) => {
              const dt = toDate(u.createdAt);
              return !!dt && (nowMs - dt.getTime()) <= oneDayMs && (nowMs - dt.getTime()) >= 0;
            };
            regularUsers = regularUsers.filter(in24h);
          }

          // If adminlogins12h segment is requested, filter admins by lastLoginAt within last 12 hours
          if (adminLogins12hSeg) {
            const toDate = (v: any): Date | null => {
              if (!v) return null;
              try { return typeof v.toDate === 'function' ? v.toDate() : new Date(v); } catch { return null; }
            };
            const nowMs = Date.now();
            const twelveHrs = 12 * 60 * 60 * 1000;
            const logged12h = (u: UserDoc) => {
              const dt = toDate(u.lastLoginAt);
              return !!dt && (nowMs - dt.getTime()) <= twelveHrs && (nowMs - dt.getTime()) >= 0;
            };
            admins = admins.filter(logged12h);
          }

          // If userlogins12h segment is requested, filter users by lastLoginAt within last 12 hours
          if (userLogins12hSeg) {
            const toDate = (v: any): Date | null => {
              if (!v) return null;
              try { return typeof v.toDate === 'function' ? v.toDate() : new Date(v); } catch { return null; }
            };
            const nowMs = Date.now();
            const twelveHrs = 12 * 60 * 60 * 1000;
            const logged12h = (u: UserDoc) => {
              const dt = toDate(u.lastLoginAt);
              return !!dt && (nowMs - dt.getTime()) <= twelveHrs && (nowMs - dt.getTime()) >= 0;
            };
            regularUsers = regularUsers.filter(logged12h);
          }

          // Helper to truncate by character count with end ellipsis
          const truncateEnd = (text: string, max: number) => {
            const t = (text || '').trim();
            if (t.length <= max) return t;
            return t.slice(0, Math.max(0, max)).trimEnd() + '……';
          };

          const Table = ({ title, rows, count }: { title: string; rows: UserDoc[]; count: number }) => (
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">{title} <span className="text-gray-500 text-sm">({count})</span></h2>
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:bg-transparent dark:border-gray-700 shadow-sm">
                <table className="min-w-full table-fixed divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase w-[50%] md:w-1/2">Name</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase w-[44%] md:w-1/3">Email</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase w-[6%] md:w-1/6">Role</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {rows.length === 0 ? (
                      <tr>
                        <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400" colSpan={4}>No records</td>
                      </tr>
                    ) : (
                      rows.map((u) => (
                        <tr
                          key={u.uid}
                          className="group hover:bg-gray-50/70 dark:hover:bg-gray-800/50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                          onClick={() => {
                            const qs = seg ? `?seg=${encodeURIComponent(seg)}` : '';
                            navigate(`${SUPER_ADMIN_BASE_PATH}/user/${encodeURIComponent(u.uid)}${qs}`);
                          }}
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === 'Enter') { const qs = seg ? `?seg=${encodeURIComponent(seg)}` : ''; navigate(`${SUPER_ADMIN_BASE_PATH}/user/${encodeURIComponent(u.uid)}${qs}`); } }}
                          title="View user details"
                        >
                          <td className="px-4 py-2">
                            <div className="relative flex items-center">
                              <button
                                onClick={(e) => { e.stopPropagation(); openConfirm(u.uid); }}
                                className="absolute left-0 inline-flex items-center justify-center h-7 w-7 rounded-md text-gray-400 dark:text-gray-500 opacity-0 -translate-x-3 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 ease-out hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20 focus:outline-none focus:ring-2 focus:ring-red-400/50"
                                title="Delete user"
                                aria-label="Delete user"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                              <div className="font-medium text-gray-900 dark:text-gray-100 truncate whitespace-nowrap transition-all duration-200 group-hover:pl-9" title={u.displayName || '—'}>
                                {truncateEnd(u.displayName || '—', 15)}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                            <div className="truncate whitespace-nowrap" title={u.email || '—'}>
                              {truncateEnd(u.email || '—', 15)}
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-900/20 dark:text-teal-200 dark:border-teal-800 capitalize">
                              {u.role || 'user'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );

          if (adminsOnly || admins24hSeg || adminLogins12hSeg) {
            return (
              <div className="grid grid-cols-1 gap-6">
                <Table title={admins24hSeg ? 'Recent Admins (Last 24 Hours)' : adminLogins12hSeg ? 'Recent Admin Logins (Last 12 Hours)' : 'Admins'} rows={admins} count={admins.length} />
              </div>
            );
          }
          if (usersOnly || users24hSeg || userLogins12hSeg) {
            return (
              <div className="grid grid-cols-1 gap-6">
                <Table title={users24hSeg ? 'Recent Users (Last 24 Hours)' : userLogins12hSeg ? 'Recent User Logins (Last 12 Hours)' : 'Users'} rows={regularUsers} count={regularUsers.length} />
              </div>
            );
          }
          else {
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Table title="Admins" rows={admins} count={admins.length} />
                <Table title="Users" rows={regularUsers} count={regularUsers.length} />
              </div>
            );
          }
        })()
      )}

      {confirmUid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" aria-live="assertive">
          <div className="absolute inset-0 bg-black/50" onClick={closeConfirm} />
          <div
            className="relative z-10 w-full max-w-md rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-user-title"
            onKeyDown={(e) => { if (e.key === 'Escape') closeConfirm(); }}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/20">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <h2 id="delete-user-title" className="text-lg font-semibold text-gray-900 dark:text-white">Delete user?</h2>
                <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                  You are about to permanently delete the user
                  {" "}
                  <span className="font-mono font-semibold text-gray-900 dark:text-white">{confirmLabel}</span>.
                  <br />
                  This will remove the account and related data. This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeConfirm}
                className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(confirmUid)}
                disabled={deletingUid === confirmUid}
                className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deletingUid === confirmUid ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
