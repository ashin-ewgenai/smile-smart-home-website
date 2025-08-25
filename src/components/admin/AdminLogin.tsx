import React, { useState } from 'react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { SUPER_ADMIN_BASE_PATH } from '../../lib/constants';
import { accountDoc, accountLoginMergePayload } from '../../models';

type Role = 'admin' | 'Super Admin';

interface AdminLoginProps {
  requiredRole?: Role; // default 'admin'; when 'Super Admin', enforce super admin access
}

export default function AdminLogin({ requiredRole }: AdminLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const emailTrimmed = email.trim();
      console.log(emailTrimmed);
      const passwordTrimmed = password.trim();

      const userCredential = await signInWithEmailAndPassword(auth, emailTrimmed, passwordTrimmed);
      const user = userCredential.user;

      // Verify role in Firestore: Accounts/{uid}
      const snap = await getDoc(accountDoc(db, user.uid));
      const data = snap.exists() ? (snap.data() as any) : undefined;
      const role = data?.Role as string | undefined;

      // If a specific role is required (e.g., Super Admin login page), enforce it
      if (requiredRole) {
        if (role !== requiredRole) {
          await signOut(auth);
          setError(
            requiredRole === 'Super Admin'
              ? 'Access denied. This portal is for Super Administrators only.'
              : 'Access denied. This portal is for administrators only.'
          );
          setIsLoading(false);
          return;
        }
      } else {
        // Single admin login page handling both roles
        if (role !== 'Super Admin' && role !== 'admin') {
          await signOut(auth);
          setError('This ID is invalid for the admin portal.');
          setIsLoading(false);
          return;
        }
      }

      // Persist simple session metadata
      try {
        if (user.email) localStorage.setItem('userEmail', user.email);
        if (role) localStorage.setItem('userRole', role);
      } catch {}

      // Update login metadata in Firestore using centralized payload (schema-only fields)
      try {
        await setDoc(accountDoc(db, user.uid), accountLoginMergePayload(), { merge: true });
      } catch {}

      // Redirect based on role
      const finalRole = role as Role | undefined;
      if (finalRole === 'Super Admin') {
        // Set a lightweight cookie so server middleware recognizes the session
        try {
          const maxAgeSeconds = 60 * 60 * 8; // 8 hours
          document.cookie = `super_admin_session=1; path=/; max-age=${maxAgeSeconds}; samesite=lax`;
        } catch {}
        window.location.href = `${SUPER_ADMIN_BASE_PATH}/dashboard`;
      } else if (finalRole === 'admin') {
        window.location.href = '/dashboard/admin';
      } else {
        // Fallback (should not hit due to checks above)
        await signOut(auth);
        setError('This ID is invalid for the admin portal.');
        setIsLoading(false);
        return;
      }
    } catch (err: any) {
      console.error('Admin login error:', err);
      const code = err?.code || '';
      let msg = 'Login failed. Please try again.';
      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found' ||
        code === 'auth/invalid-email'
      ) {
        msg = 'Invalid email or password.';
      } else if (code === 'auth/too-many-requests') {
        msg = 'Too many attempts. Please wait a moment and try again.';
      } else if (code === 'auth/network-request-failed') {
        msg = 'Network error. Check your internet connection and try again.';
      }
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-zinc-200/60 bg-white/95 backdrop-blur shadow-xl dark:bg-zinc-900/90 dark:border-zinc-700/60">
        <div className="p-6 border-b border-zinc-100/60 dark:border-zinc-800/60 text-center">
          <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-yellow-400/20 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-6 w-6 text-yellow-500"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 11c0 3-3 5-3 5h6s-3-2-3-5m0-7a4 4 0 00-4 4v1a4 4 0 004 4 4 4 0 004-4V8a4 4 0 00-4-4z"/></svg>
          </div>
          <h1 className="text-2xl font-bold">Admin Portal</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Enter your admin credentials to access the dashboard</p>
        </div>
        <div className="p-6">
          {error && (
            <div role="alert" className="mb-4 rounded-md border border-red-500/40 bg-red-50 px-4 py-3 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
              <p className="text-sm">{error}</p>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Email</label>
              <input
                id="email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full inline-flex items-center justify-center rounded-md bg-yellow-400 text-black font-medium py-2.5 shadow-sm hover:bg-yellow-400/90 hover:shadow disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <svg className="mr-2 h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg>
                  Verifying...
                </>
              ) : (
                'Login to Admin Portal'
              )}
            </button>
          </form>
        </div>
        <div className="px-6 pb-6">
          <button
            type="button"
            onClick={() => (window.location.href = '/')}
            disabled={isLoading}
            className="w-full text-sm py-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Return to Main Site
          </button>
        </div>
      </div>
    </div>
  );
}
