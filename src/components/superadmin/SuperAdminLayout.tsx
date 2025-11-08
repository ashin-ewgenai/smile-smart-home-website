import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { handleLogout as adminLogout } from '../dashboard/Admin/LogoutHandler';
import { UserCircle, Sun, Moon, Shield, Menu, X, Key } from 'lucide-react';
import { auth, db } from '../../lib/firebase';
import { SUPER_ADMIN_BASE_PATH } from '../../lib/constants';
import { getDoc, updateDoc } from 'firebase/firestore';
import { accountDoc } from '../../models/Collections';
import { reauthenticateWithCredential, EmailAuthProvider, updatePassword } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';

interface Props { children: React.ReactNode; }

export default function SuperAdminLayout({ children }: Props) {
  const location = useLocation();
  const [viewRole, setViewRole] = useState<string | null>(null);
  const [viewRoleLoading, setViewRoleLoading] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

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
        const ref = accountDoc(db, user.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const d: any = snap.data();
          setProfile({
            displayName: d?.FullName || undefined,
            email: d?.Email || undefined,
            role: d?.Role || undefined,
            lastLoginAt: d?.LastLoginAt || undefined,
          });
        }
      } catch {}
    });
    return () => unsub();
  }, []);

  // Close on outside click and Esc
  useEffect(() => {
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      
      // Handle profile dropdown
      if (profileOpen) {
        const withinDropdown = dropdownRef.current?.contains(target);
        const withinTrigger = triggerRef.current?.contains(target);
        if (!withinDropdown && !withinTrigger) {
          setProfileOpen(false);
        }
      }
      
      // Handle password modal
      if (showPasswordModal && modalRef.current && !modalRef.current.contains(target)) {
        setShowPasswordModal(false);
      }
    }
    
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (showPasswordModal) {
          setShowPasswordModal(false);
        } else if (profileOpen) {
          setProfileOpen(false);
        }
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [profileOpen, showPasswordModal]);
  
  // Handle password change
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    
    // Validate passwords
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters long');
      return;
    }
    
    const user = auth.currentUser;
    if (!user || !user.email) {
      setPasswordError('No user is signed in');
      return;
    }
    
    try {
      setIsUpdating(true);
      
      // Re-authenticate the user
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      
      // Update the password
      await updatePassword(user, newPassword);
      
      setPasswordSuccess('Password updated successfully!');
      
      // Reset form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      
      // Close modal after 2 seconds
      setTimeout(() => {
        setShowPasswordModal(false);
        setPasswordSuccess('');
      }, 2000);
      
    } catch (error: any) {
      console.error('Error updating password:', error);
      if (error.code === 'auth/wrong-password') {
        setPasswordError('Current password is incorrect');
      } else if (error.code === 'auth/weak-password') {
        setPasswordError('Password is too weak');
      } else {
        setPasswordError(error.message || 'Failed to update password');
      }
    } finally {
      setIsUpdating(false);
    }
  };

  // Load role for the user being viewed so we can show Admin/User Details in navbar
  useEffect(() => {
    const { pathname } = location;
    const base = SUPER_ADMIN_BASE_PATH;
    const prefix = `${base}/user/`;
    if (pathname.startsWith(prefix)) {
      const uid = pathname.slice(prefix.length);
      if (!uid) { setViewRole(null); setViewRoleLoading(false); return; }
      (async () => {
        try {
          setViewRoleLoading(true);
          const ref = accountDoc(db, uid);
          const snap = await getDoc(ref);
          const role = (snap.data() as any)?.Role || null;
          setViewRole(role);
        } catch {
          setViewRole(null);
        } finally {
          setViewRoleLoading(false);
        }
      })();
    } else {
      setViewRole(null);
      setViewRoleLoading(false);
    }
  }, [location]);

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
        const ref = accountDoc(db, auth.currentUser.uid);
        const snap = await getDoc(ref);
        const d: any = snap.data();
        setProfile(snap.exists() ? {
          displayName: d?.FullName || undefined,
          email: d?.Email || undefined,
          role: d?.Role || undefined,
          lastLoginAt: d?.LastLoginAt || undefined,
        } : null);
      } catch (e: any) {
        setProfileError(e?.message || 'Failed to load profile');
      } finally {
        setProfileLoading(false);
      }
    }
  }
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-x-hidden">
      <header className="fixed top-0 left-0 right-0 z-50 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between relative">
          {/* Centered dynamic title removed to avoid duplication with page headers */}
          <div className="flex items-center gap-3 h-14">
            <img
              src="/logo-primary.png"
              alt="Smile Smart Homes logo"
              className="h-9 md:h-10 w-auto object-contain select-none"
              draggable={false}
            />
            <Link to={`${SUPER_ADMIN_BASE_PATH}/dashboard`} className="font-semibold text-lg md:text-xl text-teal-700 dark:text-teal-300">Smile Smart Homes</Link>
          </div>
          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-2 sm:gap-4 text-sm relative">
            <a
              href="/dashboard/admin"
              data-astro-reload
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-teal-300 text-teal-700 hover:bg-teal-50 dark:border-teal-500 dark:text-teal-300 dark:hover:bg-teal-900/20 transition-colors"
              title="Switch to Admin Dashboard"
            >
              <Shield className="h-4 w-4" aria-hidden="true" />
              Switch to Admin
            </a>
            <button
              type="button"
              onClick={toggleTheme}
              className="p-1.5 rounded-full text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
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
                  let name = '';
                  try {
                    name =
                      profile?.displayName ||
                      profile?.email ||
                      auth.currentUser?.displayName ||
                      auth.currentUser?.email ||
                      localStorage.getItem('displayName') ||
                      localStorage.getItem('userName') ||
                      localStorage.getItem('userEmail') ||
                      '';
                  } catch {}
                  const initials = String(name)
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
                          <div className="break-all font-medium">{profile?.email || '—'}</div>
                        </div>
                      )}
                      <div className="pt-3 border-t border-gray-200 dark:border-gray-700 mt-2" />
                      <div className="pt-2 flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                          {auth?.currentUser?.uid ? (
                            <Link
                              to={`${SUPER_ADMIN_BASE_PATH}/user/${encodeURIComponent(auth.currentUser.uid)}`}
                              className="flex-1 px-3 py-1.5 text-center rounded-md bg-teal-600 text-white hover:bg-teal-700 text-sm"
                            >
                              Edit Profile
                            </Link>
                          ) : (
                            <span className="flex-1 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-500">Loading…</span>
                          )}
                          <button
                            onClick={adminLogout}
                            className="flex-1 px-3 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700 text-sm"
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
                        <button
                          onClick={() => {
                            setProfileOpen(false);
                            setShowPasswordModal(true);
                          }}
                          className="w-full mt-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm"
                        >
                          <Key className="h-4 w-4" />
                          Change Password
                        </button>
                      </div>
                    </div>
                  </div>
                )}
            </div>
          </nav>
          {/* Mobile hamburger */}
          <div className="md:hidden flex items-center">
            <button
              type="button"
              aria-label="Open menu"
              title="Open menu"
              onClick={() => setIsMobileMenuOpen(v => !v)}
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
        {/* Mobile menu panel */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <div className="max-w-full mx-auto px-4 py-3 space-y-2">
              <a
                href="/dashboard/admin"
                data-astro-reload
                className="flex items-center gap-3 px-2 py-2 rounded-md border border-teal-300 text-teal-700 hover:bg-teal-50 dark:border-teal-500 dark:text-teal-300 dark:hover:bg-teal-900/20"
                title="Switch to Admin Dashboard"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <Shield className="h-4 w-4" />
                <span className="text-base">Switch to Admin</span>
              </a>
              <button
                type="button"
                onClick={() => { toggleTheme(); setIsMobileMenuOpen(false); }}
                className="flex items-center gap-3 px-2 py-2 rounded-md text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                <span className="text-base">{theme === 'dark' ? 'Light theme' : 'Dark theme'}</span>
              </button>
              {auth?.currentUser?.uid ? (
                <Link
                  to={`${SUPER_ADMIN_BASE_PATH}/user/${encodeURIComponent(auth.currentUser.uid)}`}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-2 py-2 rounded-md text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                  title="My Profile"
                  aria-label="My Profile"
                >
                  <UserCircle className="h-5 w-5" />
                  <span className="text-base">My Profile</span>
                </Link>
              ) : (
                <span
                  className="flex items-center gap-3 px-2 py-2 rounded-md text-gray-400 dark:text-gray-500 cursor-not-allowed"
                  title="My Profile"
                  aria-label="My Profile"
                >
                  <UserCircle className="h-5 w-5" />
                  <span className="text-base">My Profile</span>
                </span>
              )}
            </div>
          </div>
        )}
      </header>
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-6 overflow-y-auto">
        {children}
      </main>

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div 
            ref={modalRef}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md overflow-hidden"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Change Password</h3>
                <button
                  onClick={() => setShowPasswordModal(false)}
                  className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <form onSubmit={handlePasswordChange} className="space-y-4">
                {passwordError && (
                  <div className="p-3 text-sm text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-300 rounded-md">
                    {passwordError}
                  </div>
                )}
                
                {passwordSuccess && (
                  <div className="p-3 text-sm text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-300 rounded-md">
                    {passwordSuccess}
                  </div>
                )}
                
                <div>
                  <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Current Password
                  </label>
                  <input
                    type="password"
                    id="currentPassword"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-teal-500 focus:border-teal-500 dark:bg-gray-700 dark:text-white"
                    required
                    disabled={isUpdating}
                  />
                </div>
                
                <div>
                  <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    New Password
                  </label>
                  <input
                    type="password"
                    id="newPassword"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-teal-500 focus:border-teal-500 dark:bg-gray-700 dark:text-white"
                    required
                    minLength={8}
                    disabled={isUpdating}
                  />
                </div>
                
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    id="confirmPassword"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-teal-500 focus:border-teal-500 dark:bg-gray-700 dark:text-white"
                    required
                    minLength={8}
                    disabled={isUpdating}
                  />
                </div>
                
                <div className="pt-2 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowPasswordModal(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500"
                    disabled={isUpdating}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-teal-600 border border-transparent rounded-md shadow-sm hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 flex items-center gap-2"
                    disabled={isUpdating}
                  >
                    {isUpdating ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Updating...
                      </>
                    ) : 'Update Password'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
