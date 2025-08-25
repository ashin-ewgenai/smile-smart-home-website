import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from './DashboardLayout';
import AdminDashboard from './AdminDashboard';
import AdminSettings from './AdminSettings';
import AdminProfile from './AdminProfile';
import AdminUsers from './pages/AdminUsers';
import Devices from './pages/Devices';
import AddDevice from './pages/AddDevice';
import Estimates from './pages/Estimates';
import Notifications from './pages/Notifications';
import Reports from './pages/Reports';
import Customers from './pages/Customers';
import Bill from './pages/Bill';
import QuotePortal from './pages/QuotePortal';
import AboutDevice from './pages/AboutDevice';
import Alerts from './pages/Alerts';
import UserPlanLeads from '../User/PlanLeads.tsx';

const RequireAdmin: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    try {
      const userEmail = localStorage.getItem('userEmail');
      const userRole = localStorage.getItem('userRole');
      setAllowed(!!userEmail && userRole === 'admin');
    } catch { setAllowed(false); }
    setReady(true);
  }, []);
  if (!ready) return null;
  return allowed ? <>{children}</> : <Navigate to="/admin_login" replace />;
};

const Placeholder = ({ title, note }: { title: string; note?: string }) => (
  <section className="p-6">
    <h1 className="text-2xl font-semibold text-white mb-3">{title}</h1>
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 text-gray-300">
      {note || 'This section is being migrated to React. Content will appear here.'}
    </div>
  </section>
);

const AdminApp: React.FC = () => {
  return (
    <BrowserRouter>
      <RequireAdmin>
        <DashboardLayout userType="admin" userName="Admin">
          <Routes>
            <Route path="/dashboard/admin" element={<AdminDashboard />} />
            <Route path="/dashboard/admin/settings" element={<AdminSettings />} />
            <Route path="/dashboard/admin/profile" element={<AdminProfile />} />

            {/* Concrete React pages for admin routes */}
            <Route path="/dashboard/admin/estimates" element={<Estimates />} />
            <Route path="/dashboard/admin/devices" element={<Devices />} />
            <Route path="/dashboard/admin/devices/add" element={<AddDevice />} />
            <Route path="/dashboard/admin/users" element={<AdminUsers />} />
            <Route path="/dashboard/admin/customers" element={<Customers />} />
            <Route path="/dashboard/admin/reports" element={<Reports />} />
            <Route path="/dashboard/admin/notifications" element={<Notifications />} />
            <Route path="/dashboard/admin/alerts" element={<Alerts />} />
            <Route path="/dashboard/admin/plan-leads" element={<UserPlanLeads />} />
            <Route path="/dashboard/admin/bill" element={<Bill />} />
            <Route path="/dashboard/admin/quote-portal" element={<QuotePortal />} />
            <Route path="/dashboard/admin/about-device" element={<AboutDevice />} />

            <Route path="*" element={<Navigate to="/dashboard/admin" replace />} />
          </Routes>
        </DashboardLayout>
      </RequireAdmin>
    </BrowserRouter>
  );
};

export default AdminApp;
