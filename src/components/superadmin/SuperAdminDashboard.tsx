import React, { useEffect, useState } from 'react';
import { collection, getCountFromServer } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { SUPER_ADMIN_BASE_PATH } from '../../lib/constants';

export default function SuperAdminDashboard() {
  const [userCount, setUserCount] = useState<number | null>(null);

  useEffect(() => {
    // Guard
    try {
      const role = localStorage.getItem('userRole');
      if (role !== 'Super Admin') {
        window.location.href = '/admin_login';
        return;
      }
    } catch {}

    (async () => {
      try {
        const coll = collection(db, 'users');
        const snap = await getCountFromServer(coll);
        setUserCount(snap.data().count);
      } catch {
        setUserCount(null);
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Super Admin Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
          <div className="text-sm text-gray-500 dark:text-gray-400">Total Users</div>
          <div className="mt-1 text-2xl font-bold">{userCount ?? '—'}</div>
        </div>
      </div>
      <div>
        <a href={`${SUPER_ADMIN_BASE_PATH}/users`} className="inline-flex items-center px-4 py-2 rounded-md bg-teal-600 text-white hover:bg-teal-700">Manage Users</a>
      </div>
    </div>
  );
}
