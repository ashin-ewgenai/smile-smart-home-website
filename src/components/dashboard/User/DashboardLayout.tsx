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
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <DashboardNavbar userType={userType} userName={userName} />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-6">
        {children}
      </main>
      <DashboardFooter />
      {userType === 'user' && <SupportChat />}
    </div>
  );
};

export { DashboardLayout };
export default DashboardLayout;
