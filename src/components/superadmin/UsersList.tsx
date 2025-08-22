import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { SUPER_ADMIN_BASE_PATH } from '../../lib/constants';

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

  if (loading) return <div>Loading users…</div>;
  if (error) return <div className="text-red-600">{error}</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Users</h1>
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
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
            {users.map((u) => (
              <tr key={u.uid} className="group hover:bg-gray-50/70 dark:hover:bg-gray-800/50">
                <td className="px-4 py-2">{u.displayName || '—'}</td>
                <td className="px-4 py-2">{u.email || '—'}</td>
                <td className="px-4 py-2">{u.role || 'user'}</td>
                <td className="px-4 py-2">
                  <a
                    href={`${SUPER_ADMIN_BASE_PATH}/user/${encodeURIComponent(u.uid)}`}
                    className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Edit
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
