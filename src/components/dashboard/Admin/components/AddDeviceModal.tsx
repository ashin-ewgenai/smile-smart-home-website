import { useEffect, useMemo, useState, useRef } from 'react';
import { collection, doc, getDocs, setDoc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '../../../../lib/firebase';

interface AddDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onDeviceAdded: () => void;
}

interface Device {
  id: string;
  deviceName: string;
  type: string;
  modelNumber: string;
  brand: string;
  description?: string;
  documentation?: string;
  warranty?: string;
  status?: string;
  stock?: number;
  imageUrl?: string;
  createdAt?: any;
  createdByEmail?: string;
  createdByUid?: string;
}

export default function AddDeviceModal({ isOpen, onClose, userId, onDeviceAdded }: AddDeviceModalProps) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const [assignedIds, setAssignedIds] = useState<string[]>([]);
  const [pendingDevice, setPendingDevice] = useState<Device | null>(null);
  const [serialInput, setSerialInput] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [quantityStr, setQuantityStr] = useState<string>('1');
  const [serialInputs, setSerialInputs] = useState<string[]>(['']);
  const [addDate, setAddDate] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const parsedQty = useMemo(() => {
    const n = parseInt(quantityStr, 10);
    if (Number.isFinite(n) && n > 0) return n;
    return 0;
  }, [quantityStr]);

  // Add passive event listener for better touchpad scrolling
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      if (!container.contains(e.target as Node)) return;
      
      const isScrollingDown = e.deltaY > 0;
      const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 1;
      const isAtTop = container.scrollTop === 0;

      if ((isScrollingDown && !isAtBottom) || (!isScrollingDown && !isAtTop)) {
        e.stopPropagation();
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Lock background/body scroll when modal is open and prevent background wheel/touch
  useEffect(() => {
    if (!isOpen) return;

    const body = document.body;
    const html = document.documentElement;
    const scrollY = window.scrollY;
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';

    const onTouchMove = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      const isScrollable = target.closest('.modal-scroll-content');
      if (!isScrollable) {
        e.preventDefault();
      }
    };
    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      const isInsideScrollable = target?.closest?.('.modal-scroll-content');
      if (!isInsideScrollable) {
        e.preventDefault();
      }
    };

    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.overflow = '';
      html.style.overflow = '';
      window.scrollTo(0, scrollY);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('wheel', onWheel as EventListener);
    };
  }, [isOpen]);
  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');

  const fetchDevices = async () => {
    if (!isOpen) return;
    
    try {
      setIsLoading(true);
      setError(null);

      // Get all devices
      const devicesSnapshot = await getDocs(collection(db, 'Devices'));
      const allDevices = devicesSnapshot.docs.map(doc => ({
        id: doc.id,
        deviceName: doc.data().deviceName || 'Unnamed Device',
        type: doc.data().type || 'Unknown',
        modelNumber: doc.data().modelNumber || '',
        brand: doc.data().brand || '',
        description: doc.data().description || '',
        warranty: doc.data().warranty || '',
        status: doc.data().status || 'Active',
        stock: doc.data().stock || 0,
        imageUrl: doc.data().imageUrl,
        ...doc.data()
      } as Device));

      // Get user's current devices from flat collection
      const userDevicesQuery = query(collection(db, 'User_Devices'), where('uid', '==', userId));
      const userDevicesSnapshot = await getDocs(userDevicesQuery);
      const userDeviceIds = new Set(userDevicesSnapshot.docs.map(doc => (doc.data() as any).sourceDeviceId || doc.id));
      // Show all devices; track which are assigned
      setDevices(allDevices);
      setAssignedIds(Array.from(userDeviceIds));
    } catch (err) {
      console.error('Error fetching devices:', err);
      setError('Failed to load devices. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Remove any User_Devices docs for this user that no longer have a matching Devices doc
  const cleanOrphanedUserDevices = async () => {
    try {
      const [devicesSnapshot, userDevicesSnapshot] = await Promise.all([
        getDocs(collection(db, 'Devices')),
        getDocs(query(collection(db, 'User_Devices'), where('uid', '==', userId)))
      ]);
      const validDeviceIds = new Set(devicesSnapshot.docs.map(d => d.id));
      const deletions: Promise<any>[] = [];
      userDevicesSnapshot.docs.forEach(docSnap => {
        const data = docSnap.data() as any;
        const sid = data?.sourceDeviceId;
        if (!sid || !validDeviceIds.has(sid)) {
          deletions.push(deleteDoc(docSnap.ref));
        }
      });
      if (deletions.length) {
        await Promise.all(deletions);
      }
    } catch (e) {
      console.error('Error cleaning orphaned user devices:', e);
    }
  };

  // Fetch devices when modal opens
  useEffect(() => {
    fetchDevices();
  }, [isOpen, userId]);

  // Derived: unique types/brands and filtered devices
  const allTypes = useMemo(() => {
    const s = new Set<string>();
    devices.forEach(d => d.type && s.add(d.type));
    return Array.from(s).sort();
  }, [devices]);

  const allBrands = useMemo(() => {
    const s = new Set<string>();
    devices.forEach(d => d.brand && s.add(d.brand));
    return Array.from(s).sort();
  }, [devices]);

  const filteredDevices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return devices.filter(d => {
      if (typeFilter && d.type !== typeFilter) return false;
      if (brandFilter && d.brand !== brandFilter) return false;
      if (!q) return true;
      const hay = `${d.deviceName} ${d.type} ${d.modelNumber} ${d.brand}`.toLowerCase();
      return hay.includes(q);
    });
  }, [devices, search, typeFilter, brandFilter]);

  const parseWarrantyToMonths = (w: unknown): number | null => {
    if (w == null) return null;
    if (typeof w === 'number' && isFinite(w)) return w;
    const s = String(w).toLowerCase().trim();
    const m = s.match(/(\d+\.?\d*)\s*(month|months|yr|yrs|year|years|m|y)/i);
    if (m) {
      const n = parseFloat(m[1]);
      const unit = m[2];
      if (!isFinite(n)) return null;
      if (unit.startsWith('y')) return Math.round(n * 12);
      return Math.round(n);
    }
    const onlyNum = s.match(/^(\d+)$/);
    if (onlyNum) return parseInt(onlyNum[1], 10);
    return null;
  };

  const computeWarrantyExpiry = (startISO: string, warrantyValue: unknown): string => {
    const months = parseWarrantyToMonths(warrantyValue);
    if (!months) return '';
    const d = new Date(startISO);
    const day = d.getDate();
    d.setMonth(d.getMonth() + months);
    if (d.getDate() < day) d.setDate(0);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const beginAddWithSerial = (deviceId: string) => {
    const source = devices.find(d => d.id === deviceId) || null;
    setPendingDevice(source);
    setSerialInput('');
    setQuantity(1);
    setQuantityStr('1');
    setSerialInputs(['']);
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    setAddDate(`${yyyy}-${mm}-${dd}`);
  };

  const confirmAddDevice = async () => {
    if (!pendingDevice) return;
    try {
      setError(null);
      const qty = quantityStr.trim() === '' ? quantity : Math.max(1, parseInt(quantityStr, 10) || 1);
      // Build serial list from new multi-inputs if present, else fallback to single input
      let serialList = (serialInputs && Array.isArray(serialInputs) ? serialInputs : [serialInput]).map(s => (s || '').trim());
      if (serialList.length < qty) {
        serialList = [...serialList, ...Array(qty - serialList.length).fill('')];
      } else if (serialList.length > qty) {
        serialList = serialList.slice(0, qty);
      }
      if (serialList.length !== qty) {
        setError('Please enter serial numbers for all units.');
        return;
      }
      if (serialList.some(s => !s)) {
        setError('Please enter a serial number for each unit.');
        return;
      }
      setSaving(true);
      const addedAtISO = new Date(`${addDate}T00:00:00`).toISOString();
      const warrantyExpiry = computeWarrantyExpiry(addedAtISO, pendingDevice.warranty);
      // Create one User_Devices document per serial number
      for (const s of serialList) {
        const deviceRef = doc(collection(db, 'User_Devices'));
        await setDoc(deviceRef, {
          uid: userId,
          sourceDeviceId: pendingDevice.id,
          brand: pendingDevice?.brand ?? '',
          description: pendingDevice?.description ?? '',
          deviceName: pendingDevice?.deviceName ?? '',
          documentation: (pendingDevice as any)?.documentation ?? '',
          modelNumber: pendingDevice?.modelNumber ?? '',
          type: pendingDevice?.type ?? '',
          addedAt: addedAtISO,
          updatedAt: addedAtISO,
          isOnline: false,
          numberOfDevices: 1,
          serialNumber: s,
          warrantyExpiry: warrantyExpiry
        });
      }
      await cleanOrphanedUserDevices();
      onDeviceAdded();
      setAddedIds(prev => (prev.includes(pendingDevice.id) ? prev : [...prev, pendingDevice.id]));
      setAssignedIds(prev => (prev.includes(pendingDevice.id) ? prev : [...prev, pendingDevice.id]));
      setPendingDevice(null);
      setSerialInput('');
      setSerialInputs(['']);
    } catch (err) {
      console.error('Error adding device:', err);
      setError('Failed to add device. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveDevice = async (deviceId: string) => {
    try {
      setError(null);
      // Find and delete all user device docs for this device
      const userDevicesQueryRef = query(
        collection(db, 'User_Devices'),
        where('uid', '==', userId),
        where('sourceDeviceId', '==', deviceId)
      );
      const snap = await getDocs(userDevicesQueryRef);
      const deletions: Promise<any>[] = [];
      snap.docs.forEach(docSnap => deletions.push(deleteDoc(docSnap.ref)));

      // Legacy fallback: doc id equals deviceId
      try {
        const legacySnap = await getDocs(query(collection(db, 'User_Devices'), where('uid', '==', userId)));
        const legacyDoc = legacySnap.docs.find(d => d.id === deviceId);
        if (legacyDoc) deletions.push(deleteDoc(legacyDoc.ref));
      } catch {}

      if (deletions.length) await Promise.all(deletions);
      onDeviceAdded();
      // Unmark as added and assigned so UI shows Add again
      setAddedIds(prev => prev.filter(id => id !== deviceId));
      setAssignedIds(prev => prev.filter(id => id !== deviceId));
    } catch (err) {
      console.error('Error removing device:', err);
      setError('Failed to remove device. Please try again.');
    }
  };

  const handleRemoveDevices = async () => {
    if (selectedDevices.length === 0) return;

    try {
      setError(null);
      const batch: Promise<any>[] = [];

      for (const deviceId of selectedDevices) {
        // Query for user devices with matching sourceDeviceId
        const userDevicesQuery = query(
          collection(db, 'User_Devices'), 
          where('uid', '==', userId),
          where('sourceDeviceId', '==', deviceId)
        );
        const userDevicesSnapshot = await getDocs(userDevicesQuery);
        
        // Delete all matching documents
        userDevicesSnapshot.docs.forEach(doc => {
          batch.push(deleteDoc(doc.ref));
        });

        // Additionally, handle legacy records where the User_Devices doc id equals the deviceId
        // (older entries that didn't set sourceDeviceId)
        try {
          const legacyRef = doc(collection(db, 'User_Devices'), deviceId);
          const legacySnap = await getDocs(query(collection(db, 'User_Devices'), where('uid', '==', userId)));
          const legacyDoc = legacySnap.docs.find(d => d.id === deviceId);
          if (legacyDoc) {
            batch.push(deleteDoc(legacyDoc.ref));
          }
        } catch {
          // no-op if not found
        }
      }

      await Promise.all(batch);
      onDeviceAdded();
      onClose();
    } catch (err) {
      console.error('Error removing devices:', err);
      setError('Failed to remove devices. Please try again.');
    }
  };

  if (!isOpen) return null;

  // Handle wheel events for better touchpad support
  const handleWheel = (e: React.WheelEvent) => {
    const container = e.currentTarget;
    const isScrollingDown = e.deltaY > 0;
    const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 1;
    const isAtTop = container.scrollTop === 0;

    // Prevent page scroll when at the top/bottom of the container
    if ((isScrollingDown && !isAtBottom) || (!isScrollingDown && !isAtTop)) {
      e.stopPropagation();
    }
  };

  return (
    <>
    <div
      className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 ${isOpen ? 'flex' : 'hidden'}`}
      onClick={onClose}
      onWheel={(e) => {
        const target = e.target as HTMLElement;
        const isScrollable = target.closest('.modal-scroll-content');
        if (!isScrollable) {
          // Avoid preventDefault on React's passive wheel listener; block bubbling only.
          e.stopPropagation();
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
        className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 pb-0 bg-white dark:bg-gray-800 flex-shrink-0">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              Add Devices
            </h3>
            <div className="flex items-center space-x-4">
              <button
                onClick={onClose}
                className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          {error && (
            <div className="mb-4 p-3 bg-red-900/30 text-red-300 border border-red-700 rounded-md">
              {error}
            </div>
          )}

          <div className="space-y-4 pb-4">
            {/* Toolbar: search + filters */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
              <div className="flex-1">
                <label className="block text-xs text-gray-600 mb-1 dark:text-gray-400">Search</label>
                <div className="relative">
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name, type, model, brand..."
                    className="w-full bg-white text-gray-900 placeholder-gray-400 border border-gray-300 rounded-md pl-9 pr-3 py-2 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:bg-gray-700/80 dark:text-gray-100 dark:border-gray-600"
                  />
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">🔎</span>
                </div>
              </div>
              <div className="sm:w-52">
                <label className="block text-xs text-gray-600 mb-1 dark:text-gray-400">Type</label>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="w-full bg-white text-gray-900 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:bg-gray-700/80 dark:text-gray-100 dark:border-gray-600"
                >
                  <option value="">All</option>
                  {allTypes.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="sm:w-52">
                <label className="block text-xs text-gray-600 mb-1 dark:text-gray-400">Brand</label>
                <select
                  value={brandFilter}
                  onChange={(e) => setBrandFilter(e.target.value)}
                  className="w-full bg-white text-gray-900 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:bg-gray-700/80 dark:text-gray-100 dark:border-gray-600"
                >
                  <option value="">All</option>
                  {allBrands.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
              {(search || typeFilter || brandFilter) && (
                <button
                  onClick={() => { setSearch(''); setTypeFilter(''); setBrandFilter(''); }}
                  className="sm:self-auto self-stretch px-3 py-2 text-sm rounded-md bg-gray-700 hover:bg-gray-600 text-white"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="text-xs text-gray-600 -mt-2 dark:text-gray-400">{filteredDevices.length} of {devices.length} devices</div>

          </div>

        </div>

        {/* Scrollable content */}
        <div 
        ref={scrollContainerRef}
        className="modal-scroll-content flex-1 overflow-y-auto px-6 py-4"
        style={{
          maxHeight: '50vh',
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          scrollBehavior: 'smooth',
          overscrollBehavior: 'contain',
          scrollbarWidth: 'thin',
          msOverflowStyle: 'none',
          touchAction: 'pan-y',
          willChange: 'transform',
          WebkitTransform: 'translateZ(0)'
        }}
        onWheel={(e) => {
          // Keep wheel events contained within the modal; edge-case prevention handled by non-passive native listener.
          e.stopPropagation();
        }}
      >
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white dark:bg-gray-800">
            <tr className="text-left text-gray-400 border-b border-gray-700">
              <th className="py-2 pr-4">Action</th>
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Type</th>
              <th className="py-2 pr-4">Model</th>
              <th className="py-2">Manufacturer</th>
            </tr>
          </thead>
          <tbody>
            {filteredDevices.map((device) => (
              <tr
                key={device.id}
                className={`border-b border-gray-200 hover:bg-gray-50 dark:border-gray-700/50 dark:hover:bg-gray-800/50`}
              >
                <td className="py-3 pr-4">
                  <button
                    onClick={() => beginAddWithSerial(device.id)}
                    className="inline-flex items-center justify-center min-w-[96px] px-3 py-2 text-sm font-medium rounded-md bg-teal-600 hover:bg-teal-700 text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    Add
                  </button>
                </td>
                <td className="py-3 pr-4 text-gray-900 dark:text-gray-100">{device.deviceName}</td>
                <td className="py-3 pr-4 text-gray-700 dark:text-gray-300">{device.type}</td>
                <td className="py-3 pr-4 text-gray-700 dark:text-gray-300">{device.modelNumber || '-'}</td>
                <td className="py-3 text-gray-700 dark:text-gray-300">{device.brand || '-'}</td>
              </tr>
            ))}
            {filteredDevices.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-gray-600 dark:text-gray-400">No devices match your filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4">
        <div className="flex justify-end items-center">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md bg-gray-200 hover:bg-gray-300 text-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white">Close</button>
        </div>
      </div>
    </div>
  </div>
  {pendingDevice && (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => !saving && setPendingDevice(null)}>
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Add Device</h4>
        <div className="text-sm text-gray-600 dark:text-gray-300 mb-4">{pendingDevice?.deviceName || '-'} • {pendingDevice?.modelNumber || '-'} • {pendingDevice?.brand || '-'}</div>
        {error && (
          <div className="mb-3 p-2 text-sm bg-red-900/30 text-red-300 border border-red-700 rounded">{error}</div>
        )}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Quantity</label>
              <input
                type="number"
                min={1}
                value={quantityStr}
                onChange={(e) => {
                  const val = e.target.value;
                  setQuantityStr(val);
                  const parsed = parseInt(val, 10);
                  if (Number.isFinite(parsed) && parsed > 0) {
                    setQuantity(parsed);
                    setSerialInputs((prev) => {
                      const arr = [...prev];
                      while (arr.length < parsed) arr.push('');
                      while (arr.length > parsed) arr.pop();
                      return arr;
                    });
                  }
                }}
                className="w-full bg-white text-gray-900 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:bg-gray-700/80 dark:text-gray-100 dark:border-gray-600"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Added Date</label>
              <input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} className="w-full bg-white text-gray-900 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:bg-gray-700/80 dark:text-gray-100 dark:border-gray-600" />
            </div>
          </div>
          {parsedQty > 0 ? (
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Serial Numbers</label>
              <div className="space-y-2">
                {Array.from({ length: parsedQty }).map((_, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="text-xs w-5 text-gray-500">{idx + 1}.</span>
                    <input
                      value={serialInputs[idx] || ''}
                      onChange={(e) => setSerialInputs((prev) => {
                        const arr = [...prev];
                        arr[idx] = e.target.value;
                        return arr;
                      })}
                      className="flex-1 bg-white text-gray-900 placeholder-gray-400 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:bg-gray-700/80 dark:text-gray-100 dark:border-gray-600"
                      placeholder={`Enter serial number #${idx + 1}`}
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      Exp: {(() => {
                        const iso = new Date(`${addDate}T00:00:00`).toISOString();
                        const exp = computeWarrantyExpiry(iso, pendingDevice?.warranty);
                        return exp || '-';
                      })()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-500 dark:text-gray-400">Enter a quantity to add serial numbers</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Warranty</label>
              <div className="px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 text-gray-800 dark:text-gray-200 text-sm">
                {(() => {
                  const months = parseWarrantyToMonths(pendingDevice?.warranty);
                  return months ? `${months} months` : 'No default warranty';
                })()}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button disabled={saving} onClick={() => setPendingDevice(null)} className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">Cancel</button>
          <button disabled={saving || parsedQty < 1} onClick={confirmAddDevice} className="px-4 py-2 text-sm rounded-md bg-teal-600 hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed text-white focus:outline-none focus:ring-2 focus:ring-teal-500">
            {saving ? 'Saving...' : 'Add Device'}
          </button>
        </div>
      </div>
    </div>
  )}
    </>
  );
}
