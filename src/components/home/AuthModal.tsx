import React, { useEffect, useState } from 'react';
// Firebase modules are lazy-loaded on demand to keep them out of the initial bundle

type View = 'login' | 'register' | null;

export default function AuthModal() {
  const [open, setOpen] = useState<View>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [confirm, setConfirm] = useState('');

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

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    resetError();
    try {
      setLoading(true);
      // Lazy-load Firebase pieces only when needed
      const [firebaseClient, authMod, fsMod] = await Promise.all([
        import('../../lib/firebase'),
        import('firebase/auth'),
        import('firebase/firestore'),
      ]);
      const { auth, db } = firebaseClient;
      const { signInWithEmailAndPassword } = authMod;
      const { doc, getDoc, setDoc, serverTimestamp } = fsMod;

      const cred = await signInWithEmailAndPassword(auth, email, password);
      const user = cred.user;
      if (user && user.email) {
        // Ensure a user profile exists in Firestore
        try {
          const userRef = doc(db, 'users', user.uid);
          const snap = await getDoc(userRef);
          if (!snap.exists()) {
            await setDoc(userRef, {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName || '',
              role: 'user',
              createdAt: serverTimestamp(),
              lastLoginAt: serverTimestamp(),
            });
          } else {
            // Optionally update last login time
            await setDoc(userRef, { lastLoginAt: serverTimestamp() }, { merge: true });
          }
        } catch (e) {
          // Non-blocking: continue login even if profile write fails
          console.warn('User profile write skipped:', (e as any)?.message);
        }
        // Persist session metadata used by dashboards/guards
        try {
          localStorage.setItem('userEmail', user.email);
        } catch {}
        // Redirect based on role
        window.location.href = '/dashboard/user';
        return;
      }
      // Fallback: close modal if no user object (shouldn't happen when signIn succeeds)
      setOpen(null);
    } catch (err: any) {
      setError(err?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    resetError();
    try {
      if (password !== confirm) {
        setError('Passwords do not match');
        return;
      }
      setLoading(true);
      const [firebaseClient, authMod, fsMod] = await Promise.all([
        import('../../lib/firebase'),
        import('firebase/auth'),
        import('firebase/firestore'),
      ]);
      const { auth, db } = firebaseClient;
      const { createUserWithEmailAndPassword, updateProfile, signOut } = authMod;
      const { doc, setDoc, serverTimestamp } = fsMod;

      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (fullName) await updateProfile(cred.user, { displayName: fullName });
      // Create user profile document in Firestore
      try {
        const user = cred.user;
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          displayName: fullName || user.displayName || '',
          role: 'user',
          createdAt: serverTimestamp(),
          lastLoginAt: null,
        });
      } catch (e) {
        console.warn('User profile create failed:', (e as any)?.message);
      }
      try { await signOut(auth); } catch {}
      setOpen('login');
    } catch (err: any) {
      setError(err?.message || 'Registration failed');
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
        if (e.target === e.currentTarget) setOpen(null);
      }}
    >
      <div className="relative w-[92vw] max-w-xl max-h-[90vh]">
        <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl ring-1 ring-black/10 dark:ring-white/10 overflow-auto">
          <button
            onClick={() => setOpen(null)}
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
