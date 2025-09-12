import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Crown, Users, Shield } from 'lucide-react';

import { Link } from 'react-router-dom';
import { getDocs, orderBy, limit, query, where, collection } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { SUPER_ADMIN_BASE_PATH } from '../../lib/constants';
import { accountsCollection } from '../../models/Collections';

type SimpleUser = {
  uid: string;
  email?: string;
  displayName?: string;
  role?: string;
  createdAt?: any;
  lastLoginAt?: any;
};

// Animated counter for KPI numbers
function CountTo({ value, duration = 800 }: { value: number | null | undefined; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);
  const to = typeof value === 'number' ? Math.max(0, Math.floor(value)) : null;

  useEffect(() => {
    if (to == null) return; // leave previous or reset handled below
    fromRef.current = 0;
    startRef.current = null;
    let raf: number;
    const step = (ts: number) => {
      if (startRef.current == null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const val = Math.round(fromRef.current + (to - fromRef.current) * eased);
      setDisplay(val);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);

  if (value == null) return <>{'—'}</>;
  return <>{display}</>;
}

export default function SuperAdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [adminCount, setAdminCount] = useState<number | null>(null);
  const [regularCount, setRegularCount] = useState<number | null>(null);
  const [recentAdmins, setRecentAdmins] = useState<SimpleUser[]>([]);
  const [recentUsers, setRecentUsers] = useState<SimpleUser[]>([]);
  const [allUsers, setAllUsers] = useState<SimpleUser[]>([]);
  const [minDelayDone, setMinDelayDone] = useState(false);
  const [adminsCreatedLast24h, setAdminsCreatedLast24h] = useState<number>(0);
  const [usersCreatedLast24h, setUsersCreatedLast24h] = useState<number>(0);
  const [adminsLoggedLast24h, setAdminsLoggedLast24h] = useState<number>(0);
  const [usersLoggedLast24h, setUsersLoggedLast24h] = useState<number>(0);
  const [chartHover, setChartHover] = useState<{ i: number; x: number; y: number; v: number } | null>(null);
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
  const [lookback, setLookback] = useState<number>(12);
  const [period, setPeriod] = useState<'day'|'week'|'month'|'year'>('month');
  const [showTotal, setShowTotal] = useState<boolean>(false);
  const [weeklyAdmin, setWeeklyAdmin] = useState<number[]>([]);
  const [weeklyUser, setWeeklyUser] = useState<number[]>([]);
  const [chartAnimate, setChartAnimate] = useState(false);
  const [lastWeekSignups, setLastWeekSignups] = useState<number>(0);
  const [totalQuotes, setTotalQuotes] = useState<number>(0);
  const [confirmedQuotes, setConfirmedQuotes] = useState<number>(0);
  // throttle refs for high-frequency move events
  const lastMoveTsRef = useRef<number>(0);

  const lookbackOptions = useMemo(() => {
    switch (period) {
      case 'day': return [7, 14, 30];
      case 'week': return [4, 8, 12, 24];
      case 'month': return [3, 6, 12];
      case 'year': return [1, 2, 3];
      default: return [12];
    }
  }, [period]);

  useEffect(() => {
    if (!lookbackOptions.includes(lookback)) {
      setLookback(lookbackOptions[0]);
    }
  }, [lookbackOptions]);

  useEffect(() => {
    // Ensure loader is visible for at least 0.5s
    const t = setTimeout(() => setMinDelayDone(true), 500);
    return () => clearTimeout(t);
  }, []);

  // Recompute buckets whenever period/lookback/users change
  useEffect(() => {
    const norm = (r?: string) => (r || '').toString().toLowerCase().replace(/[_-]+/g, ' ').trim();
    const dayMs = 24 * 60 * 60 * 1000;
    const now = new Date();
    const bucketsAdmin = Array.from({ length: lookback }, () => 0);
    const bucketsUser = Array.from({ length: lookback }, () => 0);

    const monthDiff = (a: Date, b: Date) => (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth());
    const yearDiff = (a: Date, b: Date) => a.getFullYear() - b.getFullYear();

    allUsers.forEach(u => {
      try {
        const r = norm(u.role);
        if (r !== 'admin' && r !== 'user') return;
        const dt: Date | null = u.createdAt?.toDate ? u.createdAt.toDate() : null;
        if (!dt) return;
        let diff: number;
        if (period === 'day') {
          diff = Math.floor((now.getTime() - dt.getTime()) / dayMs);
        } else if (period === 'week') {
          diff = Math.floor((now.getTime() - dt.getTime()) / (7 * dayMs));
        } else if (period === 'month') {
          diff = monthDiff(now, dt);
        } else {
          diff = yearDiff(now, dt);
        }
        if (diff >= 0 && diff < lookback) {
          const idx = (lookback - 1) - diff; // oldest at 0
          if (r === 'admin') bucketsAdmin[idx] += 1;
          if (r === 'user') bucketsUser[idx] += 1;
        }
      } catch {}
    });
    setWeeklyAdmin(bucketsAdmin);
    setWeeklyUser(bucketsUser);
  }, [allUsers, period, lookback]);

  // Trigger chart animation when data is ready
  useEffect(() => {
    if (!loading && minDelayDone) {
      const t = setTimeout(() => setChartAnimate(true), 50);
      return () => clearTimeout(t);
    }
  }, [loading, minDelayDone]);

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
        // Load all accounts ordered by CreatedAt for aggregation
        const usersSnap = await getDocs(query(accountsCollection(db), orderBy('CreatedAt', 'asc')));
        const all: SimpleUser[] = usersSnap.docs.map(d => {
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
        setAllUsers(all);

        // Normalize role string to account for variants like "Super Admin", "super_admin", etc.
        const norm = (r?: string) => (r || '').toString().toLowerCase().replace(/[_-]+/g, ' ').trim();
        const admins = all.filter(u => norm(u.role) === 'admin');
        const superAdmins = all.filter(u => norm(u.role) === 'super admin');
        const usersOnly = all.filter(u => norm(u.role) === 'user');
        const regulars = all.filter(u => norm(u.role) !== 'admin' && norm(u.role) !== 'super admin');
        // Total Users should include only accounts with role exactly 'user'
        setUserCount(usersOnly.length);
        setAdminCount(admins.length);
        setRegularCount(regulars.length);

        // Compute admins created within the last 24 hours
        try {
          const nowMs = Date.now();
          const oneDayMs = 24 * 60 * 60 * 1000;
          const recentAdminsCount = admins.reduce((acc, u) => {
            try {
              const dt: Date | null = u.createdAt?.toDate ? u.createdAt.toDate() : null;
              if (dt && (nowMs - dt.getTime()) <= oneDayMs) return acc + 1;
            } catch {}
            return acc;
          }, 0);
          setAdminsCreatedLast24h(recentAdminsCount);
        } catch {}

        // Compute users (role 'user') created within the last 24 hours
        try {
          const nowMs = Date.now();
          const oneDayMs = 24 * 60 * 60 * 1000;
          const recentUsersCount = usersOnly.reduce((acc, u) => {
            try {
              const dt: Date | null = u.createdAt?.toDate ? u.createdAt.toDate() : null;
              if (dt && (nowMs - dt.getTime()) <= oneDayMs) return acc + 1;
            } catch {}
            return acc;
          }, 0);
          setUsersCreatedLast24h(recentUsersCount);
        } catch {}

        // Compute last-24h login counts for admins and users
        try {
          const nowMs = Date.now();
          const oneDayMs = 24 * 60 * 60 * 1000;
          const recentAdminLogins = admins.reduce((acc, u) => {
            try {
              const dt: Date | null = u.lastLoginAt?.toDate ? u.lastLoginAt.toDate() : null;
              if (dt && (nowMs - dt.getTime()) <= oneDayMs) return acc + 1;
            } catch {}
            return acc;
          }, 0);
          setAdminsLoggedLast24h(recentAdminLogins);

          const recentUserLogins = usersOnly.reduce((acc, u) => {
            try {
              const dt: Date | null = u.lastLoginAt?.toDate ? u.lastLoginAt.toDate() : null;
              if (dt && (nowMs - dt.getTime()) <= oneDayMs) return acc + 1;
            } catch {}
            return acc;
          }, 0);
          setUsersLoggedLast24h(recentUserLogins);
        } catch {}

        // Compute last week signups (ISO week: Monday-Sunday). Exclude Super Admins.
        try {
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
          const norm = (r?: string) => (r || '').toString().toLowerCase().replace(/[_-]+/g, ' ').trim();
          const count = all
            .filter(u => {
              const r = norm(u.role);
              if (r === 'super admin') return false;
              const dt = toDate(u.createdAt);
              return !!dt && dt >= lastWeekStart && dt <= lastWeekEnd;
            })
            .length;
          setLastWeekSignups(count);
        } catch {}

        // Fetch quotes data for pie chart
        try {
          // Get total quotes from '/quotes' collection
          const quotesSnap = await getDocs(collection(db, 'quotes'));
          setTotalQuotes(quotesSnap.size);

          // Get confirmed quotes (status = 'confirmed') from '/quotes' collection
          const confirmedSnap = await getDocs(
            query(collection(db, 'quotes'), where('status', '==', 'confirmed'))
          );
          setConfirmedQuotes(confirmedSnap.size);
        } catch (e) {
          console.error('Failed to fetch quotes data:', e);
        }

        // Buckets computed in a separate effect based on period/lookback/users change

        // Recent logins (admins and users separately)
        const adminsSnap = await getDocs(
          query(
            accountsCollection(db),
            where('Role', '==', 'admin'),
            orderBy('LastLoginAt', 'desc'),
            limit(5)
          )
        );
        setRecentAdmins(adminsSnap.docs.map(d => {
          const data: any = d.data();
          return {
            uid: d.id,
            email: data?.Email,
            displayName: data?.FullName,
            role: data?.Role,
            createdAt: data?.CreatedAt,
            lastLoginAt: data?.LastLoginAt,
          };
        }));

        const usersSnapRecent = await getDocs(
          query(
            accountsCollection(db),
            where('Role', 'in', ['user', 'User']),
            orderBy('LastLoginAt', 'desc'),
            limit(5)
          )
        );
        setRecentUsers(usersSnapRecent.docs.map(d => {
          const data: any = d.data();
          return {
            uid: d.id,
            email: data?.Email,
            displayName: data?.FullName,
            role: data?.Role,
            createdAt: data?.CreatedAt,
            lastLoginAt: data?.LastLoginAt,
          };
        }));
      } catch {
        // keep silent but show empty state
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const maxWeekly = useMemo(() => Math.max(1, ...weeklyAdmin, ...weeklyUser), [weeklyAdmin, weeklyUser]);

  // Keep hover in sync with pin state
  useEffect(() => {
    if (pinnedIndex != null) {
      const i = Math.max(0, Math.min((weeklyAdmin.length || 1) - 1, pinnedIndex));
      const v = (weeklyAdmin[i] || 0) + (weeklyUser[i] || 0);
      setChartHover({ i, x: 0, y: 0, v }); // x,y recomputed on render/mouse move
    } else if (!pinnedIndex) {
      setChartHover(null);
    }
  }, [pinnedIndex, weeklyAdmin, weeklyUser]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-sm py-2">
        <Crown className="h-4 w-4 text-yellow-500" aria-hidden="true" />
        <span className="font-semibold text-gray-900 dark:text-white">Dashboard</span>
      </div>

      {(!minDelayDone || loading) ? (
        <>
          {/* KPI skeletons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
                <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="mt-3 h-7 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
            ))}
          </div>

          {/* Recent skeletons */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
                <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-3" />
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((__, j) => (
                    <div key={j} className="h-5 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link
              to={`${SUPER_ADMIN_BASE_PATH}/users`}
              className="block rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-500 dark:text-gray-400">Total Users</div>
                <Users className="h-5 w-5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
              </div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white"><CountTo value={userCount} /></div>
            </Link>
            <Link
              to={`${SUPER_ADMIN_BASE_PATH}/users?seg=admins`}
              className="block rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-500 dark:text-gray-400">Admins</div>
                <Shield className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              </div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white"><CountTo value={adminCount} /></div>
            </Link>
            <Link
              to={`${SUPER_ADMIN_BASE_PATH}/users?seg=users`}
              className="block rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors cursor-pointer"
            >
              <div className="text-sm text-gray-500 dark:text-gray-400">Regular Users</div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white"><CountTo value={regularCount} /></div>
            </Link>
            <Link
              to={`${SUPER_ADMIN_BASE_PATH}/users?seg=lastweek`}
              className="block rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors cursor-pointer"
            >
              <div className="text-sm text-gray-500 dark:text-gray-400">Last Week Signups</div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white"><CountTo value={lastWeekSignups} /></div>
            </Link>
          </div>
          {/* Charts Row - Pie Chart and Line Chart */}
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Quotes Status Pie Chart */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900 dark:text-white">Quotes Status</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Total: {totalQuotes}</div>
              </div>
              {(() => {
                const total = totalQuotes;
                const confirmed = confirmedQuotes;
                const pending = total - confirmed;
                
                if (total === 0) {
                  return (
                    <div className="flex items-center justify-center h-48 text-gray-500 dark:text-gray-400">
                      No quotes data available
                    </div>
                  );
                }

                const confirmedPercentage = (confirmed / total) * 100;
                const pendingPercentage = (pending / total) * 100;
                
                // SVG pie chart - smaller for side-by-side layout
                const radius = 60;
                const centerX = 90;
                const centerY = 80;
                
                // Calculate angles for pie slices
                const confirmedAngle = (confirmed / total) * 360;
                const pendingAngle = (pending / total) * 360;
                
                // Convert to radians and calculate coordinates
                const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
                
                const confirmedEndAngle = confirmedAngle;
                const pendingEndAngle = confirmedAngle + pendingAngle;
                
                const confirmedX = centerX + radius * Math.cos(toRadians(confirmedEndAngle - 90));
                const confirmedY = centerY + radius * Math.sin(toRadians(confirmedEndAngle - 90));
                
                const pendingX = centerX + radius * Math.cos(toRadians(pendingEndAngle - 90));
                const pendingY = centerY + radius * Math.sin(toRadians(pendingEndAngle - 90));
                
                const largeArcConfirmed = confirmedAngle > 180 ? 1 : 0;
                const largeArcPending = pendingAngle > 180 ? 1 : 0;
                
                const confirmedPath = `M ${centerX} ${centerY} L ${centerX} ${centerY - radius} A ${radius} ${radius} 0 ${largeArcConfirmed} 1 ${confirmedX} ${confirmedY} Z`;
                const pendingPath = `M ${centerX} ${centerY} L ${confirmedX} ${confirmedY} A ${radius} ${radius} 0 ${largeArcPending} 1 ${pendingX} ${pendingY} Z`;
                
                return (
                  <div className="space-y-4">
                    <div className="flex justify-center">
                      <svg width="180" height="160" className="flex-shrink-0">
                        {/* Confirmed quotes slice */}
                        <path
                          d={confirmedPath}
                          fill="#10b981"
                          stroke="#fff"
                          strokeWidth="2"
                        />
                        {/* Pending quotes slice */}
                        <path
                          d={pendingPath}
                          fill="#f59e0b"
                          stroke="#fff"
                          strokeWidth="2"
                        />
                      </svg>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                        <span className="text-xs text-gray-700 dark:text-gray-300">
                          Confirmed: {confirmed} ({confirmedPercentage.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                        <span className="text-xs text-gray-700 dark:text-gray-300">
                          Pending: {pending} ({pendingPercentage.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* New Users by Month chart */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900 dark:text-white">New Users by Month</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Last {lookback} months</div>
              </div>
              {(() => {
                const W = 400;
                const H = 220;
              const padL = 36, padR = 10, padT = 10, padB = 24;
              const innerW = W - padL - padR;
              const innerH = H - padT - padB;
              const data = weeklyUser && weeklyUser.length ? weeklyUser : Array.from({ length: lookback }, () => 0);
              const n = Math.max(1, data.length);
              const stepX = innerW / Math.max(1, n - 1);
              const maxY = Math.max(1, ...data);
              const pts = data.map((v, i) => {
                const x = padL + i * stepX;
                const y = padT + innerH * (1 - v / maxY);
                return [x, y] as const;
              });
              const d = pts.map(([x, y], i) => (i ? `L ${x} ${y}` : `M ${x} ${y}`)).join(' ');
              // labels oldest -> newest
              const now = new Date();
              const labels = Array.from({ length: n }, (_, i) => {
                const d2 = new Date(now);
                d2.setMonth(now.getMonth() - (n - 1 - i));
                return d2.toLocaleString(undefined, { month: 'short' });
              });
              return (
                <div className="overflow-x-auto">
                  <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-56">
                    <line x1={padL} y1={padT} x2={padL} y2={padT + innerH} stroke="currentColor" className="text-gray-300 dark:text-gray-700" />
                    <line x1={padL} y1={padT + innerH} x2={padL + innerW} y2={padT + innerH} stroke="currentColor" className="text-gray-300 dark:text-gray-700" />
                    {Array.from({ length: 4 }).map((_, i) => {
                      const y = padT + (innerH * i) / 4;
                      return (
                        <line
                          key={i}
                          x1={padL}
                          y1={y}
                          x2={padL + innerW}
                          y2={y}
                          stroke="currentColor"
                          className="text-gray-200 dark:text-gray-800"
                          strokeDasharray="3,3"
                        />
                      );
                    })}
                    <path d={d} fill="none" stroke="#14b8a6" strokeWidth={2} />
                    {pts.map(([x, y], i) => (
                      <circle key={i} cx={x} cy={y} r={3} fill="#14b8a6" />
                    ))}
                    <text x={padL - 8} y={padT + 8} textAnchor="end" className="fill-gray-500 text-[10px]">{maxY}</text>
                    {labels.map((lab, i) => (
                      <text key={i} x={padL + i * stepX} y={padT + innerH + 16} textAnchor="middle" className="fill-gray-500 text-[10px]">{lab}</text>
                    ))}
                  </svg>
                </div>
              );
            })()}
            </div>
          </div>
        </>
      )}
      {null}
    </div>
  );
}
