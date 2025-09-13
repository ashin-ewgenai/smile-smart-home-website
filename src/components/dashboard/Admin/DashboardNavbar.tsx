import React, { useState, useEffect } from 'react';
import { Menu, X, User, LogOut, Bell, ArrowLeft, Crown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { handleLogout } from './LogoutHandler';
import DarkModeToggle from '../../ui/DarkModeToggle';
import { SUPER_ADMIN_BASE_PATH } from '../../../lib/constants';

interface DashboardNavbarProps {
  userType: 'admin' | 'user';
  userName: string;
}

const DashboardNavbar: React.FC<DashboardNavbarProps> = ({ userType, userName }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const toggleProfileDropdown = () => {
    setIsProfileDropdownOpen(!isProfileDropdownOpen);
  };

  // Get actual user name from localStorage
  const [actualUserName, setActualUserName] = useState(userName);
  
  useEffect(() => {
    const email = localStorage.getItem('userEmail');
    if (email) {
      // Extract name from email (simple approach)
      const name = email.split('@')[0];
      // Capitalize first letter
      setActualUserName(name.charAt(0).toUpperCase() + name.slice(1));
    }
    try {
      const role = (localStorage.getItem('userRole') || '').toLowerCase().replace(/[_-]+/g, ' ').trim();
      setIsSuperAdmin(role === 'super admin');
    } catch {}
  }, []);


  return (
    <nav className="fixed top-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="flex justify-between h-16">
          <div className="flex items-center min-w-0 flex-1">
            <button
              type="button"
              onClick={() => {
                try {
                  if (window.history.length > 1) window.history.back();
                  else window.location.href = userType === 'admin' ? '/dashboard/admin' : '/dashboard/user';
                } catch {
                  window.location.href = userType === 'admin' ? '/dashboard/admin' : '/dashboard/user';
                }
              }}
              aria-label="Go back"
              title="Go back"
              className="mr-3 p-2 rounded-full text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <Link to="/" className="flex items-center min-w-0">
                <span className="text-base sm:text-xl font-bold text-teal-600 dark:text-teal-400 truncate whitespace-nowrap max-w-[50vw] sm:max-w-none">
                  Smile Smart Home
                </span>
              </Link>
            </div>
            <div className="hidden">
              <Link 
                to={userType === 'admin' ? '/dashboard/admin' : '/dashboard/user'} 
                className="px-3 py-2 text-sm font-medium text-gray-900 dark:text-white rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Dashboard
              </Link>
              {userType === 'admin' ? (
                <>
                  <Link 
                    to="/dashboard/admin/users" 
                    className="px-3 py-2 text-sm font-medium text-gray-900 dark:text-white rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    Manage Users
                  </Link>
                  <Link 
                    to="/dashboard/admin/settings" 
                    className="px-3 py-2 text-sm font-medium text-gray-900 dark:text-white rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    Settings
                  </Link>
                </>
              ) : (
                <Link 
                  to={`/dashboard/${userType}/settings`} 
                  className="px-3 py-2 text-sm font-medium text-gray-900 dark:text-white rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Settings
                </Link>
              )}
            </div>
          </div>
          <div className="flex items-center flex-shrink-0">
            <div className="hidden md:flex items-center space-x-1 sm:space-x-2">
              {isSuperAdmin && (
                <a
                  href={`${SUPER_ADMIN_BASE_PATH}/dashboard`}
                  className="mr-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-yellow-300 text-yellow-700 bg-yellow-50 hover:bg-yellow-100 dark:border-yellow-600 dark:text-yellow-200 dark:bg-yellow-900/20 text-xs"
                  title="Switch to Super Admin Dashboard"
                >
                  <Crown className="h-3.5 w-3.5" />
                  Super Admin
                </a>
              )}
              <DarkModeToggle />
              {userType === 'admin' ? (
                <Link
                  to="/notifications"
                  aria-label="Notifications"
                  className="p-2 rounded-full text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white focus:outline-none"
                >
                  <Bell className="h-5 w-5" />
                </Link>
              ) : (
                <button
                  type="button"
                  className="p-2 rounded-full text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white focus:outline-none"
                  disabled
                  aria-disabled="true"
                >
                  <Bell className="h-5 w-5 opacity-50" />
                </button>
              )}
            </div>
            <div className="ml-3 relative hidden md:block">
              <div>
                <button 
                  type="button" 
                  className="flex items-center max-w-xs rounded-full bg-gray-100 dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500" 
                  id="user-menu" 
                  aria-expanded="false" 
                  aria-haspopup="true"
                  onClick={toggleProfileDropdown}
                >
                  <span className="sr-only">Open user menu</span>
                  <div className="h-8 w-8 rounded-full flex items-center justify-center bg-teal-500 text-white">
                    <User className="h-5 w-5" />
                  </div>
                </button>
              </div>
              {/* Desktop dropdown is rendered at container level to align with navbar bottom border */}
            </div>
            <div className="ml-2 -mr-2 flex md:hidden shrink-0 relative z-10">
              <button 
                type="button" 
                className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-500" 
                aria-expanded="false"
                onClick={toggleMobileMenu}
              >
                <span className="sr-only">Open main menu</span>
                {isMobileMenuOpen ? (
                  <X className="block h-6 w-6" aria-hidden="true" />
                ) : (
                  <Menu className="block h-6 w-6" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        </div>
        {/* Desktop dropdown placed after header row to sit at bottom border; positioned to container */}
        {isProfileDropdownOpen && (
          <div className="hidden md:block">
            <div 
              className="origin-top-right absolute right-4 top-full w-56 rounded-md shadow-lg py-1 bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 focus:outline-none z-20"
              role="menu"
              aria-orientation="vertical"
              aria-labelledby="user-menu"
            >
              <div className="px-4 py-2 text-sm text-gray-700 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700">
                <p className="font-medium">{actualUserName}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{userType}</p>
              </div>
              <button 
                onClick={handleLogout}
                className="w-full text-left block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700" 
                role="menuitem"
              >
                <div className="flex items-center">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </div>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mobile profile dropdown: full-width, inline to push content (no overlap) */}
      {isProfileDropdownOpen && (
        <div className="md:hidden border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 w-full">
          <div className="max-w-full mx-auto px-4 py-3 space-y-1">
            <div className="px-1 pb-2 text-sm text-gray-700 dark:text-gray-200">
              <p className="font-medium">{actualUserName}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{userType}</p>
            </div>
            <button 
              onClick={handleLogout}
              className="w-full text-left block px-3 py-2 rounded-md text-base font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Sign out
            </button>
          </div>
        </div>
      )}

      {isMobileMenuOpen && (
        <div className="md:hidden">
          <div className="px-2 pt-2 pb-3 space-y-2 sm:px-3">
            <a 
              href={userType === 'admin' ? '/dashboard/admin' : '/dashboard/user'} 
              onClick={() => setIsMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-md text-base font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Dashboard
            </a>
            {userType === 'admin' ? (
              <>
                <a 
                  href="/dashboard/admin/users" 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block px-3 py-2 rounded-md text-base font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Manage Users
                </a>
                <a 
                  href="/dashboard/admin/devices/add" 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block px-3 py-2 rounded-md text-base font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Add Device
                </a>
                <a 
                  href="/dashboard/admin/reports" 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block px-3 py-2 rounded-md text-base font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Reports
                </a>
                <a 
                  href="/dashboard/admin/plan-leads" 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block px-3 py-2 rounded-md text-base font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Plan Leads
                </a>
                <a 
                  href="/dashboard/admin/estimates" 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block px-3 py-2 rounded-md text-base font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Create Quote
                </a>
              </>
            ) : (
              <a 
                href="/dashboard/user/settings" 
                onClick={() => setIsMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-md text-base font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Settings
              </a>
            )}

            {/* Divider */}
            <div className="border-t border-gray-200 dark:border-gray-700 my-2" />

            {/* Moved navbar controls into the mobile menu */}
            <div className="px-1 py-2 space-y-2">
              {/* Theme toggle */}
              <div className="flex items-center justify-between px-2 py-2 rounded-md bg-gray-50 dark:bg-gray-800">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Theme</span>
                <DarkModeToggle />
              </div>

              {/* Notifications */}
              {userType === 'admin' ? (
                <a
                  href="/dashboard/admin/notifications"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-2 py-2 rounded-md text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Bell className="h-5 w-5" />
                  <span className="text-base">Notifications</span>
                </a>
              ) : (
                <div className="flex items-center gap-3 px-2 py-2 rounded-md text-gray-500 dark:text-gray-400">
                  <Bell className="h-5 w-5 opacity-50" />
                  <span className="text-base">Notifications</span>
                </div>
              )}

              {/* Account */}
              <div className="flex items-center gap-3 px-2 py-2 rounded-md">
                <div className="h-8 w-8 rounded-full flex items-center justify-center bg-teal-500 text-white">
                  <User className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">{actualUserName}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">{userType}</div>
                </div>
                <button 
                  onClick={handleLogout}
                  className="px-3 py-1.5 rounded-md bg-red-600 text-white text-sm hover:bg-red-700"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
          {/* End mobile menu content */}
        </div>
      )}
    </nav>
  );
};

export default DashboardNavbar;
