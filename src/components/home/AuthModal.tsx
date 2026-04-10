import React, { useEffect, useState } from 'react';
import { auth, db } from '../../lib/firebase';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getDoc, setDoc } from 'firebase/firestore';
import { accountDoc, accountLoginMergePayload, newAccountPayload } from '../../models';
import { useAuth } from '../../hooks/useAuth';
import { useDevices } from '../../contexts/DevicesContext';
import { serverTimestamp } from 'firebase/firestore';

type View = 'login' | null;

export default function AuthModal() {
  const [open, setOpen] = useState<View>(null);
  const [loading, setLoading] = useState(false);

  // form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { loginWithGoogle } = useAuth();
  const { showNotification, showCriticalError } = useDevices();

  // basic client-side validators and error mapping
  function validEmail(v: string) {
    // Accept any valid email format
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  }
  function validPassword(v: string) {
    // Strong password: min 8 chars, at least 1 upper, 1 lower, 1 number, 1 symbol
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\-+={}:;"'\[\]\\|<>?,./`~]).{8,}$/.test(v);
  }
  function friendlyAuthError(code?: string) {
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/invalid-email':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/too-many-requests':
        return 'Wrong user ID or password';
      case 'auth/account-exists-with-different-credential':
        return 'An account already exists with a different sign-in method';
      case 'permission-denied':
        return 'Permission denied. Please ensure you have the correct role and are logged in.';
      case 'unauthenticated':
        return 'Session expired. Please sign in again';
      case 'auth/user-disabled':
        return 'This account has been disabled';
      case 'auth/email-already-in-use':
        return 'Email already in use';
      case 'auth/weak-password':
        return 'Password is too weak';
      case 'auth/operation-not-allowed':
        return 'Operation not allowed. Contact support';
      default:
        return 'Something went wrong. Please try again';
    }
  }

  useEffect(() => {
    // expose global open/close helpers
    (window as any).__authOpen = (view: View) => setOpen(view);
    (window as any).__authClose = () => setOpen(null);
    return () => {
      delete (window as any).__authOpen;
      delete (window as any).__authClose;
    };
  }, []);

  useEffect(() => {
    // lock scroll when open
    if (open) document.documentElement.classList.add('overflow-hidden');
    else document.documentElement.classList.remove('overflow-hidden');
  }, [open]);


  function resetFormFields() {
    setEmail('');
    setPassword('');
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    try {
      // client-side validation
      if (!validEmail(email)) {
        showNotification({ message: 'Please enter a valid email', type: 'error', mode: 'snackbar' });
        return;
      }
      if (!validPassword(password)) {
        showNotification({ 
          message: 'Password must be at least 8 characters and include uppercase, lowercase, number, and symbol', 
          type: 'error', 
          mode: 'snackbar' 
        });
        return;
      }
      setLoading(true);
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const user = cred.user;
      if (user && user.email) {
        // Fetch role from Firestore in Accounts collection
        const userRef = accountDoc(db, user.uid);
        const snap = await getDoc(userRef);

        if (!snap.exists()) {
          // Treat as invalid credentials for home login
          showNotification({ message: 'Wrong user ID or password', type: 'error', mode: 'snackbar' });
          try { await signOut(auth); } catch {}
          return;
        }

        const data = snap.data() as any;
        const role = (data?.Role || data?.role || '').toString().toLowerCase();

        if (role === 'user') {
          // Update LastLoginAt and metadata (do not create new docs here)
          try {
            await setDoc(userRef, accountLoginMergePayload(), { merge: true });
          } catch (e) {
            console.warn('lastLoginAt update failed:', (e as any)?.message);
          }
          // Persist user data in localStorage
          try {
            localStorage.setItem('userEmail', user.email || '');
            localStorage.setItem('userId', user.uid);
            localStorage.setItem('userRole', 'user');
            
            // Cache user's name for quick greeting fallback
            const cachedName = (data?.FullName || data?.fullName || data?.displayName || data?.name || user.displayName || '').toString();
            if (cachedName) {
              localStorage.setItem('userName', cachedName);
            }
            
            // Also store any additional user data that might be needed
            if (data?.phoneNumber) {
              localStorage.setItem('userPhone', data.phoneNumber);
            }
            if (data?.address) {
              localStorage.setItem('userAddress', data.address);
            }
          } catch (error) {
            console.error('Error storing user data in localStorage:', error);
          }
          // Redirect to user dashboard
          window.location.href = '/dashboard/user';
          return;
        }

        // Any non-user role is invalid for home login
        showNotification({ 
          message: (
            <span>
              Invalid account for home login{' '}
              <a href="/admin_login" className="underline text-blue-600">
                Go to admin login
              </a>
            </span>
          ), 
          type: 'error', 
          mode: 'snackbar' 
        });
        try { await signOut(auth); } catch {}
        return;
      }
      // Fallback: close modal if no user object (should not happen when signIn succeeds)
      setOpen(null);
    } catch (err: any) {
      // Do not surface raw Firebase error messages
      const code = err?.code as string | undefined;
      showNotification({ 
        message: friendlyAuthError(code),
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setLoading(true);
    try {
      const user = await loginWithGoogle();
      if (user && user.email) {
        const userRef = accountDoc(db, user.uid);
        const snap = await getDoc(userRef);

        if (snap.exists()) {
          const data = snap.data() as any;
          const role = (data?.Role || data?.role || '').toString().toLowerCase();

          // Reject admins from using the User Dashboard
          if (role !== 'user') {
            showNotification({
              message: 'Administrative account detected. Please use the Admin Portal to sign in.',
              type: 'error',
              mode: 'snackbar'
            });
            await signOut(auth);
            return;
          }

          // Update existing user metadata - NON-BLOCKING
          try {
            await setDoc(userRef, accountLoginMergePayload(), { merge: true });
          } catch (updateErr) {
            console.error('Non-blocking metadata update failure:', updateErr);
            // We ignore this error and let the user through to their dashboard
          }

          // Persist to localStorage
          localStorage.setItem('userEmail', user.email);
          localStorage.setItem('userId', user.uid);
          localStorage.setItem('userRole', 'user');
          const cachedName = (data?.FullName || data?.fullName || data?.displayName || '').toString();
          if (cachedName) localStorage.setItem('userName', cachedName);
        } else {
          // AUTO-REGISTRATION for new Google users
          const newUserPayload = newAccountPayload({
            uid: user.uid,
            email: user.email.toLowerCase(),
            fullName: user.displayName || 'User',
            role: 'user',
            consultationId: null
          });
          
          await setDoc(userRef, newUserPayload);

          localStorage.setItem('userEmail', user.email);
          localStorage.setItem('userId', user.uid);
          localStorage.setItem('userRole', 'user');
          if (user.displayName) localStorage.setItem('userName', user.displayName);
        }

        window.location.href = '/dashboard/user';
      }
    } catch (err: any) {
      console.error('Google Sign-In Error details:', err);
      const code = err?.code as string | undefined;
      const errorMessage = friendlyAuthError(code);
      
      // Check if we can extract more info about why it failed
      let diagnosticMsg = errorMessage;
      if (err.message && err.message.includes('permission')) {
        diagnosticMsg = `[permission-denied] You do not have permission to update your profile. Please contact support.`;
      }
      // show diagnostic in console for logging/debugging
      console.warn('Google Sign-In Diagnostic:', diagnosticMsg);
      showNotification({ 
        message: errorMessage,
        type: 'error'
      });
      await signOut(auth);
    } finally {
      setLoading(false);
    }
  }

  const show = open !== null;

  return (
    <div
      id="auth-modal-inline"
      className={
        'fixed inset-0 z-[100] ' +
        (show ? 'flex' : 'hidden') +
        ' items-center justify-center bg-black/50 backdrop-blur-sm'
      }
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          resetFormFields();
          setOpen(null);
        }
      }}
    >
      <div className="relative w-[92vw] max-w-xl max-h-[90vh]">
        <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl ring-1 ring-black/10 dark:ring-white/10 overflow-auto">
          <button
            onClick={() => { resetFormFields(); setOpen(null); }}
            className="absolute top-3 right-3 inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/60"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M6.72 6.72a.75.75 0 011.06 0L12 10.94l4.22-4.22a.75.75 0 111.06 1.06L13.06 12l4.22 4.22a.75.75 0 11-1.06 1.06L12 13.06l-4.22 4.22a.75.75 0 11-1.06-1.06L10.94 12 6.72 7.78a.75.75 0 010-1.06z" clipRule="evenodd"/></svg>
          </button>

          <div className="p-6 sm:p-8">
            {open === 'login' && (
              <form className="space-y-5" onSubmit={handleLogin}>
                <h1 className="text-2xl font-bold text-center text-charcoal dark:text-white mb-2">Sign in</h1>
                <p className="text-sm text-center text-gray-600 dark:text-gray-300 mb-4">Welcome back! Please enter your details.</p>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email ID</label>
                  <input id="email" type="email" autoComplete="email" required value={email} onChange={(e)=>setEmail(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal" placeholder="you@example.com" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        try {
                          window.dispatchEvent(new CustomEvent('open-forgot-password'));
                        } catch {}
                      }}
                      className="text-xs text-teal hover:underline"
                    >
                      Forgot password?
                    </a>
                  </div>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e)=>setPassword(e.target.value)}
                      className="w-full pr-11 pl-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 focus:outline-none"
                    >
                      {showPassword ? (
                        // Eye-off icon
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                          <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.11 1 12c.74-1.72 1.82-3.27 3.11-4.55M9.9 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.89 11 8-.46 1.07-1.07 2.06-1.8 2.94M14.12 14.12A3 3 0 1 1 9.88 9.88M1 1l22 22" />
                        </svg>
                      ) : (
                        // Eye icon
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                <button type="submit" className="w-full btn-primary" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
                
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white dark:bg-gray-900 px-2 text-gray-500">Or continue with</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal transition-colors"
                >
                  <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  Sign in with Google
                </button>

              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
