import React, { useEffect, useMemo, useState } from 'react';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useDevices } from '../../../contexts/DevicesContext';

// Minimal view-model for Devices collection (aligns with `src/models/Collections.ts` Device)
interface SerialItem {
  serialNumber?: string;
  serial?: string;
  warrantyExpiry?: string | Date;
}

type DeviceDoc = {
  id: string;
  deviceName?: string;
  name?: string;
  model?: string;
  type?: string;
  quantity?: number;
  description?: string;
  serialNumbers?: Array<{
    serialNumber: string;
    warrantyExpiry?: string | Date;
  }>;
  status?: string;
  serial?: string;
  modelNumber?: string;
  imageUrl?: string;
  price?: number | null;
  stock?: number | null;
  rating?: number | null;
  discount?: number | null;
  warranty?: any | null;
  warrantySource?: 'user' | 'device';
  brand?: string;
  documentationUrl?: string;
  serials?: SerialItem[];
};

// --- Component ---

const AboutDevices: React.FC = () => {
  const { devices, loading, error, uid } = useDevices();
  const deviceTypes = useMemo(() => {
    const s = new Set<string>();
    devices.forEach(d => { if (d.type) s.add(d.type); });
    return s;
  }, [devices]);
  // Modernized UI controls
  const [queryText, setQueryText] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'name'|'brand'|'type'>('name');
  const [selectedDevice, setSelectedDevice] = useState<DeviceDoc | null>(null);
  const [selectedDeviceCount, setSelectedDeviceCount] = useState<number | null>(null);
  const [selectedDeviceCountLoading, setSelectedDeviceCountLoading] = useState(false);
  const [userTotalDevices, setUserTotalDevices] = useState<number | null>(null);
  const modalRef = React.useRef<HTMLDivElement>(null);
  // Non-blocking wheel handler to ensure scrolling always works inside modal content
  const onContentWheel = React.useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    // Do NOT call preventDefault to avoid passive listener issues
    el.scrollTop += e.deltaY;
  }, []);

  // Lock background scroll when modal is open
  useEffect(() => {
    if (!selectedDevice) return;
    const body = document.body;
    const html = document.documentElement;
    const scrollY = window.scrollY;
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';

    return () => {
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.width = '';
      body.style.overflow = '';
      html.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, [selectedDevice]);

  // Helper: try multiple keys and parse number-like strings
  const coerceNumberFromKeys = (obj: any, keys: string[]): number | null => {
    for (const k of keys) {
      const v = obj?.[k];
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'string') {
        const n = Number(v);
        if (Number.isFinite(n)) return n;
      }
    }
    return null;
  };

  // Helper: extract user-specific warranty from userdevices doc
  // Looks for serials: [{ serialNumber, warrantyExpiry }]
  const getUserWarranty = (userData: any, serialHint?: string): any => {
    try {
      // 1) If serials array of maps exists, try to match by serialNumber
      if (Array.isArray(userData?.serials)) {
        const items = userData.serials as Array<any>;
        if (serialHint) {
          const found = items.find(it => (it?.serialNumber || it?.serial) === serialHint);
          if (found && (found.warrantyExpiry || found.warrantyexpiry)) {
            return found.warrantyExpiry ?? found.warrantyexpiry;
          }
        }
        // If no match: pick a valid warranty from the list (prefer latest date)
        let best: any = null;
        let bestTime = -Infinity;
        for (const it of items) {
          const val = it?.warrantyExpiry ?? it?.warrantyexpiry ?? null;
          if (!val) continue;
          // Try to parse to time for comparison
          let t = NaN;
          if (val && typeof val === 'object' && typeof val.toDate === 'function') {
            t = (val as Timestamp).toDate().getTime();
          } else if (typeof val === 'number') {
            const ms = val < 1e12 ? val * 1000 : val;
            t = new Date(ms).getTime();
          } else if (typeof val === 'string') {
            t = Date.parse(val);
          }
          if (!Number.isNaN(t) && t > bestTime) {
            bestTime = t;
            best = val;
          }
        }
        if (best !== null) return best;
      }
      // 2) Fallback to top-level fields on user doc
      return (
        userData?.warrantyExpiry ??
        userData?.warrantyexpiry ??
        userData?.warrantyDate ??
        userData?.warrantyEnd ??
        userData?.warranty_end ??
        userData?.warranty ??
        null
      );
    } catch {
      return null;
    }
  };

  // Helper: format warranty values from various possible Firestore shapes
  const formatWarranty = (value: any): string => {
    if (value === null || value === undefined) return '—';
    try {
      // Firestore Timestamp
      if (value && typeof value === 'object' && typeof value.toDate === 'function') {
        const d = (value as Timestamp).toDate();
        return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
      }
      // Number epoch (ms or s)
      if (typeof value === 'number') {
        const ms = value < 1e12 ? value * 1000 : value; // if seconds, convert to ms
        const d = new Date(ms);
        return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
      }
      // String date
      if (typeof value === 'string') {
        const parsed = Date.parse(value);
        if (Number.isNaN(parsed)) {
          // Not a parseable date; show raw text
          return value;
        }
        const d = new Date(parsed);
        return isNaN(d.getTime()) ? value : d.toLocaleDateString();
      }
      // Fallback textual representation
      return String(value);
    } catch {
      return '—';
    }
  };

  // Devices list is provided by DevicesContext; no fetching here.

  // Open details modal and fetch this device's count from userdevices/{uid}/devices/{deviceId}
  const openDetails = async (device: DeviceDoc) => {
    setSelectedDevice(device);
    setSelectedDeviceCount(null);
    setUserTotalDevices(null);
    if (!uid) return;
    try {
      setSelectedDeviceCountLoading(true);
      // Query flat collection for this user's device
      const userDevicesCol = collection(db, 'User_Devices');
      let qSnap = await getDocs(query(userDevicesCol, where('uid', '==', uid), where('sourceDeviceId', '==', device.id)));
      if (qSnap.empty) {
        qSnap = await getDocs(query(userDevicesCol, where('uid', '==', uid), where('deviceId', '==', device.id)));
      }
      const snap = qSnap.docs[0];
      if (snap.exists()) {
        const data: any = snap.data();
        // Try multiple possible fields incl. common aliases; fall back to serials length
        const countAliases = ['deviceCount','DeviceCount','deviceCount1','DeviceCount1','count','Count','quantity','Quantity','qty','Qty'];
        const parsed = coerceNumberFromKeys(data, countAliases);
        const count = parsed ?? (Array.isArray(data.serials) ? data.serials.length : null);
        setSelectedDeviceCount(count ?? null);
      } else {
        setSelectedDeviceCount(null);
      }

      // Calculate total device count from flat collection
      try {
        const allUserDevicesSnap = await getDocs(query(userDevicesCol, where('uid', '==', uid)));
        let totalCount = 0;
        allUserDevicesSnap.docs.forEach(doc => {
          const data = doc.data();
          const countAliases = ['deviceCount','DeviceCount','deviceCount1','DeviceCount1','count','Count','quantity','Quantity','qty','Qty'];
          const parsed = coerceNumberFromKeys(data, countAliases);
          const count = parsed ?? (Array.isArray(data.serials) ? data.serials.length : 1);
          totalCount += count;
        });
        setUserTotalDevices(totalCount);
      } catch (e) {
      }
    } catch (e) {
      setSelectedDeviceCount(null);
    } finally {
      setSelectedDeviceCountLoading(false);
    }
  };

  // Derived filtered & sorted list (must be before any early returns to satisfy Rules of Hooks)
  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    const t = typeFilter.toLowerCase();
    let list = devices.filter(d => {
      const name = String(d.deviceName || d.name || '').toLowerCase();
      const brand = String(d.brand || '').toLowerCase();
      const model = String(d.modelNumber || '').toLowerCase();
      const type = String(d.type || '').toLowerCase();
      const matchesQuery = !q || name.includes(q) || brand.includes(q) || model.includes(q);
      const matchesType = t === 'all' || type === t;
      return matchesQuery && matchesType;
    });
    list.sort((a,b) => {
      const av = String((sortBy === 'name' ? (a.deviceName || a.name) : sortBy === 'brand' ? a.brand : a.type) || '').toLowerCase();
      const bv = String((sortBy === 'name' ? (b.deviceName || b.name) : sortBy === 'brand' ? b.brand : b.type) || '').toLowerCase();
      return av.localeCompare(bv);
    });
    return list;
  }, [devices, queryText, typeFilter, sortBy]);

  if (loading) {
    return (
      <section className="p-6">
        <h1 className="text-2xl font-semibold text-white">My Devices</h1>
        <div className="mt-4 flex justify-center items-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
          <span className="ml-3 text-gray-300">Loading your devices...</span>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="p-6">
        <h1 className="text-2xl font-semibold text-white">My Devices</h1>
        <div className="mt-4 p-4 bg-red-900/30 border border-red-700 rounded text-red-200">
          <p className="font-medium">Error loading devices</p>
          <p className="text-sm mt-1">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 px-3 py-1 text-sm bg-red-700 hover:bg-red-600 rounded transition-colors"
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="p-6">
      <style>{`
        /* Match dropdown menu (option list) background to select bg */
        .about-devices-select option { background-color: #ffffff; color: #111827; }
        .dark .about-devices-select option { background-color: #111827; color: #e5e7eb; }
      `}</style>
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Devices</h1>
          <p className="text-xs text-gray-600 dark:text-gray-400 m-0">{devices.length} total • {filtered.length} shown</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full min-w-0">
          <div className="relative min-w-0">
            <input
              value={queryText}
              onChange={(e)=>setQueryText(e.target.value)}
              placeholder="Search by name brand model..."
              className="w-full px-10 py-2 rounded-xl bg-white border border-gray-300 text-gray-900 placeholder:text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal/70 dark:bg-gray-900/40 dark:border-gray-800 dark:text-gray-100 dark:placeholder-gray-400"
            />
            <svg className="absolute left-3 top-2.5 h-5 w-5 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
            </svg>
          </div>
          <select value={typeFilter} onChange={(e)=>setTypeFilter(e.target.value)} className="about-devices-select w-40 sm:w-48 min-w-0 px-3 py-2 rounded-xl bg-white border border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal/70 dark:bg-gray-900/40 dark:border-gray-800 dark:text-gray-100">
            <option>All</option>
            {Array.from(deviceTypes).map(t => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select value={sortBy} onChange={(e)=>setSortBy(e.target.value as any)} className="about-devices-select w-40 sm:w-48 min-w-0 px-3 py-2 rounded-xl bg-white border border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal/70 dark:bg-gray-900/40 dark:border-gray-800 dark:text-gray-100">
            <option value="name">Sort: Name</option>
            <option value="brand">Sort: Brand</option>
            <option value="type">Sort: Type</option>
          </select>
        </div>
      </div>
      
      {filtered.length === 0 ? (
        <div className="mt-8 text-center py-14 bg-gray-50 rounded-2xl border border-gray-200 dark:bg-gray-900/50 dark:border-gray-800">
          <svg className="mx-auto h-12 w-12 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <h3 className="mt-3 text-gray-900 dark:text-white font-medium">No devices match your filters</h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Try removing filters or searching with different keywords.</p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((device) => {
            const title = device.deviceName || device.name || 'Unnamed Device';
            const price = (device as any).price;
            const type = device.type;
            return (
              <div key={device.id} className="group relative overflow-hidden rounded-2xl bg-white dark:bg-gradient-to-b dark:from-gray-950/70 dark:to-gray-900/60 border border-gray-200 dark:border-gray-700 hover:border-teal/50 shadow-sm hover:shadow-teal-500/10 transition-all">
                <div className="relative">
                  {device.imageUrl ? (
                    <img
                      src={device.imageUrl}
                      alt={title}
                      className="w-full h-44 object-cover transform-gpu transition-transform duration-300 group-hover:scale-[1.03]"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.onerror = null;
                        target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZWVlIi8+PC9zdmc+';
                      }}
                    />
                  ) : (
                    <div className="w-full h-44 flex items-center justify-center bg-gray-100 dark:bg-gray-800/60">
                      <svg className="h-12 w-12 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    </div>
                  )}
                  {type && (
                    <span className="absolute top-3 left-3 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-black/70 dark:bg-black/60 backdrop-blur text-white border border-white/10">{type}</span>
                  )}
                </div>
                <div className="p-4 bg-white dark:bg-gray-900/70">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate" title={title}>{title}</h3>
                    {typeof price === 'number' && (
                      <span className="text-xs text-teal-700 dark:text-teal-300 whitespace-nowrap">₹{price.toLocaleString()}</span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-gray-700 dark:text-gray-300">
                    {device.brand && <span className="truncate">{device.brand}</span>}
                    {device.modelNumber && <span className="truncate opacity-80">{device.modelNumber}</span>}
                  </div>
                  {/* Rating removed as requested */}
                  <div className="mt-4 flex justify-end">
                    <button onClick={() => openDetails(device)} className="px-4 py-2 text-xs bg-teal-600 hover:bg-teal-500 text-white rounded-full shadow-soft transform-gpu transition-transform duration-150 ease-out hover:scale-[1.03] active:scale-95 focus:outline-none">
                      View Details
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {selectedDevice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto transition-all duration-300"
          role="dialog"
          aria-modal="true"
          onClick={() => { setSelectedDevice(null); setSelectedDeviceCount(null); setUserTotalDevices(null); }}
        >
          <div
            ref={modalRef}
            className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl bg-white dark:bg-gray-900/95 border border-gray-200/80 dark:border-gray-700/80 shadow-2xl overflow-hidden transform transition-all duration-300 scale-95 hover:scale-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-800">
              <div className="flex items-center space-x-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600 dark:text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7 2a2 2 0 00-2 2v12a2 2 0 002 2h6a2 2 0 002-2V4a2 2 0 00-2-2H7zm3 14a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Device Details</h3>
              </div>
              <button
                className="px-4 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 text-sm font-medium shadow-sm"
                onClick={() => { setSelectedDevice(null); setSelectedDeviceCount(null); setUserTotalDevices(null); }}
                aria-label="Close modal"
              >
                Close
              </button>
            </div>

            <div
              className="p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar"
              style={{ WebkitOverflowScrolling: 'touch' as any }}
              onWheel={onContentWheel}
              onWheelCapture={onContentWheel}
              tabIndex={0}
            >
              {/* Device Information Card */}
              <div className="bg-white dark:bg-gray-800/80 p-6 rounded-xl border border-gray-100 dark:border-gray-700/50 shadow-sm hover:shadow-md transition-shadow duration-300">
                <div className="flex items-center space-x-2 mb-4">
                  <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 0v12h8V4H6z" />
                    </svg>
                  </div>
                  <h4 className="text-base font-semibold text-gray-900 dark:text-white">Device Information</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</div>
                    <div className="text-gray-800 dark:text-gray-200 font-medium flex items-center">
                      <span className="truncate">{selectedDevice.deviceName}</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Brand</div>
                    <div className="text-gray-800 dark:text-gray-200">{selectedDevice.brand || 'N/A'}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Model</div>
                    <div className="text-gray-800 dark:text-gray-200">{selectedDevice.modelNumber || 'N/A'}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Type</div>
                    <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200">
                      {selectedDevice.type || 'N/A'}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Quantity</div>
                    <div className="text-gray-800 dark:text-gray-200 font-medium">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 text-sm">
                        {selectedDevice.quantity}
                      </span>
                    </div>
                  </div>
                  {selectedDevice.documentationUrl && (
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Documentation</div>
                      <div className="text-gray-800 dark:text-gray-200 font-medium">
                        <a
                          href={selectedDevice.documentationUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-4 inline-flex items-center text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-sm"
                        >
                          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          View Documentation
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Description Card */}
              {selectedDevice.description && (
                <div className="bg-white dark:bg-gray-800/80 p-6 rounded-xl border border-gray-100 dark:border-gray-700/50 shadow-sm hover:shadow-md transition-shadow duration-300">
                  <div className="flex items-center space-x-2 mb-4">
                    <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0l4 4a1 1 0 010 2 1 1 0 01-2 0l-4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <h4 className="text-base font-semibold text-gray-900 dark:text-white">Description</h4>
                  </div>
                  <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                    {selectedDevice.description}
                  </p>
                </div>
              )}

              {/* Serial Numbers Card */}
              {((selectedDevice.serialNumbers && selectedDevice.serialNumbers.length > 0) || (selectedDevice.serials && selectedDevice.serials.length > 0)) && (
                <div className="bg-white dark:bg-gray-800/80 p-6 rounded-xl border border-gray-100 dark:border-gray-700/50 shadow-sm hover:shadow-md transition-shadow duration-300">
                  <div className="flex items-center space-x-2 mb-4">
                    <div className="p-2 rounded-lg bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <h4 className="text-base font-semibold text-gray-900 dark:text-white">Serial Numbers & Warranty</h4>
                  </div>
                  <div className="space-y-3">
                    {(selectedDevice.serialNumbers || selectedDevice.serials || []).map((sn: any, index: number) => (
                      <div 
                        key={index} 
                        className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-100 dark:border-gray-700/50 hover:border-blue-200 dark:hover:border-blue-900/50 transition-colors duration-200"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Serial Number</div>
                            <div className="font-mono text-sm bg-gray-100 dark:bg-gray-800/50 px-3 py-1.5 rounded-md text-gray-800 dark:text-gray-200">
                              {sn.serialNumber || sn.serial}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Warranty Expiry</div>
                            <div className="flex items-center">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                sn.warrantyExpiry && new Date(sn.warrantyExpiry) > new Date() 
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' 
                                  : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                              }`}>
                                {sn.warrantyExpiry 
                                  ? new Date(sn.warrantyExpiry).toLocaleDateString() 
                                  : 'No expiry date'}
                                {sn.warrantyExpiry && new Date(sn.warrantyExpiry) > new Date() && (
                                  <svg className="ml-1 w-3 h-3" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default AboutDevices;
