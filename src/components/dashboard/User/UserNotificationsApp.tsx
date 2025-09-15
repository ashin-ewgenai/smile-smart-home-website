import React, { useEffect, useMemo, useState } from 'react';
import DashboardLayout from './DashboardLayout';
import NotificationsPage from './NotificationsPage';

export default function UserNotificationsApp() {
  const hydrated = useMemo(() => typeof window !== 'undefined', []);
  const [userName, setUserName] = useState('User');

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
