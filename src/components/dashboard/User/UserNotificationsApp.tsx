import React, { useEffect, useMemo, useState } from 'react';
import { BrowserRouter as Router, useLocation } from 'react-router-dom';
import DashboardLayout from './DashboardLayout';
import NotificationsPage from './NotificationsPage';

// Wrapper component that uses useLocation
function NotificationsAppContent() {
  const hydrated = useMemo(() => typeof window !== 'undefined', []);
  const [userName, setUserName] = useState('User');
  
  // This will be safe because it only runs on the client side
  const location = typeof window !== 'undefined' ? useLocation() : null;

  useEffect(() => {
    if (!hydrated) return;
    try {
      const saved = localStorage.getItem('userName') || localStorage.getItem('displayName') || localStorage.getItem('userEmail');
      if (saved && typeof saved === 'string') setUserName(saved);
    } catch {}
  }, [hydrated]);

  return (
    <DashboardLayout userType="user" userName={userName}>
      <NotificationsPage />
    </DashboardLayout>
  );
}

// Main component that wraps with Router
function UserNotificationsApp() {
  // Only render Router on client side to avoid hydration issues
  if (typeof window === 'undefined') {
    return (
      <DashboardLayout userType="user" userName="User">
        <NotificationsPage />
      </DashboardLayout>
    );
  }

  return (
    <Router>
      <NotificationsAppContent />
    </Router>
  );
}

export default UserNotificationsApp;
