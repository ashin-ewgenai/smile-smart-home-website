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
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <DashboardNavbar userType={userType} userName={userName} />
      {/* Content area with sidebar on the left and main content on the right */}
      <div className="flex-1 w-full md:flex">
        {/* Sidebar: left-aligned, only right border, full height of content area */}
        <aside className="hidden md:flex md:w-60 border-r border-gray-200 dark:border-gray-700 self-stretch">
          <AdminSidebar />
        </aside>
        {/* Main content area with standard page paddings */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-4 md:py-6 min-w-0">
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
