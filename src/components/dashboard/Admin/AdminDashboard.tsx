import React, { useState, useEffect } from 'react';
import { Users, Home, Settings, Bell, BarChart2, Calendar, HelpCircle, FileText } from 'lucide-react';

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
        <p className="text-gray-600 dark:text-gray-400">Welcome to your admin dashboard</p>
      </div>
      
      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-500"></div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
            {/* User Stats Card */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">User Statistics</h2>
                <Users className="h-6 w-6 text-teal-500" />
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">Total Users</span>
                  <span className="text-xl font-bold text-gray-900 dark:text-white">{userStats.totalUsers}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">Active Users</span>
                  <span className="text-xl font-bold text-teal-500">{userStats.activeUsers}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">New Users (This Week)</span>
                  <span className="text-xl font-bold text-blue-500">{userStats.newUsers}</span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <a href="/dashboard/admin/users" className="text-teal-600 dark:text-teal-400 hover:underline text-sm font-medium flex items-center">
                  View All Users
                  <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
                  </svg>
                </a>
              </div>
            </div>
            
            {/* System Stats Card */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">System Statistics</h2>
                <Home className="h-6 w-6 text-teal-500" />
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">Total Devices</span>
                  <span className="text-xl font-bold text-gray-900 dark:text-white">{systemStats.totalDevices}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">Active Devices</span>
                  <span className="text-xl font-bold text-teal-500">{systemStats.activeDevices}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">Alerts Today</span>
                  <span className="text-xl font-bold text-red-500">{systemStats.alertsToday}</span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <a href="/dashboard/admin/devices" className="text-teal-600 dark:text-teal-400 hover:underline text-sm font-medium flex items-center">
                  View All Devices
                  <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
                  </svg>
                </a>
              </div>
            </div>
            
            {/* Quick Actions Card */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Quick Actions</h2>
                <Settings className="h-6 w-6 text-teal-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <a href="/dashboard/admin/users/add" className="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                  <Users className="h-6 w-6 text-teal-500 mb-2" />
                  <span className="text-sm font-medium text-gray-900 dark:text-white">Add User</span>
                </a>
                <a href="/dashboard/admin/devices/add" className="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                  <Home className="h-6 w-6 text-teal-500 mb-2" />
                  <span className="text-sm font-medium text-gray-900 dark:text-white">Add Device</span>
                </a>
                <a href="/dashboard/admin/reports" className="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                  <BarChart2 className="h-6 w-6 text-teal-500 mb-2" />
                  <span className="text-sm font-medium text-gray-900 dark:text-white">Reports</span>
                </a>
                <a href="/dashboard/admin/settings" className="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                  <Settings className="h-6 w-6 text-teal-500 mb-2" />
                  <span className="text-sm font-medium text-gray-900 dark:text-white">Settings</span>
                </a>
                <a href="/dashboard/admin/users" className="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                  <Users className="h-6 w-6 text-teal-500 mb-2" />
                  <span className="text-sm font-medium text-gray-900 dark:text-white">Customers</span>
                </a>
                <a href="/dashboard/admin/estimates" className="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                  <FileText className="h-6 w-6 text-teal-500 mb-2" />
                  <span className="text-sm font-medium text-gray-900 dark:text-white">Create Quote</span>
                </a>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden">
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
