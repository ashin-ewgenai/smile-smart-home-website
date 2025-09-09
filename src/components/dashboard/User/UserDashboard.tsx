import React, { useState, useEffect, useRef } from 'react';
import { Home, Settings, Bell, Calendar, Battery, Thermometer, Lock, Wrench, ChevronRight } from 'lucide-react';
import RequestServiceModal from './RequestServiceModal';
import RequestStatusModal from './RequestStatusModal';
import { db, auth } from '../../../lib/firebase';
import { getDocs, query, orderBy, limit, getDoc, collection, onSnapshot, doc, where } from 'firebase/firestore';
import { userServiceRequestsCollection, userDoc } from '../../../models/Collections';
import { onAuthStateChanged } from 'firebase/auth';

interface Device {
  id: string;
  name: string;
  type: string;
  status: string;
  lastActivity: string;
  warranty?: string;
  modelNumber?: string;
  brand?: string;
}

interface DeviceStats {
  totalDevices: number;
  activeDevices: number;
  offlineDevices: number;
}

interface UserDashboardProps {
  userName: string;
}

const UserDashboard: React.FC<UserDashboardProps> = ({ userName }) => {
  // Get actual user name from Firestore or localStorage
  const [actualUserName, setActualUserName] = useState(userName);
  const [serviceRequestOpen, setServiceRequestOpen] = useState(false);
  const [serviceFilter, setServiceFilter] = useState<'all' | 'tv' | 'internet' | 'warranty' | 'installation' | 'maintenance' | 'troubleshooting'>('all');
  const [deviceFilter, setDeviceFilter] = useState<'all' | string>('all');
  const [dateSort, setDateSort] = useState<'desc' | 'asc'>('desc');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const myDevicesRef = useRef<HTMLDivElement>(null);
  // Billing & Warranty compact toggle
  const [billingCompact, setBillingCompact] = useState(false);

  // Request Service form state
  const [reqService, setReqService] = useState<'installation' | 'maintenance' | 'troubleshooting' | 'warranty' | 'internet' | 'tv'>('installation');
  const [reqDevice, setReqDevice] = useState<string>('');
  const [reqDate, setReqDate] = useState<string>('');
  const [reqTime, setReqTime] = useState<string>('');
  const [reqPriority, setReqPriority] = useState<'normal' | 'high' | 'low'>('normal');
  const [reqDesc, setReqDesc] = useState<string>('');
  const [reqSuccess, setReqSuccess] = useState<string>('');
  const [reqError, setReqError] = useState<string>('');
  const [userDeviceOptions, setUserDeviceOptions] = useState<Device[]>([]);
  const clearReqFeedback = () => {
    setReqSuccess('');
    setReqError('');
  };

  // Fetch user's devices
  useEffect(() => {
    let isMounted = true;
    
    const fetchUserDevices = async (uid: string) => {
      try {
        
        // Get user's devices from flat User_Devices collection
        const userDevicesRef = collection(db, 'User_Devices');
        const userDevicesQuery = query(userDevicesRef, where('uid', '==', uid));
        // console.log('Querying user devices for uid:', uid);
        const userDevicesSnapshot = await getDocs(userDevicesQuery);
        
        // console.log('User devices snapshot:', {
        //   size: userDevicesSnapshot.size,
        //   docs: userDevicesSnapshot.docs.map(d => ({
        //     id: d.id,
        //     data: d.data()
        //   }))
        // });
        
        // Process user's devices
        const devices = await Promise.all(userDevicesSnapshot.docs.map(async (userDeviceDoc) => {
          const deviceData = userDeviceDoc.data();
          const deviceId = userDeviceDoc.id;
          
          try {
            // Try to get device details from the main Devices collection
            const deviceDoc = await getDoc(doc(db, 'Devices', deviceId));
            
            if (deviceDoc.exists()) {
              const deviceInfo = deviceDoc.data();
              // console.log('Found device in main collection:', {
              //   id: deviceId,
              //   data: deviceInfo,
              //   type: deviceInfo.deviceType || deviceInfo.type || 'Unknown'
              // });
              
              return {
                id: deviceId,
                name: deviceInfo.deviceName || deviceInfo.name || `Device ${deviceId}`,
                type: deviceInfo.deviceType || deviceInfo.type || 'Unknown',
                status: 'active',
                lastActivity: 'Just now',
                brand: deviceInfo.brand || deviceInfo.manufacturer || '',
                modelNumber: deviceInfo.modelNumber || deviceInfo.model || '',
                warranty: deviceInfo.warranty || deviceInfo.warrantyPeriod || ''
              };
            }
            
            // Fallback to using the document data directly if not found in main collection
            const deviceType = deviceData.deviceType || deviceData.type || 
                             (deviceData.data ? (deviceData.data.deviceType || deviceData.data.type) : null) || 
                             'Unknown';
            
            // console.log('Device not found in main collection, using direct data:', {
            //   id: deviceId,
            //   data: deviceData,
            //   type: deviceType
            // });
            
            return {
              id: deviceId,
              name: deviceData.deviceName || deviceData.name || deviceData.data?.deviceName || deviceData.data?.name || `Device ${deviceId}`,
              type: deviceType,
              status: 'active',
              lastActivity: 'Just now',
              brand: deviceData.brand || deviceData.manufacturer || deviceData.data?.brand || deviceData.data?.manufacturer || '',
              modelNumber: deviceData.modelNumber || deviceData.model || deviceData.data?.modelNumber || deviceData.data?.model || '',
              warranty: deviceData.warranty || deviceData.warrantyPeriod || deviceData.data?.warranty || deviceData.data?.warrantyPeriod || ''
            };
          } catch (error) {
            // console.error('Error processing device:', error);
            return null;
          }
        }));
        
        // Filter out any null values
        const validDevices = devices.filter((d): d is NonNullable<typeof d> => d !== null);
        // console.log('Processed user devices:', validDevices);
        
        if (isMounted) {
          // Update both userDeviceOptions and userDevices with the same data
          setUserDeviceOptions(validDevices);
          
          // Set the first device as default if none selected
          if (validDevices.length > 0 && !reqDevice) {
            // console.log('Setting default device:', validDevices[0]);
            setReqDevice(validDevices[0].id);
          }
        }
      } catch (error) {
        // console.error('Error fetching user devices:', error);
      }
    };
    
    // Get current user
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        fetchUserDevices(user.uid);
      }
    });
    
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [reqDevice]);

  useEffect(() => {
    let cancelled = false;
    async function loadUserName() {
      try {
        const user = auth.currentUser;
        // Prefer Firestore users/{uid}.name, then auth.displayName, then localStorage fallback, then email local-part
        if (user?.uid) {
          try {
            const snap = await getDoc(userDoc(db, user.uid));
            const name = (snap.exists() ? (snap.data() as any)?.name : undefined) as string | undefined;
            const display = (name && name.trim()) || user.displayName || localStorage.getItem('userName') || '';
            if (!cancelled) {
              if (display && display.trim()) {
                setActualUserName(display.trim());
                return;
              }
              const email = user.email || localStorage.getItem('userEmail') || '';
              const local = (email.split('@')[0] || '').trim();
              const fallback = local ? local.charAt(0).toUpperCase() + local.slice(1) : 'there';
              setActualUserName(fallback);
            }
          } catch {
            // Firestore failed; try displayName/email/localStorage
            if (!cancelled) {
              const display = user.displayName || localStorage.getItem('userName') || '';
              if (display) {
                setActualUserName(display);
                return;
              }
              const email = user.email || localStorage.getItem('userEmail') || '';
              const local = (email.split('@')[0] || '').trim();
              const fallback = local ? local.charAt(0).toUpperCase() + local.slice(1) : 'there';
              setActualUserName(fallback);
            }
          }
        } else {
          // Not signed in yet; attempt localStorage cached name
          const cached = localStorage.getItem('userName');
          if (!cancelled && cached) setActualUserName(cached);
        }
      } catch {}
    }
    void loadUserName();
    return () => { cancelled = true; };
  }, []);

  // Help/TicketCenter modal is now globally managed in DashboardLayout

  // Reset success/error banner each time the Request Service modal opens
  useEffect(() => {
    if (serviceRequestOpen) {
      clearReqFeedback();
    }
  }, [serviceRequestOpen]);
  const [deviceStats, setDeviceStats] = useState<DeviceStats>({
    totalDevices: 0,
    activeDevices: 0,
    offlineDevices: 0
  });
  
  const [isLoading, setIsLoading] = useState(true);

  // Per-type counts state
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});
  const [typeCountsLoading, setTypeCountsLoading] = useState<boolean>(false);

  // Track auth state so we can read user subcollection
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
    return () => unsub();
  }, []);

  // Request Status modal state
  const [requestStatusOpen, setRequestStatusOpen] = useState(false);
  const [myRequests, setMyRequests] = useState<Array<{ id: string; service: string; device: string; priority: string; status: string; date?: string; time?: string; createdAt?: any }>>([]);
  const [reqListLoading, setReqListLoading] = useState(false);
  const [reqListError, setReqListError] = useState('');
  const [reqCacheAt, setReqCacheAt] = useState<number>(0);

  // Fetch user's requests; if force is true, bypass cache freshness
  const fetchMyRequests = async (force = false) => {
    const user = auth.currentUser;
    if (!user) return;
    const isFresh = Date.now() - reqCacheAt < 15000; // 15s freshness window
    if (isFresh && !force) return;
    setReqListError('');
    setReqListLoading(true);
    try {
      // Read from nested subcollection: serviceRequests/{uid}/requests
      const qRef = query(
        userServiceRequestsCollection(db, user.uid),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
      const snap = await getDocs(qRef);
      const list = snap.docs
        .map(d => ({ id: d.id, ...(d.data() as any) }));
      setMyRequests(list as any);
      setReqCacheAt(Date.now());
    } catch (err: any) {
      setReqListError(err?.message || 'Failed to load requests');
    } finally {
      setReqListLoading(false);
    }
  };
  
  // Real-time: per-type counts and active/total devices
  useEffect(() => {
    if (!uid) {
      setIsLoading(false);
      setTypeCounts({});
      setDeviceStats({ totalDevices: 0, activeDevices: 0, offlineDevices: 0 });
      return;
    }

    setTypeCountsLoading(true);
    setIsLoading(true);

    const ref = collection(db, 'User_Devices');
    const userQuery = query(ref, where('uid', '==', uid));
    const unsubscribe = onSnapshot(userQuery, async (snap) => {
      // Active devices = number of device mappings for the user
      const active = snap.size;

      // Build per-type counts: sum by serial array length or numeric count fields
      const counts: Record<string, number> = {};
      const normalizeType = (t: string): string => {
        const s = (t || '').toString().trim().toLowerCase();
        if (!s) return 'Unknown';
        if (['cctv','cctv camera','camera cctv','cctv cameras'].includes(s)) return 'CCTV';
        if (['smart alarm','alarm','smart-alarm','smartalarm'].includes(s)) return 'Smart Alarm';
        if (['wireless doorbell kits','wireless doorbell','doorbell','doorbell kit','doorbell kits'].includes(s)) return 'Wireless Doorbell Kits';
        // Title-case fallback
        return s.replace(/\b\w/g, (m) => m.toUpperCase());
      };
      const numFrom = (obj: any, keys: string[]): number | null => {
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
      snap.forEach((d) => {
        const data: any = d.data();
        const rawType = (data?.type ?? data?.deviceType ?? data?.category ?? data?.DeviceType ?? data?.Type ?? 'Unknown') as string;
        const type = normalizeType(String(rawType || 'Unknown'));
        let add = 0;
        if (Array.isArray(data?.serials)) add = data.serials.length;
        if (!add) {
          const n = numFrom(data, ['deviceCount','DeviceCount','deviceCount1','DeviceCount1','count','Count','quantity','Quantity','qty','Qty','serialCount','SerialCount']);
          add = n ?? 0;
        }
        if (!add) add = 1; // fallback, at least one device
        counts[type] = (counts[type] ?? 0) + add;
      });
      setTypeCounts(counts);

      // Calculate total devices from flat collection counts
      let total = 0;
      try {
        snap.forEach((d) => {
          const data: any = d.data();
          let add = 0;
          if (Array.isArray(data?.serials)) add = data.serials.length;
          if (!add) {
            const n = numFrom(data, ['deviceCount','DeviceCount','deviceCount1','DeviceCount1','count','Count','quantity','Quantity','qty','Qty','serialCount','SerialCount']);
            add = n ?? 0;
          }
          if (!add) add = 1; // fallback, at least one device
          total += add;
        });
      } catch {}

      setDeviceStats({ totalDevices: total, activeDevices: active, offlineDevices: Math.max(total - active, 0) });
      setTypeCountsLoading(false);
      setIsLoading(false);
    }, () => {
      // On error, clear counts but avoid crashing UI
      setTypeCounts({});
      setDeviceStats({ totalDevices: 0, activeDevices: 0, offlineDevices: 0 });
      setTypeCountsLoading(false);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [uid, db]);
  
  // console.log('userDeviceOptions:', userDeviceOptions);
  
  const userDevices: Device[] = userDeviceOptions.map((device, index) => ({
    id: device.id || String(index + 1),
    name: device.name,
    type: device.type || 'Device',
    status: device.status || 'active',
    lastActivity: device.lastActivity || 'Just now',
    brand: device.brand || '',
    modelNumber: device.modelNumber || '',
    warranty: device.warranty || ''
  }));
  
  // Warranty helpers
  const formatDate = (d: Date) => d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  const addDays = (d: Date, days: number) => {
    const nd = new Date(d);
    nd.setDate(nd.getDate() + days);
    return nd;
  };
  const remainingText = (end: Date) => {
    const now = new Date();
    const diffMs = end.getTime() - now.getTime();
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (days <= 0) return 'Expired';
    if (days > 365) return `${(days / 365).toFixed(1)} years`;
    return `${days} days`;
  };

  return (
    <>
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Welcome, {actualUserName}</h1>
          <p className="text-gray-600 dark:text-gray-400">Here's what's happening in your smart home</p>
        </div>
        {/* Help button moved to navbar; retained space for layout consistency */}
      </div>
      
      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-500"></div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {/* Device Stats Card */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">My Devices</h2>
                <Home className="h-6 w-6 text-teal-500" />
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">type of devices</span>
                  <span className="text-xl font-bold text-gray-900 dark:text-white">{deviceStats.totalDevices}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">Active Devices</span>
                  <span className="text-xl font-bold text-teal-500">{deviceStats.activeDevices}</span>
                </div>
                {/* Per-type breakdown fetched from Firestore */}
                {Object.keys(typeCounts).length > 0 && (
                  <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">total number of devices you owned</p>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6">
                      {Object.entries(typeCounts).map(([type, count]) => (
                        <li key={type} className="flex items-center justify-between text-sm">
                          <span className="text-gray-600 dark:text-gray-400 truncate" title={type}>{type}</span>
                          <span className="text-gray-900 dark:text-white font-medium">= {count}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
            
            {/* Billing & Warranty */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700 col-span-1 md:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Quick Controls</h2>
              </div>
              {/* Single board with three actions */}
              <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-3 gap-3">
                {/* Request Service */}
                <button
                  onClick={() => setServiceRequestOpen(true)}
                  className={`flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors`}
                  aria-label="Open Request Service"
                >
                  <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mb-2">
                    <Wrench className="h-5 w-5 text-green-600 dark:text-green-300" />
                  </div>
                  {!billingCompact && (
                    <span className="text-sm font-medium text-gray-900 dark:text-white">Request Service</span>
                  )}
                </button>
                {/* About Device */}
                <a
                  href="/dashboard/user/about-device"
                  className={`flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors`}
                  aria-label="Open About Device"
                >
                  <div className="h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center mb-2">
                    <Home className="h-5 w-5 text-indigo-600 dark:text-indigo-300" />
                  </div>
                  {!billingCompact && (
                    <span className="text-sm font-medium text-gray-900 dark:text-white">About Device</span>
                  )}
                </a>
                {/* Quote Portal */}
                <a
                  href="/dashboard/user/quote-portal"
                  className={`flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors`}
                  aria-label="Open Quote Portal"
                >
                  <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center mb-2">
                    <Calendar className="h-5 w-5 text-amber-600 dark:text-amber-300" />
                  </div>
                  {!billingCompact && (
                    <span className="text-sm font-medium text-gray-900 dark:text-white">Quote Portal</span>
                  )}
                </a>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* My Devices */}
            <div ref={myDevicesRef} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 lg:col-span-2 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">My Devices</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full table-auto divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-slate-100/80 dark:bg-slate-700/80 backdrop-blur supports-backdrop-blur:backdrop-blur sticky top-0 z-10">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-200 uppercase tracking-wide">Device Name</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-200 uppercase tracking-wide">Brand</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-200 uppercase tracking-wide">Model</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-200 uppercase tracking-wide">Type</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-200 uppercase tracking-wide">Warranty</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {userDevices.length > 0 ? (
                      userDevices.map((device) => (
                      <tr key={device.id} className="odd:bg-transparent even:bg-gray-50 dark:even:bg-gray-800/60 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{device.name}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {device.brand || 'N/A'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {device.modelNumber || 'N/A'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {device.type || 'Unknown'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {device.warranty || 'N/A'}
                          </div>
                        </td>
                      </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={2} className="px-6 py-4 text-center text-sm text-gray-500">
                          No devices found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          
        </>
      )}

    <RequestStatusModal
      open={requestStatusOpen}
      onClose={() => setRequestStatusOpen(false)}
      myRequests={myRequests as any}
      reqListLoading={reqListLoading}
      reqListError={reqListError}
    />
    </div>
    {/* Support Tickets modal removed here; now rendered globally in DashboardLayout */}

    {/* console.log('Rendering RequestServiceModal with deviceOptions:', userDeviceOptions.map(device => device.name)) */}
    <RequestServiceModal
      open={serviceRequestOpen}
      onClose={() => setServiceRequestOpen(false)}
      deviceOptions={userDeviceOptions.map(device => device.name)}
    />
    </>
  );
};

export default UserDashboard;
