import React, { useEffect, useState } from 'react';
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
import NotificationsPage from './NotificationsPage';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../../lib/firebase';

// Simple wrapper to show the Quote Portal within standard padding
const QuotePortalPage: React.FC = () => (
  <section className="px-4 py-4 sm:p-6">
    <QuoteForm />
  </section>
);

const SupportTicketsPage: React.FC = () => (
  <section className="px-4 py-4 sm:p-6">
    <TicketCenter />
  </section>
);

const NotificationsRoutePage: React.FC = () => (
  <section className="px-4 py-4 sm:p-6">
    <NotificationsPage />
  </section>
);

const DashboardApp: React.FC = () => {
  const [authReady, setAuthReady] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setIsAuthed(!!user);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const GuardedSupportChat: React.FC = () => {
    if (!authReady) return null;
    if (!isAuthed) return <Navigate to="/login" replace />;
    return <SupportChatPanel raiseTicketsHref="/support-tickets" />;
  };

  return (
    <BrowserRouter basename="/dashboard/user">
      <DevicesProvider>
        <DashboardLayout userType="user" userName="User">
          <Routes>
          <Route path="/" element={<UserDashboard userName="User" />} />
          <Route path="/settings" element={<UserSettings />} />
          <Route path="/notifications" element={<NotificationsRoutePage />} />
          <Route path="/quote-portal" element={<QuotePortalPage />} />
          <Route path="/support-tickets" element={<SupportTicketsPage />} />
          <Route path="/support-chat" element={<GuardedSupportChat />} />
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
