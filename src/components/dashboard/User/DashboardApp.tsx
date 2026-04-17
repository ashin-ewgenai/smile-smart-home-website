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

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-soft-gray to-white dark:from-gray-950 dark:via-charcoal dark:to-gray-950">
        <div className="relative group">
          <div className="absolute -inset-4 bg-gradient-to-r from-teal-500 to-blue-500 rounded-full blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200 animate-pulse"></div>
          <div className="relative flex items-center justify-center h-16 w-16 rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xl">
            <svg className="animate-spin h-8 w-8 text-teal-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
        </div>
      </div>
    );
  }

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
