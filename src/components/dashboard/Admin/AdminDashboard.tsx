import React, { useState, useEffect } from 'react';
import { Users, Home, Settings, Bell, BarChart2, Calendar, HelpCircle, FileText, ChevronDown, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { COLLECTION_ACCOUNTS } from '../../../models/Collections';

interface User {
  id: string;
  FullName: string;
  Email: string | null;
  Role?: string;
  Status: 'online' | 'offline' | string;
  CreatedAt?: { toDate: () => Date } | null;
  [key: string]: any; // For any additional properties
}

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
  
  // Filter out invalid data points
  const validData = data.filter(d => typeof d === 'number' && !isNaN(d) && isFinite(d));
  if (validData.length === 0) return null;
  
  const max = Math.max(...validData);
  const min = Math.min(...validData);
  const range = max - min || 1;
  const step = validData.length > 1 ? width / (validData.length - 1) : 0;
  
  const points = validData
    .map((d, i) => {
      const x = i * step;
      const y = height - ((d - min) / range) * height;
      // Ensure coordinates are valid numbers
      if (isNaN(x) || isNaN(y) || !isFinite(x) || !isFinite(y)) {
        return null;
      }
      return `${x},${y}`;
    })
    .filter(Boolean)
    .join(' ');
    
  if (!points) return null;
  
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
  const [recentUsers, setRecentUsers] = useState<User[]>([]);
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);

  // Fetch and process all users
  useEffect(() => {
    const fetchAndProcessUsers = async () => {
      try {
        setIsLoading(true);
        const usersRef = collection(db, COLLECTION_ACCOUNTS);
        const querySnapshot = await getDocs(usersRef);
        
        // Process all users with proper typing
        const allUsers = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            FullName: data.FullName || 'Unknown User',
            Email: data.Email || null,
            Status: data.Status || 'offline',
            Role: data.Role || 'user',
            CreatedAt: data.CreatedAt || null
          } as User;
        });
        
        // Filter for users with role 'user' and sort by CreatedAt
        const userAccounts = allUsers
          .filter(user => user.Role === 'user')
          .sort((a, b) => {
            const dateA = a.CreatedAt?.toDate() || new Date(0);
            const dateB = b.CreatedAt?.toDate() || new Date(0);
            return dateB.getTime() - dateA.getTime(); // Newest first
          });
        
        // Get the 5 most recent users
        const recent = userAccounts.slice(0, 5);
        setRecentUsers(recent);
        
        // Calculate stats
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        
        const totalUsers = userAccounts.length;
        const activeUsers = userAccounts.filter(user => user.Status === 'online').length;
        const newUsers = userAccounts.filter(user => {
          const userDate = user.CreatedAt?.toDate() || new Date(0);
          return userDate >= oneWeekAgo;
        }).length;
        
        // Update KPIs
        setKpis([{
          key: 'users',
          label: 'Total Users',
          value: totalUsers,
          delta: 0,
          icon: Users,
          color: 'text-teal-500',
          data: [totalUsers],
        }]);
        
        // Update user stats
        setUserStats({
          totalUsers,
          activeUsers,
          newUsers
        });
        
      } catch (error) {
        console.error('Error processing users:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchAndProcessUsers();
  }, []);

  const [kpis, setKpis] = useState<Array<{
    key: string;
    label: string;
    value: number | string;
    delta: number;
    icon: any;
    color: string;
    data: number[];
  }>>([{
    key: 'users',
    label: 'Total Users',
    value: 0,
    delta: 0,
    icon: Users,
    color: 'text-teal-500',
    data: [],
  }]);
  
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
              const solo = kpis.length === 1;
              const cardInner = (
                <div className={`bg-white dark:bg-gray-800 rounded-lg shadow ${solo ? 'p-7' : 'p-6'} border border-gray-200 dark:border-gray-700 h-full flex flex-col`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <span className={`${solo ? 'text-lg' : 'text-base'} text-gray-600 dark:text-gray-400`}>{kpi.label}</span>
                      <div className="mt-2 flex items-end gap-3">
                        <span className={`${solo ? 'text-5xl' : 'text-4xl'} font-bold text-gray-900 dark:text-white`}>{kpi.value}</span>
                        <span className={`${solo ? 'text-base' : 'text-sm'} font-medium flex items-center ${isUp ? 'text-emerald-600' : 'text-red-500'}`}>
                          {isUp ? <TrendingUp className={`${solo ? 'h-6 w-6' : 'h-5 w-5'} mr-1`} /> : <TrendingDown className={`${solo ? 'h-6 w-6' : 'h-5 w-5'} mr-1`} />}
                          {isUp ? '+' : ''}{kpi.delta}
                        </span>
                      </div>
                    </div>
                    <div className={`rounded-md ${solo ? 'p-4' : 'p-3'} ${kpi.color.replace('text-', 'bg-').replace('-500', '-100')} dark:bg-gray-700`}>
                      <Icon className={`${solo ? 'h-8 w-8' : 'h-6 w-6'} ${kpi.color}`} />
                    </div>
                  </div>
                  <div className="mt-4">
                    <Sparkline data={kpi.data} width={solo ? 160 : 120} height={solo ? 40 : 32} />
                  </div>
                  {kpi.key === 'active' && (
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                      <a href="/dashboard/admin/devices" className="text-teal-600 dark:text-teal-400 hover:underline text-sm font-medium flex items-center">
                        View All Devices
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
                <div
                  key={kpi.key}
                  className={`h-full ${kpis.length === 1 ? 'col-span-full justify-self-center w-full max-w-xs' : ''}`}
                >
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
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Join Date</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {recentUsers.map((user) => (
                      <tr key={user.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{user.FullName}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500 dark:text-gray-400">{user.Email}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {user.CreatedAt?.toDate().toLocaleDateString() || 'N/A'}
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
