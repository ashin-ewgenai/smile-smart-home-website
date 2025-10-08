import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../../../../lib/firebase';
import {
  accountsCollection,
  quotesCollection,
  quoteDoc,
  requestServicesCollection,
  supportTicketsCollection,
  supportTicketDoc,
  plannerLeadsCollection,
  estimationQuoteDoc,
  estimationQuotesCollection,
} from '../../../../models/Collections';
import { getDocs, getDoc, limit, query, where, updateDoc, doc, Timestamp, collection, onSnapshot } from 'firebase/firestore';
import DeviceDetailsModal from '../components/DeviceDetailsModal';
import AddDeviceModal from '../components/AddDeviceModal';
import EstimationEditor from '../components/EstimationEditor';
import StatusChangeButton from '../components/StatusChangeButton';
import PhoneInput from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';

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
  // Contact requests (for User Details landing)
  const [contactRequests, setContactRequests] = useState<any[]>([]);
  const [loadingContactRequests, setLoadingContactRequests] = useState<boolean>(false);
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  const toggleOpen = (id: string) => setOpenIds((prev) => ({ ...prev, [id]: !prev[id] }));

  // Edit contact fields (phone, address)
  const [editingContact, setEditingContact] = useState<boolean>(false);
  const [tempPhone, setTempPhone] = useState<string>('');
  const [tempAddress, setTempAddress] = useState<string>('');
  const [savingContact, setSavingContact] = useState<boolean>(false);

  // Edit display name (FullName)
  const [editingName, setEditingName] = useState<boolean>(false);
  const [tempName, setTempName] = useState<string>('');
  const [savingName, setSavingName] = useState<boolean>(false);

  // Avoid SSR hydration issues for react-phone-input-2
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Planner Leads per contact email (lazy-loaded)
  const [openPlanIds, setOpenPlanIds] = useState<Record<string, boolean>>({});
  const [plannerLeadsByEmail, setPlannerLeadsByEmail] = useState<Record<string, any[]>>({});
  const [plannerLeadsLoading, setPlannerLeadsLoading] = useState<Record<string, boolean>>({});
  const togglePlanOpen = (key: string) => setOpenPlanIds((prev) => ({ ...prev, [key]: !prev[key] }));

  const loadPlannerLeadsForEmail = async (emailToCheck: string) => {
    if (!emailToCheck) return;
    if (plannerLeadsByEmail[emailToCheck] || plannerLeadsLoading[emailToCheck]) return;
    setPlannerLeadsLoading((p) => ({ ...p, [emailToCheck]: true }));
    try {
      // Try match on 'email'
      let res = await getDocs(query(plannerLeadsCollection(db), where('email', '==', emailToCheck)));
      // If no docs, try alternative field 'userEmail'
      if (res.empty) {
        res = await getDocs(query(plannerLeadsCollection(db), where('userEmail', '==', emailToCheck)));
      }
      const items = res.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPlannerLeadsByEmail((p) => ({ ...p, [emailToCheck]: items }));
    } catch (e) {
      console.error('Failed to load Planner_Leads for', emailToCheck, e);
      setPlannerLeadsByEmail((p) => ({ ...p, [emailToCheck]: [] }));
    } finally {
      setPlannerLeadsLoading((p) => ({ ...p, [emailToCheck]: false }));
    }
  };

  // Related docs
  const [quotes, setQuotes] = useState<any[] | null>(null);
  const [services, setServices] = useState<any[] | null>(null);
  const [tickets, setTickets] = useState<any[] | null>(null);
  const [loadingRelated, setLoadingRelated] = useState(false);

  // UI: tabs and drawer
  type TabKey = 'quotes' | 'services' | 'tickets' | 'devices';
  const [activeTab, setActiveTab] = useState<TabKey>('quotes');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Handle wheel event for table scrolling
  const handleTableWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const isScrollingDown = e.deltaY > 0;
    const isScrollingUp = e.deltaY < 0;
    
    // Check if we've reached the top and trying to scroll up
    if (container.scrollTop === 0 && isScrollingUp) {
      e.stopPropagation();
      return;
    }
    
    // Check if we've reached the bottom and trying to scroll down
    if (container.scrollHeight - container.scrollTop === container.clientHeight && isScrollingDown) {
      e.stopPropagation();
      return;
    }
    
    // Prevent the default only if we need to handle the scroll
    if ((isScrollingDown && container.scrollTop < container.scrollHeight - container.clientHeight) ||
        (isScrollingUp && container.scrollTop > 0)) {
      e.stopPropagation();
    }
  };
  const [selected, setSelected] = useState<
    | { type: TabKey; id: string; data: any }
    | null
  >(null);
  const [editStatus, setEditStatus] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [estimation, setEstimation] = useState<any | null>(null);
  // UI helpers for UID reveal/copy
  const [showUid, setShowUid] = useState(false);
  const [copiedUid, setCopiedUid] = useState(false);
  const maskUid = (v?: string) => {
    if (!v) return '—';
    // Always show bullets only, with a fixed length to avoid leaking actual length
    return '••••••••••';
  };

  // Lock background scroll and prevent background wheel/touch when the centered details modal is open
  useEffect(() => {
    if (!drawerOpen) return;

    const body = document.body;
    const html = document.documentElement;
    const scrollY = window.scrollY;
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';

    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      const inside = target?.closest?.('.modal-scroll-content');
      if (!inside) {
        e.preventDefault();
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      const inside = target?.closest?.('.modal-scroll-content');
      if (!inside) {
        e.preventDefault();
      }
    };

    document.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('touchmove', onTouchMove, { passive: false });

    return () => {
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.overflow = '';
      html.style.overflow = '';
      window.scrollTo(0, scrollY);
      document.removeEventListener('wheel', onWheel as EventListener);
      document.removeEventListener('touchmove', onTouchMove);
    };
  }, [drawerOpen]);

  // Render Smart Home plan text with sections and bullet lists (matches User PlanLeads view)
  const renderPlanText = (text?: string) => {
    const raw = (text || '').trim();
    if (!raw) return <div className="text-gray-400">-</div>;
    const lines = raw.split(/\r?\n/);
    const elements: React.ReactNode[] = [];
    let bufferList: string[] = [];

    const flushList = () => {
      if (bufferList.length > 0) {
        elements.push(
          <ul className="list-disc pl-6 space-y-1" key={`ul-${elements.length}`}>
            {bufferList.map((li, idx) => (
              <li key={idx} className="text-gray-200">{li}</li>
            ))}
          </ul>
        );
        bufferList = [];
      }
    };

    lines.forEach((line, i) => {
      const l = line.trim();
      if (!l) {
        flushList();
        elements.push(<div key={`br-${i}`} className="h-3" />);
        return;
      }
      if (l.startsWith('- ')) {
        bufferList.push(l.replace(/^-\s*/, ''));
        return;
      }
      const labelMatch = l.match(/^(.*?:)\s*(.*)$/);
      if (labelMatch) {
        flushList();
        const [, label, rest] = labelMatch as RegExpMatchArray;
        elements.push(
          <div key={`lbl-${i}`} className="text-gray-200">
            <span className="font-semibold text-white">{label} </span>
            {rest}
          </div>
        );
        return;
      }
      flushList();
      elements.push(
        <div key={`p-${i}`} className="text-gray-200">{l}</div>
      );
    });
    flushList();
    return <div className="space-y-1">{elements}</div>;
  };

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

  // Initialize editable fields when account loads/changes
  useEffect(() => {
    if (!account) return;
    setTempPhone((account as any)?.phoneNumber || '');
    setTempAddress((account as any)?.address || '');
    setTempName((account as any)?.FullName || '');
  }, [account]);

  const saveContactInfo = async () => {
    if (!account?.id) return;
    try {
      setSavingContact(true);
      const ref = doc(db, 'Accounts', account.id);
      await updateDoc(ref, {
        phoneNumber: tempPhone || '',
        address: tempAddress || ''
      });
      setEditingContact(false);
    } finally {
      setSavingContact(false);
    }
  };

  const saveDisplayName = async () => {
    if (!account?.id) return;
    try {
      setSavingName(true);
      const ref = doc(db, 'Accounts', account.id);
      await updateDoc(ref, {
        FullName: (tempName || '').trim(),
      });
      setEditingName(false);
    } finally {
      setSavingName(false);
    }
  };

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
            const ref = estimationQuoteDoc(db, id);
            const snap = await getDoc(ref as ReturnType<typeof doc>);
            if (snap.exists()) { found = { id: snap.id, ...snap.data() }; break; }
          } catch {}
        }

        // Fallback: search by originalQuoteId field
        if (!found) {
          try {
            const col = estimationQuotesCollection(db);
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

  // When no email is provided, show a real-time list of contactRequests (new user submissions)
  useEffect(() => {
    if (email) return; // Only run when viewing the general User Details list
    setLoadingContactRequests(true);
    const ref = collection(db, 'contactRequests');
    // Order newest first if createdAt exists
    let unsubscribe = onSnapshot(ref, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // sort locally by createdAt desc to avoid requiring index
      rows.sort((a: any, b: any) => {
        const da = (a?.createdAt as any)?.toMillis?.() ?? (a?.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
        const dbv = (b?.createdAt as any)?.toMillis?.() ?? (b?.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
        return dbv - da;
      });
      setContactRequests(rows);
      setLoadingContactRequests(false);
    }, (err) => {
      console.error('contactRequests onSnapshot error:', err);
      setLoadingContactRequests(false);
    });
    return () => unsubscribe();
  }, [email]);

  // Fetch devices when account changes
  useEffect(() => {
    if (!account?.id) return;
    
    const fetchDevices = async () => {
      try {
        // Get user's devices from flat collection
        const userDevicesQuery = query(collection(db, 'User_Devices'), where('uid', '==', account.id));
        const userDevicesSnapshot = await getDocs(userDevicesQuery);
        
        // Process each device to get details from the main Devices collection
        const devicesPromises = userDevicesSnapshot.docs.map(async (deviceDoc) => {
          const deviceData = deviceDoc.data();
          try {
            // Get device details from main Devices collection using sourceDeviceId
            const sourceDeviceId = deviceData.sourceDeviceId || deviceDoc.id;
            const deviceDetailsSnapshot = await getDoc(doc(db, 'Devices', sourceDeviceId));
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
    const userDevicesQuery = query(collection(db, 'User_Devices'), where('uid', '==', account.id));
    const unsubscribe = onSnapshot(
      userDevicesQuery,
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
        // Fetch nested collections (primary) - tickets now use flat collection
        const [qSnapNested, sSnap, tSnap] = await Promise.all([
          getDocs(quotesCollection(db, uid)),
          getDocs(query(requestServicesCollection(db), where('uid', '==', uid))),
          getDocs(query(supportTicketsCollection(db), where('uid', '==', uid))),
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
      
      // Generate colored device pills
      const deviceItems = Array.isArray(d?.devices)
        ? (d.devices as any[]).filter(Boolean)
        : first('device', 'Device')
            ? [first('device', 'Device')]
            : [];
            
      const devicePills = deviceItems.length > 0 
        ? (
            <div className="flex flex-wrap gap-2 mt-1">
              {deviceItems.map((device, idx) => {
                // Normalize any device shape to a readable label
                const getDeviceLabel = (v: any): string => {
                  if (typeof v === 'string') return v;
                  if (!v || typeof v !== 'object') return String(v ?? '');
                  return (
                    v.deviceName ||
                    v.name ||
                    v.label ||
                    v.title ||
                    v.model ||
                    // If looks like a Firestore doc ref-like object with id
                    v.id ||
                    JSON.stringify(v)
                  );
                };
                const label = getDeviceLabel(device);
                
                return (
                  <span 
                    key={idx}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                  >
                    {label}
                  </span>
                );
              })}
            </div>
          )
        : '—';
        
      rows.push({ label: 'Devices', value: devicePills });
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
      // For devices, prefer opening the modal with the actual Devices/{id},
      // using sourceDeviceId when present on the user device row.
      const deviceIdToOpen = (data?.sourceDeviceId as string) || id;
      setSelectedDevice({ id: deviceIdToOpen, userId: account.id });
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
    // Support Tickets -> pending, resolved
    tickets: ['pending', 'resolved'],
    // Devices -> online, offline
    devices: ['online', 'offline'],
  };

  const saveStatus = async () => {
    if (!selected) return;
    
    if (selected.type === 'devices') {
      try {
        // Update device in flat collection
        const userDevicesQuery = query(
          collection(db, 'User_Devices'), 
          where('uid', '==', account?.id),
          where('sourceDeviceId', '==', selected.id)
        );
        const userDevicesSnapshot = await getDocs(userDevicesQuery);
        
        if (!userDevicesSnapshot.empty) {
          await updateDoc(userDevicesSnapshot.docs[0].ref, {
            isOnline: editStatus === 'online',
            updatedAt: Timestamp.now()
          });
        }
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
        const ref = doc(db, 'Request_service', selected.id);
        await updateDoc(ref, { status: editStatus });
        setServices((prev) => (prev || []).map((x) => (x.id === selected.id ? { ...x, status: editStatus } : x)));
      } else if (selected.type === 'tickets') {
        const ref = supportTicketDoc(db, selected.id);
        await updateDoc(ref as any, { status: editStatus });
        setTickets((prev) => (prev || []).map((x) => (x.id === selected.id ? { ...x, status: editStatus } : x)));
      }
      setSelected((s) => (s ? { ...s, data: { ...s.data, status: editStatus } } : s));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 p-4 md:p-6">
      {/* Header */}
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between px-2 md:px-0 mb-4">
          <h2 className="text-xl md:text-lg font-semibold text-white">User Details</h2>
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-teal-500/30 text-teal-300 hover:bg-teal-500/10 hover:border-teal-400/50 transition-all duration-300 backdrop-blur-sm bg-gray-800/50 shadow-lg hover:shadow-teal-500/20"
              aria-label="Back to Users"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M7.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4A1 1 0 018.707 6.707L6.414 9H17a1 1 0 110 2H6.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
              <span className="hidden sm:inline">Back to Users</span>
            </button>
          ) : (
            <a
              href="/dashboard/admin/users"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-teal-500/30 text-teal-300 hover:bg-teal-500/10 hover:border-teal-400/50 transition-all duration-300 backdrop-blur-sm bg-gray-800/50 shadow-lg hover:shadow-teal-500/20"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M7.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4A1 1 0 018.707 6.707L6.414 9H17a1 1 0 110 2H6.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
              <span className="hidden sm:inline">Back to Users</span>
            </a>
          )}
        </div>
      </div>

      {/* Profile card */}
      <div className="max-w-6xl mx-auto mt-4">
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 dark:bg-gray-900 dark:border-gray-700">
          {!email ? (
            <div className="space-y-4">
              {loadingContactRequests && <div className="text-gray-300">Loading...</div>}
              {!loadingContactRequests && contactRequests.length === 0 && (
                <div className="text-gray-300">No contact requests.</div>
              )}
              {!loadingContactRequests && contactRequests.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...contactRequests]
                    .sort((a, b) => {
                      const aTime = a.createdAt?.seconds || a.createdAt?._seconds || 0;
                      const bTime = b.createdAt?.seconds || b.createdAt?._seconds || 0;
                      if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
                      return bTime - aTime;
                    })
                    .map((r: any) => {
                      const id = r.id as string;
                      const isOpen = !!openIds[id];
                      const createdAt = r.createdAt ? (r.createdAt.toDate ? r.createdAt.toDate() : new Date(r.createdAt.seconds * 1000)) : null;
                      return (
                        <div key={id} className="bg-white rounded-lg border border-gray-200 overflow-hidden transition-all hover:border-teal-500/50 hover:bg-gray-50 dark:bg-gray-800/50 dark:border-gray-700">
                          <button
                            type="button"
                            className="w-full text-left p-4 flex justify-between items-center hover:bg-gray-50 transition-colors dark:hover:bg-gray-700/50"
                            aria-expanded={isOpen}
                            aria-controls={`contact-panel-${id}`}
                            onClick={() => toggleOpen(id)}
                          >
                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium truncate text-gray-900 dark:text-gray-200">{r.email || 'No Email'}</h3>
                              {createdAt && (
                                <p className="text-xs text-gray-500 mt-1">
                                  {createdAt.toLocaleDateString()} • {createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              )}
                            </div>
                            <span className={`transition-transform duration-200 text-gray-500 ${isOpen ? 'rotate-90' : 'rotate-0'}`}>
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                              </svg>
                            </span>
                          </button>
                          {isOpen && (
                            <div id={`contact-panel-${id}`} className="text-sm text-gray-700 p-4 bg-gray-50 dark:text-gray-300 dark:bg-gray-800/30">
                              <div className="space-y-3">
                                <div>
                                  <div className="text-gray-500">Full Name</div>
                                  <div className="text-gray-900 dark:text-gray-100">{r.fullName || '—'}</div>
                                </div>
                                <div>
                                  <div className="text-gray-500">Email</div>
                                  <div className="text-gray-900 dark:text-gray-100 break-all">{r.email || '—'}</div>
                                </div>
                                <div>
                                  <div className="text-gray-500">Phone</div>
                                  <div className="text-gray-900 dark:text-gray-100">{r.phone || '—'}</div>
                                </div>
                                <div>
                                  <div className="text-gray-500">Service</div>
                                  <div className="text-gray-900 dark:text-gray-100">{r.service || '—'}</div>
                                </div>
                                <div className="sm:col-span-2">
                                  <div className="text-gray-500">Message</div>
                                  <div className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">{r.message || '—'}</div>
                                </div>
                                <div>
                                  <div className="text-gray-500">Created</div>
                                  <div className="text-gray-900 dark:text-gray-100">{fmt(dateFrom(r.createdAt))}</div>
                                </div>
                              </div>

                              <div className="mt-4 border-t border-gray-800 pt-3">
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-2 text-left text-sm text-gray-200 hover:text-white focus:outline-none"
                                  aria-expanded={!!openPlanIds[id]}
                                  aria-controls={`planleads-panel-${id}`}
                                  onClick={async () => {
                                    const next = !openPlanIds[id];
                                    togglePlanOpen(id);
                                    if (next && r.email) await loadPlannerLeadsForEmail(r.email);
                                  }}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                                    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                                    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                                    <path d="M9 15h6" />
                                    <path d="M12 18v-6" />
                                  </svg>
                                  <span className="inline-flex items-center gap-2">Plan Leads</span>
                                </button>
                                {openPlanIds[id] && (
                                  <div id={`planleads-panel-${id}`} className="mt-3 pl-0 sm:pl-2">
                                    {plannerLeadsLoading[r.email || ''] ? (
                                      <div className="text-gray-400">Loading...</div>
                                    ) : (plannerLeadsByEmail[r.email || ''] || []).length === 0 ? (
                                      <div className="text-gray-400">No planner leads found for this email.</div>
                                    ) : (
                                      <div className="space-y-3">
                                        {(plannerLeadsByEmail[r.email || ''] || []).map((lead) => (
                                          <div key={lead.id} className="rounded-lg border border-gray-800 p-4 bg-gray-900/70 text-white dark:bg-gray-900/40 dark:text-gray-100">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                                              {Object.entries(lead).filter(([k]) => k !== 'id' && k !== 'formData' && k !== 'updatedAt' && k !== 'email' && k !== 'recommendedAreas' && k !== 'complexity').map(([k, v]) => (
                                                <div key={k} className="break-words">
                                                  <div className="text-gray-300">{k === 'planText' ? 'Recommeded setup' : k}</div>
                                                  <div className="text-gray-100">
                                                    {k.toLowerCase().includes('created') || k.toLowerCase().includes('updated') ? fmt(dateFrom(v as any)) : k === 'planText' ? renderPlanText(v as any) : String(v)}
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="mt-3 pt-3 border-t border-gray-700">
                                <button onClick={() => (window.location.href = `mailto:${r.email}`)} className="text-teal-400 hover:text-teal-300 text-sm flex items-center gap-1">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                  </svg>
                                  Reply
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          ) : (
            <>
              {email && loading && <div className="text-gray-300">Loading...</div>}
              {error && <div className="text-red-400">{error}</div>}
              {!loading && !error && account && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left: Name & Email with inline name edit */}
                  <div className="text-center md:text-left">
                    {!editingName ? (
                      <div className="flex flex-col md:flex-row md:items-center gap-2 justify-center md:justify-start">
                        <div className="text-2xl md:text-3xl font-bold text-white">{account.FullName || '—'}</div>
                        <button
                          type="button"
                          onClick={() => { setTempName(account.FullName || ''); setEditingName(true); }}
                          className="text-teal-400 hover:text-teal-300 text-sm px-3 py-1 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 transition-colors"
                          title="Edit name"
                        >
                          Edit
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center md:flex-row md:items-center gap-2">
                        <input
                          type="text"
                          value={tempName}
                          onChange={(e) => setTempName(e.target.value)}
                          className="px-4 py-2 rounded-xl border border-gray-600 bg-gray-800/60 text-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-center md:text-left"
                          placeholder="Full name"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={saveDisplayName}
                            disabled={savingName}
                            className="px-4 ■py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-60 transition-colors"
                          >
                            {savingName ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setEditingName(false); setTempName(account.FullName || ''); }}
                            className="px-4 py-2 rounded-xl border border-gray-600 text-gray-300 hover:bg-gray-700/50 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="text-lg text-gray-300 mt-2 text-center md:text-left">{account.Email || '—'}</div>
                  </div>
                  {/* Right: UID / Role / Status */}
                  <div className="grid grid-cols-1 gap-4 text-center md:text-left md:grid-cols-[auto,1fr] md:gap-x-4 md:gap-y-2">
                    <div className="text-gray-400">UID</div>
                    <div className="text-gray-200 truncate" title={account.Uid}>
                      <div className="group/uid inline-flex items-center gap-2 max-w-full min-w-0">
                        <span className="truncate font-mono text-sm tracking-wider px-3 py-1 rounded-lg bg-gray-800/60 border border-gray-600 text-gray-200">
                          {showUid ? (account.Uid || '—') : maskUid(account.Uid)}
                        </span>
                        <div className="inline-flex items-center gap-1 opacity-0 group-hover/uid:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => setShowUid((v) => !v)}
                            className="p-1 text-gray-400 hover:text-gray-300 rounded"
                            aria-label={showUid ? 'Hide UID' : 'Show UID'}
                          >
                            {showUid ? '👁️‍🗨️' : '👁️'}
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(String(account.Uid || ''));
                                setCopiedUid(true);
                                setTimeout(() => setCopiedUid(false), 1200);
                              } catch {}
                            }}
                            className="p-1 text-gray-400 hover:text-gray-300 rounded"
                            aria-label="Copy UID"
                          >
                            📋
                          </button>
                          {copiedUid && (
                            <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300">Copied</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-gray-400">Role</div>
                    <div className="text-gray-200">{account.Role}</div>
                  </div>

                  {/* Contact Info */}
                  <div className="mt-6 border-t border-gray-700/50 pt-6">
                    {!editingContact ? (
                      <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                          {/* Phone */}
                          <div className="flex items-center gap-3 flex-1">
                            <div className="w-10 h-10 rounded-full bg-teal-500/20 flex items-center justify-center flex-shrink-0">
                              📱
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-gray-400">Phone</div>
                              <div className="text-white font-medium">{(account as any)?.phoneNumber || '—'}</div>
                            </div>
                          </div>
                          {/* Address */}
                          <div className="flex items-center gap-3 flex-1">
                            <div className="w-10 h-10 rounded-full bg-teal-500/20 flex items-center justify-center flex-shrink-0">
                              📍
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-gray-400">Address</div>
                              <div className="text-white font-medium break-words">{(account as any)?.address || '—'}</div>
                            </div>
                          </div>
                        </div>
                        {/* Edit button */}
                        <div className="flex justify-center md:justify-end">
                          <button
                            type="button"
                            onClick={() => setEditingContact(true)}
                            className="px-6 py-3 rounded-xl border-2 border-teal-500/30 text-teal-300 hover:bg-teal-500/10 hover:border-teal-400/50 transition-all duration-300 backdrop-blur-sm bg-gray-800/50 shadow-lg hover:shadow-teal-500/20 font-medium"
                          >
                            ✏️ Edit Contact Info
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-4">
                          <div>
                            <label className="block text-sm text-gray-300 mb-2">Phone Number</label>
                            {mounted && (
                              <PhoneInput
                                country="in"
                                value={tempPhone}
                                onChange={(phone: string) => setTempPhone(phone)}
                                disableCountryGuess={true}
                                disableCountryCode={false}
                                disableDropdown={false}
                                inputProps={{
                                  name: 'phone',
                                  required: false,
                                  className:
                                    'w-full !pl-16 !py-3 !border-2 !border-gray-600 !rounded-xl focus:!ring-2 focus:!ring-teal-500 focus:!border-teal-500 !bg-gray-800/60 !text-white',
                                }}
                                containerClass="w-full"
                                buttonClass="!bg-gray-700 !border-r-2 !border-gray-600 !rounded-l-xl !p-0 !w-14 !h-full !flex !items-center !justify-center hover:!bg-gray-600 focus:!ring-2 focus:!ring-teal-500"
                                dropdownClass="!border-2 !border-gray-600 !rounded-xl !shadow-2xl !bg-gray-800 !left-1/2 !-translate-x-1/2 !fixed !z-50 !w-80 [&_.highlight]:!bg-teal-500/20 dark:[&_.highlight]:!bg-teal-400/30 [&_.highlight]:!text-white [&_.country:hover]:!bg-gray-700 [&_.country:hover_.country-name]:!text-white"
                                containerStyle={{ width: '100%' }}
                                inputStyle={{
                                  width: '100%',
                                  height: 'auto',
                                  paddingLeft: '4rem',
                                  backgroundColor: 'transparent',
                                }}
                                buttonStyle={{
                                  backgroundColor: 'transparent',
                                  border: 'none',
                                }}
                                dropdownStyle={{
                                  borderRadius: '0.75rem',
                                  marginTop: '0.5rem',
                                  boxShadow:
                                    '0 10px 25px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.1)',
                                  maxHeight: '300px',
                                  overflowY: 'auto',
                                }}
                                searchPlaceholder="Search country..."
                                searchClass="!w-[calc(100%-1rem)] !mx-2 !my-2 !px-4 !py-2 !text-sm !rounded-lg !border-2 !border-gray-600 focus:!ring-2 focus:!ring-teal-500 !bg-gray-800 !text-white"
                                searchNotFound="No country found"
                                enableSearch
                                countryCodeEditable={false}
                                disableSearchIcon
                                preferredCountries={['us', 'gb', 'ca', 'au', 'in']}
                              />
                            )}
                          </div>
                          <div>
                            <label className="block text-sm text-gray-300 mb-2">Address</label>
                            <textarea
                              value={tempAddress}
                              onChange={(e) => setTempAddress(e.target.value)}
                              rows={4}
                              placeholder="Enter full address"
                              className="w-full px-4 py-3 rounded-xl border-2 border-gray-600 bg-gray-800/60 text-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                            />
                          </div>
                        </div>
                        <div className="flex justify-center gap-3">
                          <button
                            type="button"
                            onClick={() => { setEditingContact(false); setTempPhone((account as any)?.phoneNumber || ''); setTempAddress((account as any)?.address || ''); }}
                            className="px-6 py-3 rounded-xl border-2 border-gray-600 text-gray-300 hover:bg-gray-700/50 transition-colors font-medium"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={savingContact}
                            onClick={saveContactInfo}
                            className="px-6 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-60 transition-colors font-medium shadow-lg hover:shadow-teal-500/25"
                          >
                            {savingContact ? 'Saving...' : '💾 Save'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      {account?.id && (
        <div className="max-w-6xl mx-auto mt-6 px-2 sm:px-4">
          {/* Mobile/Tablet View - 2x2 Grid */}
          <div className="md:hidden">
            <div className="grid grid-cols-2 gap-2">
              {([
                { key: 'quotes', label: `Quotes (${quotes?.length ?? 0})` },
                { key: 'services', label: `Services (${services?.length ?? 0})` },
                { key: 'tickets', label: `Support (${tickets?.length ?? 0})` },
                { key: 'devices', label: `Devices (${devices?.length ?? 0})` },
              ] as { key: TabKey; label: string }[]).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`px-3 py-3 text-sm font-medium rounded-lg transition-all duration-200 ${
                    activeTab === t.key
                      ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 shadow-lg shadow-teal-500/20'
                      : 'bg-gray-800/40 text-gray-300 hover:bg-gray-700/50 border border-gray-700/50'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          
          {/* Desktop View - Single Row */}
          <div className="hidden md:block">
            <div className="flex justify-between items-center border-b border-gray-200 bg-white rounded-t-xl px-2 sm:px-3 py-2 dark:bg-transparent dark:border-gray-700">
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
                        ? 'bg-white text-gray-900 border-gray-200 dark:bg-gray-800 dark:border-gray-700 dark:text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-50 border-transparent dark:bg-gray-800/40 dark:text-gray-300 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-b-md rounded-tr-md p-2 md:p-4 dark:bg-gray-800/60 dark:border-gray-700">
            {loadingRelated && <div className="text-gray-300">Loading...</div>}
            {!loadingRelated && lists[activeTab].length === 0 && (
              <div className="text-gray-300">No items.</div>
            )}

            {!loadingRelated && lists[activeTab].length > 0 && (
              <div 
                className="overflow-x-auto overflow-y-auto max-h-[220px] rounded-b-md rounded-tr-md custom-scroll"
                onWheel={handleTableWheel}
              >
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white dark:bg-gray-800 z-10">
                    <tr className="text-left text-xs uppercase text-gray-600 dark:text-gray-400">
                      {activeTab === 'devices' ? (
                        <>
                          <th className="py-2 pr-4">Device Name</th>
                          <th className="py-2 pr-4">Type</th>
                        </>
                      ) : activeTab === 'tickets' ? (
                        <>
                          <th className="py-2 pr-4">Subject</th>
                          <th className="py-2 pr-4">Created</th>
                        </>
                      ) : activeTab === 'services' ? (
                        <>
                          <th className="py-2 pr-4">Service</th>
                          <th className="py-2 pr-4">Created</th>
                        </>
                      ) : (
                        <>
                          <th className="py-2 pr-4">Quote Type</th>
                          <th className="py-2 pr-4">Created</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {([...lists[activeTab]].sort((a: any, b: any) => {
                      const ad = dateFrom(a.createdAt ?? a.created_at ?? a.ts);
                      const bd = dateFrom(b.createdAt ?? b.created_at ?? b.ts);
                      const at = ad ? ad.getTime() : 0;
                      const bt = bd ? bd.getTime() : 0;
                      return bt - at; // newest first
                    })).map((row: any) => {
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
                            className="cursor-pointer border-b border-gray-200 hover:bg-gray-50 dark:border-gray-700/70 dark:hover:bg-gray-700/40"
                          >
                            <td className="py-2 pr-4 text-gray-900 dark:text-gray-100">
                              {row.deviceName || 'Unnamed Device'}
                            </td>
                            <td className="py-2 pr-4 text-gray-700 dark:text-gray-300">{row.type || 'Unknown'}</td>
                          </tr>
                        );
                      }
                      
                      if (activeTab === 'tickets') {
                        return (
                          <tr
                            key={row.id}
                            onClick={() => openDetails('tickets', row.id, row)}
                            className={`cursor-pointer border-b border-gray-200 hover:bg-gray-50 dark:border-gray-700/70 dark:hover:bg-gray-700/40 ${isUnread ? 'font-semibold' : ''}`}
                          >
                            <td className="py-2 pr-4 text-gray-900 dark:text-gray-100">
                              {row.subject || row.title || 'No Subject'}
                            </td>
                            <td className="py-2 pr-4">{statusBadge(status)}</td>
                            <td className="py-2 pr-4 text-gray-700 dark:text-gray-300">{fmt(dateFrom(created))}</td>
                          </tr>
                        );
                      }
                      
                      if (activeTab === 'services') {
                        return (
                          <tr
                            key={row.id}
                            onClick={() => openDetails('services', row.id, row)}
                            className={`cursor-pointer border-b border-gray-200 hover:bg-gray-50 dark:border-gray-700/70 dark:hover:bg-gray-700/40 ${isUnread ? 'font-semibold' : ''}`}
                          >
                            <td className="py-2 pr-4 text-gray-900 dark:text-gray-100">
                              {row.service || row.category || 'Uncategorized Service'}
                            </td>
                            <td className="py-2 pr-4">{statusBadge(status)}</td>
                            <td className="py-2 pr-4 text-gray-700 dark:text-gray-300">{fmt(dateFrom(created))}</td>
                          </tr>
                        );
                      }
                      
                      // Default rendering for other tabs (quotes)
                      return (
                        <tr
                          key={row.id}
                          onClick={() => openDetails(activeTab as any, row.id, row)}
                          className={`cursor-pointer border-b border-gray-200 hover:bg-gray-50 dark:border-gray-700/70 dark:hover:bg-gray-700/40 ${isUnread ? 'font-semibold' : ''}`}
                        >
                          <td className="py-2 pr-4 text-gray-900 dark:text-gray-100 truncate max-w-[14rem]" title={row.quoteType || row.type || row.id}>
                            {row.quoteType || row.type || '—'}
                          </td>
                          <td className="py-2 pr-4">{statusBadge(status)}</td>
                          <td className="py-2 pr-4 text-gray-700 dark:text-gray-300">{fmt(dateFrom(created))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {activeTab === 'devices' && (
              <div className="mt-3 flex justify-end">
                <button
                  onClick={() => setShowAddDeviceModal(true)}
                  className="px-3 py-1.5 text-sm rounded-md bg-teal-600 hover:bg-teal-700 text-white"
                >
                  Add/Remove Devices
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Centered details modal */}
      {drawerOpen && selected && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50" onClick={closeDetails} />
          <div
            className="absolute inset-0 flex items-center justify-center p-4"
            onWheel={(e) => {
              const target = e.target as HTMLElement;
              const isScrollable = target.closest('.modal-scroll-content');
              if (!isScrollable && e.cancelable) {
                e.preventDefault();
              }
            }}
            onTouchMove={(e) => {
              const target = e.target as HTMLElement;
              const isScrollable = target.closest('.modal-scroll-content');
              if (!isScrollable) {
                e.preventDefault();
              }
            }}
          >
            <div
              className="modal-scroll-content w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-5 overflow-y-auto max-h-[90vh]"
              style={{
                overscrollBehavior: 'contain',
                WebkitOverflowScrolling: 'touch',
                scrollbarWidth: 'thin',
                msOverflowStyle: 'none',
                touchAction: 'pan-y'
              }}
              onWheel={(e) => {
                // Keep wheel inside and prevent scroll chaining at edges
                e.stopPropagation();
                const el = e.currentTarget as HTMLDivElement;
                const { scrollTop, scrollHeight, clientHeight } = el;
                const atTop = scrollTop <= 0;
                const atBottom = Math.ceil(scrollTop + clientHeight) >= scrollHeight;
                if ((e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom)) {
                  if (e.cancelable) e.preventDefault();
                }
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">{selected.type === 'quotes' ? 'Quote' : selected.type === 'services' ? 'Service Request' : 'Support Ticket'} Details</h3>
                <button onClick={closeDetails} className="text-gray-300 hover:text-white">✕</button>
              </div>
              <div className="space-y-2 text-sm">
                {/* Subheader meta under title */}
                <div className="text-gray-400 flex items-center gap-2 mb-2">
                  <span>📅</span>
                  <span className="font-medium">Created</span>
                  <span className="text-gray-200">{fmtPretty(dateFrom(selected.data?.createdAt ?? selected.data?.created_at ?? selected.data?.ts))}</span>
                </div>

                {/* Top info grid */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-gray-400 flex items-center gap-1">🆔 <span>Request ID</span></div>
                  <div className="col-span-2 text-gray-100 break-all">{selected.id}</div>
                  {/* Created & Status moved out of this grid */}
                </div>

              {/* Details section */}
              <div className="mt-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  {detailData.rows.map((r, i) => (
                    <div key={i} className={r.wide ? 'sm:col-span-2' : ''}>
                      <div className="text-gray-400">{r.label}</div>
                      <div className={`text-gray-100 ${r.isLongText ? 'whitespace-pre-wrap' : ''}`}>
                        {React.isValidElement(r.value) ? r.value : (r.value ?? '—')}
                      </div>
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

              {/* Bottom status control */}
              <div className="mt-6 border-t border-gray-700 pt-4">
                <div className="text-gray-400 flex items-center gap-2 mb-2">
                  <span>🏷️</span>
                  <span className="font-medium">Status</span>
                </div>
                <div>
                  {selected.type === 'services' || selected.type === 'tickets' ? (
                    <StatusChangeButton
                      value={editStatus}
                      options={statusOptionsByType[selected.type]}
                      onChange={setEditStatus}
                      onSave={saveStatus}
                      saving={saving}
                    />
                  ) : (
                    statusBadge(selected.data?.status ?? selected.data?.Status)
                  )}
                </div>
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
              
              {/* Estimation Editor / Creator */}
              {selected?.type === 'quotes' && (
                <EstimationEditor
                  selected={selected as any}
                  accountEmail={account?.Email}
                  accountUid={account?.id}
                  estimation={estimation}
                  onSaved={async (saved) => {
                    setEstimation(saved);
                    try {
                      if (selected?.type !== 'quotes') return;
                      const isFlat = !!(selected?.data?.userUid || selected?.data?.uid);
                      const estId = saved?.id || saved?.quoteId;
                      if (isFlat) {
                        // Flat quotes collection
                        await updateDoc(doc(db, 'quotes', selected.id), {
                          status: 'Confirmed',
                          hasEstimation: true,
                          estimationQuoteId: estId,
                          updatedAt: Timestamp.now(),
                        } as any);
                      } else if (account?.id) {
                        // Nested quotes under user
                        await updateDoc(quoteDoc(db, account.id, selected.id) as any, {
                          status: 'confirmed',
                          hasEstimation: true,
                          estimationQuoteId: estId,
                          updatedAt: Timestamp.now(),
                        } as any);
                      }

                      // Sync local UI state
                      const newStatus = isFlat ? 'Confirmed' : 'confirmed';
                      setQuotes((prev) => (prev || []).map((q) => q.id === selected.id ? { ...q, status: newStatus, hasEstimation: true, estimationQuoteId: estId } : q));
                      setSelected((s) => s ? { ...s, data: { ...s.data, status: newStatus, hasEstimation: true, estimationQuoteId: estId } } : s);
                    } catch (e) {
                      console.error('Failed to update quote status after estimation save:', e);
                    }
                  }}
                />
              )}
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
    {/* Enhanced custom styles for mobile-optimized design */}
    <style>
      {`
        .custom-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(20, 184, 166, 0.6) rgba(0,0,0,0.1);
        }
        .custom-scroll::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .custom-scroll::-webkit-scrollbar-track {
          background: rgba(0,0,0,0.1);
          border-radius: 8px;
        }
        .custom-scroll::-webkit-scrollbar-thumb {
          background: rgba(20, 184, 166, 0.6);
          border-radius: 8px;
        }
        .custom-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(20, 184, 166, 0.8);
        }

        /* Smooth transitions for all interactive elements */
        * {
          transition-property: background-color, border-color, color, fill, stroke, opacity, box-shadow, transform, filter, backdrop-filter;
          transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
          transition-duration: 300ms;
        }
      `}
    </style>
    </section>
  );
}

export default AdminUserDetail;
