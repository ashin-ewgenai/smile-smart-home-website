import React, { useState, useEffect, useRef } from 'react';
import { Home, Settings, Bell, Calendar, HelpCircle, Battery, Thermometer, Lock, ShieldCheck, Receipt, Wrench, X, ChevronRight } from 'lucide-react';
import TicketCenter from './TicketCenter';
import { db, auth } from '../../../lib/firebase';
import { addDoc, collection, serverTimestamp, getDocs, query, where, orderBy, limit } from 'firebase/firestore';

interface DeviceStats {
  totalDevices: number;
  activeDevices: number;
  offlineDevices: number;
}

interface UserDashboardProps {
  userName: string;
}

const UserDashboard: React.FC<UserDashboardProps> = ({ userName }) => {
  // Get actual user name from localStorage
  const [actualUserName, setActualUserName] = useState(userName);
  const [helpOpen, setHelpOpen] = useState(false);
  const [warrantyOpen, setWarrantyOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [serviceRequestOpen, setServiceRequestOpen] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'monthly' | 'yearly' | 'instalment' | 'onetime'>('all');
  const [serviceFilter, setServiceFilter] = useState<'all' | 'tv' | 'internet' | 'warranty' | 'installation' | 'maintenance' | 'troubleshooting'>('all');
  const [deviceFilter, setDeviceFilter] = useState<'all' | string>('all');
  const [dateSort, setDateSort] = useState<'desc' | 'asc'>('desc');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const myDevicesRef = useRef<HTMLDivElement>(null);

  // Request Service form state
  const [reqService, setReqService] = useState<'installation' | 'maintenance' | 'troubleshooting' | 'warranty' | 'internet' | 'tv'>('installation');
  const [reqDevice, setReqDevice] = useState<string>('');
  const [reqDate, setReqDate] = useState<string>('');
  const [reqTime, setReqTime] = useState<string>('');
  const [reqPriority, setReqPriority] = useState<'normal' | 'high' | 'low'>('normal');
  const [reqDesc, setReqDesc] = useState<string>('');
  const [reqSuccess, setReqSuccess] = useState<string>('');
  const [reqError, setReqError] = useState<string>('');
  const clearReqFeedback = () => {
    setReqSuccess('');
    setReqError('');
  };
  
  useEffect(() => {
    const email = localStorage.getItem('userEmail');
    if (email) {
      // Extract name from email (simple approach)
      const name = email.split('@')[0];
      // Capitalize first letter
      setActualUserName(name.charAt(0).toUpperCase() + name.slice(1));
    }
  }, []);

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
      // Avoid composite index; limit results to speed up initial load
      const qRef = query(
        collection(db, 'serviceRequests'),
        where('uid', '==', user.uid),
        limit(50)
      );
      const snap = await getDocs(qRef);
      const list = snap.docs
        .map(d => ({ id: d.id, ...(d.data() as any) }))
        .sort((a: any, b: any) => {
          const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0;
          const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0;
          return tb - ta;
        });
      setMyRequests(list as any);
      setReqCacheAt(Date.now());
    } catch (err: any) {
      setReqListError(err?.message || 'Failed to load requests');
    } finally {
      setReqListLoading(false);
    }
  };
  
  // Simulate fetching data
  useEffect(() => {
    // In a real app, this would be an API call
    setTimeout(() => {
      setDeviceStats({
        totalDevices: 8,
        activeDevices: 7,
        offlineDevices: 1
      });
      
      setIsLoading(false);
    }, 1000);
  }, []);
  
  const userDevices = [
    { id: 1, name: 'Living Room Camera', type: 'Camera', status: 'active', lastActivity: '5 minutes ago' },
    { id: 2, name: 'Front Door Lock', type: 'Smart Lock', status: 'active', lastActivity: '15 minutes ago' },
    { id: 3, name: 'Kitchen Thermostat', type: 'Thermostat', status: 'active', lastActivity: '30 minutes ago' },
    { id: 4, name: 'Bedroom Light', type: 'Smart Light', status: 'active', lastActivity: '1 hour ago' },
    { id: 5, name: 'Garage Door', type: 'Door Sensor', status: 'offline', lastActivity: '2 days ago' },
  ];
  const formDeviceOptions = userDevices.map(u => u.name);
  
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
  
  const recentActivities = [
    { id: 1, device: 'Front Door Lock', action: 'Unlocked', time: '10:23 AM', date: 'Today', user: 'You' },
    { id: 2, device: 'Living Room Camera', action: 'Motion Detected', time: '09:45 AM', date: 'Today', user: 'System' },
    { id: 3, device: 'Kitchen Thermostat', action: 'Temperature Changed to 72°F', time: '08:30 AM', date: 'Today', user: 'You' },
    { id: 4, device: 'Bedroom Light', action: 'Turned On', time: '07:15 AM', date: 'Today', user: 'You' },
    { id: 5, device: 'Front Door Lock', action: 'Locked', time: '11:50 PM', date: 'Yesterday', user: 'You' },
  ];

  // Mock payments data
  const payments = [
    { id: 'INV-2025-0001', date: '2025-01-05', plan: 'monthly' as const, service: 'tv' as const, device: 'Living Room TV', paymentMethod: 'full' as const, label: 'TV Monthly Pass', amount: 9.99, status: 'paid' as const },
    { id: 'INV-2025-0002', date: '2025-02-05', plan: 'monthly' as const, service: 'internet' as const, device: 'Home Router', paymentMethod: 'full' as const, label: 'Internet Monthly Pass', amount: 19.99, status: 'paid' as const },
    { id: 'INV-2025-0003', date: '2025-03-05', plan: 'monthly' as const, service: 'internet' as const, device: 'Home Router', paymentMethod: 'full' as const, label: 'Internet Monthly Pass', amount: 19.99, status: 'due' as const },
    { id: 'INV-2025-Y001', date: '2025-01-01', plan: 'yearly' as const, service: 'warranty' as const, device: 'Kitchen Thermostat', paymentMethod: 'full' as const, label: 'Yearly Device Warranty', amount: 79.0, status: 'paid' as const },
    { id: 'INV-2025-I010', date: '2025-02-20', plan: 'instalment' as const, service: 'warranty' as const, device: 'Living Room Camera', paymentMethod: 'installments' as const, label: 'Camera Warranty Installment 1/6', amount: 49.0, status: 'paid' as const },
    { id: 'INV-2025-I011', date: '2025-03-20', plan: 'instalment' as const, service: 'warranty' as const, device: 'Living Room Camera', paymentMethod: 'installments' as const, label: 'Camera Warranty Installment 2/6', amount: 49.0, status: 'due' as const },
    { id: 'INV-2025-OT01', date: '2025-03-10', plan: 'onetime' as const, service: 'tv' as const, device: 'Living Room TV', paymentMethod: 'full' as const, label: 'Movie Rental (One-time)', amount: 4.99, status: 'paid' as const },
    { id: 'INV-2025-OT02', date: '2025-04-02', plan: 'onetime' as const, service: 'warranty' as const, device: 'Front Door Lock', paymentMethod: 'full' as const, label: 'One-time Service Visit', amount: 29.0, status: 'due' as const },
    { id: 'INV-2025-IN01', date: '2025-04-10', plan: 'onetime' as const, service: 'installation' as const, device: 'Bedroom Light', paymentMethod: 'full' as const, label: 'Smart Light Installation', amount: 59.0, status: 'paid' as const },
    { id: 'INV-2025-MA01', date: '2025-04-15', plan: 'yearly' as const, service: 'maintenance' as const, device: 'Living Room Camera', paymentMethod: 'full' as const, label: 'Annual Maintenance Plan', amount: 39.0, status: 'paid' as const },
    { id: 'INV-2025-TR01', date: '2025-04-18', plan: 'onetime' as const, service: 'troubleshooting' as const, device: 'Garage Door', paymentMethod: 'full' as const, label: 'Troubleshooting Visit', amount: 25.0, status: 'due' as const },
  ];

  const deviceOptions = Array.from(new Set(payments.map((p) => p.device)));
  
  return (
    <>
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Welcome, {actualUserName}</h1>
          <p className="text-gray-600 dark:text-gray-400">Here's what's happening in your smart home</p>
        </div>
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-teal-600 text-teal-600 hover:bg-teal-50 dark:hover:bg-gray-700"
          aria-label="Help: Open Support Tickets"
        >
          <HelpCircle className="h-4 w-4" />
          <span className="text-sm font-medium">Help</span>
        </button>
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
                  <span className="text-gray-600 dark:text-gray-400">Total Devices</span>
                  <span className="text-xl font-bold text-gray-900 dark:text-white">{deviceStats.totalDevices}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">Active Devices</span>
                  <span className="text-xl font-bold text-teal-500">{deviceStats.activeDevices}</span>
                </div>
                <button
                  type="button"
                  onMouseEnter={() => {
                    if (auth.currentUser) fetchMyRequests(false);
                  }}
                  onFocus={() => {
                    if (auth.currentUser) fetchMyRequests(false);
                  }}
                  onClick={() => {
                    const user = auth.currentUser;
                    if (!user) {
                      alert('Please sign in to view your service requests.');
                      return;
                    }
                    // Open immediately, then refresh in background
                    setRequestStatusOpen(true);
                    fetchMyRequests(false);
                  }}
                  className="group w-full flex items-center justify-between px-5 py-4 rounded-lg border border-teal-600/60 text-teal-800 dark:text-teal-200 bg-teal-50/50 dark:bg-teal-900/10 hover:bg-teal-100/70 dark:hover:bg-teal-900/20 shadow-sm hover:shadow-md transition-all duration-200"
                  aria-label="Open Request Status"
                >
                  <span className="text-gray-900 dark:text-white font-semibold">Request Status</span>
                  <span className="inline-flex items-center gap-1 text-sm text-teal-700 dark:text-teal-300">
                    View
                    <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </span>
                </button>
              </div>
            </div>
            
            {/* Billing & Warranty */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700 col-span-1 md:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Billing & Warranty</h2>
                <Settings className="h-6 w-6 text-teal-500" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-3">
                {/* Warranty Status */}
                <button
                  onClick={() => setWarrantyOpen(true)}
                  className="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                  aria-label="Open Warranty Details"
                >
                  <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center mb-2">
                    <ShieldCheck className="h-5 w-5 text-blue-600 dark:text-blue-300" />
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">Warranty Status</span>
                </button>
                {/* Payment History */}
                <button
                  onClick={() => setPaymentOpen(true)}
                  className="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                  aria-label="Open Payment History"
                >
                  <div className="h-10 w-10 rounded-full bg-yellow-100 dark:bg-yellow-900 flex items-center justify-center mb-2">
                    <Receipt className="h-5 w-5 text-yellow-600 dark:text-yellow-300" />
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">Payment History</span>
                </button>
                {/* Request Service */}
                <button
                  onClick={() => setServiceRequestOpen(true)}
                  className="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                  aria-label="Open Request Service"
                >
                  <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mb-2">
                    <Wrench className="h-5 w-5 text-green-600 dark:text-green-300" />
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">Request Service</span>
                </button>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* My Devices */}
            <div ref={myDevicesRef} className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 lg:col-span-2">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">My Devices</h2>
                <a href="/dashboard/user/devices" className="text-sm text-teal-600 dark:text-teal-400 hover:underline">View All</a>
              </div>
              <div>
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Device Name</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Warranty Start</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Warranty End</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Remaining</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Renewal Date</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {userDevices.map((device) => {
                      // Demo start date per device; replace with real warranty start if available
                      const start = addDays(new Date('2024-08-01'), device.id * 30);
                      let end = addDays(start, 365);
                      let renewal = end;
                      // Override for specific device (id 4) to show 2030 as requested
                      if (device.id === 4) {
                        end = new Date('2030-11-29');
                        renewal = end;
                      }
                      return (
                        <tr key={device.id}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">{device.name}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-500 dark:text-gray-400">{device.type}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatDate(start)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatDate(end)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{remainingText(end)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatDate(renewal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          
        </>
      )}

    {requestStatusOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label="Request Status">
        <div className="relative w-full max-w-5xl">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200/80 dark:border-gray-700/80 ring-1 ring-black/5 overflow-hidden transform transition-all duration-200 ease-out">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gradient-to-r from-white to-gray-50 dark:from-gray-800 dark:to-gray-750/40">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Your Service Requests</h2>
              <button
                onClick={() => setRequestStatusOpen(false)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-800 transition"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
                <span className="text-sm font-medium">Close</span>
              </button>
            </div>
            {reqListError && (
              <div className="mx-6 mt-4 rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3">{reqListError}</div>
            )}
            <div className="max-h-[70vh] overflow-auto">
              {reqListLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-teal-500"></div>
                </div>
              ) : myRequests.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center mb-3">
                    <Wrench className="h-6 w-6 text-teal-600 dark:text-teal-300" />
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">No service requests yet.</p>
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0 z-10">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold tracking-wider text-gray-500 dark:text-gray-300 uppercase">Created</th>
                      <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold tracking-wider text-gray-500 dark:text-gray-300 uppercase">Service</th>
                      <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold tracking-wider text-gray-500 dark:text-gray-300 uppercase">Device</th>
                      <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold tracking-wider text-gray-500 dark:text-gray-300 uppercase">Priority</th>
                      <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold tracking-wider text-gray-500 dark:text-gray-300 uppercase">Preferred</th>
                      <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold tracking-wider text-gray-500 dark:text-gray-300 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {myRequests.map((r) => {
                      const created = (r as any).createdAt?.toDate ? (r as any).createdAt.toDate() as Date : undefined;
                      const createdText = created ? created.toLocaleString() : '-';
                      return (
                        <tr key={r.id} className="odd:bg-white even:bg-gray-50/60 dark:odd:bg-gray-800 dark:even:bg-gray-800/60 hover:bg-teal-50/60 dark:hover:bg-gray-700/60 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-200">{createdText}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 dark:text-gray-100 capitalize">{r.service}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-200">{r.device}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 dark:text-gray-100 capitalize">{r.priority}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-200">{r.date || '--'} {r.time || ''}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${r.status==='open' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${r.status==='open' ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    )}
    </div>

    {helpOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label="Support Tickets">
        <div className="relative w-full max-w-6xl">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Support Tickets</h2>
              <button
                onClick={() => setHelpOpen(false)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-800 transition"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
                <span className="text-sm font-medium">Close</span>
              </button>
            </div>
            <div className="max-h-[80vh] overflow-auto p-4">
              <TicketCenter />
            </div>
          </div>
        </div>
      </div>
    )}

    {paymentOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label="Payment History">
        <div className="relative w-full max-w-5xl">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Payment History</h2>
              <button
                onClick={() => setPaymentOpen(false)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-800 transition"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
                <span className="text-sm font-medium">Close</span>
              </button>
            </div>
            <div className="px-6 pt-4">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Plan:</span>
                {(['all','monthly','yearly','instalment','onetime'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setPaymentFilter(f)}
                    className={`px-3 py-1.5 rounded-md text-sm border ${paymentFilter===f ? 'bg-teal-600 text-white border-teal-600' : 'text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                  >
                    {f[0].toUpperCase()+f.slice(1)}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-8 mb-4">
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-600 dark:text-gray-400" htmlFor="serviceFilter">Service:</label>
                  <select
                    id="serviceFilter"
                    value={serviceFilter}
                    onChange={(e) => setServiceFilter(e.target.value as 'all' | 'tv' | 'internet' | 'warranty' | 'installation' | 'maintenance' | 'troubleshooting')}
                    className="text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="all">All</option>
                    <option value="tv">TV</option>
                    <option value="internet">Internet</option>
                    <option value="warranty">Warranty</option>
                    <option value="installation">Installation</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="troubleshooting">Troubleshooting</option>
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-600 dark:text-gray-400" htmlFor="deviceFilter">Device:</label>
                  <select
                    id="deviceFilter"
                    value={deviceFilter}
                    onChange={(e) => setDeviceFilter(e.target.value)}
                    className="text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="all">All</option>
                    {deviceOptions.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <label className="text-sm text-gray-600 dark:text-gray-400" htmlFor="dateFrom">From:</label>
                <input
                  id="dateFrom"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <label className="text-sm text-gray-600 dark:text-gray-400" htmlFor="dateTo">To:</label>
                <input
                  id="dateTo"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <label className="text-sm text-gray-600 dark:text-gray-400" htmlFor="dateSort">Sort:</label>
                <select
                  id="dateSort"
                  value={dateSort}
                  onChange={(e) => setDateSort(e.target.value as 'asc' | 'desc')}
                  className="text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="desc">Newest first</option>
                  <option value="asc">Oldest first</option>
                </select>
                {(dateFrom || dateTo) && (
                  <button
                    onClick={() => { setDateFrom(''); setDateTo(''); }}
                    className="text-sm px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Clear Dates
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-[70vh] overflow-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Service</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Device</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Plan</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Amount</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Payment Type</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {payments
                    .filter(p => paymentFilter==='all' ? true : p.plan === paymentFilter)
                    .filter(p => serviceFilter==='all' ? true : p.service === serviceFilter)
                    .filter(p => deviceFilter==='all' ? true : p.device === deviceFilter)
                    .filter(p => {
                      const d = new Date(p.date);
                      if (dateFrom && d < new Date(dateFrom)) return false;
                      if (dateTo) {
                        const to = new Date(dateTo);
                        to.setHours(23,59,59,999);
                        if (d > to) return false;
                      }
                      return true;
                    })
                    .sort((a, b) => {
                      const da = new Date(a.date).getTime();
                      const db = new Date(b.date).getTime();
                      return dateSort === 'asc' ? da - db : db - da;
                    })
                    .map((p) => (
                    <tr key={p.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-200">{new Date(p.date).toLocaleDateString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-200 capitalize">{p.service}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-200">{p.device}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-200 capitalize">{p.plan}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{p.label}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-200">${p.amount.toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-200 capitalize">{p.paymentMethod}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs ${p.status==='paid' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'}`}>
                          {p.status === 'paid' ? 'Paid' : 'Due'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {p.status === 'paid' ? (
                          <button
                            onClick={() => alert(`Opening receipt for ${p.id}`)}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            View Receipt
                          </button>
                        ) : (
                          <span className="text-sm text-gray-500 dark:text-gray-400">No receipt</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    )}

    {serviceRequestOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label="Request Service">
        <div className="relative w-full max-w-2xl">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Request Service</h2>
              <button
                onClick={() => { clearReqFeedback(); setServiceRequestOpen(false); }}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-800 transition"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
                <span className="text-sm font-medium">Close</span>
              </button>
            </div>
            {reqSuccess && (
              <div className="mx-6 mt-4 rounded-md bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-4 py-3">
                {reqSuccess}
              </div>
            )}
            {reqError && (
              <div className="mx-6 mt-4 rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3">
                {reqError}
              </div>
            )}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!reqDevice || !reqDate || !reqTime) {
                  alert('Please select device, date, and time.');
                  return;
                }
                const user = auth.currentUser;
                if (!user) {
                  alert('Please sign in to submit a service request.');
                  return;
                }
                const uid = user.uid;
                const payload = {
                  uid,
                  service: reqService,
                  device: reqDevice,
                  date: reqDate,
                  time: reqTime,
                  priority: reqPriority,
                  description: reqDesc,
                  status: 'open' as const,
                  createdAt: serverTimestamp(),
                };
                try {
                  await addDoc(collection(db, 'serviceRequests'), payload);
                  setReqSuccess('Submitted successfully.');
                  setReqError('');
                  setReqDevice('');
                  setReqDate('');
                  setReqTime('');
                  setReqPriority('normal');
                  setReqDesc('');
                } catch (err: any) {
                  setReqError(`Failed to submit request: ${err?.message || err}`);
                  setReqSuccess('');
                }
              }}
            >
              <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label htmlFor="reqService" className="text-sm text-gray-700 dark:text-gray-200">Service</label>
                  <select
                    id="reqService"
                    value={reqService}
                    onChange={(e) => { clearReqFeedback(); setReqService(e.target.value as typeof reqService); }}
                    className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-3 py-2"
                  >
                    <option value="installation">Installation</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="troubleshooting">Troubleshooting</option>
                    <option value="warranty">Warranty</option>
                    <option value="internet">Internet</option>
                    <option value="tv">TV</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="reqDevice" className="text-sm text-gray-700 dark:text-gray-200">Device</label>
                  <select
                    id="reqDevice"
                    value={reqDevice}
                    onChange={(e) => { clearReqFeedback(); setReqDevice(e.target.value); }}
                    className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-3 py-2"
                  >
                    <option value="">Select device</option>
                    {formDeviceOptions.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="reqDate" className="text-sm text-gray-700 dark:text-gray-200">Preferred Date</label>
                  <input
                    id="reqDate"
                    type="date"
                    value={reqDate}
                    onChange={(e) => { clearReqFeedback(); setReqDate(e.target.value); }}
                    className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-3 py-2"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="reqTime" className="text-sm text-gray-700 dark:text-gray-200">Preferred Time</label>
                  <input
                    id="reqTime"
                    type="time"
                    value={reqTime}
                    onChange={(e) => { clearReqFeedback(); setReqTime(e.target.value); }}
                    step={900}
                    min="09:00"
                    max="18:00"
                    title="Pick a time between 9:00 and 18:00 (15-min intervals)"
                    className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Quick picks:</span>
                    <button
                      type="button"
                      onClick={() => {
                        clearReqFeedback();
                        const now = new Date();
                        // round to next 15-min slot
                        const minutes = now.getMinutes();
                        const rounded = minutes % 15 === 0 ? minutes : minutes + (15 - (minutes % 15));
                        if (rounded === 60) { now.setHours(now.getHours() + 1); now.setMinutes(0); }
                        else { now.setMinutes(rounded); }
                        const hh = String(now.getHours()).padStart(2,'0');
                        const mm = String(now.getMinutes()).padStart(2,'0');
                        setReqTime(`${hh}:${mm}`);
                      }}
                      className="px-2 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600/40"
                    >Now</button>
                    <button
                      type="button"
                      onClick={() => { clearReqFeedback(); setReqTime('09:00'); }}
                      className="px-2 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600/40"
                    >9:00 AM</button>
                    <button
                      type="button"
                      onClick={() => { clearReqFeedback(); setReqTime('13:00'); }}
                      className="px-2 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600/40"
                    >1:00 PM</button>
                    <button
                      type="button"
                      onClick={() => { clearReqFeedback(); setReqTime('17:00'); }}
                      className="px-2 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600/40"
                    >5:00 PM</button>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="reqPriority" className="text-sm text-gray-700 dark:text-gray-200">Priority</label>
                  <select
                    id="reqPriority"
                    value={reqPriority}
                    onChange={(e) => { clearReqFeedback(); setReqPriority(e.target.value as typeof reqPriority); }}
                    className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-3 py-2"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div className="md:col-span-2 flex flex-col gap-1">
                  <label htmlFor="reqDesc" className="text-sm text-gray-700 dark:text-gray-200">Describe the issue</label>
                  <textarea
                    id="reqDesc"
                    value={reqDesc}
                    onChange={(e) => { clearReqFeedback(); setReqDesc(e.target.value); }}
                    placeholder="Provide details to help our technician"
                    rows={4}
                    className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-3 py-2"
                  />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { clearReqFeedback(); setServiceRequestOpen(false); }}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-teal-600 text-white hover:bg-teal-700"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    )}

    {warrantyOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label="Warranty Details">
        <div className="relative w-full max-w-5xl">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Warranty Details</h2>
              <button
                onClick={() => setWarrantyOpen(false)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-800 transition"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
                <span className="text-sm font-medium">Close</span>
              </button>
            </div>
            <div className="max-h-[80vh] overflow-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Device Name</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Warranty Start</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Warranty End</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Remaining</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Extend</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Bill</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {userDevices.map((device) => {
                    const start = addDays(new Date('2024-08-01'), device.id * 30);
                    let end = addDays(start, 365);
                    let renewal = end;
                    if (device.id === 4) {
                      end = new Date('2030-11-29');
                      renewal = end;
                    }
                    return (
                      <tr key={device.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{device.name}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{device.type}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatDate(start)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatDate(end)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{remainingText(end)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => alert(`Request to extend warranty for ${device.name} submitted`)}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-teal-600 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-gray-700"
                          >
                            Extend
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => alert(`Opening warranty bill for ${device.name}: INV-${String(device.id).padStart(4, '0')}`)}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            View Bill
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default UserDashboard;
