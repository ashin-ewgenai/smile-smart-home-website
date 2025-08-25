import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDocs, orderBy, limit, query, where } from 'firebase/firestore';
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
  const [period, setPeriod] = useState<'day'|'week'|'month'|'year'>('week');
  const [showTotal, setShowTotal] = useState<boolean>(false);
  const [weeklyAdmin, setWeeklyAdmin] = useState<number[]>([]);
  const [weeklyUser, setWeeklyUser] = useState<number[]>([]);
  const [chartAnimate, setChartAnimate] = useState(false);
  const [lastWeekSignups, setLastWeekSignups] = useState<number>(0);
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
        // Total Users should exclude Super Admin accounts
        setUserCount(all.length - superAdmins.length);
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
      <div className="flex items-center gap-2 text-sm py-2">
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
              <div className="text-sm text-gray-500 dark:text-gray-400">Total Users</div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{userCount ?? '—'}</div>
            </Link>
            <Link
              to={`${SUPER_ADMIN_BASE_PATH}/users?seg=admins`}
              className="block rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors cursor-pointer"
            >
              <div className="text-sm text-gray-500 dark:text-gray-400">Admins</div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{adminCount ?? '—'}</div>
            </Link>
            <Link
              to={`${SUPER_ADMIN_BASE_PATH}/users?seg=users`}
              className="block rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors cursor-pointer"
            >
              <div className="text-sm text-gray-500 dark:text-gray-400">Regular Users</div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{regularCount ?? '—'}</div>
            </Link>
            <Link
              to={`${SUPER_ADMIN_BASE_PATH}/users?seg=lastweek`}
              className="block rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors cursor-pointer"
            >
              <div className="text-sm text-gray-500 dark:text-gray-400">Last Week Signups</div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{lastWeekSignups}</div>
            </Link>
          </div>

          
        </>
      )}
      {(!minDelayDone || loading) ? null : (
        <>
          {/* Weekly signups chart (last 12 weeks) - Dual series line graph */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold">Signups by {period === 'day' ? 'Day' : period === 'week' ? 'Week' : period === 'month' ? 'Month' : 'Year'} ({lookback})</h2>
              <div className="flex items-center gap-3 text-sm">
                <label className="inline-flex items-center gap-2">
                  <span className="text-gray-600 dark:text-gray-300">Period</span>
                  <select value={period} onChange={(e) => setPeriod(e.target.value as any)} className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white text-gray-800 dark:bg-gray-800 dark:text-gray-200">
                    <option value="day">Day</option>
                    <option value="week">Week</option>
                    <option value="month">Month</option>
                    <option value="year">Year</option>
                  </select>
                </label>
                <label className="inline-flex items-center gap-2">
                  <span className="text-gray-600 dark:text-gray-300">Lookback</span>
                  <select value={lookback} onChange={(e) => setLookback(parseInt(e.target.value))} className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white text-gray-800 dark:bg-gray-800 dark:text-gray-200">
                    {lookbackOptions.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>
              </div>
            </div>
            {(() => {
              const w = 640; // viewBox width
              const h = 200; // viewBox height
              const padL = 28; // left for y-axis ticks
              const padR = 12;
              const padT = 16;
              const padB = 24; // bottom for x-axis labels
              const innerW = w - padL - padR;
              const innerH = h - padT - padB;
              const n = Math.max(weeklyAdmin.length, weeklyUser.length, lookback);
              const stepX = n > 1 ? innerW / (n - 1) : 0;

              const toX = (i: number) => padL + i * stepX;
              const toY = (v: number) => {
                const ratio = maxWeekly > 0 ? v / maxWeekly : 0;
                return padT + (1 - ratio) * innerH;
              };

              const ptsAdmin = weeklyAdmin.map((v, i) => ({ x: toX(i), y: toY(v), v }));
              const ptsUser = weeklyUser.map((v, i) => ({ x: toX(i), y: toY(v), v }));
              const totalSeries = Array.from({ length: n }, (_, i) => (weeklyAdmin[i] || 0) + (weeklyUser[i] || 0));
              const ptsTotal = totalSeries.map((v, i) => ({ x: toX(i), y: toY(v), v }));

              // Catmull-Rom to Bezier for smooth curve
              const curve = (p: {x:number;y:number}[], tension = 0.2) => {
                if (p.length < 2) return '';
                let d = `M ${p[0].x} ${p[0].y}`;
                for (let i = 0; i < p.length - 1; i++) {
                  const p0 = p[i - 1] || p[i];
                  const p1 = p[i];
                  const p2 = p[i + 1];
                  const p3 = p[i + 2] || p[i + 1];
                  const cp1x = p1.x + (p2.x - p0.x) * tension / 6;
                  const cp1y = p1.y + (p2.y - p0.y) * tension / 6;
                  const cp2x = p2.x - (p3.x - p1.x) * tension / 6;
                  const cp2y = p2.y - (p3.y - p1.y) * tension / 6;
                  d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
                }
                return d;
              };

              const pathAdmin = curve(ptsAdmin);
              const pathUser = curve(ptsUser);
              const pathTotal = curve(ptsTotal);

              // Area path down to baseline
              const areaD = '';

              // y-axis ticks: 0, mid, max
              const ticks = [0, Math.ceil(maxWeekly / 2), maxWeekly];

              return (
                <div className="w-full">
                  <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-48">
                    <defs>
                      <linearGradient id="gradLine" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="rgb(13 148 136)" />
                        <stop offset="100%" stopColor="rgb(45 212 191)" />
                      </linearGradient>
                      <linearGradient id="gradArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgb(13 148 136)" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="rgb(13 148 136)" stopOpacity="0" />
                      </linearGradient>
                      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="rgba(13,148,136,0.4)" />
                      </filter>
                    </defs>

                    {/* Gridlines */}
                    {Array.from({ length: 4 }).map((_, i) => {
                      const y = padT + (innerH / 3) * i;
                      return (
                        <line key={i} x1={padL} y1={y} x2={w - padR} y2={y} className="stroke-gray-200 dark:stroke-gray-700" strokeWidth={1} />
                      );
                    })}
                    {/* Vertical gridlines */}
                    {Array.from({ length: n }).map((_, i) => (
                      <line key={`v-${i}`} x1={toX(i)} y1={padT} x2={toX(i)} y2={padT + innerH} className="stroke-gray-100 dark:stroke-gray-800" strokeWidth={1} />
                    ))}

                    {/* Lines with gradient stroke + subtle shadow and animation */}
                    {pathAdmin && (
                      <path d={pathAdmin} fill="none" stroke="rgb(234 179 8)" strokeWidth={3} filter="url(#shadow)" strokeLinejoin="round" strokeLinecap="round"
                        pathLength={1} strokeDasharray={1} strokeDashoffset={chartAnimate ? 0 : 1} style={{ transition: 'stroke-dashoffset 800ms ease 80ms' }} />
                    )}
                    {pathUser && (
                      <path d={pathUser} fill="none" stroke="rgb(99 102 241)" strokeWidth={3} filter="url(#shadow)" strokeLinejoin="round" strokeLinecap="round"
                        pathLength={1} strokeDasharray={1} strokeDashoffset={chartAnimate ? 0 : 1} style={{ transition: 'stroke-dashoffset 900ms ease 140ms' }} />
                    )}
                    {showTotal && pathTotal && (
                      <path d={pathTotal} fill="none" stroke="url(#gradLine)" strokeWidth={2} strokeDasharray="4 3" opacity={0.9} />
                    )}
                    {/* Points */}
                    {ptsAdmin.map((p, i) => (
                      <g key={`a-${i}`}>
                        <circle cx={p.x} cy={p.y} r={3.5} className="fill-amber-500 dark:fill-amber-400" />
                        <title>{`Week ${i + 1} (Admin): ${p.v}`}</title>
                        {chartHover?.i === i && (
                          <text x={p.x + 6} y={p.y - 6} className="fill-amber-500 text-[10px] transition-opacity" style={{opacity: 1}}>{p.v}</text>
                        )}
                      </g>
                    ))}
                    {ptsUser.map((p, i) => (
                      <g key={`u-${i}`}>
                        <circle cx={p.x} cy={p.y} r={3.5} className="fill-indigo-500" />
                        <title>{`Week ${i + 1} (User): ${p.v}`}</title>
                        {chartHover?.i === i && (
                          <text x={p.x + 6} y={p.y - 6} className="fill-indigo-500 text-[10px] transition-opacity" style={{opacity: 1}}>{p.v}</text>
                        )}
                      </g>
                    ))}
                    {showTotal && ptsTotal.map((p, i) => (
                      <g key={`t-${i}`}>
                        {chartHover?.i === i && (
                          <text x={p.x + 6} y={p.y - 6} className="fill-amber-500 text-[10px] transition-opacity" style={{opacity: 1}}>{p.v}</text>
                        )}
                      </g>
                    ))}

                    {/* Hover guides and tooltip */}
                    {chartHover && (
                      <g>
                        {/* Vertical guide line */}
                        <line x1={chartHover.x} y1={padT} x2={chartHover.x} y2={padT + innerH} className="stroke-teal-500/40" strokeWidth={1} />
                        {/* Highlight points for both series */}
                        <circle cx={toX(chartHover.i)} cy={toY(weeklyAdmin[chartHover.i])} r={5} className="fill-black dark:fill-white" />
                        <circle cx={toX(chartHover.i)} cy={toY(weeklyAdmin[chartHover.i])} r={4} className="fill-amber-400" />
                        <circle cx={toX(chartHover.i)} cy={toY(weeklyUser[chartHover.i])} r={5} className="fill-black dark:fill-white" />
                        <circle cx={toX(chartHover.i)} cy={toY(weeklyUser[chartHover.i])} r={4} className="fill-indigo-400" />
                        {/* Tooltip */}
                        {(() => {
                          const tipW = 160;
                          const tipH = 56;
                          const offset = 10;
                          const px = toX(chartHover.i);
                          const py = Math.min(toY(weeklyAdmin[chartHover.i]), toY(weeklyUser[chartHover.i]));
                          let tx = px + offset;
                          let ty = py - tipH - 8;
                          if (tx + tipW > w - padR) tx = chartHover.x - tipW - offset;
                          if (ty < padT) ty = Math.max(py + 8, padT + 8);

                          // Build period-based date range labels. Index i -> diff = (lookback-1) - i
                          const i = chartHover.i;
                          const diff = (lookback - 1) - i;
                          const oneDayMs = 24 * 60 * 60 * 1000;
                          const nowD = new Date();
                          const fmtDay = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                          const fmtMonth = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
                          const fmtYear = (d: Date) => d.getFullYear().toString();

                          let titleLabel = '';
                          let range = '';
                          if (period === 'day') {
                            const endMs = Date.now() - diff * oneDayMs;
                            titleLabel = `Day ${i + 1}`;
                            range = fmtDay(endMs);
                          } else if (period === 'week') {
                            const endMs = Date.now() - diff * 7 * oneDayMs;
                            const startMs = endMs - 6 * oneDayMs;
                            titleLabel = `Week ${i + 1}`;
                            range = `${fmtDay(startMs)} - ${fmtDay(endMs)}`;
                          } else if (period === 'month') {
                            const end = new Date(nowD.getFullYear(), nowD.getMonth(), 1);
                            end.setMonth(end.getMonth() - diff + 1);
                            end.setDate(0); // last day of target month
                            const start = new Date(end.getFullYear(), end.getMonth(), 1);
                            titleLabel = `Month ${i + 1}`;
                            range = fmtMonth(start);
                          } else {
                            const year = nowD.getFullYear() - diff;
                            titleLabel = `Year ${i + 1}`;
                            range = fmtYear(new Date(year, 0, 1));
                          }
                          const a = weeklyAdmin[i] || 0;
                          const u = weeklyUser[i] || 0;
                          const total = a + u;
                          return (
                            <g>
                              <rect x={tx} y={ty} width={tipW} height={tipH} rx={6} ry={6} className="fill-gray-900/90 dark:fill-gray-800/90" />
                              <text x={tx + 8} y={ty + 16} className="fill-white text-[10px]">{`${titleLabel} (${range})`}</text>
                              <text x={tx + 8} y={ty + 30} className="text-[11px]">
                                <tspan fill="#ffffff">Admin: </tspan>
                                <tspan fill="#fbbf24" fontWeight="600">{a}</tspan>
                              </text>
                              <text x={tx + 80} y={ty + 30} className="text-[11px]">
                                <tspan fill="#ffffff">User: </tspan>
                                <tspan fill="#a5b4fc" fontWeight="600">{u}</tspan>
                              </text>
                              <text x={tx + 8} y={ty + 44} className="fill-gray-300 text-[10px]">{`Total: ${total}`}</text>
                            </g>
                          );
                        })()}
                      </g>
                    )}

                    {/* Mouse capture overlay */}
                    <rect
                      x={padL}
                      y={padT}
                      width={innerW}
                      height={innerH}
                      fill="transparent"
                      onPointerMove={(e) => {
                        const now = performance.now();
                        if (now - (lastMoveTsRef.current || 0) < 16) return; // ~60fps throttle
                        lastMoveTsRef.current = now;
                        const svg = (e.currentTarget as SVGRectElement).ownerSVGElement;
                        if (!svg) return;
                        const ctm = svg.getScreenCTM();
                        if (!ctm) return;
                        const pt = svg.createSVGPoint();
                        pt.x = e.clientX;
                        pt.y = e.clientY;
                        const sp = pt.matrixTransform(ctm.inverse());
                        const x = sp.x;
                        const clampedX = Math.max(padL, Math.min(padL + innerW, x));
                        const idx = stepX > 0 ? Math.round((clampedX - padL) / stepX) : 0;
                        const i = Math.max(0, Math.min(n - 1, idx));
                        setChartHover({ i, x: toX(i), y: toY(Math.max(weeklyAdmin[i] || 0, weeklyUser[i] || 0)), v: (weeklyAdmin[i] || 0) + (weeklyUser[i] || 0) });
                      }}
                      onPointerDown={(e) => {
                        const svg = (e.currentTarget as SVGRectElement).ownerSVGElement;
                        if (!svg) return;
                        const ctm = svg.getScreenCTM();
                        if (!ctm) return;
                        const pt = svg.createSVGPoint();
                        pt.x = e.clientX;
                        pt.y = e.clientY;
                        const sp = pt.matrixTransform(ctm.inverse());
                        const x = sp.x;
                        const clampedX = Math.max(padL, Math.min(padL + innerW, x));
                        const idx = stepX > 0 ? Math.round((clampedX - padL) / stepX) : 0;
                        const i = Math.max(0, Math.min(n - 1, idx));
                        setPinnedIndex(prev => prev === i ? null : i);
                        setChartHover({ i, x: toX(i), y: toY(Math.max(weeklyAdmin[i] || 0, weeklyUser[i] || 0)), v: (weeklyAdmin[i] || 0) + (weeklyUser[i] || 0) });
                      }}
                      onPointerLeave={() => { if (pinnedIndex == null) setChartHover(null); }}
                      onMouseMove={(e) => {
                        const svg = (e.currentTarget as SVGRectElement).ownerSVGElement;
                        if (!svg) return;
                        const ctm = svg.getScreenCTM();
                        if (!ctm) return;
                        const pt = svg.createSVGPoint();
                        pt.x = e.clientX;
                        pt.y = e.clientY;
                        const sp = pt.matrixTransform(ctm.inverse());
                        const x = sp.x; // SVG viewBox space
                        const clampedX = Math.max(padL, Math.min(padL + innerW, x));
                        const idx = stepX > 0 ? Math.round((clampedX - padL) / stepX) : 0;
                        const i = Math.max(0, Math.min(n - 1, idx));
                        setChartHover({ i, x: toX(i), y: toY(Math.max(weeklyAdmin[i] || 0, weeklyUser[i] || 0)), v: (weeklyAdmin[i] || 0) + (weeklyUser[i] || 0) });
                      }}
                      onMouseLeave={() => { if (pinnedIndex == null) setChartHover(null); }}
                      onClick={(e) => {
                        const svg = (e.currentTarget as SVGRectElement).ownerSVGElement;
                        if (!svg) return;
                        const ctm = svg.getScreenCTM();
                        if (!ctm) return;
                        const pt = svg.createSVGPoint();
                        pt.x = e.clientX;
                        pt.y = e.clientY;
                        const sp = pt.matrixTransform(ctm.inverse());
                        const x = sp.x; // SVG viewBox space
                        const clampedX = Math.max(padL, Math.min(padL + innerW, x));
                        const idx = stepX > 0 ? Math.round((clampedX - padL) / stepX) : 0;
                        const i = Math.max(0, Math.min(n - 1, idx));
                        setPinnedIndex(prev => prev === i ? null : i);
                        // also set hover so guide aligns immediately
                        setChartHover({ i, x: toX(i), y: toY(Math.max(weeklyAdmin[i] || 0, weeklyUser[i] || 0)), v: (weeklyAdmin[i] || 0) + (weeklyUser[i] || 0) });
                      }}
                    />

                    {/* Y-axis ticks */}
                    {ticks.map((t, i) => (
                      <g key={`t-${i}`}> 
                        <text x={padL - 6} y={toY(t) + 4} textAnchor="end" className="fill-gray-500 dark:fill-gray-400 text-[10px]">{t}</text>
                      </g>
                    ))}

                    {/* X-axis labels per selected period */}
                    {(() => {
                      const oneDayMs = 24 * 60 * 60 * 1000;
                      const nowD = new Date();
                      const fmtDay = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                      const monthLabel = (d: Date) => d.toLocaleDateString(undefined, { month: 'short' });
                      const isoWeek = (d: Date) => {
                        const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
                        const dayNum = date.getUTCDay() || 7;
                        date.setUTCDate(date.getUTCDate() + 4 - dayNum);
                        const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
                        const weekNo = Math.ceil((((date as any) - (yearStart as any)) / 86400000 + 1) / 7);
                        return weekNo;
                      };
                      return Array.from({ length: n }).map((_, i) => {
                        const diff = (lookback - 1) - i;
                        let label = '';
                        if (period === 'day') {
                          const endMs = Date.now() - diff * oneDayMs;
                          label = fmtDay(endMs);
                        } else if (period === 'week') {
                          const end = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate());
                          end.setDate(end.getDate() - diff * 7);
                          label = `Wk ${isoWeek(end)}`;
                        } else if (period === 'month') {
                          const d = new Date(nowD.getFullYear(), nowD.getMonth(), 1);
                          d.setMonth(d.getMonth() - diff);
                          label = monthLabel(d);
                        } else {
                          const year = nowD.getFullYear() - diff;
                          label = String(year);
                        }
                        return (
                          <text key={`x-${i}`} x={toX(i)} y={h - 6} textAnchor="middle" className="fill-gray-400 text-[10px]">
                            {label}
                          </text>
                        );
                      });
                    })()}
                  </svg>
                </div>
              );
            })()}
            
          </div>

          {/* Recent users/admins */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link to={`${SUPER_ADMIN_BASE_PATH}/users?seg=admins24h`} className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors block">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-semibold">Recent Admins <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">(Last 24 Hours)</span></div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">{adminsCreatedLast24h}</span>
              </div>
              <ul className="space-y-2 text-sm">
                {recentAdmins.map((u) => (
                  <li key={u.uid} className="flex items-center justify-between">
                    <span className="truncate">{u.displayName || u.email || '—'}</span>
                    <Link to={`${SUPER_ADMIN_BASE_PATH}/user/${encodeURIComponent(u.uid)}?seg=admins24h`} className="text-teal-600 hover:underline">View</Link>
                  </li>
                ))}
              </ul>
            </Link>
            <Link to={`${SUPER_ADMIN_BASE_PATH}/users?seg=users24h`} className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors block">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-semibold">Recent Users <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">(Last 24 Hours)</span></div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300">{usersCreatedLast24h}</span>
              </div>
              <ul className="space-y-2 text-sm">
                {recentUsers.map((u) => (
                  <li key={u.uid} className="flex items-center justify-between">
                    <span className="truncate">{u.displayName || u.email || '—'}</span>
                    <Link to={`${SUPER_ADMIN_BASE_PATH}/user/${encodeURIComponent(u.uid)}?seg=users24h`} className="text-teal-600 hover:underline">View</Link>
                  </li>
                ))}
              </ul>
            </Link>
          </div>

          {/* Recent logins */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Link to={`${SUPER_ADMIN_BASE_PATH}/users?seg=adminlogins12h`} className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors block">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Recent Admin Logins</h2>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">{adminsLoggedLast24h}</span>
              </div>
              {recentAdmins.length > 0 && (
                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                  {recentAdmins.map((u) => (
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
              )}
            </Link>
            <Link to={`${SUPER_ADMIN_BASE_PATH}/users?seg=userlogins12h`} className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors block">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Recent User Logins</h2>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300">{usersLoggedLast24h}</span>
              </div>
              {recentUsers.length > 0 && (
                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                  {recentUsers.map((u) => (
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
              )}
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
