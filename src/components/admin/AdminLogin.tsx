import React, { useEffect, useState } from 'react';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { SUPER_ADMIN_BASE_PATH } from '../../lib/constants';
import { accountDoc, accountLoginMergePayload } from '../../models';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

type Role = 'admin' | 'Super Admin';

interface AdminLoginProps {
  requiredRole?: Role; // default 'admin'; when 'Super Admin', enforce super admin access
}

export default function AdminLogin({ requiredRole }: AdminLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const { loginWithGoogle } = useAuth();

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

  const handleGoogleLogin = async () => {
    if (!loginWithGoogle) return;
    setIsLoading(true);
    setError(null);
    try {
      await loginWithGoogle();
      // Redirect is handled by the onAuthStateChanged useEffect already in this component
    } catch (err: any) {
      console.error('Google login error:', err);
      setError(err?.message || 'Google sign-in failed. Please try again.');
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
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              className="block w-full pr-12 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-150 ease-in-out"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              disabled={isLoading}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-3 my-auto h-8 w-8 inline-flex items-center justify-center text-gray-300 hover:text-white focus:outline-none"
            >
              {showPassword ? <EyeOff className="h-5 w-5 text-gray-400" /> : <Eye className="h-5 w-5 text-gray-400" />}
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

      <div className="mt-6">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-600"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-gray-800 text-gray-400">Or continue with</span>
          </div>
        </div>

        <div className="mt-6">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full flex items-center justify-center py-3 px-4 bg-white hover:bg-gray-100 text-gray-900 font-medium rounded-lg transition duration-200 ease-in-out transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Sign in with Google
          </button>
        </div>
      </div>
    </div>
  );
}
