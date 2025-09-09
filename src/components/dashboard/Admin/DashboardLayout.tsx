import React from 'react';
import DashboardNavbar from './DashboardNavbar';
import DashboardFooter from './DashboardFooter';
import AdminSidebar from './AdminSidebar';

interface DashboardLayoutProps {
  children: React.ReactNode;
  userType: 'admin' | 'user';
  userName: string;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, userType, userName }) => {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      <DashboardNavbar userType={userType} userName={userName} />
      <div className="pt-16 flex flex-col flex-1 min-h-0">
        <div className="flex flex-1 relative min-h-0">
          {/* Sidebar - extended to footer */}
          <aside className="hidden md:block fixed top-16 left-0 h-[calc(100vh-4rem)] w-60 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-y-auto">
            <AdminSidebar />
          </aside>
          {/* Main content - extended to match sidebar */}
          <div className="flex-1 md:ml-60 min-h-[calc(100vh-4rem)] flex flex-col w-full">
            <main className="min-h-0 px-4 sm:px-6 lg:px-8 py-6">
              {children}
            </main>
            {/* Removed bottom border */}
          </div>
        </div>
        <div className="w-full">
          <DashboardFooter />
        </div>
      </div>
    </div>
  );
};

export { DashboardLayout };
export default DashboardLayout;
