import { auth } from '../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

// Redirect unauthenticated visitors of the user dashboard to /login.
// This replaces prior localStorage-based gates to ensure Firebase Auth is the source of truth.
(function initAuthGate() {
  if (typeof window === 'undefined') return;

  let handled = false;
  const redirect = () => {
    if (handled) return;
    handled = true;
    try {
      window.location.href = '/login';
    } catch {}
  };

  // If we already have a currentUser synchronously, allow.
  if (!auth.currentUser) {
    // Wait for the initial auth state to resolve, then decide.
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      if (!user) redirect();
    });

    // Safety timeout: If auth doesn't respond in time, fall back to localStorage hint.
    setTimeout(() => {
      if (handled) return;
      // If there's no Firebase user, but legacy localStorage said logged in, still wait;
      // otherwise redirect to /login for a clean flow.
      if (!auth.currentUser) redirect();
    }, 4000);
  }
})();
