import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, orderBy, limit, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { SUPER_ADMIN_BASE_PATH } from '../../lib/constants';

type SimpleUser = {
  uid: string;
  email?: string;
  displayName?: string;
  role?: string;
  createdAt?: any;
  lastLoginAt?: any;
};

export default function SuperAdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [adminCount, setAdminCount] = useState<number | null>(null);
  const [regularCount, setRegularCount] = useState<number | null>(null);
  const [weekly, setWeekly] = useState<number[]>([]); // last 12 weeks signups
  const [recentAdmins, setRecentAdmins] = useState<SimpleUser[]>([]);
  const [recentUsers, setRecentUsers] = useState<SimpleUser[]>([]);

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
      setLoading(true);
      try {
        // Load all users ordered by createdAt for aggregation
        const usersSnap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'asc')));
        const all: SimpleUser[] = usersSnap.docs.map(d => ({ uid: d.id, ...(d.data() as any) }));

        const admins = all.filter(u => (u.role || '').toLowerCase() === 'admin');
        const regulars = all.filter(u => (u.role || '').toLowerCase() !== 'admin' && (u.role || '').toLowerCase() !== 'super admin');
        setUserCount(all.length);
        setAdminCount(admins.length);
        setRegularCount(regulars.length);

        // Build last 12 weeks buckets by createdAt
        const now = new Date();
        const weeks: number[] = Array.from({ length: 12 }, () => 0);
        all.forEach(u => {
          try {
            const dt: Date | null = u.createdAt?.toDate ? u.createdAt.toDate() : null;
            if (!dt) return;
            const diffMs = now.getTime() - dt.getTime();
            const weekIndex = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
            if (weekIndex >= 0 && weekIndex < 12) {
              weeks[11 - weekIndex] += 1; // oldest at index 0, newest at 11
            }
          } catch {}
        });
        setWeekly(weeks);

        // Recent logins (admins and users separately)
        const adminsSnap = await getDocs(
          query(
            collection(db, 'users'),
            where('role', '==', 'admin'),
            orderBy('lastLoginAt', 'desc'),
            limit(5)
          )
        );
        setRecentAdmins(adminsSnap.docs.map(d => ({ uid: d.id, ...(d.data() as any) })));

        const usersSnapRecent = await getDocs(
          query(
            collection(db, 'users'),
            where('role', 'in', ['user', 'User']),
            orderBy('lastLoginAt', 'desc'),
            limit(5)
          )
        );
        setRecentUsers(usersSnapRecent.docs.map(d => ({ uid: d.id, ...(d.data() as any) })));
      } catch {
        // keep silent but show empty state
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const maxWeekly = useMemo(() => Math.max(1, ...weekly), [weekly]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Super Admin Dashboard</h1>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
          <div className="text-sm text-gray-500 dark:text-gray-400">Total Users</div>
          <div className="mt-1 text-2xl font-bold">{loading ? '…' : userCount ?? '—'}</div>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
          <div className="text-sm text-gray-500 dark:text-gray-400">Admins</div>
          <div className="mt-1 text-2xl font-bold">{loading ? '…' : adminCount ?? '—'}</div>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
          <div className="text-sm text-gray-500 dark:text-gray-400">Regular Users</div>
          <div className="mt-1 text-2xl font-bold">{loading ? '…' : regularCount ?? '—'}</div>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
          <div className="text-sm text-gray-500 dark:text-gray-400">Manage</div>
          <div className="mt-1">
            <Link to={`${SUPER_ADMIN_BASE_PATH}/users`} className="inline-flex items-center px-3 py-1.5 rounded-md bg-teal-600 text-white hover:bg-teal-700 text-sm">Users</Link>
          </div>
        </div>
      </div>

      {/* Weekly signups chart (last 12 weeks) */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Signups (12 weeks)</h2>
        </div>
        <div className="h-32 flex items-end gap-1">
          {weekly.map((v, idx) => {
            const height = Math.round((v / maxWeekly) * 100);
            return (
              <div key={idx} className="flex-1 bg-teal-500/70 dark:bg-teal-400/70 rounded-sm" style={{ height: `${Math.max(4, height)}%` }} title={`Week ${idx + 1}: ${v}`} />
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-xs text-gray-500">
          <span>Old</span>
          <span>New</span>
        </div>
      </div>

      {/* Recent logins */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
          <h2 className="text-lg font-semibold mb-2">Recent Admin Logins</h2>
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {(recentAdmins.length === 0 ? [{ uid: 'empty', displayName: '—', email: 'No records', lastLoginAt: null }] : recentAdmins).map((u) => (
              <li key={u.uid} className="py-2 flex items-center justify-between">
                <div>
                  <div className="font-medium">{u.displayName || '—'}</div>
                  <div className="text-sm text-gray-500">{u.email || '—'}</div>
                </div>
                <div className="text-sm text-gray-500">
                  {(() => { try { return u.lastLoginAt?.toDate ? u.lastLoginAt.toDate().toLocaleString() : '—'; } catch { return '—'; } })()}
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
          <h2 className="text-lg font-semibold mb-2">Recent User Logins</h2>
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {(recentUsers.length === 0 ? [{ uid: 'empty', displayName: '—', email: 'No records', lastLoginAt: null }] : recentUsers).map((u) => (
              <li key={u.uid} className="py-2 flex items-center justify-between">
                <div>
                  <div className="font-medium">{u.displayName || '—'}</div>
                  <div className="text-sm text-gray-500">{u.email || '—'}</div>
                </div>
                <div className="text-sm text-gray-500">
                  {(() => { try { return u.lastLoginAt?.toDate ? u.lastLoginAt.toDate().toLocaleString() : '—'; } catch { return '—'; } })()}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
