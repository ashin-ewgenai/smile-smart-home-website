import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Users, Home, Settings, Bell, BarChart2, Calendar, HelpCircle, FileText, ChevronDown, TrendingUp, TrendingDown, Activity, Eye, EyeOff, LayoutDashboard } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '../../../lib/firebase';
import { COLLECTION_ACCOUNTS, accountsCollection, registerUserWithProfile, type Account } from '../../../models/Collections';

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
  // Add User modal state (Option A)
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [showAddPassword, setShowAddPassword] = useState(false);
  const [addRole, setAddRole] = useState<Account['Role']>('user');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const addModalRef = useRef<HTMLDivElement | null>(null);

  const openAdd = () => { setShowAdd(true); setAddError(null); };
  const closeAdd = () => { setShowAdd(false); setAddName(''); setAddEmail(''); setAddPassword(''); setAddRole('user'); setAddError(null); };

  useEffect(() => {
    if (showAdd && addModalRef.current) {
      addModalRef.current.focus();
    }
  }, [showAdd]);

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!addEmail || !addPassword) return;
    setAdding(true);
    setAddError(null);
    try {
      await registerUserWithProfile(auth, db, {
        email: addEmail,
        password: addPassword,
        fullName: addName || addEmail.split('@')[0],
        role: addRole,
      });
      closeAdd();
    } catch (err: any) {
      setAddError(err?.message || 'Failed to add user');
    } finally {
      setAdding(false);
    }
  }

  // Fetch and process all users
  useEffect(() => {
    const fetchAndProcessUsers = async () => {
      try {
        setIsLoading(true);
        const usersRef = accountsCollection(db);
        // Restrict to end-user accounts to comply with stricter Firestore rules
        const querySnapshot = await getDocs(
          // fetch only Accounts where Role == 'user'
          query(usersRef, where('Role', '==', 'user'))
        );
        
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
        // Already constrained by query; still defensively filter and then sort
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
        // Permission-denied or other failures: show empty state gracefully
        setRecentUsers([]);
        setUserStats({ totalUsers: 0, activeUsers: 0, newUsers: 0 });
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
 
  // Animated count for the Users KPI
  const [animatedUsersCount, setAnimatedUsersCount] = useState(0);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const startValueRef = useRef<number>(0);

  useEffect(() => {
    // Determine the target count from the 'users' KPI
    const usersKpi = kpis.find(k => k.key === 'users');
    if (!usersKpi) return;
    const rawTarget = typeof usersKpi.value === 'number' ? usersKpi.value : parseInt(String(usersKpi.value || 0), 10);
    const target = Number.isFinite(rawTarget) ? rawTarget : 0;

    // Respect reduced motion
    if (typeof window !== 'undefined' && 'matchMedia' in window && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setAnimatedUsersCount(target);
      return;
    }

    // Cancel any ongoing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    startTimeRef.current = null;
    startValueRef.current = animatedUsersCount; // continue from current displayed value

    const duration = 1200; // ms
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const step = (timestamp: number) => {
      if (startTimeRef.current === null) startTimeRef.current = timestamp;
      const progress = Math.min((timestamp - startTimeRef.current) / duration, 1);
      const eased = easeOutCubic(progress);
      const current = Math.round(startValueRef.current + (target - startValueRef.current) * eased);
      setAnimatedUsersCount(current);
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(step);
      } else {
        animationRef.current = null;
      }
    };

    animationRef.current = requestAnimationFrame(step);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [kpis]);
  
  const recentAlerts = [
    { id: 1, device: 'Living Room Camera', type: 'Motion Detected', time: '10:23 AM', date: 'Today' },
    { id: 2, device: 'Front Door Lock', type: 'Multiple Failed Attempts', time: '09:45 AM', date: 'Today' },
    { id: 3, device: 'Garage Sensor', type: 'Door Left Open', time: '08:30 AM', date: 'Today' },
    { id: 4, device: 'Kitchen Smoke Detector', type: 'Low Battery', time: '07:15 AM', date: 'Today' },
    { id: 5, device: 'Basement Water Sensor', type: 'Water Detected', time: '11:50 PM', date: 'Yesterday' },
  ];
  
  
  
  return (
    <div>
      <div className="mb-6 glass-surface rounded-[24px] px-4 py-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white inline-flex items-center gap-2">Admin Dashboard
          <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
        </h1>
        <div className="mt-2 flex items-center justify-between">
          <p className="text-gray-600 dark:text-gray-400">Welcome to your admin dashboard</p>
          <div className="relative inline-block">
            <button
              type="button"
              onClick={() => setIsQuickActionsOpen((v) => !v)}
              id="quick-actions-button"
              aria-haspopup="menu"
              aria-expanded={isQuickActionsOpen}
              aria-controls="quick-actions-menu"
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-900 dark:text-white bg-white dark:bg-gray-700 rounded-md border border-gray-300 dark:border-gray-600 shadow-sm hover:shadow-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              Quick Actions
              <ChevronDown className={`h-4 w-4 transition-transform ${isQuickActionsOpen ? 'rotate-180' : ''}`} />
            </button>
            {isQuickActionsOpen && (
              <div
                id="quick-actions-menu"
                role="menu"
                aria-labelledby="quick-actions-button"
                className="absolute right-0 top-full mt-2 w-full bg-white/95 backdrop-blur-sm dark:bg-gray-800 rounded-lg shadow-xl ring-1 ring-black/10 dark:ring-white/10 border border-gray-200/70 dark:border-gray-700/60 z-30 overflow-hidden"
              >
                <div className="p-0 divide-y divide-gray-100 dark:divide-gray-700">
                  <a
                    href="/dashboard/admin/users/add"
                    role="menuitem"
                    onClick={(e) => { e.preventDefault(); setIsQuickActionsOpen(false); openAdd(); }}
                    className="block px-3 py-2 text-sm leading-6 text-gray-900 dark:text-white hover:bg-teal-50 hover:text-teal-700 dark:hover:bg-gray-700 dark:hover:text-teal-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                  >
                    Add User
                  </a>
                  <Link to="/devices/add" role="menuitem" className="block px-3 py-2 text-sm leading-6 text-gray-900 dark:text-white hover:bg-teal-50 hover:text-teal-700 dark:hover:bg-gray-700 dark:hover:text-teal-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">Add Device</Link>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* KPI Summary moved inside header glass section */}
        {!isLoading && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 auto-rows-fr gap-4">
            {kpis.map((kpi) => {
              const Icon = kpi.icon as any;
              const isUp = kpi.delta >= 0;
              return (
                <div key={kpi.key} className="h-full">
                  <div className="bg-white/95 dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-md transition-shadow p-6 border border-gray-200 dark:border-gray-700 h-full flex flex-col">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-base text-gray-600 dark:text-gray-400">{kpi.label}</span>
                        <div className="mt-2 flex items-end gap-3">
                          <span className="text-4xl font-bold text-gray-900 dark:text-white">
                            {kpi.key === 'users' ? animatedUsersCount.toLocaleString() : kpi.value}
                          </span>
                          <span className={`text-sm font-medium flex items-center ${isUp ? 'text-emerald-600' : 'text-red-500'}`}>
                            {isUp ? <TrendingUp className="h-5 w-5 mr-1" /> : <TrendingDown className="h-5 w-5 mr-1" />}
                            {isUp ? '+' : ''}{kpi.delta}
                          </span>
                        </div>
                      </div>
                      <div className={`p-3 rounded-md ${kpi.color.replace('text-', 'bg-').replace('-500', '-100')} dark:bg-gray-700`}>
                        <Icon className={`h-6 w-6 ${kpi.color}`} />
                      </div>
                    </div>
                    <div className="mt-4">
                      <Sparkline data={kpi.data} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-500"></div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6">
            {/* Recent Users */}
            <div className="bg-white/95 dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
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

      {/* Add User Modal (local to AdminDashboard) */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closeAdd} />
          <div
            ref={addModalRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            className="relative z-10 bg-white dark:bg-gray-800 rounded-lg shadow-lg w-full max-w-md p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Add User</h2>
              <button onClick={closeAdd} className="text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white">✕</button>
            </div>
            <form onSubmit={handleAddSubmit} className="space-y-4">
              {addError && <div className="text-red-600 text-sm">{addError}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full name</label>
                <input value={addName} onChange={e => setAddName(e.target.value)} className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                <input type="email" required value={addEmail} onChange={e => setAddEmail(e.target.value)} className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                <div className="relative">
                  <input
                    type={showAddPassword ? 'text' : 'password'}
                    required
                    value={addPassword}
                    onChange={e => setAddPassword(e.target.value)}
                    className="w-full pr-10 px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  />
                  <button
                    type="button"
                    aria-label={showAddPassword ? 'Hide password' : 'Show password'}
                    title={showAddPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowAddPassword(v => !v)}
                    className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                  >
                    {showAddPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
                <select value={addRole} onChange={e => setAddRole(e.target.value as Account['Role'])} className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                  <option value="Super Admin">Super Admin</option>
                </select>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={closeAdd} className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300">Cancel</button>
                <button type="submit" disabled={adding} className="px-3 py-2 rounded bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-60">{adding ? 'Adding...' : 'Add User'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default AdminDashboard;
