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
import { getDocs, getDoc, limit, query, where, updateDoc, doc, Timestamp, collection, onSnapshot } from 'firebase/firestore';
import DeviceDetailsModal from '../components/DeviceDetailsModal';
import AddDeviceModal from '../components/AddDeviceModal';

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
  type TabKey = 'quotes' | 'services' | 'tickets' | 'devices';
  const [activeTab, setActiveTab] = useState<TabKey>('quotes');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<
    | { type: TabKey; id: string; data: any }
    | null
  >(null);
  const [editStatus, setEditStatus] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [estimation, setEstimation] = useState<any | null>(null);

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
    let unsubscribe: () => void;

    const fetchAccount = async () => {
      setLoading(true);
      setError(null);
      try {
        const q = query(accountsCollection(db), where('Email', '==', email), limit(1));
        const querySnapshot = onSnapshot(q, 
          (snap) => {
            if (!mounted) return;
            if (snap.empty) {
              setError('User not found');
              setAccount(null);
            } else {
              setAccount({ id: snap.docs[0].id, ...snap.docs[0].data() });
            }
            setLoading(false);
          },
          (err: Error) => {
            if (!mounted) return;
            console.error('Error fetching account:', err);
            setError('Error loading user data');
            setLoading(false);
          }
        );
        unsubscribe = querySnapshot;
      } catch (e: any) {
        if (mounted) {
          setError(e?.message || 'Failed to load user');
          setLoading(false);
        }
      }
    };

    fetchAccount();
    
    return () => {
      mounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [email]);

  // Load estimation details when a quote is selected (top-level hook)
  useEffect(() => {
    const loadEstimation = async () => {
      if (!selected || selected.type !== 'quotes') { setEstimation(null); return; }
      try {
        const candidates: (string | null)[] = [];
        if (selected.data?.quoteId) candidates.push(selected.data.quoteId);
        // Sometimes the estimation doc id is `Q-<timestamp>` and the quote's own id is not the same.
        // We try constructing `Q-<selected.id>` only if it already looks like `Q-...`.
        if (typeof selected.id === 'string' && selected.id.startsWith('Q-')) {
          candidates.push(selected.id);
        } else {
          candidates.push(`Q-${selected.id}`);
        }

        let found: any | null = null;
        for (const id of candidates) {
          if (!id) continue;
          try {
            const ref = doc(db, 'Estimation Quote', id);
            const snap = await getDoc(ref);
            if (snap.exists()) { found = { id: snap.id, ...snap.data() }; break; }
          } catch {}
        }

        // Fallback: search by originalQuoteId field
        if (!found) {
          try {
            const col = collection(db, 'Estimation Quote');
            const qs = await getDocs(query(col, where('originalQuoteId', '==', selected.id), limit(1)));
            if (!qs.empty) {
              const d = qs.docs[0];
              found = { id: d.id, ...d.data() };
            }
          } catch {}
        }

        setEstimation(found);
      } catch (e) {
        console.warn('Failed to load estimation:', e);
        setEstimation(null);
      }
    };
    loadEstimation();
  }, [selected]);

  // Fetch devices when account changes
  useEffect(() => {
    if (!account?.id) return;
    
    const fetchDevices = async () => {
      try {
        // Get user's devices
        const userDevicesSnapshot = await getDocs(collection(db, 'userdevices', account.id, 'devices'));
        
        // Process each device to get details from the main Devices collection
        const devicesPromises = userDevicesSnapshot.docs.map(async (deviceDoc) => {
          const deviceData = deviceDoc.data();
          try {
            // Get device details from main Devices collection
            const deviceDetailsSnapshot = await getDoc(doc(db, 'Devices', deviceDoc.id));
            if (deviceDetailsSnapshot.exists()) {
              const deviceDetails = deviceDetailsSnapshot.data() as {
                deviceName?: string;
                type?: string;
                modelNumber?: string;
                brand?: string;
                description?: string;
                status?: string;
              };
              
              return {
                id: deviceDoc.id,
                deviceName: deviceDetails.deviceName || 'Unnamed Device',
                type: deviceDetails.type || 'Unknown',
                modelNumber: deviceDetails.modelNumber || '-',
                brand: deviceDetails.brand || '-',
                description: deviceDetails.description || '',
                status: deviceDetails.status || 'Active',
                ...deviceData, // This will include isOnline, lastActiveAt, etc.
                lastActiveAt: (deviceData.lastActiveAt as any)?.toDate?.() || null
              } as const;
            }
          } catch (error) {
            console.error(`Error fetching device ${deviceDoc.id}:`, error);
          }
          
          // Fallback to basic data if device details can't be fetched
          return {
            id: deviceDoc.id,
            deviceName: 'Unnamed Device',
            type: 'Unknown',
            ...deviceData,
            lastActiveAt: (deviceData.lastActiveAt as any)?.toDate?.() || null
          } as const;
        });

        // Wait for all device details to be fetched
        const devicesWithDetails = (await Promise.all(devicesPromises)).filter(Boolean);
        setDevices(devicesWithDetails);
      } catch (error) {
        console.error('Error in fetchDevices:', error);
      }
    };

    // Set up real-time listener for device changes
    const unsubscribe = onSnapshot(
      collection(db, 'userdevices', account.id, 'devices'),
      () => fetchDevices(),
      (error) => {
        console.error('Error in devices snapshot:', error);
      }
    );

    // Initial fetch
    fetchDevices();

    return () => unsubscribe();
  }, [account?.id]);

  useEffect(() => {
    if (!account?.id) return;
    let mounted = true;
    (async () => {
      setLoadingRelated(true);
      try {
        const uid: string = account.id;
        // Fetch nested collections (primary)
        const [qSnapNested, sSnap, tSnap] = await Promise.all([
          getDocs(quotesCollection(db, uid)),
          getDocs(userServiceRequestsCollection(db, uid)),
          getDocs(supportTicketsCollection(db, uid)),
        ]);

        // Also support a flat quotes collection that stores user UID in a field
        // e.g., collection 'quotes' with field 'userUid' or 'uid'
        let flatQuotes: any[] = [];
        try {
          const flatCol = collection(db, 'quotes');
          const [byUserUid, byUid] = await Promise.all([
            getDocs(query(flatCol, where('userUid', '==', uid))),
            getDocs(query(flatCol, where('uid', '==', uid))),
          ]);
          // Prefer 'userUid' results; if empty, use 'uid'
          const chosen = byUserUid.size > 0 ? byUserUid : byUid;
          flatQuotes = chosen.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch {}

        if (!mounted) return;
        const nestedQuotes = qSnapNested.docs.map(d => ({ id: d.id, ...d.data() }));
        // Merge nested + flat (IDs are distinct across roots; simple concat is fine)
        const allQuotes = [...nestedQuotes, ...flatQuotes];
        setQuotes(allQuotes);
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

  // Pretty formatter: Aug 26, 2025 – 5:12 PM
  const fmtPretty = (d: Date | null): string => {
    if (!d) return '-';
    const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return `${date} – ${time}`;
  };

  // Build structured details for the selected item
  const detailData = useMemo(() => {
    if (!selected) return { rows: [] as { label: string; value: any; wide?: boolean; isLongText?: boolean }[], attachment: undefined as any };
    const d = selected.data || {};
    const first = (...keys: string[]) => {
      for (const k of keys) {
        const v = d?.[k];
        if (v !== undefined && v !== null && v !== '') return v;
      }
      return undefined;
    };
    const rows: { label: string; value: any; wide?: boolean; isLongText?: boolean }[] = [];
    const asPrettyDate = (v: any) => fmtPretty(dateFrom(v));

    if (selected.type === 'tickets') {
      rows.push({ label: 'Category', value: first('category', 'Category') });
      rows.push({ label: 'Subject', value: first('subject', 'Subject', 'title', 'Title') });
      rows.push({ label: 'Description', value: first('description', 'Description', 'message', 'Message'), wide: true, isLongText: true });
    } else if (selected.type === 'services') {
      rows.push({ label: 'Service', value: first('service', 'Service', 'category', 'Category') });
      rows.push({ label: 'Device', value: first('device', 'Device') });
      rows.push({ label: 'Priority', value: first('priority', 'Priority') });
      rows.push({ label: 'Description', value: first('description', 'Description', 'notes', 'Notes'), wide: true, isLongText: true });
      const scheduled = first('scheduledAt', 'scheduleAt', 'schedule', 'scheduled', 'dateTime', 'datetime');
      const datePart = first('date', 'Date');
      const timePart = first('time', 'Time');
      const scheduledText = scheduled ? asPrettyDate(scheduled) : (datePart || timePart ? `${datePart || ''} ${timePart || ''}`.trim() : undefined);
      if (scheduledText) rows.push({ label: 'Scheduled', value: scheduledText });
      const loc = first('location', 'Location', 'area', 'Area');
      if (loc) rows.push({ label: 'Location', value: loc });
    } else if (selected.type === 'quotes') {
      // Display fields requested for quotes coming from flat structure
      const valOrDash = (v: any) => (v === undefined || v === null || v === '' ? '—' : v);
      const arrToText = (v: any) => Array.isArray(v) ? (v as any[]).join(', ') : v;

      rows.push({ label: 'Budget', value: valOrDash(first('budget')) });
      rows.push({ label: 'Budget Currency', value: valOrDash(first('budgetCurrency')) });
      // Explicitly show created/updated timestamps
      const created = first('createdAt', 'created_at', 'ts');
      const updated = first('updatedAt', 'updated_at');
      if (created) rows.push({ label: 'Created At', value: fmtPretty(dateFrom(created)) });
      if (updated) rows.push({ label: 'Updated At', value: fmtPretty(dateFrom(updated)) });
      // Also show status as a plain value in details (it is also shown above with a badge)
      rows.push({ label: 'Status', value: valOrDash(first('status', 'Status')) });
      rows.push({ label: 'Customer Email', value: valOrDash(first('customerEmail')) });
      rows.push({ label: 'Customer ID', value: valOrDash(first('customerId')) });
      const newRooms = arrToText(first('newRoomsToAutomate'));
      if (newRooms !== undefined) rows.push({ label: 'New Rooms To Automate', value: valOrDash(newRooms), wide: true });
      rows.push({ label: 'Quote Type', value: valOrDash(first('quoteType')) });
      const smartRooms = arrToText(first('roomsAlreadySmart'));
      if (smartRooms !== undefined) rows.push({ label: 'Rooms Already Smart', value: valOrDash(smartRooms), wide: true });
      rows.push({ label: 'Timeline', value: valOrDash(first('timeline')) });
      rows.push({ label: 'User UID', value: valOrDash(first('userUid', 'uid')) });
    }

    const attachment = first('imageUrl', 'imageURL', 'ImageUrl', 'attachment', 'url', 'photoURL', 'photoUrl');
    return { rows, attachment };
  }, [selected]);

  

  const statusBadge = (status: string | undefined) => {
    const s = (status || '').toString();
    const lower = s.toLowerCase();
    let cls = 'bg-gray-700 text-gray-100 border border-gray-600';
    if (['new', 'pending', 'submitted'].includes(lower)) cls = 'bg-amber-500/20 text-amber-300 border border-amber-500/40';
    if (['open', 'in progress', 'in process', 'approved', 'ack'].includes(lower)) cls = 'bg-blue-500/20 text-blue-300 border border-blue-500/40';
    if (['resolved', 'done', 'closed'].includes(lower)) cls = 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
    return <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{s || '-'}</span>;
  };

  const [devices, setDevices] = useState<any[] | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<{id: string, userId: string} | null>(null);
  const [showAddDeviceModal, setShowAddDeviceModal] = useState(false);
  const lists = useMemo(() => ({ 
    quotes: quotes || [], 
    services: services || [], 
    tickets: tickets || [],
    devices: devices || []
  }), [quotes, services, tickets, devices]);

  const openDetails = (type: TabKey, id: string, data: any) => {
    if (type === 'devices' && account?.id) {
      setSelectedDevice({ id, userId: account.id });
      return;
    }
    setSelected({ type, id, data });
    const current = (data?.status ?? data?.Status ?? '').toString();
    setEditStatus(current);
    setDrawerOpen(true);
  };

  const closeDetails = () => { setDrawerOpen(false); setSelected(null); };

  const statusOptionsByType: Record<TabKey, string[]> = {
    // Quotes -> pending, confirmed
    quotes: ['pending', 'confirmed'],
    // Service Requests -> open, in process, closed
    services: ['open', 'in process', 'closed'],
    // Support Tickets -> pending, resolved, in progress
    tickets: ['pending', 'resolved', 'in progress'],
    // Devices -> online, offline
    devices: ['online', 'offline'],
  };

  const saveStatus = async () => {
    if (!selected) return;
    
    if (selected.type === 'devices') {
      try {
        await updateDoc(doc(db, 'userdevices', account?.id, 'devices', selected.id), {
          isOnline: editStatus === 'online',
          updatedAt: Timestamp.now()
        });
        closeDetails();
      } catch (error) {
        console.error('Error updating device status:', error);
      }
      return;
    }
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
          <div className="flex justify-between items-center border-b border-gray-700">
            <div className="flex gap-2">
              {([
                { key: 'quotes', label: `Quotes (${quotes?.length ?? 0})` },
                { key: 'services', label: `Service Requests (${services?.length ?? 0})` },
                { key: 'tickets', label: `Support Tickets (${tickets?.length ?? 0})` },
                { key: 'devices', label: `Devices (${devices?.length ?? 0})` },
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
            {activeTab === 'devices' && (
              <button
                onClick={() => setShowAddDeviceModal(true)}
                className="px-3 py-1.5 text-sm rounded-md bg-teal-600 hover:bg-teal-700 text-white"
              >
                Add/Remove Devices
              </button>
            )}
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
                    <tr className="text-left text-xs text-gray-400 uppercase">
                      {activeTab === 'devices' ? (
                        <>
                          <th className="py-2 pr-4">Device Name</th>
                          <th className="py-2 pr-4">Type</th>
                        </>
                      ) : activeTab === 'tickets' ? (
                        <>
                          <th className="py-2 pr-4">Subject</th>
                          <th className="py-2 pr-4">Status</th>
                          <th className="py-2 pr-4">Created</th>
                        </>
                      ) : activeTab === 'services' ? (
                        <>
                          <th className="py-2 pr-4">Service</th>
                          <th className="py-2 pr-4">Status</th>
                          <th className="py-2 pr-4">Created</th>
                        </>
                      ) : (
                        <>
                          <th className="py-2 pr-4">Quote Type</th>
                          <th className="py-2 pr-4">Status</th>
                          <th className="py-2 pr-4">Created</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {lists[activeTab].map((row: any) => {
                      const status = row.status ?? row.Status;
                      const created = row.createdAt ?? row.created_at ?? row.ts;
                      const isUnread = (status || '').toString().toLowerCase() === 'pending' || 
                                     (status || '').toString().toLowerCase() === 'new' || 
                                     (status || '').toString().toLowerCase() === 'submitted';
                      
                      if (activeTab === 'devices') {
                        return (
                          <tr
                            key={row.id}
                            onClick={() => openDetails('devices', row.id, row)}
                            className="cursor-pointer border-b border-gray-700/70 hover:bg-gray-700/40"
                          >
                            <td className="py-2 pr-4 text-gray-100">
                              {row.deviceName || 'Unnamed Device'}
                            </td>
                            <td className="py-2 pr-4 text-gray-300">{row.type || 'Unknown'}</td>
                          </tr>
                        );
                      }
                      
                      if (activeTab === 'tickets') {
                        return (
                          <tr
                            key={row.id}
                            onClick={() => openDetails('tickets', row.id, row)}
                            className={`cursor-pointer border-b border-gray-700/70 hover:bg-gray-700/40 ${isUnread ? 'font-semibold' : ''}`}
                          >
                            <td className="py-2 pr-4 text-gray-100">
                              {row.subject || row.title || 'No Subject'}
                            </td>
                            <td className="py-2 pr-4">{statusBadge(status)}</td>
                            <td className="py-2 pr-4 text-gray-300">{fmt(dateFrom(created))}</td>
                          </tr>
                        );
                      }
                      
                      if (activeTab === 'services') {
                        return (
                          <tr
                            key={row.id}
                            onClick={() => openDetails('services', row.id, row)}
                            className={`cursor-pointer border-b border-gray-700/70 hover:bg-gray-700/40 ${isUnread ? 'font-semibold' : ''}`}
                          >
                            <td className="py-2 pr-4 text-gray-100">
                              {row.service || row.category || 'Uncategorized Service'}
                            </td>
                            <td className="py-2 pr-4">{statusBadge(status)}</td>
                            <td className="py-2 pr-4 text-gray-300">{fmt(dateFrom(created))}</td>
                          </tr>
                        );
                      }
                      
                      // Default rendering for other tabs (quotes)
                      return (
                        <tr
                          key={row.id}
                          onClick={() => openDetails(activeTab as any, row.id, row)}
                          className={`cursor-pointer border-b border-gray-700/70 hover:bg-gray-700/40 ${isUnread ? 'font-semibold' : ''}`}
                        >
                          <td className="py-2 pr-4 text-gray-100 truncate max-w-[14rem]" title={row.quoteType || row.type || row.id}>
                            {row.quoteType || row.type || '—'}
                          </td>
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

      {/* Centered details modal */}
      {drawerOpen && selected && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50" onClick={closeDetails} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-5 overflow-y-auto max-h-[90vh]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">{selected.type === 'quotes' ? 'Quote' : selected.type === 'services' ? 'Service Request' : 'Support Ticket'} Details</h3>
                <button onClick={closeDetails} className="text-gray-300 hover:text-white">✕</button>
              </div>
              <div className="space-y-2 text-sm">
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-gray-400 flex items-center gap-1">🆔 <span>Request ID</span></div>
                  <div className="col-span-2 text-gray-100 break-all">{selected.id}</div>
                  <div className="text-gray-400 flex items-center gap-1">📅 <span>Created</span></div>
                  <div className="col-span-2 text-gray-100">{fmtPretty(dateFrom(selected.data?.createdAt ?? selected.data?.created_at ?? selected.data?.ts))}</div>
                  <div className="text-gray-400 flex items-center gap-1">🏷️ <span>Status</span></div>
                  <div className="col-span-2">{statusBadge(selected.data?.status ?? selected.data?.Status)}</div>
                </div>
              
              {/* Details section */}
              <div className="mt-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  {detailData.rows.map((r, i) => (
                    <div key={i} className={r.wide ? 'sm:col-span-2' : ''}>
                      <div className="text-gray-400">{r.label}</div>
                      <div className={`text-gray-100 ${r.isLongText ? 'whitespace-pre-wrap' : ''}`}>{(r.value ?? '—').toString()}</div>
                    </div>
                  ))}
                </div>
                {detailData.attachment && (
                  <div className="mt-3">
                    <div className="text-gray-400 mb-1">Attachments</div>
                    <a href={`${detailData.attachment}`} target="_blank" rel="noreferrer">
                      <img src={`${detailData.attachment}`} alt="attachment" className="h-24 w-24 object-cover rounded border border-gray-700 hover:opacity-90" />
                    </a>
                  </div>
                )}
              </div>

              {selected.type === 'quotes' && estimation && (
                <div className="mt-6 border-t border-gray-700 pt-4">
                  <div className="text-gray-200 font-medium mb-2">Estimate</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-gray-400">Quote ID</div>
                      <div className="text-gray-100">{estimation.quoteId || estimation.id}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">Status</div>
                      <div className="text-gray-100">{estimation.status || '—'}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">Created At</div>
                      <div className="text-gray-100">{fmtPretty(dateFrom(estimation.createdAt))}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">Updated At</div>
                      <div className="text-gray-100">{fmtPretty(dateFrom(estimation.updatedAt))}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">Issue Date</div>
                      <div className="text-gray-100">{fmtPretty(dateFrom(estimation.issueDate))}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">Delivery Timeline</div>
                      <div className="text-gray-100">{estimation.deliveryTimeline || '—'}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">Customer Email</div>
                      <div className="text-gray-100">{estimation.customerEmail || '—'}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">Created By</div>
                      <div className="text-gray-100">{estimation.createdByEmail || estimation.createdByUid || '—'}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">Subtotal</div>
                      <div className="text-gray-100">{estimation.subtotal ?? '—'}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">Taxes</div>
                      <div className="text-gray-100">{estimation.taxes ?? '—'}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">Shipping</div>
                      <div className="text-gray-100">{estimation.shippingCharges ?? '—'}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">Installation</div>
                      <div className="text-gray-100">{estimation.installationCharges ?? '—'}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">Overall Discount</div>
                      <div className="text-gray-100">{estimation.overallDiscount ?? '—'}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">Grand Total</div>
                      <div className="text-gray-100 font-medium">{estimation.grandTotal ?? '—'}</div>
                    </div>
                    {estimation.paymentTerms && (
                      <div className="sm:col-span-2">
                        <div className="text-gray-400">Payment Terms</div>
                        <div className="text-gray-100">{estimation.paymentTerms}</div>
                      </div>
                    )}
                    {estimation.notes && (
                      <div className="sm:col-span-2">
                        <div className="text-gray-400">Notes</div>
                        <div className="text-gray-100 whitespace-pre-wrap">{estimation.notes}</div>
                      </div>
                    )}
                  </div>

                  {Array.isArray(estimation.items) && estimation.items.length > 0 && (
                    <div className="mt-4">
                      <div className="text-gray-200 font-medium mb-2">Items</div>
                      <div className="overflow-x-auto rounded-md border border-gray-700/70">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-gray-400 border-b border-gray-700">
                              <th className="py-2 pr-4">Name</th>
                              <th className="py-2 pr-4">Qty</th>
                              <th className="py-2 pr-4">Unit Price</th>
                              <th className="py-2 pr-4">Discount</th>
                              <th className="py-2 pr-4">Tax %</th>
                            </tr>
                          </thead>
                          <tbody>
                            {estimation.items.map((it: any) => (
                              <tr key={it.id} className="border-b border-gray-700/50">
                                <td className="py-2 pr-4 text-gray-100">{it.name || '-'}</td>
                                <td className="py-2 pr-4 text-gray-300">{it.quantity ?? '-'}</td>
                                <td className="py-2 pr-4 text-gray-300">{it.unitPrice ?? '-'}</td>
                                <td className="py-2 pr-4 text-gray-300">{it.discount ?? '-'}</td>
                                <td className="py-2 pr-4 text-gray-300">{it.taxPercent ?? '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
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
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Device Details Modal */}
      {selectedDevice && (
        <DeviceDetailsModal
          isOpen={!!selectedDevice}
          onClose={() => setSelectedDevice(null)}
          deviceId={selectedDevice.id}
          userId={selectedDevice.userId}
        />
      )}

      <AddDeviceModal
        isOpen={showAddDeviceModal}
        onClose={() => setShowAddDeviceModal(false)}
        userId={account?.id || ''}
        onDeviceAdded={() => { /* no-op: realtime listener above will refresh with enriched details */ }}
      />
    </section>
  );
}
;

export default AdminUserDetail;
