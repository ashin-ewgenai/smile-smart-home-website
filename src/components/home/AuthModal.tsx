import React, { useEffect, useState } from 'react';
import { auth, db } from '../../lib/firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, increment, getDocs, collection, where, limit, query } from 'firebase/firestore';

type View = 'login' | 'register' | null;

export default function AuthModal() {
  const [open, setOpen] = useState<View>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<React.ReactNode | null>(null);

  // form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [confirm, setConfirm] = useState('');

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

  function resetError() {
    setError(null);
  }

  function resetFormFields() {
    setEmail('');
    setPassword('');
    setFullName('');
    setConfirm('');
    setError(null);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    resetError();
    try {
      // client-side validation
      if (!validEmail(email)) {
        setError('Please enter a valid email');
        return;
      }
      if (!validPassword(password)) {
        setError('Password must be at least 8 characters and include uppercase, lowercase, number, and symbol');
        return;
      }
      setLoading(true);
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const user = cred.user;
      if (user && user.email) {
        // Fetch role from Firestore without creating a user document here
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);

        if (!snap.exists()) {
          // Treat as invalid credentials for home login
          setError('Wrong user ID or password');
          try { await signOut(auth); } catch {}
          return;
        }

        const data = snap.data() as any;
        const role = (data?.role || '').toString().toLowerCase();

        if (role === 'user') {
          // Update lastLoginAt and metadata (do not create new docs here)
          try {
            await setDoc(
              userRef,
              {
                lastLoginAt: serverTimestamp(),
                lastLoginAtText: new Date().toISOString(),
                loginCount: increment(1),
                status: 'online',
                statusUpdatedAt: serverTimestamp(),
              },
              { merge: true }
            );
          } catch (e) {
            console.warn('lastLoginAt update failed:', (e as any)?.message);
          }
          // Persist a few items
          try { localStorage.setItem('userEmail', user.email); } catch {}
          try { localStorage.setItem('userRole', 'user'); } catch {}
          // Cache user's name for quick greeting fallback
          try {
            const cachedName = (data?.fullName || data?.displayName || data?.name || user.displayName || '').toString();
            if (cachedName) localStorage.setItem('userName', cachedName);
          } catch {}
          // Redirect to user dashboard
          window.location.href = '/dashboard/user';
          return;
        }

        // Any non-user role is invalid for home login
        setError(
          <span>
            Invalid account for home login{' '}
            <a href="/admin_login" className="underline text-blue-600">
              Go to admin login
            </a>
          </span>
        );
        try { await signOut(auth); } catch {}
        return;
      }
      // Fallback: close modal if no user object (should not happen when signIn succeeds)
      setOpen(null);
    } catch (err: any) {
      // Do not surface raw Firebase error messages
      const code = err?.code as string | undefined;
      setError(friendlyAuthError(code));
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    resetError();
    try {
      // client-side validation
      if (!fullName || fullName.trim().length < 2) {
        setError('Please enter your full name');
        return;
      }
      if (!validEmail(email)) {
        setError('Please enter a valid email');
        return;
      }
      if (!validPassword(password)) {
        setError('Password must be at least 8 characters and include uppercase, lowercase, number, and symbol');
        return;
      }
      if (password !== confirm) {
        setError('Passwords do not match');
        return;
      }
      setLoading(true);
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (fullName) await updateProfile(cred.user, { displayName: fullName });
      // Create user profile document in Firestore
      try {
        const user = cred.user;
        // lookup consultationId from contactmessages by email
        let consultationId: string | null = null;
        try {
          if (user.email) {
            const q = query(collection(db, 'contactmessages'), where('email', '==', user.email), limit(1));
            const res = await getDocs(q);
            if (!res.empty) consultationId = res.docs[0].id;
          }
        } catch {}

        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          fullName: fullName || user.displayName || '',
          role: 'user',
          createdAt: serverTimestamp(),
          lastLoginAt: null,
          lastLoginAtText: '',
          loginCount: 0,
          status: 'offline',
          statusUpdatedAt: serverTimestamp(),
          consultationId: consultationId,
        });
      } catch (e) {
        console.warn('User profile create failed:', (e as any)?.message);
      }
      try { await signOut(auth); } catch {}
      setOpen('login');
    } catch (err: any) {
      const code = err?.code as string | undefined;
      setError(friendlyAuthError(code));
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
                    <a href="/forgot-password" className="text-xs text-teal hover:underline">Forgot password?</a>
                  </div>
                  <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e)=>setPassword(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal" placeholder="••••••••" />
                </div>
                <button type="submit" className="w-full btn-primary" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-300">
                  Don't have an account?{' '}
                  <button type="button" onClick={()=>{ setError(null); setOpen('register'); }} className="text-blue-600 dark:text-blue-400 hover:underline">Register here</button>
                </p>
              </form>
            )}

            {open === 'register' && (
              <form className="space-y-5" onSubmit={handleRegister}>
                <h1 className="text-2xl font-bold text-center text-charcoal dark:text-white mb-2">Create your account</h1>
                <p className="text-sm text-center text-gray-600 dark:text-gray-300 mb-4">Join us to manage your smart home services.</p>
                <div>
                  <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name</label>
                  <input id="fullName" type="text" autoComplete="name" required value={fullName} onChange={(e)=>setFullName(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal" placeholder="John Doe" />
                </div>
                <div>
                  <label htmlFor="reg-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email ID</label>
                  <input id="reg-email" type="email" autoComplete="email" required value={email} onChange={(e)=>setEmail(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal" placeholder="you@example.com" />
                </div>
                <div>
                  <label htmlFor="reg-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                  <input id="reg-password" type="password" autoComplete="new-password" required value={password} onChange={(e)=>setPassword(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal" placeholder="••••••••" />
                </div>
                <div>
                  <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirm Password</label>
                  <input id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e)=>setConfirm(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal" placeholder="••••••••" />
                </div>
                <button type="submit" className="w-full btn-primary" disabled={loading}>{loading ? 'Creating account...' : 'Create account'}</button>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-300">
                  Already have an account?{' '}
                  <button type="button" onClick={()=>{ setError(null); setOpen('login'); }} className="text-blue-600 dark:text-blue-400 hover:underline">Sign in</button>
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
