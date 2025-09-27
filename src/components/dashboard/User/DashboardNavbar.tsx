import React, { useState, useEffect } from 'react';
import { Menu, X, User, LogOut, Settings, ArrowLeft, Moon, Sun, Bell } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { onSnapshot, query, where, limit } from 'firebase/firestore';
import { auth, db } from '../../../lib/firebase';
import { userNotificationsCollection } from '../../../models/Collections';
import { handleLogout } from './LogoutHandler';

interface DashboardNavbarProps {
  userType: 'admin' | 'user';
  userName: string;
}

const DashboardNavbar: React.FC<DashboardNavbarProps> = ({ userType, userName }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [hasUnread, setHasUnread] = useState<boolean>(() => {
    try {
      return localStorage.getItem('hasUnreadNotifications') === '1';
    } catch {
      return false;
    }
  });
  // Safely use location only in browser environment
  const location = typeof window !== 'undefined' ? useLocation() : { pathname: '' };
  const navigate = useNavigate();

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

  // Initialize dark mode from storage or media preference
  useEffect(() => {
    try {
      const stored = localStorage.getItem('darkMode');
      const prefers = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const initial = stored === 'true' || (stored === null && prefers);
      setDarkMode(initial);
      if (initial) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    } catch {}
  }, []);

  // Listen for unread user notifications to toggle red dot on bell icon
  useEffect(() => {
    let unsubAuth: any;
    let unsubNotif: any;
    try {
      unsubAuth = auth.onAuthStateChanged((user) => {
        // Cleanup previous listener
        try { if (unsubNotif) unsubNotif(); } catch {}
        if (!user?.uid) {
          setHasUnread(false);
          try { localStorage.setItem('hasUnreadNotifications', '0'); } catch {}
          return;
        }
        try {
          const uq = query(
            userNotificationsCollection(db),
            where('uid', '==', user.uid),
            where('status', '==', 'unread'),
            limit(1)
          );
          unsubNotif = onSnapshot(uq, (snap) => {
            const anyUnread = !snap.empty;
            // Debug logs are safe; remove if too chatty
            try { console.debug('[UserNavbar] notif snapshot size:', snap.size, 'hasUnread:', anyUnread); } catch {}
            setHasUnread(anyUnread);
            try { localStorage.setItem('hasUnreadNotifications', anyUnread ? '1' : '0'); } catch {}
          }, (err) => {
            try { console.warn('[UserNavbar] notif listener error', err); } catch {}
            setHasUnread(false);
            try { localStorage.setItem('hasUnreadNotifications', '0'); } catch {}
          });
        } catch {
          setHasUnread(false);
          try { localStorage.setItem('hasUnreadNotifications', '0'); } catch {}
        }
      });
      return () => {
        try { if (unsubNotif) unsubNotif(); } catch {}
        try { if (unsubAuth) unsubAuth(); } catch {}
      };
    } catch {
      setHasUnread(false);
      try { localStorage.setItem('hasUnreadNotifications', '0'); } catch {}
    }
  }, []);

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    try { localStorage.setItem('darkMode', String(next)); } catch {}
    if (next) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  };


  return (
    <nav className="fixed top-0 inset-x-0 z-50 w-full glass-surface">
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 relative">
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
              className="mr-3 p-2 rounded-full text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 md:hidden"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex-shrink-0">
              <a
                href="/"
                className="flex items-center space-x-3 text-xl font-semibold text-charcoal dark:text-white"
                aria-label="Smile Smart Homes home"
              >
                <img
                  src="/logo-primary.png"
                  alt="Smile Smart Homes"
                  className="h-10 sm:h-12 w-auto filter-teal"
                />
                <img
                  src="/my-secondary.png.png"
                  alt="Secondary logo"
                  className="h-8 sm:h-10 w-auto hidden sm:inline-block filter-teal"
                />
              </a>
            </div>
          </div>
          {/* Centered desktop nav removed; sidebar will handle navigation */}
          <div className="flex items-center">
            {/* Help button removed; "Raise Tickets" is now in the sidebar and mobile menu */}
            <Link
              to="notifications"
              className="relative p-2 rounded-full text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white focus:outline-none ml-3"
              aria-label="Notifications"
              title="Notifications"
            >
              <Bell className="h-5 w-5" />
              {hasUnread && (
                <span
                  aria-hidden
                  className="absolute top-1.5 right-1.5 inline-block h-2.5 w-2.5 rounded-full bg-red-500"
                />
              )}
            </Link>
            <button
              type="button"
              onClick={toggleDarkMode}
              className="p-2 rounded-full text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white focus:outline-none ml-3"
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              title={darkMode ? 'Light mode' : 'Dark mode'}
            >
              {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
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
                  <div className="h-8 w-8 rounded-full flex items-center justify-center bg-black dark:bg-teal-500 text-white ring-1 ring-gray-300/60 dark:ring-teal-300/40 shadow-sm">
                    <User className="h-5 w-5" />
                  </div>
                </button>
              </div>
              {isProfileDropdownOpen && (
                <div 
                  className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg py-1 bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 focus:outline-none z-10" 
                  role="menu" 
                  aria-orientation="vertical" 
                  aria-labelledby="user-menu"
                >
                  <div className="px-4 py-2 text-sm text-gray-700 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700">
                    <p className="font-medium">{actualUserName}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{userType}</p>
                  </div>
                  <Link 
                    to="profile"
                    className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700" 
                    role="menuitem"
                    onClick={() => setIsProfileDropdownOpen(false)}
                  >
                    <div className="flex items-center">
                      <User className="mr-2 h-4 w-4" />
                      Profile
                    </div>
                  </Link>
                  <Link 
                    to="settings"
                    className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700" 
                    role="menuitem"
                    onClick={() => setIsProfileDropdownOpen(false)}
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
              )}
            </div>
            <div className="-mr-2 flex md:hidden">
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
      </div>

      {isMobileMenuOpen && (
        <div className="md:hidden">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            <Link 
              to={userType === 'admin' ? '/dashboard/admin' : '/'} 
              className="block px-3 py-2 rounded-md text-base font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Dashboard
            </Link>
            {userType === 'admin' && (
              <Link 
                to="/e" 
                className="block px-3 py-2 rounded-md text-base font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Manage Users
              </Link>
            )}
            {/* Removed Notifications link to avoid duplicate/incorrect LinkWithRef */}
            <Link 
              to="quote-portal" 
              className="block px-3 py-2 rounded-md text-base font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Quote Portal
            </Link>
            <Link 
              to="about-device" 
              className="block px-3 py-2 rounded-md text-base font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              About Device
            </Link>
            <Link 
              to="support-tickets" 
              className="block px-3 py-2 rounded-md text-base font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Raise Tickets
            </Link>
            <Link
              to="support-chat"
              className="block px-3 py-2 rounded-md text-base font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Support Chat
            </Link>
          </div>
          {/** Removed mobile profile/account section to avoid duplication in mobile view */}
        </div>
      )}
    </nav>
  );
};

export default DashboardNavbar;
