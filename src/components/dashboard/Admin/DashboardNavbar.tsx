import React, { useState, useEffect } from 'react';
import { Menu, X, User, LogOut, Settings, Bell, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { handleLogout } from './LogoutHandler';
import DarkModeToggle from '../../ui/DarkModeToggle';

interface DashboardNavbarProps {
  userType: 'admin' | 'user';
  userName: string;
}

const DashboardNavbar: React.FC<DashboardNavbarProps> = ({ userType, userName }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);

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
  }, []);


  return (
    <nav className="fixed top-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
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
            <div className="flex-shrink-0">
              <Link to="/" className="flex items-center">
                <span className="text-xl font-bold text-teal-600 dark:text-teal-400">
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
          <div className="flex items-center">
            <div className="flex items-center space-x-1">
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
            <div className="ml-3 relative">
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
            <div className="ml-3 -mr-2 flex md:hidden">
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
              <Link 
                to={`/dashboard/${userType}/profile`} 
                className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700" 
                role="menuitem"
              >
                <div className="flex items-center">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </div>
              </Link>
              <Link 
                to={`/dashboard/${userType}/settings`} 
                className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700" 
                role="menuitem"
              >
                <div className="flex items-center">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </div>
              </Link>
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
            <Link 
              to={`/dashboard/${userType}/profile`} 
              className="block px-3 py-2 rounded-md text-base font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Profile
            </Link>
            <Link 
              to={`/dashboard/${userType}/settings`} 
              className="block px-3 py-2 rounded-md text-base font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Settings
            </Link>
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
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            <Link 
              to={userType === 'admin' ? '/dashboard/admin' : '/dashboard/user'} 
              className="block px-3 py-2 rounded-md text-base font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Dashboard
            </Link>
            {userType === 'admin' ? (
              <>
                <Link 
                  to="/dashboard/admin/users" 
                  className="block px-3 py-2 rounded-md text-base font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Manage Users
                </Link>
                <Link 
                  to="/dashboard/admin/devices/add" 
                  className="block px-3 py-2 rounded-md text-base font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Add Device
                </Link>
                <Link 
                  to="/dashboard/admin/reports" 
                  className="block px-3 py-2 rounded-md text-base font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Reports
                </Link>
                <Link 
                  to="/dashboard/admin/plan-leads" 
                  className="block px-3 py-2 rounded-md text-base font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Plan Leads
                </Link>
                <Link 
                  to="/dashboard/admin/settings" 
                  className="block px-3 py-2 rounded-md text-base font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Settings
                </Link>
                <Link 
                  to="/dashboard/admin/estimates" 
                  className="block px-3 py-2 rounded-md text-base font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Create Quote
                </Link>
              </>
            ) : (
              <Link 
                to={`/dashboard/${userType}/settings`} 
                className="block px-3 py-2 rounded-md text-base font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Settings
              </Link>
            )}
          </div>
          {/* Account header and links removed on small screens per request */}
        </div>
      )}
    </nav>
  );
};

export default DashboardNavbar;
