import React from 'react';
import { Settings, Users, LayoutDashboard, FilePlus, Cpu, UserCircle2, BarChart2, MessageCircle } from 'lucide-react';
import { Link, useInRouterContext, useLocation } from 'react-router-dom';

const linkBase = 'block px-3 py-2 rounded-full text-sm font-medium text-gray-800 dark:text-white hover:bg-gray-100/70 dark:hover:bg-gray-800/60';

const AdminSidebar: React.FC = () => {
  const inRouter = useInRouterContext();
  const location = inRouter ? useLocation() : { pathname: '' } as any;

  const Item = ({ href, children }: { href: string; children: React.ReactNode }) => {
    // Convert full paths to relative paths for React Router with basename
    const relativePath = href.replace('/dashboard/admin', '') || '/';
    const active = inRouter && (
      href === '/dashboard/admin' 
        ? location.pathname === '/' || location.pathname === ''
        : location.pathname === href.replace('/dashboard/admin', '') || 
          (href === '/dashboard/admin/contact-submissions' && location.pathname === '/contact-submissions')
    );
    const cls = `${linkBase} ${active ? 'bg-gray-200/80 dark:bg-gray-700/70' : ''}`;
    return inRouter ? (
      <Link to={relativePath} className={cls}>{children}</Link>
    ) : (
      <a href={href} className={cls}>{children}</a>
    );
  };

  return (
    <nav className="p-3 space-y-1">
      <Item href="/dashboard/admin">
        <span className="inline-flex items-center gap-2">
          <LayoutDashboard className="h-5 w-5" />
          Dashboard
        </span>
      </Item>
      <Item href="/dashboard/admin/estimates">
        <span className="inline-flex items-center gap-2">
          <FilePlus className="h-5 w-5" />
          Quotes
        </span>
      </Item>
      <Item href="/dashboard/admin/devices/add">
        <span className="inline-flex items-center gap-2">
          <Cpu className="h-5 w-5" />
          Add Device
        </span>
      </Item>
      <Item href="/dashboard/admin/users">
        <span className="inline-flex items-center gap-2">
          <Users className="h-4 w-4" />
          Manage Users
        </span>
      </Item>
      <Item href="/dashboard/admin/contact-submissions">
        <span className="inline-flex items-center gap-2">
          <UserCircle2 className="h-4 w-4" />
          Contact Submissions
        </span>
      </Item>
      <Item href="/dashboard/admin/plan-leads">
        <span className="inline-flex items-center gap-2">
          <FilePlus className="h-5 w-5" />
          Plan Leads
        </span>
      </Item>
      <Item href="/dashboard/admin/reports">
        <span className="inline-flex items-center gap-2">
          <BarChart2 className="h-4 w-4" />
          Reports
        </span>
      </Item>
      <Item href="/dashboard/admin/support">
        <span className="inline-flex items-center gap-2">
          <MessageCircle className="h-4 w-4" />
          Support Center
        </span>
      </Item>
    </nav>
  );
};

export default AdminSidebar;
