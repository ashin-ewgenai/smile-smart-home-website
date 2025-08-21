import React, { useState, useEffect } from 'react';
import { Users, Home, Settings, Bell, BarChart2, Calendar, HelpCircle, FileText, ChevronDown, TrendingUp, TrendingDown, Activity } from 'lucide-react';

interface UserStats {
  totalUsers: number;
  activeUsers: number;
  newUsers: number;
}

interface SystemStats {
  totalDevices: number;
  activeDevices: number;
  alertsToday: number;
}

// Lightweight inline sparkline component (no external deps)
const Sparkline: React.FC<{ data: number[]; width?: number; height?: number; stroke?: string }> = ({
  data,
  width = 120,
  height = 32,
  stroke = '#14b8a6',
}) => {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data
    .map((d, i) => {
      const x = i * step;
      const y = height - ((d - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
};

const AdminDashboard: React.FC = () => {
  const [userStats, setUserStats] = useState<UserStats>({
    totalUsers: 0,
    activeUsers: 0,
    newUsers: 0
  });
  
  const [systemStats, setSystemStats] = useState<SystemStats>({
    totalDevices: 0,
    activeDevices: 0,
    alertsToday: 0
  });
  
  const [isLoading, setIsLoading] = useState(true);
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);

  // Mock KPI & trend data (could be fetched based on dateRange)
  const kpis = [
    {
      key: 'users',
      label: 'Total Users',
      value: 156,
      delta: +12,
      icon: Users,
      color: 'text-teal-500',
      data: [6, 8, 7, 9, 12, 11, 15, 14, 16, 15, 16, 18],
    },
    {
      key: 'active',
      label: 'Total Devices',
      value: 298,
      delta: +5,
      icon: Activity,
      color: 'text-blue-500',
      data: [270, 272, 274, 276, 278, 279, 281, 283, 286, 289, 295, 298],
    },
    {
      key: 'alerts',
      label: 'Alerts Today',
      value: 5,
      delta: -2,
      icon: Bell,
      color: 'text-red-500',
      data: [9, 10, 8, 7, 6, 7, 6, 5, 6, 5, 5, 5],
    },
  ];
  
  // Simulate fetching data
  useEffect(() => {
    // In a real app, this would be an API call
    setTimeout(() => {
      setUserStats({
        totalUsers: 156,
        activeUsers: 89,
        newUsers: 12
      });
      
      setSystemStats({
        totalDevices: 342,
        activeDevices: 298,
        alertsToday: 5
      });
      
      setIsLoading(false);
    }, 1000);
  }, []);
  
  const recentUsers = [
    { id: 1, name: 'John Doe', email: 'john@example.com', status: 'active', joinDate: '2023-08-10' },
    { id: 2, name: 'Jane Smith', email: 'jane@example.com', status: 'active', joinDate: '2023-08-09' },
    { id: 3, name: 'Robert Johnson', email: 'robert@example.com', status: 'inactive', joinDate: '2023-08-08' },
    { id: 4, name: 'Emily Davis', email: 'emily@example.com', status: 'active', joinDate: '2023-08-07' },
    { id: 5, name: 'Michael Wilson', email: 'michael@example.com', status: 'pending', joinDate: '2023-08-06' },
  ];
  
  const recentAlerts = [
    { id: 1, device: 'Living Room Camera', type: 'Motion Detected', time: '10:23 AM', date: 'Today' },
    { id: 2, device: 'Front Door Lock', type: 'Multiple Failed Attempts', time: '09:45 AM', date: 'Today' },
    { id: 3, device: 'Garage Sensor', type: 'Door Left Open', time: '08:30 AM', date: 'Today' },
    { id: 4, device: 'Kitchen Smoke Detector', type: 'Low Battery', time: '07:15 AM', date: 'Today' },
    { id: 5, device: 'Basement Water Sensor', type: 'Water Detected', time: '11:50 PM', date: 'Yesterday' },
  ];
  
  
  
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Admin Dashboard</h1>
        <div className="flex items-center justify-between">
          <p className="text-gray-600 dark:text-gray-400">Welcome to your admin dashboard</p>
          <div className="relative inline-block">
            <button
              type="button"
              onClick={() => setIsQuickActionsOpen((v) => !v)}
              id="quick-actions-button"
              aria-haspopup="menu"
              aria-expanded={isQuickActionsOpen}
              aria-controls="quick-actions-menu"
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              Quick Actions
              <ChevronDown className={`h-4 w-4 transition-transform ${isQuickActionsOpen ? 'rotate-180' : ''}`} />
            </button>
            {isQuickActionsOpen && (
              <div
                id="quick-actions-menu"
                role="menu"
                aria-labelledby="quick-actions-button"
                className="absolute right-0 top-full mt-2 w-full bg-white dark:bg-gray-800 rounded-lg shadow-xl ring-1 ring-black/10 dark:ring-white/10 border border-gray-200/70 dark:border-gray-700/60 z-30 overflow-hidden"
              >
                <div className="p-0 divide-y divide-gray-100 dark:divide-gray-700">
                  <a href="/dashboard/admin/users/add" role="menuitem" className="block px-3 py-2 text-sm leading-6 text-gray-900 dark:text-white hover:bg-teal-50 hover:text-teal-700 dark:hover:bg-gray-700 dark:hover:text-teal-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">Add User</a>
                  <a href="/dashboard/admin/devices/add" role="menuitem" className="block px-3 py-2 text-sm leading-6 text-gray-900 dark:text-white hover:bg-teal-50 hover:text-teal-700 dark:hover:bg-gray-700 dark:hover:text-teal-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">Add Device</a>
                  <a href="/dashboard/admin/estimates" role="menuitem" className="block px-3 py-2 text-sm leading-6 text-gray-900 dark:text-white hover:bg-teal-50 hover:text-teal-700 dark:hover:bg-gray-700 dark:hover:text-teal-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">Create Quote</a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-500"></div>
        </div>
      ) : (
        <>
          {/* KPI Summary */
          }
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 auto-rows-fr gap-4 mb-6">
            {kpis.map((kpi) => {
              const Icon = kpi.icon as any;
              const isUp = kpi.delta >= 0;
              const cardInner = (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700 h-full flex flex-col">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">{kpi.label}</span>
                      <div className="mt-1 flex items-end gap-2">
                        <span className="text-2xl font-bold text-gray-900 dark:text-white">{kpi.value}</span>
                        <span className={`text-xs font-medium flex items-center ${isUp ? 'text-emerald-600' : 'text-red-500'}`}>
                          {isUp ? <TrendingUp className="h-4 w-4 mr-1" /> : <TrendingDown className="h-4 w-4 mr-1" />}
                          {isUp ? '+' : ''}{kpi.delta}
                        </span>
                      </div>
                    </div>
                    <div className={`p-2 rounded-md ${kpi.color.replace('text-', 'bg-').replace('-500', '-100')} dark:bg-gray-700`}>
                      <Icon className={`h-5 w-5 ${kpi.color}`} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <Sparkline data={kpi.data} />
                  </div>
                  {(kpi.key === 'users' || kpi.key === 'active') && (
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                      <a href={kpi.key === 'users' ? "/dashboard/admin/users" : "/dashboard/admin/devices"} className="text-teal-600 dark:text-teal-400 hover:underline text-sm font-medium flex items-center">
                        {kpi.key === 'users' ? 'View All Users' : 'View All Devices'}
                        <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
                        </svg>
                      </a>
                    </div>
                  )}
                </div>
              );
              return kpi.key === 'alerts' ? (
                <a key={kpi.key} href="#recent-alerts" className="block h-full focus:outline-none focus:ring-2 focus:ring-teal-500 rounded-lg cursor-pointer">
                  {cardInner}
                </a>
              ) : (
                <div key={kpi.key} className="h-full">
                  {cardInner}
                </div>
              );
            })}
          </div>
          
          
          <div className="grid grid-cols-1 gap-6">
            {/* Recent Users */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Users</h2>
                <a href="/dashboard/admin/users" className="text-sm text-teal-600 dark:text-teal-400 hover:underline">View All</a>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Name</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Email</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Join Date</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {recentUsers.map((user) => (
                      <tr key={user.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{user.name}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500 dark:text-gray-400">{user.email}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                            ${user.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 
                              user.status === 'inactive' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' : 
                              'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'}`}>
                            {user.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {user.joinDate}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* Recent Alerts */}
            <div id="recent-alerts" className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden mb-6">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Alerts</h2>
                <a href="/dashboard/admin/alerts" className="text-sm text-teal-600 dark:text-teal-400 hover:underline">View All</a>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Device</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Alert Type</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Time</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {recentAlerts.map((alert) => (
                      <tr key={alert.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{alert.device}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500 dark:text-gray-400">{alert.type}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {alert.time}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {alert.date}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminDashboard;
