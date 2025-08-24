import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams, useSearchParams } from 'react-router-dom';
import SuperAdminLayout from './SuperAdminLayout';
import SuperAdminDashboard from './SuperAdminDashboard';
import User_Admin_List from './User_Admin_List';
import User_Admin_Edit from './User_Admin_Edit';
import { SUPER_ADMIN_BASE_PATH } from '../../lib/constants';

const Placeholder = ({ title }: { title: string }) => (
  <section className="p-6">
    <h1 className="text-2xl font-semibold text-white mb-3">{title}</h1>
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 text-gray-300">
      This section is being migrated to React.
    </div>
  </section>
);

const UserEditByParam: React.FC = () => {
  const { id } = useParams();
  if (!id) return <div className="p-6 text-red-500">Missing user id.</div>;
  return <User_Admin_Edit uid={id} />;
};

const UserEditByQuery: React.FC = () => {
  const [params] = useSearchParams();
  const uid = params.get('uid');
  if (!uid) return <div className="p-6 text-red-500">Missing user id. Open with ?uid=USER_ID</div>;
  return <User_Admin_Edit uid={uid} />;
};

const SuperAdminApp: React.FC = () => {
  const base = SUPER_ADMIN_BASE_PATH;
  return (
    <BrowserRouter>
      <SuperAdminLayout>
        <Routes>
          <Route path={`${base}/dashboard`} element={<SuperAdminDashboard />} />
          <Route path={`${base}/users`} element={<User_Admin_List />} />
          <Route path={`${base}/user/:id`} element={<UserEditByParam />} />
          {/* Backward compatibility for old Astro path with ?uid= */}
          <Route path={`${base}/userlist/user`} element={<UserEditByQuery />} />
          <Route path={"*"} element={<Navigate to={`${base}/dashboard`} replace />} />
        </Routes>
      </SuperAdminLayout>
    </BrowserRouter>
  );
};

export default SuperAdminApp;
