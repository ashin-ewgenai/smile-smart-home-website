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
  const [viewMode, setViewMode] = useState<'add' | 'remove'>('add');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
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

      if (viewMode === 'add') {
        // In add mode, show only devices not assigned to the user
        const availableDevices = allDevices.filter(device => !userDeviceIds.has(device.id));
        setDevices(availableDevices);
      } else {
        // In remove mode, show only devices assigned to the user
        const userDevices = allDevices.filter(device => userDeviceIds.has(device.id));
        setDevices(userDevices);
      }
    } catch (err) {
      console.error('Error fetching devices:', err);
      setError('Failed to load devices. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch devices when modal opens or view mode changes
  useEffect(() => {
    fetchDevices();
  }, [isOpen, userId, viewMode]);

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

  const handleAddDevices = async () => {
    if (selectedDevices.length === 0) return;

    try {
      setError(null);
      const batch: Promise<any>[] = [];
      const now = new Date().toISOString();

      for (const deviceId of selectedDevices) {
        const deviceRef = doc(collection(db, 'User_Devices'));
        batch.push(
          setDoc(deviceRef, {
            uid: userId,
            sourceDeviceId: deviceId,
            addedAt: now,
            updatedAt: now,
            isOnline: false
          })
        );
      }

      await Promise.all(batch);
      onDeviceAdded();
      onClose();
    } catch (err) {
      console.error('Error adding devices:', err);
      setError('Failed to add devices. Please try again.');
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
        className="bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 pb-0 bg-gray-800 flex-shrink-0">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold text-white">
              {viewMode === 'add' ? 'Add Devices' : 'Remove Devices'}
            </h3>
            <div className="flex items-center space-x-4">
              <div className="flex rounded-md shadow-sm" role="group">
                <button
                  type="button"
                  onClick={() => setViewMode('add')}
                  className={`px-4 py-2 text-sm font-medium rounded-l-lg ${
                    viewMode === 'add'
                      ? 'bg-teal-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Add Devices
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('remove')}
                  className={`px-4 py-2 text-sm font-medium rounded-r-lg ${
                    viewMode === 'remove'
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Remove Devices
                </button>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white"
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
                <label className="block text-xs text-gray-400 mb-1">Search</label>
                <div className="relative">
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name, type, model, brand..."
                    className="w-full bg-gray-700/80 text-gray-100 placeholder-gray-400 border border-gray-600 rounded-md pl-9 pr-3 py-2 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">🔎</span>
                </div>
              </div>
              <div className="sm:w-52">
                <label className="block text-xs text-gray-400 mb-1">Type</label>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="w-full bg-gray-700/80 text-gray-100 border border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  <option value="">All</option>
                  {allTypes.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="sm:w-52">
                <label className="block text-xs text-gray-400 mb-1">Brand</label>
                <select
                  value={brandFilter}
                  onChange={(e) => setBrandFilter(e.target.value)}
                  className="w-full bg-gray-700/80 text-gray-100 border border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-teal-500"
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

            <div className="text-xs text-gray-400 -mt-2">{filteredDevices.length} of {devices.length} devices</div>

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
          <thead className="sticky top-0 bg-gray-800">
            <tr className="text-left text-gray-400 border-b border-gray-700">
              <th className="py-2 pr-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedDevices.length > 0 && selectedDevices.length === filteredDevices.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        // Select all visible devices
                        const allVisibleIds = filteredDevices.map((d) => d.id);
                        setSelectedDevices(Array.from(new Set([...selectedDevices, ...allVisibleIds])));
                      } else {
                        // Unselect all visible devices
                        const visibleIds = new Set(filteredDevices.map((d) => d.id));
                        setSelectedDevices(selectedDevices.filter((id) => !visibleIds.has(id)));
                      }
                    }}
                    className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-teal-500 focus:ring-teal-500"
                  />
                  <span className="ml-2">
                    {selectedDevices.length > 0 && selectedDevices.length === filteredDevices.length ? 'Unselect All' : 'Select All'}
                  </span>
                </div>
              </th>
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
                className={`border-b border-gray-700/50 hover:bg-gray-800/50 ${
                  selectedDevices.includes(device.id)
                    ? viewMode === 'add'
                      ? 'bg-teal-900 bg-opacity-20'
                      : 'bg-red-900 bg-opacity-20'
                    : ''
                }`}
              >
                <td className="py-3 pr-4">
                  <input
                    type="checkbox"
                    checked={selectedDevices.includes(device.id)}
                    onChange={() => {
                      setSelectedDevices((prev) =>
                        prev.includes(device.id)
                          ? prev.filter((id) => id !== device.id)
                          : [...prev, device.id]
                      );
                    }}
                    className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-teal-500 focus:ring-teal-500"
                  />
                </td>
                <td className="py-3 pr-4 text-gray-100">{device.deviceName}</td>
                <td className="py-3 pr-4 text-gray-300">{device.type}</td>
                <td className="py-3 pr-4 text-gray-300">{device.modelNumber || '-'}</td>
                <td className="py-3 text-gray-300">{device.brand || '-'}</td>
              </tr>
            ))}
            {filteredDevices.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-gray-400">No devices match your filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="bg-gray-800 border-t border-gray-700 p-4">
        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-400">{selectedDevices.length} {selectedDevices.length === 1 ? 'device' : 'devices'} selected</div>
          <div className="flex space-x-3">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-md bg-gray-700 hover:bg-gray-600 text-white">Cancel</button>
            {viewMode === 'add' ? (
              <button onClick={handleAddDevices} disabled={selectedDevices.length === 0} className="px-4 py-2 text-sm rounded-md bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50 disabled:cursor-not-allowed">Add Selected Devices</button>
            ) : (
              <button onClick={handleRemoveDevices} disabled={selectedDevices.length === 0} className="px-4 py-2 text-sm rounded-md bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed">Remove Selected Devices</button>
            )}
          </div>
        </div>
      </div>
    </div>
  </div>
);
}
