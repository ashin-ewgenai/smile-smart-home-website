import React, { useEffect, useState } from 'react';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { getDoc, setDoc } from 'firebase/firestore';
import { Eye, EyeOff } from 'lucide-react';
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
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already authenticated, redirect based on role and replace history to prevent Back returning here
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      try {
        const snap = await getDoc(accountDoc(db, user.uid));
        const data = snap.exists() ? (snap.data() as any) : undefined;
        const role = data?.Role as Role | undefined;

        // Enforce requiredRole if provided
        if (requiredRole && role !== requiredRole) {
          return; // stay on page; user can sign out or switch account
        }

        // Accept admin or Super Admin
        if (role === 'Super Admin') {
          try {
            const maxAgeSeconds = 60 * 60 * 8;
            document.cookie = `super_admin_session=1; path=/; max-age=${maxAgeSeconds}; samesite=lax`;
          } catch {}
          window.location.replace(`${SUPER_ADMIN_BASE_PATH}/dashboard`);
        } else if (role === 'admin') {
          window.location.replace('/dashboard/admin');
        }
      } catch {}
    });
    return () => unsub();
  }, [requiredRole]);

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
    <div className="p-8">
      <div className="text-center mb-8">
        <div className="mx-auto mb-4 h-20 w-20 rounded-full bg-gray-700 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white">Admin Portal</h2>
        <p className="mt-2 text-sm text-gray-300">Sign in to access your dashboard</p>
      </div>
      
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-900/50 text-red-200 text-sm border border-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
            Email address
          </label>
          <div className="relative">
            <input
              id="email"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
              className="block w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-150 ease-in-out"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="password" className="block text-sm font-medium text-gray-300">
              Password
            </label>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              className="block w-full px-4 py-3 pr-12 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-150 ease-in-out"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              disabled={isLoading}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-300 focus:outline-none focus:text-gray-300 transition duration-150 ease-in-out disabled:opacity-50"
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition duration-200 ease-in-out transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Signing in...
              </>
            ) : 'Sign in'}
          </button>
        </div>
      </form>
    </div>
  );
}
