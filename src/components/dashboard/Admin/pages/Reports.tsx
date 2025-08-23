import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../../../../lib/firebase';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from 'recharts';

type ServiceRequest = {
  id: string;
  createdAt?: any;
  status?: string;
  type?: string;
};

const COLORS = ['#10b981', '#60a5fa', '#f59e0b', '#ef4444', '#a78bfa', '#34d399'];

const Reports: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load data from Firestore with localStorage fallback
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const q = query(collection(db, 'service_requests'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        if (cancelled) return;
        const list: ServiceRequest[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        setRequests(list);
        try { localStorage.setItem('service_requests', JSON.stringify(list)); } catch {}
      } catch (e) {
        try {
          const raw = localStorage.getItem('service_requests');
          const list = raw ? JSON.parse(raw) : [];
          setRequests(Array.isArray(list) ? list : []);
          setError('Live data unavailable; showing cached data.');
        } catch {
          setRequests([]);
          setError('No data available.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Helpers
  const toDateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const toDate = (v: any): Date | null => {
    if (!v) return null;
    // Firestore Timestamp
    if (v && typeof v.toDate === 'function') return v.toDate();
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };

  // Build last 14 days line series from requests
  const requestsPerDay = useMemo(() => {
    const now = new Date();
    const days: { date: string; count: number }[] = [];
    const counts: Record<string, number> = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      counts[toDateKey(d)] = 0;
    }
    for (const r of requests) {
      const d = toDate(r.createdAt);
      if (!d) continue;
      const key = toDateKey(d);
      if (key in counts) counts[key] += 1;
    }
    for (const key of Object.keys(counts)) {
      days.push({ date: key.slice(5), count: counts[key] });
    }
    // Keep chronological
    days.sort((a, b) => a.date.localeCompare(b.date));
    return days;
  }, [requests]);

  // Status distribution pie
  const statusPie = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of requests) {
      const s = (r.status || 'unknown').toLowerCase();
      map[s] = (map[s] || 0) + 1;
    }
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [requests]);

  // Type bar chart
  const typeBars = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of requests) {
      const t = (r.type || 'other').toLowerCase();
      map[t] = (map[t] || 0) + 1;
    }
    return Object.entries(map).map(([type, count]) => ({ type, count }));
  }, [requests]);

  return (
    <section className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-white">Reports</h1>

      {error && (
        <div className="rounded-md border border-yellow-700/40 bg-yellow-900/20 text-yellow-300 px-3 py-2 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 text-gray-300">Loading charts…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Requests per day */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
            <div className="text-sm text-gray-300 mb-2 font-medium">Requests (last 14 days)</div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={requestsPerDay} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" stroke="#9CA3AF" />
                  <YAxis allowDecimals={false} stroke="#9CA3AF" />
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151' }} />
                  <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Status distribution */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
            <div className="text-sm text-gray-300 mb-2 font-medium">Status distribution</div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {statusPie.map((_, i) => (
                      <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151' }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Type breakdown */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 lg:col-span-2">
            <div className="text-sm text-gray-300 mb-2 font-medium">Request types</div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={typeBars} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="type" stroke="#9CA3AF" />
                  <YAxis allowDecimals={false} stroke="#9CA3AF" />
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151' }} />
                  <Bar dataKey="count" fill="#60a5fa" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default Reports;
