import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import DashboardLayout from './DashboardLayout';

// Extend Window interface for auth coordination with authGate
declare global {
  interface Window {
    __reactAuthHandled?: boolean;
  }
}
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

// Debug component to log routing information
const RouteDebugger: React.FC = () => {
  const location = useLocation();
  useEffect(() => {
    console.log('[DashboardApp] Current route:', location.pathname);
    console.log('[DashboardApp] Full URL:', window.location.href);
    console.log('[DashboardApp] Is support-chat?', location.pathname === '/support-chat' || location.pathname.startsWith('/support-chat/'));
  }, [location]);
  return null;
};

// Wildcard redirect with logging to debug unmatched routes
const WildcardRedirect: React.FC = () => {
  const location = useLocation();
  useEffect(() => {
    console.warn('[DashboardApp] Wildcard route hit! Unmatched path:', location.pathname);
    console.warn('[DashboardApp] Expected /support-chat but got:', location.pathname);
  }, [location]);
  return <Navigate to="/" replace />;
};

// Error boundary for SupportChatPanel
class SupportChatErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    console.error('[SupportChatErrorBoundary] Caught error:', error);
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[SupportChatErrorBoundary] Error details:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <h2 className="text-lg font-semibold text-red-700 dark:text-red-300 mb-2">Something went wrong</h2>
          <p className="text-sm text-red-600 dark:text-red-400 mb-4">
            The chat panel failed to load. Please try refreshing the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

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
    console.log('[DashboardApp] Initializing auth state...');
    
    let isMounted = true;
    
    // Check for existing user first (sync check)
    const checkAuth = async () => {
      // First try sync check
      const currentUser = auth.currentUser;
      if (currentUser) {
        console.log('[DashboardApp] User already authenticated (sync check):', currentUser.uid);
        if (isMounted) {
          setIsAuthed(true);
          setAuthReady(true);
          // Signal to auth gate that React handled auth
          window.__reactAuthHandled = true;
        }
        return;
      }
      
      // Wait a bit for Firebase to initialize from persistence
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check again after delay
      const userAfterDelay = auth.currentUser;
      if (userAfterDelay) {
        console.log('[DashboardApp] User authenticated after delay:', userAfterDelay.uid);
        if (isMounted) {
          setIsAuthed(true);
          setAuthReady(true);
          // Signal to auth gate that React handled auth
          window.__reactAuthHandled = true;
        }
        return;
      }
      
      // Subscribe to auth changes for any late updates
      const unsub = onAuthStateChanged(auth, (user) => {
        if (!isMounted) return;
        console.log('[DashboardApp] Auth state changed:', user ? 'authenticated' : 'not authenticated');
        setIsAuthed(!!user);
        setAuthReady(true);
        // Signal to auth gate that React handled auth
        window.__reactAuthHandled = true;
      });
      
      // Safety timeout
      setTimeout(() => {
        if (isMounted && !authReady) {
          console.log('[DashboardApp] Auth timeout - final check');
          setIsAuthed(!!auth.currentUser);
          setAuthReady(true);
          // Signal to auth gate that React handled auth
          window.__reactAuthHandled = true;
        }
      }, 3000);
      
      return unsub;
    };
    
    let unsubPromise: Promise<(() => void) | undefined> | null = null;
    
    checkAuth().then(unsub => {
      if (unsub) {
        unsubPromise = Promise.resolve(unsub);
      }
    });
    
    return () => {
      isMounted = false;
      if (unsubPromise) {
        unsubPromise.then(unsub => unsub?.());
      }
    };
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
    console.log('[GuardedSupportChat] Rendering. authReady:', authReady, 'isAuthed:', isAuthed);
    if (!authReady) {
      console.log('[GuardedSupportChat] Waiting for auth...');
      return (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin h-8 w-8 text-teal-500">
            <svg className="h-8 w-8" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
        </div>
      );
    }
    if (!isAuthed) {
      console.log('[GuardedSupportChat] Not authenticated, redirecting to home with auth modal');
      // Store return URL and redirect to home to trigger auth gate
      const currentPath = window.location.pathname + window.location.search;
      sessionStorage.setItem('authReturnTo', currentPath);
      sessionStorage.setItem('authOpenModal', 'login');
      window.location.href = '/';
      return (
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-600 dark:text-gray-400">Redirecting to login...</p>
        </div>
      );
    }
    console.log('[GuardedSupportChat] Rendering SupportChatPanel');
    return (
      <SupportChatErrorBoundary>
        <SupportChatPanel raiseTicketsHref="/support-tickets" isAuthenticated={true} />
      </SupportChatErrorBoundary>
    );
  };

  return (
    <BrowserRouter basename="/dashboard/user">
      <RouteDebugger />
      <DevicesProvider>
        <DashboardLayout userType="user" userName="User">
          <Routes>
            <Route path="/" element={<UserDashboard userName="User" />} />
            <Route path="/settings" element={<UserSettings />} />
            <Route path="/notifications" element={<NotificationsRoutePage />} />
            <Route path="/quote-portal" element={<QuotePortalPage />} />
            <Route path="/support-tickets" element={<SupportTicketsPage />} />
            <Route path="/support-chat/*" element={<GuardedSupportChat />} />
            <Route path="/about-device" element={<AboutDevices />} />
            <Route path="/bill" element={<UserBill />} />
            <Route path="/profile" element={<UserProfile />} />
            <Route path="*" element={<WildcardRedirect />} />
          </Routes>
        </DashboardLayout>
      </DevicesProvider>
    </BrowserRouter>
  );
};

export default DashboardApp;
