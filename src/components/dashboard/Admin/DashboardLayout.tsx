import React from 'react';
import DashboardNavbar from './DashboardNavbar';
import DashboardFooter from './DashboardFooter';
import SupportChat from '../../supportChat/SupportChat';
import AdminSidebar from './AdminSidebar';

interface DashboardLayoutProps {
  children: React.ReactNode;
  userType: 'admin' | 'user';
  userName: string;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, userType, userName }) => {
  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 pt-16">
      <DashboardNavbar userType={userType} userName={userName} />
      {/* Content area with sidebar on the left and main content on the right */}
      <div className="flex-1 w-full md:flex">
        {/* Sidebar: fixed on md+ below the navbar */}
        <aside className="hidden md:flex md:fixed md:top-16 md:left-0 md:h-[calc(100vh-4rem)] md:w-60 md:z-30 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <AdminSidebar />
        </aside>
        {/* Main content area with offsets so it doesn't sit under fixed elements */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-4 md:py-6 min-w-0 md:ml-60">
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
