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
  type?: string;
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
  description?: string;
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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-white">My Devices</h1>
        <span className="text-sm text-gray-400">{devices.length} device{devices.length !== 1 ? 's' : ''}</span>
      </div>
      
      {devices.length === 0 ? (
        <div className="mt-8 text-center py-12 bg-gray-900/50 rounded-lg border border-gray-800">
          <svg
            className="mx-auto h-12 w-12 text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-white">No devices found</h3>
          <p className="mt-1 text-sm text-gray-400">You don't have any devices assigned to your account.</p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map((device) => (
            <div key={device.id} className="glass-surface rounded-2xl overflow-hidden hover:shadow-soft-lg transition-all">
              {device.imageUrl ? (
                <img 
                  src={device.imageUrl} 
                  alt={device.deviceName || device.name || 'Device'} 
                  className="w-full h-40 object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.onerror = null;
                    target.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMjAwIiB2aWV3Qm94PSIwIDAgNDAwIDIwMCI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iIzFhMjEyOSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjNGJmZjZmIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiPk5vIGltYWdlIGF2YWlsYWJsZTwvdGV4dD48L3N2Zz4=';
                  }}
                />
              ) : (
                <div className="w-full h-40 flex items-center justify-center bg-gray-100 dark:bg-gray-800/50">
                  <svg className="h-16 w-16 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
              
              <div className="p-4">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate mb-3" title={device.deviceName || device.name || 'Unnamed Device'}>
                    {device.deviceName || device.name || 'Unnamed Device'}
                  </h3>
                </div>
                
                <div className="mt-3 grid grid-cols-1 gap-2 text-xs">
                  {device.brand && (
                    <div className="truncate">
                      <span className="text-gray-600 dark:text-gray-400">Brand:</span>
                      <span className="ml-1 text-gray-900 dark:text-gray-300" title={device.brand}>{device.brand}</span>
                    </div>
                  )}
                  {device.modelNumber && (
                    <div className="truncate">
                      <span className="text-gray-600 dark:text-gray-400">Model:</span>
                      <span className="ml-1 text-gray-900 dark:text-gray-300" title={device.modelNumber}>{device.modelNumber}</span>
                    </div>
                  )}
                  {device.type && (
                    <div className="truncate">
                      <span className="text-gray-600 dark:text-gray-400">Type:</span>
                      <span className="ml-1 text-gray-900 dark:text-gray-300" title={device.type}>{device.type}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => openDetails(device)}
                    className="px-5 py-2 text-sm bg-teal-600 hover:bg-teal-500 text-white rounded-full shadow-soft select-none transform-gpu transition-transform duration-150 ease-out hover:scale-[1.03] active:scale-95 focus:outline-none focus:ring-0 touch-manipulation"
                  >
                    View Details
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {selectedDevice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          onClick={() => { setSelectedDevice(null); setSelectedDeviceCount(null); setUserTotalDevices(null); }}
        >
          <div
            ref={modalRef}
            className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Device Details</h3>
              <button
                className="flex items-center space-x-1 px-3 py-1.5 rounded-full bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/40 text-red-600 hover:text-red-700 dark:text-red-300 dark:hover:text-red-200 transition-all duration-200 text-sm shadow-sm hover:shadow-md hover:shadow-red-500/20 dark:hover:shadow-red-400/10 border border-red-100 dark:border-red-800/50 hover:border-red-200 dark:hover:border-red-700"
                aria-label="Close"
                onClick={() => { setSelectedDevice(null); setSelectedDeviceCount(null); setUserTotalDevices(null); }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>Close</span>
              </button>
            </div>

            <div
              className="px-4 py-4 text-sm space-y-3 overflow-y-auto flex-1 custom-scrollbar"
              style={{ WebkitOverflowScrolling: 'touch' as any }}
              onWheel={onContentWheel}
              onWheelCapture={onContentWheel}
              tabIndex={0}
            >
              <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
                <h4 className="font-medium text-gray-900 dark:text-gray-200 mb-3">Device Information</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Name</div>
                    <div className="text-gray-800 dark:text-gray-200">{selectedDevice.deviceName || selectedDevice.name || '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Brand</div>
                    <div className="text-gray-800 dark:text-gray-200">{selectedDevice.brand || '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Model</div>
                    <div className="text-gray-800 dark:text-gray-200">{selectedDevice.modelNumber || '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Type</div>
                    <div className="text-gray-800 dark:text-gray-200">{selectedDevice.type || '—'}</div>
                  </div>
                  {selectedDeviceCount !== null && (
                    <div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Quantity</div>
                      <div className="text-gray-800 dark:text-gray-200">{selectedDeviceCountLoading ? 'Loading…' : selectedDeviceCount}</div>
                    </div>
                  )}
                </div>
              </div>

              {selectedDevice.description && (
                <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-900 dark:text-gray-200 mb-2">Description</h4>
                  <p className="text-gray-700 dark:text-gray-300 text-sm">{selectedDevice.description}</p>
                </div>
              )}

              <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
                <h4 className="font-medium text-gray-900 dark:text-gray-200 mb-3">Serial Numbers</h4>
                {selectedDevice.serials && selectedDevice.serials.length > 0 ? (
                  <div className="space-y-2">
                    {selectedDevice.serials.map((serialItem: SerialItem, index: number) => (
                      <div key={index} className="grid grid-cols-2 gap-4 p-3 bg-gray-100 dark:bg-gray-700/30 rounded">
                        <div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Serial Number</div>
                          <div className="text-gray-800 dark:text-gray-200 font-mono">{serialItem.serialNumber || '—'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Warranty Expiry</div>
                          <div className="text-gray-800 dark:text-gray-200">{serialItem.warrantyExpiry ? new Date(serialItem.warrantyExpiry).toLocaleDateString() : '—'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-600 dark:text-gray-400 text-sm">No serial numbers available</p>
                )}
              </div>

              {selectedDevice.documentationUrl && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
                  <a
                    href={selectedDevice.documentationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-sm flex items-center"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    View Documentation
                  </a>
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
