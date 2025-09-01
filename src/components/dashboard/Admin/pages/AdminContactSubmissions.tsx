import React from 'react';
import DashboardLayout from '../DashboardLayout';
import AdminUserDetail from './AdminUserDetail';

const AdminContactSubmissions: React.FC = () => {
  // Read from localStorage only on client
  let userName = 'Admin';
  try {
    if (typeof window !== 'undefined') {
      userName = localStorage.getItem('userName') || 'Admin';
    }
  } catch {}

  return (
    <DashboardLayout userType="admin" userName={userName}>
      <AdminUserDetail />
    </DashboardLayout>
  );
};

export default AdminContactSubmissions;
