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
import { DevicesProvider } from '../../../contexts/DevicesContext';

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
    <BrowserRouter basename="/dashboard/user">
      <DevicesProvider>
        <DashboardLayout userType="user" userName="User">
          <Routes>
          <Route path="/" element={<UserDashboard userName="User" />} />
          <Route path="/settings" element={<UserSettings />} />
          <Route path="/quote-portal" element={<QuotePortalPage />} />
          <Route path="/support-tickets" element={<SupportTicketsPage />} />
          <Route path="/support-chat" element={<SupportChatPanel raiseTicketsHref="/support-tickets" />} />
          <Route path="/about-device" element={<AboutDevices />} />
          <Route path="/bill" element={<UserBill />} />
          <Route path="/profile" element={<UserProfile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </DashboardLayout>
      </DevicesProvider>
    </BrowserRouter>
  );
};

export default DashboardApp;
