import React from 'react';
import { Settings, Users, LayoutDashboard, FilePlus, Cpu, UserCircle2, BarChart2 } from 'lucide-react';

const linkBase = 'block px-3 py-2 rounded-md text-sm font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800';

const AdminSidebar: React.FC = () => {
  return (
    <nav className="p-3 space-y-1">
      <a href="/dashboard/admin" className={linkBase}>
        <span className="inline-flex items-center gap-2">
          <LayoutDashboard className="h-4 w-4" />
          Dashboard
        </span>
      </a>
      <a href="/dashboard/admin/estimates" className={linkBase}>
        <span className="inline-flex items-center gap-2">
          <FilePlus className="h-4 w-4" />
          Create Quote
        </span>
      </a>
      <a href="/dashboard/admin/devices/add" className={linkBase}>
        <span className="inline-flex items-center gap-2">
          <Cpu className="h-4 w-4" />
          Add Device
        </span>
      </a>
      <a href="/dashboard/admin/users" className={linkBase}>
        <span className="inline-flex items-center gap-2">
          <Users className="h-4 w-4" />
          Manage Users
        </span>
      </a>
      <a href="/dashboard/admin/customers" className={linkBase}>
        <span className="inline-flex items-center gap-2">
          <UserCircle2 className="h-4 w-4" />
          Customers
        </span>
      </a>
      <a href="/dashboard/admin/reports" className={linkBase}>
        <span className="inline-flex items-center gap-2">
          <BarChart2 className="h-4 w-4" />
          Reports
        </span>
      </a>
      <a href="/dashboard/admin/settings" className={linkBase}>
        <span className="inline-flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Settings
        </span>
      </a>
    </nav>
  );
};

export default AdminSidebar;
