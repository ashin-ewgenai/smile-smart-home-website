import React, { useState, useEffect, useRef } from 'react';
import { Home, Settings, Bell, Calendar, HelpCircle, Battery, Thermometer, Lock, ShieldCheck, Receipt, Wrench, X } from 'lucide-react';
import TicketCenter from './TicketCenter';

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
  const myDevicesRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const email = localStorage.getItem('userEmail');
    if (email) {
      // Extract name from email (simple approach)
      const name = email.split('@')[0];
      // Capitalize first letter
      setActualUserName(name.charAt(0).toUpperCase() + name.slice(1));
    }
  }, []);
  const [deviceStats, setDeviceStats] = useState<DeviceStats>({
    totalDevices: 0,
    activeDevices: 0,
    offlineDevices: 0
  });
  
  const [isLoading, setIsLoading] = useState(true);
  
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
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">Offline Devices</span>
                  <span className="text-xl font-bold text-red-500">{deviceStats.offlineDevices}</span>
                </div>
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
                <button className="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                  <div className="h-10 w-10 rounded-full bg-yellow-100 dark:bg-yellow-900 flex items-center justify-center mb-2">
                    <Receipt className="h-5 w-5 text-yellow-600 dark:text-yellow-300" />
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">Payment History</span>
                </button>
                {/* Request Service */}
                <button className="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
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
              <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                <button
                  onClick={() => setWarrantyOpen(false)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-teal-600 text-white hover:bg-teal-700"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default UserDashboard;
