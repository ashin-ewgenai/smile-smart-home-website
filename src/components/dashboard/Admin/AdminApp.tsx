import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import DashboardLayout from './DashboardLayout';
import AdminDashboard from './AdminDashboard';
import AdminSettings from './AdminSettings';
import AdminProfile from './AdminProfile';
import AdminUsers from './pages/AdminUsers';
import AdminUserDetail from './pages/AdminUserDetail';
import Devices from './pages/Devices';
import AddDevice from './pages/AddDevice';
import Estimates from './pages/Estimates';
import Notifications from './pages/Notifications';
import Reports from './pages/Reports';
import Bill from './pages/Bill';
import AboutDevice from './pages/AboutDevice';
import Alerts from './pages/Alerts';
import UserPlanLeads from '../User/PlanLeads.tsx';
import AdminSupportApp from './AdminSupportApp';

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

// Wrapper to read query param and render AdminUserDetail inside dashboard layout
const AdminUserDetailPage: React.FC = () => {
  const { search } = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(search);
  const email = params.get('userEmail') || '';
  const handleBack = () => navigate('/dashboard/admin/users');
  return <AdminUserDetail email={email} onBack={handleBack} />;
};

const AdminApp: React.FC = () => {
  return (
    <BrowserRouter basename="/dashboard/admin">
      <RequireAdmin>
        <DashboardLayout userType="admin" userName="Admin">
          <Routes>
            <Route path="/" element={<AdminDashboard />} />
            <Route path="/settings" element={<AdminSettings />} />
            <Route path="/profile" element={<AdminProfile />} />

            {/* Concrete React pages for admin routes */}
            <Route path="/estimates" element={<Estimates />} />
            <Route path="/devices" element={<Devices />} />
            <Route path="/devices/add" element={<AddDevice />} />
            <Route path="/users" element={<AdminUsers />} />
            <Route path="/contact-submissions" element={<AdminUserDetailPage />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/plan-leads" element={<UserPlanLeads />} />
            <Route path="/bill" element={<Bill />} />
            <Route path="/about-device" element={<AboutDevice />} />
            <Route path="/support" element={<AdminSupportApp />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </DashboardLayout>
      </RequireAdmin>
    </BrowserRouter>
  );
};

export default AdminApp;
