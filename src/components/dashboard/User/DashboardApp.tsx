import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from './DashboardLayout';
import UserDashboard from './UserDashboard';
import UserSettings from './UserSettings';
import UserProfile from './UserProfile';
import QuoteForm from './QuoteForm';
import AboutDevices from './AboutDevices';
import UserBill from './UserBill';
import TicketCenter from './TicketCenter';
import ChangePassword from './ChangePassword';
import SupportChatPanel from '../../supportChat/SupportChatPanel';

// Simple wrapper to show the Quote Portal within standard padding
const QuotePortalPage: React.FC = () => (
  <section className="p-6">
    <QuoteForm />
  </section>
);

const SupportTicketsPage: React.FC = () => (
  <section className="p-6">
    <TicketCenter />
  </section>
);

const DashboardApp: React.FC = () => {
  return (
    <BrowserRouter>
      <DashboardLayout userType="user" userName="User">
        <Routes>
          <Route path="/dashboard/user" element={<UserDashboard userName="User" />} />
          <Route path="/dashboard/user/settings" element={<UserSettings />} />
          <Route path="/dashboard/user/quote-portal" element={<QuotePortalPage />} />
          <Route path="/dashboard/user/support-tickets" element={<SupportTicketsPage />} />
          <Route path="/dashboard/user/support-chat" element={<SupportChatPanel raiseTicketsHref="/dashboard/user/support-tickets" />} />
          <Route path="/dashboard/user/about-device" element={<AboutDevices />} />
          <Route path="/dashboard/user/bill" element={<UserBill />} />
          <Route path="/dashboard/user/profile" element={<UserProfile />} />
          <Route path="*" element={<Navigate to="/dashboard/user" replace />} />
        </Routes>
      </DashboardLayout>
    </BrowserRouter>
  );
};

export default DashboardApp;
