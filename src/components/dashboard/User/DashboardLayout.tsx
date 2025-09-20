import React, { useEffect, useState } from 'react';
import { Link, useLocation, useInRouterContext } from 'react-router-dom';
import DashboardNavbar from './DashboardNavbar';
import DashboardFooter from './DashboardFooter';

interface DashboardLayoutProps {
  children: React.ReactNode;
  userType: 'admin' | 'user';
  userName: string;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, userType, userName }) => {
  // Sidebar collapsed state with persistence
  const [collapsed, setCollapsed] = useState(false);
  // Mount flag to avoid hydration mismatches for className/active states
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('sidebar_collapsed');
      if (saved === '1') setCollapsed(true);
      if (saved === '0') setCollapsed(false);
    } catch {}
    setMounted(true);
  }, []);
  // Support both SPA (with Router) and non-SPA usage
  const inRouter = typeof window !== 'undefined' && useInRouterContext();
  const location = inRouter ? useLocation() : { pathname: '' };

  const base = `/dashboard/${userType}`;
  const items = [
    {
      href: userType === 'admin' ? '/dashboard/admin' : '/dashboard/user',
      key: 'dashboard',
      label: 'Dashboard',
      title: 'Dashboard',
      match: userType === 'admin' ? '/dashboard/admin' : '/dashboard/user',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 21V10.5" />
          <path d="M19 21V10.5" />
          <path d="M9 21v-6h6v6" />
        </svg>
      )
    },
    {
      href: `${base}/quote-portal`, key: 'quote', label: 'Quote Portal', title: 'Quote Portal', match: `${base}/quote-portal`, icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <path d="M8 6h12" />
          <path d="M8 12h12" />
          <path d="M8 18h12" />
          <path d="M3 6h.01" />
          <path d="M3 12h.01" />
          <path d="M3 18h.01" />
        </svg>
      )
    },
    {
      href: `${base}/support-tickets`, key: 'tickets', label: 'Raise Tickets', title: 'Raise Tickets', match: `${base}/support-tickets`, icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <path d="M3 9h18" />
          <path d="M3 15h18" />
          <path d="M7 9v6" />
          <path d="M17 9v6" />
        </svg>
      )
    },
    {
      href: `${base}/about-device`, key: 'about', label: 'About Device', title: 'About Device', match: `${base}/about-device`, icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <rect x="9" y="9" width="6" height="6" rx="1" />
          <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" />
        </svg>
      )
    },
    
    {
      href: `${base}/support-chat`, key: 'support', label: 'Support Chat', title: 'Support Chat', match: `${base}/support-chat`, icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <path d="M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
        </svg>
      )
    },
  ];

  const LinkItem = ({ href, label, active, title, icon }: { href: string; label: string; active: boolean; title: string; icon: React.ReactNode }) => {
    // Stronger light-mode contrast for inactive items; preserve dark mode styling
    const common = `group relative flex items-center ${collapsed ? 'justify-center' : 'justify-start'} gap-3 rounded-full px-3 py-2 text-sm font-medium transition-all duration-200 ` +
      `${active
        ? 'text-teal-900 dark:text-white bg-teal-50 dark:bg-gray-800/70 ring-1 ring-teal-400/20 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]'
        : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800/50'} ` +
      `${collapsed ? 'w-12 mx-auto' : 'w-full pl-2'} `;
    const children = (
      <>
        {active && (
          <span aria-hidden className="absolute left-0 top-0 bottom-0 w-0.5 bg-teal-400/90 shadow-[0_0_10px_2px_rgba(20,184,166,0.55)] rounded-r" />
        )}
        <span className="shrink-0 text-gray-500 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white">{icon}</span>
        {!collapsed && <span className="truncate">{label}</span>}
      </>
    );
    // When inside a Router with a basename (e.g., "/dashboard/user"),
    // Link's `to` should be relative to that basename. Our `href` values are absolute
    // (e.g., "/dashboard/user/support-tickets"), so we strip the `base` prefix for SPA links.
    const to = inRouter
      ? (href.startsWith(base) ? (href.slice(base.length) || '/') : href)
      : href;

    return inRouter ? (
      <Link to={to} title={title} className={common}>{children}</Link>
    ) : (
      <a href={href} title={title} className={common}>{children}</a>
    );
  };

  // Full-bleed content for specific routes (e.g., Admin Support Center)
  const isFullBleed = (() => {
    try {
      if (!mounted) return false;
      const path = inRouter ? location?.pathname : window.location.pathname;
      if (!path) return false;
      return path.startsWith('/dashboard/admin/support');
    } catch {
      return false;
    }
  })();

  return (
    <div className="flex flex-col min-h-screen pt-16 bg-gradient-to-br from-white via-soft-gray to-white dark:from-gray-950 dark:via-charcoal dark:to-gray-950">
      <DashboardNavbar userType={userType} userName={userName} />
      {/* Content area with optional sidebar */}
      <div className="flex-1 flex max-w-full">
        {/* Sidebar (desktop only) */}
        <aside className={`hidden md:block ${collapsed ? 'w-20' : 'w-64'} flex-shrink-0 glass-surface border-r border-white/30 dark:border-white/10` }>
          <nav className="sticky top-16 p-4 space-y-2">
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={() => {
                  try {
                    if (window.history.length > 1) window.history.back();
                    else window.location.href = userType === 'admin' ? '/dashboard/admin' : '/dashboard/user';
                  } catch {
                    window.location.href = userType === 'admin' ? '/dashboard/admin' : '/dashboard/user';
                  }
                }}
                aria-label="Go back"
                title="Go back"
                className="w-8 h-8 flex items-center justify-center rounded-full text-gray-300 hover:text-white hover:bg-slate-800/60 border border-gray-700 transition"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                  <path d="m12 19-7-7 7-7"></path>
                  <path d="M19 12H5"></path>
                </svg>
              </button>
              {!collapsed && (
                <button
                  type="button"
                  aria-label="Collapse sidebar"
                  title="Collapse"
                  onClick={() => { setCollapsed(true); try { localStorage.setItem('sidebar_collapsed','1'); } catch {} }}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-gray-300 hover:text-white hover:bg-slate-800/60 border border-gray-700 transition"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                    <path d="m15 18-6-6 6-6"></path>
                  </svg>
                </button>
              )}
            </div>

            {items.map((it) => (
              <LinkItem
                key={it.key}
                href={it.href}
                label={it.label}
                title={it.title}
                // Only mark active after mount to avoid SSR/client mismatch
                active={(() => {
                  if (!mounted) return false;
                  const path = inRouter ? location?.pathname : window.location.pathname;
                  if (!path) return false;
                  return it.key === 'dashboard' ? path === it.match : path.startsWith(it.match);
                })()}
                icon={it.icon}
              />
            ))}

            {collapsed && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  aria-label="Expand sidebar"
                  title="Expand"
                  onClick={() => { setCollapsed(false); try { localStorage.setItem('sidebar_collapsed','0'); } catch {} }}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-gray-300 hover:text-white hover:bg-slate-800/60 border border-gray-700 transition"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </div>
            )}

          </nav>
        </aside>
        {/* Main content */}
        <main className={`flex-1 ${isFullBleed ? 'min-h-0 p-0' : 'px-4 sm:px-6 lg:px-8 py-4 md:py-6'}`}>
          {children}
        </main>
      </div>
      <DashboardFooter />
      
    </div>
  );
};

export { DashboardLayout };
export default DashboardLayout;
