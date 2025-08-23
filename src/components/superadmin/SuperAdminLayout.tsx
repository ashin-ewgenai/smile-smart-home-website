import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { handleLogout as adminLogout } from '../dashboard/Admin/LogoutHandler';
import { ArrowLeft, UserCircle, Sun, Moon } from 'lucide-react';
import { auth, db } from '../../lib/firebase';
import { SUPER_ADMIN_BASE_PATH } from '../../lib/constants';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

interface Props { children: React.ReactNode; }

export default function SuperAdminLayout({ children }: Props) {
  const navigate = useNavigate();
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {}
    return 'light';
  });

  useEffect(() => {
    try {
      const root = document.documentElement;
      if (theme === 'dark') root.classList.add('dark');
      else root.classList.remove('dark');
      localStorage.setItem('theme', theme);
    } catch {}
  }, [theme]);

  function toggleTheme() {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  // Profile dropdown state
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ displayName?: string; email?: string; role?: string; lastLoginAt?: any } | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Ensure initials are available immediately when logged in
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setProfile(null);
        return;
      }
      // Seed profile with auth info for immediate initials
      setProfile((prev) => prev ?? { displayName: user.displayName || undefined, email: user.email || undefined });
      try {
        const ref = doc(db, 'users', user.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setProfile(snap.data() as any);
        }
      } catch {}
    });
    return () => unsub();
  }, []);

  // Close on outside click and Esc
  useEffect(() => {
    if (!profileOpen) return;
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      const withinDropdown = dropdownRef.current?.contains(target);
      const withinTrigger = triggerRef.current?.contains(target);
      if (!withinDropdown && !withinTrigger) {
        setProfileOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setProfileOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [profileOpen]);

  async function openProfileDropdown() {
    if (!auth?.currentUser?.uid) return;
    setProfileOpen((o) => {
      const next = !o;
      return next;
    });
    // If opening, load profile
    if (!profileOpen && !profile) {
      try {
        setProfileLoading(true);
        setProfileError(null);
        const ref = doc(db, 'users', auth.currentUser.uid);
        const snap = await getDoc(ref);
        setProfile((snap.data() as any) || null);
      } catch (e: any) {
        setProfileError(e?.message || 'Failed to load profile');
      } finally {
        setProfileLoading(false);
      }
    }
  }
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                try {
                  // Prefer SPA navigation
                  if (window.history.length > 1) navigate(-1);
                  else navigate(`${SUPER_ADMIN_BASE_PATH}/dashboard`);
                } catch {
                  navigate(`${SUPER_ADMIN_BASE_PATH}/dashboard`);
                }
              }}
              aria-label="Go back"
              title="Go back"
              className="p-2 rounded-full text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <Link to={`${SUPER_ADMIN_BASE_PATH}/dashboard`} className="font-semibold">Smile Smart Homes</Link>
          </div>
          <nav className="flex items-center gap-2 sm:gap-4 text-sm relative">
            <button
              type="button"
              onClick={toggleTheme}
              className="p-1.5 rounded-full text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            {auth?.currentUser?.uid && (
              <div className="relative">
                <button
                  type="button"
                  onClick={openProfileDropdown}
                  ref={triggerRef}
                  className="p-0.5 rounded-full text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                  title="My Profile"
                  aria-label="My Profile"
                >
                  {(() => {
                    const name =
                      profile?.displayName ||
                      profile?.email ||
                      auth.currentUser?.displayName ||
                      auth.currentUser?.email ||
                      '';
                    const initials = name
                      .split(/\s+/)
                      .filter(Boolean)
                      .map((s) => s.charAt(0).toUpperCase())
                      .slice(0, 2)
                      .join('');
                  
                    return initials ? (
                      <div className="h-8 w-8 flex items-center justify-center rounded-full bg-teal-600 text-white text-sm font-semibold">
                        {initials}
                      </div>
                    ) : (
                      <UserCircle className="h-6 w-6" />
                    );
                  })()}
                </button>
                {profileOpen && (
                  <div ref={dropdownRef} className="absolute right-0 mt-2 w-80 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg z-50">
                    <div className="p-4 space-y-2">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">My Profile</div>
                      {profileLoading ? (
                        <div className="text-sm text-gray-600 dark:text-gray-300">Loading…</div>
                      ) : profileError ? (
                        <div className="text-sm text-red-600">{profileError}</div>
                      ) : (
                        <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                          <div><span className="text-gray-500">Name:</span> <span className="font-medium">{profile?.displayName || '—'}</span></div>
                          <div className="break-all"><span className="text-gray-500">Email:</span> <span className="font-medium">{profile?.email || '—'}</span></div>
                          <div><span className="text-gray-500">Role:</span> <span className="font-medium">{profile?.role || '—'}</span></div>
                          <div>
                            <span className="text-gray-500">Last login:</span> <span className="font-medium">
                              {(() => {
                                try {
                                  const ts: any = profile?.lastLoginAt;
                                  if (ts?.toDate) return ts.toDate().toLocaleString();
                                } catch {}
                                return '—';
                              })()}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 break-all">UID: {auth.currentUser?.uid}</div>
                        </div>
                      )}
                      <div className="pt-3 border-t border-gray-200 dark:border-gray-700 mt-2" />
                      <div className="pt-2 flex items-center justify-between gap-2">
                        <Link
                          to={`${SUPER_ADMIN_BASE_PATH}/user/${encodeURIComponent(auth.currentUser!.uid)}`}
                          className="px-3 py-1.5 rounded-md bg-teal-600 text-white hover:bg-teal-700 text-sm"
                        >
                          Edit profile
                        </Link>
                        <button
                          onClick={adminLogout}
                          className="px-3 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700 text-sm"
                        >
                          Logout
                        </button>
                        <button
                          onClick={() => setProfileOpen(false)}
                          className="px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
}
