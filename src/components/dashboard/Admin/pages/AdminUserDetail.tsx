import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../../../../lib/firebase';
import {
  accountsCollection,
  quotesCollection,
  quoteDoc,
  userServiceRequestsCollection,
  userServiceRequestDoc,
  supportTicketsCollection,
  supportTicketDoc,
} from '../../../../models/Collections';
import { getDocs, limit, query, where, updateDoc, Timestamp } from 'firebase/firestore';

type Props = {
  email?: string | null;
  onBack?: () => void;
};

const AdminUserDetail: React.FC<Props> = ({ email: emailProp, onBack }) => {
  // In Astro page we mount directly; react-router may not manage the URL here, so use URLSearchParams
  const [email, setEmail] = useState<string | null>(emailProp ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<any | null>(null);

  // Related docs
  const [quotes, setQuotes] = useState<any[] | null>(null);
  const [services, setServices] = useState<any[] | null>(null);
  const [tickets, setTickets] = useState<any[] | null>(null);
  const [loadingRelated, setLoadingRelated] = useState(false);

  // UI: tabs and drawer
  type TabKey = 'quotes' | 'services' | 'tickets';
  const [activeTab, setActiveTab] = useState<TabKey>('quotes');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<
    | { type: TabKey; id: string; data: any }
    | null
  >(null);
  const [editStatus, setEditStatus] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Derive email either from prop or URL param if not provided
  useEffect(() => {
    if (emailProp !== undefined) {
      setEmail(emailProp ?? null);
      return;
    }
    try {
      const url = new URL(window.location.href);
      const e = url.searchParams.get('userEmail');
      setEmail(e);
    } catch {
      setEmail(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailProp]);

  useEffect(() => {
    if (!email) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const q = query(accountsCollection(db), where('Email', '==', email), limit(1));
        const snap = await getDocs(q);
        if (snap.empty) {
          if (mounted) { setError('User not found'); setAccount(null); }
        } else {
          if (mounted) setAccount({ id: snap.docs[0].id, ...snap.docs[0].data() });
        }
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Failed to load user');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [email]);

  // Load related collections by UID (Accounts doc id)
  useEffect(() => {
    if (!account?.id) return;
    let mounted = true;
    (async () => {
      setLoadingRelated(true);
      try {
        const uid: string = account.id;
        const [qSnap, sSnap, tSnap] = await Promise.all([
          getDocs(quotesCollection(db, uid)),
          getDocs(userServiceRequestsCollection(db, uid)),
          getDocs(supportTicketsCollection(db, uid)),
        ]);
        if (!mounted) return;
        setQuotes(qSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setServices(sSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setTickets(tSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch {
        if (mounted) {
          setQuotes([]);
          setServices([]);
          setTickets([]);
        }
      } finally {
        if (mounted) setLoadingRelated(false);
      }
    })();
    return () => { mounted = false; };
  }, [account?.id]);

  // Helpers
  const dateFrom = (v: any): Date | null => {
    if (!v) return null;
    try {
      if (v instanceof Timestamp) return v.toDate();
      if (typeof v === 'number') return new Date(v);
      if (typeof v === 'string') return new Date(v);
      if (v?.seconds) return new Date(v.seconds * 1000);
    } catch {}
    return null;
  };

  const fmt = (d: Date | null): string => (d ? d.toLocaleString() : '-');

  const statusBadge = (status: string | undefined) => {
    const s = (status || '').toString();
    const lower = s.toLowerCase();
    let cls = 'bg-gray-700 text-gray-100 border border-gray-600';
    if (['new', 'pending', 'submitted'].includes(lower)) cls = 'bg-amber-500/20 text-amber-300 border border-amber-500/40';
    if (['open', 'in progress', 'approved', 'ack'].includes(lower)) cls = 'bg-blue-500/20 text-blue-300 border border-blue-500/40';
    if (['resolved', 'done', 'closed'].includes(lower)) cls = 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
    return <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{s || '-'}</span>;
  };

  const lists = useMemo(() => ({ quotes: quotes || [], services: services || [], tickets: tickets || [] }), [quotes, services, tickets]);

  const openDetails = (type: TabKey, id: string, data: any) => {
    setSelected({ type, id, data });
    const current = (data?.status ?? data?.Status ?? '').toString();
    setEditStatus(current);
    setDrawerOpen(true);
  };

  const closeDetails = () => { setDrawerOpen(false); setSelected(null); };

  const statusOptionsByType: Record<TabKey, string[]> = {
    quotes: ['submitted', 'approved', 'closed'],
    services: ['new', 'open', 'ack', 'done', 'closed'],
    tickets: ['Pending', 'In Progress', 'Resolved', 'open', 'closed'],
  };

  const saveStatus = async () => {
    if (!account?.id || !selected) return;
    const uid = account.id as string;
    setSaving(true);
    try {
      if (selected.type === 'quotes') {
        const ref = quoteDoc(db, uid, selected.id);
        await updateDoc(ref as any, { status: editStatus });
        setQuotes((prev) => (prev || []).map((x) => (x.id === selected.id ? { ...x, status: editStatus } : x)));
      } else if (selected.type === 'services') {
        const ref = userServiceRequestDoc(db, uid, selected.id);
        await updateDoc(ref as any, { status: editStatus });
        setServices((prev) => (prev || []).map((x) => (x.id === selected.id ? { ...x, status: editStatus } : x)));
      } else if (selected.type === 'tickets') {
        const ref = supportTicketDoc(db, uid, selected.id);
        await updateDoc(ref as any, { status: editStatus });
        setTickets((prev) => (prev || []).map((x) => (x.id === selected.id ? { ...x, status: editStatus } : x)));
      }
      setSelected((s) => (s ? { ...s, data: { ...s.data, status: editStatus } } : s));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="p-6">
      {/* Header */}
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between px-2 md:px-0">
          <h2 className="text-lg font-semibold text-gray-100">User Details</h2>
          {onBack ? (
            <button type="button" onClick={onBack} className="text-teal-600 hover:underline">Back to Users</button>
          ) : (
            <a href="/dashboard/admin/users" className="text-teal-600 hover:underline">Back to Users</a>
          )}
        </div>
      </div>

      {/* Profile card */}
      <div className="max-w-6xl mx-auto mt-4">
        <div className="bg-gray-800/80 backdrop-blur rounded-xl shadow-lg border border-gray-700 p-6">
          {!email && <div className="text-gray-300">Missing userEmail in URL.</div>}
          {email && loading && <div className="text-gray-300">Loading...</div>}
          {error && <div className="text-red-400">{error}</div>}
          {!loading && !error && account && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-2xl font-semibold text-white">{account.FullName || '—'}</div>
                <div className="text-lg text-gray-300">{account.Email || '—'}</div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-gray-400">UID</div><div className="text-gray-100 truncate" title={account.Uid}>{account.Uid}</div>
                <div className="text-gray-400">Role</div><div className="text-gray-100">{account.Role}</div>
                <div className="text-gray-400">Status</div><div className="text-gray-100">{account.Status}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      {account?.id && (
        <div className="max-w-6xl mx-auto mt-6">
          <div className="flex gap-2 border-b border-gray-700">
            {([
              { key: 'quotes', label: `Quotes (${quotes?.length ?? 0})` },
              { key: 'services', label: `Service Requests (${services?.length ?? 0})` },
              { key: 'tickets', label: `Support Tickets (${tickets?.length ?? 0})` },
            ] as { key: TabKey; label: string }[]).map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`px-4 py-2 text-sm rounded-t-md border border-b-0 ${
                  activeTab === t.key
                    ? 'bg-gray-800 text-white border-gray-700'
                    : 'bg-gray-800/40 text-gray-300 hover:bg-gray-700/50 border-transparent'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="bg-gray-800/60 border border-gray-700 rounded-b-md rounded-tr-md p-2 md:p-4">
            {loadingRelated && <div className="text-gray-300">Loading...</div>}
            {!loadingRelated && lists[activeTab].length === 0 && (
              <div className="text-gray-300">No items.</div>
            )}

            {!loadingRelated && lists[activeTab].length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400">
                      <th className="py-2 pr-4 font-medium">ID</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 pr-4 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lists[activeTab].map((row: any) => {
                      const status = row.status ?? row.Status;
                      const created = row.createdAt ?? row.created_at ?? row.ts;
                      const isUnread = (status || '').toString().toLowerCase() === 'pending' || (status || '').toString().toLowerCase() === 'new' || (status || '').toString().toLowerCase() === 'submitted';
                      return (
                        <tr
                          key={row.id}
                          onClick={() => openDetails(activeTab, row.id, row)}
                          className={`cursor-pointer border-b border-gray-700/70 hover:bg-gray-700/40 ${isUnread ? 'font-semibold' : ''}`}
                        >
                          <td className="py-2 pr-4 text-gray-100 truncate max-w-[14rem]" title={row.id}>{row.id}</td>
                          <td className="py-2 pr-4">{statusBadge(status)}</td>
                          <td className="py-2 pr-4 text-gray-300">{fmt(dateFrom(created))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Right-side details drawer */}
      {drawerOpen && selected && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50" onClick={closeDetails} />
          <aside className="absolute right-0 top-0 h-full w-full sm:w-[28rem] bg-gray-900 border-l border-gray-700 shadow-xl p-5 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">{selected.type === 'quotes' ? 'Quote' : selected.type === 'services' ? 'Service Request' : 'Support Ticket'} Details</h3>
              <button onClick={closeDetails} className="text-gray-300 hover:text-white">✕</button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <div className="text-gray-400">Request ID</div>
                <div className="col-span-2 text-gray-100 break-all">{selected.id}</div>
                <div className="text-gray-400">User UID</div>
                <div className="col-span-2 text-gray-100 break-all">{account?.id}</div>
                <div className="text-gray-400">Created</div>
                <div className="col-span-2 text-gray-100">{fmt(dateFrom(selected.data?.createdAt ?? selected.data?.created_at ?? selected.data?.ts))}</div>
                <div className="text-gray-400">Status</div>
                <div className="col-span-2">{statusBadge(selected.data?.status ?? selected.data?.Status)}</div>
              </div>

              {/* Description/details */}
              {selected.type !== 'quotes' && selected.data?.description && (
                <div className="mt-3">
                  <div className="text-gray-400 mb-1">Description</div>
                  <div className="text-gray-100 whitespace-pre-wrap">{selected.data.description}</div>
                </div>
              )}

              {/* Edit status */}
              <div className="mt-4 border-t border-gray-700 pt-4">
                <div className="text-gray-200 font-medium mb-2">Edit Status</div>
                <div className="flex items-center gap-2">
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="bg-gray-800 text-gray-100 border border-gray-700 rounded px-3 py-2"
                  >
                    {statusOptionsByType[selected.type].map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                  <button
                    onClick={saveStatus}
                    disabled={saving}
                    className="px-4 py-2 rounded bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-60"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>

              {/* Raw payload for debugging/visibility */}
              <details className="mt-4">
                <summary className="cursor-pointer text-gray-400">Raw Data</summary>
                <pre className="mt-2 text-xs text-gray-300 bg-gray-800 p-3 rounded border border-gray-700 overflow-auto">{JSON.stringify(selected.data, null, 2)}</pre>
              </details>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
;

export default AdminUserDetail;
