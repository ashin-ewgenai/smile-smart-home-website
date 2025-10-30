import React, { useState, useEffect } from 'react';
import { Menu, X, User, LogOut, Bell, ArrowLeft, Crown } from 'lucide-react';
import { onSnapshot, query, where, limit, orderBy } from 'firebase/firestore';
import { auth, db } from '../../../lib/firebase';
import { adminNotificationsCollection, userNotificationsCollection, supportTicketsCollection } from '../../../models/Collections';
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
  const [hasUnread, setHasUnread] = useState(false);

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

  // Listen for unread notifications and toggle red dot
  useEffect(() => {
    if (userType === 'admin') {
      // Admin bell: combine unread Admin_Notifications (excluding support_ticket) and open Support_Tickets
      let unsubAuth: any;
      let unsubAdmin: any;
      let unsubTickets: any;
      try {
        unsubAuth = auth.onAuthStateChanged((user) => {
          // Cleanup previous listeners when auth changes
          try { if (unsubAdmin) unsubAdmin(); } catch {}
          try { if (unsubTickets) unsubTickets(); } catch {}
          if (!user?.uid) { setHasUnread(false); return; }

          let adminHasUnread = false;
          let ticketsHasUnread = false;
          const compute = () => setHasUnread(adminHasUnread || ticketsHasUnread);

          // Unread admin notifications only, exclude support_ticket client-side
          try {
            const qAdmin = query(
              adminNotificationsCollection(db),
              where('status', '==', 'unread'),
              limit(50)
            );
            unsubAdmin = onSnapshot(qAdmin, (snap) => {
              adminHasUnread = snap.docs.some((d) => {
                const data: any = d.data();
                const relatedType = String((data?.relatedEntityType ?? '') as string).toLowerCase();
                return relatedType !== 'support_ticket';
              });
              compute();
            }, () => { adminHasUnread = false; compute(); });
          } catch { adminHasUnread = false; compute(); }

          // Support tickets considered unread when status not in ack/closed/resolved/archived
          try {
            const qTickets = query(
              supportTicketsCollection(db),
              limit(50)
            );
            unsubTickets = onSnapshot(qTickets, (snap) => {
              ticketsHasUnread = snap.docs.some((d) => {
                const st = String(((d.data() as any)?.status || '') as string).toLowerCase();
                return st !== 'ack' && st !== 'closed' && st !== 'resolved' && st !== 'archived';
              });
              compute();
            }, () => { ticketsHasUnread = false; compute(); });
          } catch { ticketsHasUnread = false; compute(); }
        });
        return () => {
          try { if (unsubAdmin) unsubAdmin(); } catch {}
          try { if (unsubTickets) unsubTickets(); } catch {}
          try { if (unsubAuth) unsubAuth(); } catch {}
        };
      } catch { setHasUnread(false); }
    } else {
      // user navbar: show dot when the current user has unread notifications
      let unsubAuth: any;
      let unsubNotif: any;
      try {
        unsubAuth = auth.onAuthStateChanged((user) => {
          // Cleanup any previous listener
          try { if (unsubNotif) unsubNotif(); } catch {}
          if (!user?.uid) {
            setHasUnread(false);
            return;
          }
          try {
            const uq = query(
              userNotificationsCollection(db),
              where('uid', '==', user.uid),
              orderBy('createdAt', 'desc'),
              limit(25)
            );
            unsubNotif = onSnapshot(uq, (snap) => {
              const anyUnread = snap.docs.some(d => {
                const data: any = d.data();
                const status = String((data?.status ?? data?.Status ?? '') as string).toLowerCase();
                const readFlag = (data?.read ?? data?.isRead) as boolean | undefined;
                return status === 'unread' || readFlag === false;
              });
              setHasUnread(anyUnread);
            }, (err) => {
              try { console.warn('User notifications listener error:', err?.message || err); } catch {}
              setHasUnread(false);
            });
          } catch {
            setHasUnread(false);
          }
        });
        return () => {
          try { if (unsubNotif) unsubNotif(); } catch {}
          try { if (unsubAuth) unsubAuth(); } catch {}
        };
      } catch {
        setHasUnread(false);
      }
    }
  }, [userType]);


  return (
    <nav className="fixed top-0 left-0 right-0 z-40 glass-surface">
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
                <img
                  src="/logo-primary.png"
                  alt="Smile Smart Homes logo"
                  className="h-8 sm:h-10 w-auto mr-2"
                />
                <span className="text-base sm:text-xl font-bold text-teal-600 dark:text-teal-400 truncate whitespace-nowrap max-w-[50vw] sm:max-w-none">
                  Smile Smart Homes
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
                  className="relative p-2 rounded-full text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white focus:outline-none"
                >
                  <Bell className="h-5 w-5" />
                  {hasUnread && (
                    <span
                      aria-hidden
                      className="absolute top-1.5 right-1.5 inline-block h-2.5 w-2.5 rounded-full bg-red-500"
                    />
                  )}
                </Link>
              ) : (
                <Link
                  to="/dashboard/user/notifications"
                  aria-label="Notifications"
                  className="relative p-2 rounded-full text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white focus:outline-none"
                >
                  <Bell className="h-5 w-5" />
                  {hasUnread && (
                    <span
                      aria-hidden
                      className="absolute top-1.5 right-1.5 inline-block h-2.5 w-2.5 rounded-full bg-red-500"
                    />
                  )}
                </Link>
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

      {/* Mobile profile dropdown removed: account section is provided inside the mobile menu */}

      {isMobileMenuOpen && (
        <div className="md:hidden">
          <div className="px-2 pt-2 pb-3 space-y-2 sm:px-3">
            <Link 
              to={userType === 'admin' ? '/' : '/dashboard/user'} 
              onClick={() => setIsMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-md text-base font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Dashboard
            </Link>
            {userType === 'admin' ? (
              <>
                <Link 
                  to="/users" 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block px-3 py-2 rounded-md text-base font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Manage Users
                </Link>
                <Link 
                  to="/devices/add" 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block px-3 py-2 rounded-md text-base font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Add Device
                </Link>
                <Link 
                  to="/reports" 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block px-3 py-2 rounded-md text-base font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Reports
                </Link>
                <Link 
                  to="/plan-leads" 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block px-3 py-2 rounded-md text-base font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Plan Leads
                </Link>
                <Link 
                  to="/estimates" 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block px-3 py-2 rounded-md text-base font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Quotes
                </Link>
              </>
            ) : (
              <Link 
                to="/dashboard/user/settings" 
                onClick={() => setIsMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-md text-base font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Settings
              </Link>
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
                <Link
                  to="/notifications"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-2 py-2 rounded-md text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 relative"
                >
                  <div className="relative">
                    <Bell className="h-5 w-5" />
                    {hasUnread && (
                      <span
                        aria-hidden
                        className="absolute -top-0.5 -right-0.5 inline-block h-2.5 w-2.5 rounded-full bg-red-500"
                      />
                    )}
                  </div>
                  <span className="text-base">Notifications</span>
                </Link>
              ) : (
                <div className="flex items-center gap-3 px-2 py-2 rounded-md text-gray-500 dark:text-gray-400">
                  <Bell className="h-5 w-5 opacity-50" />
                  <span className="text-base">Notifications</span>
                </div>
              )}

              {/* Super Admin switch (mobile) */}
              {isSuperAdmin && (
                <a
                  href={`${SUPER_ADMIN_BASE_PATH}/dashboard`}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-2 py-2 rounded-md border border-yellow-300 text-yellow-700 bg-yellow-50 hover:bg-yellow-100 dark:border-yellow-600 dark:text-yellow-200 dark:bg-yellow-900/20"
                  title="Switch to Super Admin Dashboard"
                >
                  <Crown className="h-4 w-4" />
                  <span className="text-base">Super Admin</span>
                </a>
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
