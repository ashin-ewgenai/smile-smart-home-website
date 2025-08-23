import React from 'react';
import DashboardNavbar from './DashboardNavbar';
import DashboardFooter from './DashboardFooter';
import SupportChat from '../../supportChat/SupportChat';

interface DashboardLayoutProps {
  children: React.ReactNode;
  userType: 'admin' | 'user';
  userName: string;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, userType, userName }) => {
  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 pt-16">
      <DashboardNavbar userType={userType} userName={userName} />
      {/* Content area with optional sidebar */}
      <div className="flex-1 flex max-w-full">
        {/* Sidebar (desktop only) */}
        <aside className="hidden md:block w-64 flex-shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <nav className="sticky top-16 p-4 space-y-1">
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
              className="w-full flex items-center gap-2 px-3 py-2 mb-2 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              {/* Inline arrow-left icon */}
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <path d="m12 19-7-7 7-7"></path>
                <path d="M19 12H5"></path>
              </svg>
            </button>
            <a
              href={userType === 'admin' ? '/dashboard/admin' : '/dashboard/user'}
              className="block px-3 py-2 rounded-md text-sm font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Dashboard
            </a>
            {userType === 'admin' && (
              <a
                href="/dashboard/admin/users"
                className="block px-3 py-2 rounded-md text-sm font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Manage Users
              </a>
            )}
            <a
              href={`/dashboard/${userType}/settings`}
              className="block px-3 py-2 rounded-md text-sm font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Settings
            </a>
            <a
              href={`/dashboard/${userType}/quote-portal`}
              className="block px-3 py-2 rounded-md text-sm font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Quote Portal
            </a>
            <a
              href={`/dashboard/${userType}/about-device`}
              className="block px-3 py-2 rounded-md text-sm font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              About Device
            </a>
            <a
              href={`/dashboard/${userType}/bill`}
              className="block px-3 py-2 rounded-md text-sm font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Bill
            </a>
          </nav>
        </aside>
        {/* Main content */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-4 md:py-6">
          {children}
        </main>
      </div>
      <DashboardFooter />
      {userType === 'user' && <SupportChat />}
    </div>
  );
};

export { DashboardLayout };
export default DashboardLayout;
