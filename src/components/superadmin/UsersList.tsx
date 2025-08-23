import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { auth, db, functions } from '../../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { SUPER_ADMIN_BASE_PATH } from '../../lib/constants';
import CreateUserModal from './CreateUserModal';

interface UserDoc {
  uid: string;
  email?: string;
  displayName?: string;
  role?: string;
  createdAt?: any;
  lastLoginAt?: any;
}

export default function UsersList() {
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingUid, setDeletingUid] = useState<string | null>(null);
  const [confirmUid, setConfirmUid] = useState<string | null>(null);
  const [confirmLabel, setConfirmLabel] = useState<string>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    try {
      const role = localStorage.getItem('userRole');
      if (role !== 'Super Admin') {
        window.location.href = '/admin_login';
        return;
      }
    } catch {}

    (async () => {
      setLoading(true);
      try {
        const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        const list: UserDoc[] = snap.docs.map((d) => ({ uid: d.id, ...(d.data() as any) }));
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
        const isNotFound = code === 'functions/not-found' || /not found/i.test(msg);
        const isUnavailable = code === 'unavailable' || /unavailable/i.test(msg);
        if (!isNotFound && !isUnavailable) {
          // If it's another error from function, surface it to user
          throw fnErr;
        }
        await deleteDoc(doc(db, 'users', uid));
        setUsers(prev => prev.filter(u => u.uid !== uid));
        closeConfirm();
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to delete user');
    } finally {
      setDeletingUid(null);
    }
  }

  if (loading) return <div>Loading users…</div>;
  if (error) return <div className="text-red-600">{error}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Users Management</h1>
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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-teal-600 text-white hover:bg-teal-700"
          >
            Add User
          </button>
        </div>
      </div>

      {/* Compute filtered groups: exclude Super Admins and the logged-in super admin */}
      {(() => {
        const currentUid = auth.currentUser?.uid || '';
        const normalized = users.filter((u) => {
          const r = (u.role || 'user').toLowerCase().replace(/\s+/g, '_');
          if (r === 'super_admin' || r === 'superadmin' || r === 'super-admin') return false;
          if (u.uid === currentUid) return false;
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
        const admins = normalized.filter((u) => (u.role || '').toLowerCase() === 'admin' && byQuery(u));
        const regularUsers = normalized.filter((u) => (u.role || '').toLowerCase() !== 'admin' && byQuery(u));

        const Table = ({ title, rows, count }: { title: string; rows: UserDoc[]; count: number }) => (
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">{title} <span className="text-gray-500 text-sm">({count})</span></h2>
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:bg-transparent dark:border-gray-700">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase">Name</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase">Email</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase">Role</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {rows.length === 0 ? (
                    <tr>
                      <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400" colSpan={4}>No records</td>
                    </tr>
                  ) : (
                    rows.map((u) => (
                      <tr key={u.uid} className="group hover:bg-gray-50/70 dark:hover:bg-gray-800/50">
                        <td className="px-4 py-2">{u.displayName || '—'}</td>
                        <td className="px-4 py-2">{u.email || '—'}</td>
                        <td className="px-4 py-2">{u.role || 'user'}</td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <a
                              href={`${SUPER_ADMIN_BASE_PATH}/userlist/user?uid=${encodeURIComponent(u.uid)}`}
                              className="inline-flex items-center px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                              Edit
                            </a>
                            <button
                              onClick={() => openConfirm(u.uid)}
                              disabled={deletingUid === u.uid}
                              className="inline-flex items-center px-3 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                              title="Delete user"
                            >
                              {deletingUid === u.uid ? 'Deleting…' : 'Delete'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Admins */}
            <Table title="Admins" rows={admins} count={admins.length} />
            {/* Right: Users */}
            <Table title="Users" rows={regularUsers} count={regularUsers.length} />
          </div>
        );
      })()}

      {confirmUid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closeConfirm} />
          <div className="relative z-10 w-full max-w-md rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Delete user?</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              Are you sure you want to delete the user <span className="font-medium">{confirmLabel}</span>? This action cannot be undone.
            </p>
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
