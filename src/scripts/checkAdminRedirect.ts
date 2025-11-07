import { auth } from '../lib/firebase';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { setPersistence, browserLocalPersistence } from 'firebase/auth';

/**
 * Checks if the current user is an admin and redirects to admin dashboard if they are.
 * Should be called on all non-admin pages to ensure admins are properly redirected.
 */
function checkAdminRedirect() {
  // Skip on server-side rendering
  if (typeof window === 'undefined') return;

  // Function to check if user is admin
  const isAdmin = () => {
    try {
      const userRole = localStorage.getItem('userRole') || '';
      const roleNorm = userRole.toLowerCase().replace(/[_-]+/g, ' ').trim();
      return roleNorm === 'admin' || roleNorm === 'super admin';
    } catch {
      return false;
    }
  };

  // Check if already on admin page to prevent redirect loops
  const isAdminPage = window.location.pathname.startsWith('/dashboard/admin') || 
                     window.location.pathname === '/admin_login';

  // If already on an admin page, no need to redirect
  if (isAdminPage) return;

  // Ensure auth persistence is set
  setPersistence(auth, browserLocalPersistence).then(() => {
    // Check auth state
    onAuthStateChanged(auth, (user) => {
      if (user) {
        // If user is signed in, check admin status
        if (isAdmin()) {
          console.log('Admin user detected, redirecting to admin dashboard');
          // Small delay to ensure the page has loaded
          setTimeout(() => {
            // Only redirect if not already on the admin page
            if (!window.location.pathname.startsWith('/dashboard/admin')) {
              window.location.href = '/dashboard/admin';
            }
          }, 100);
        }
      } else {
        console.log('No user signed in');
      }
    }, (error) => {
      console.error('Auth state error:', error);
    });
  }).catch((error) => {
    console.error('Persistence error:', error);
  });
}

// Run the check when the script loads
checkAdminRedirect();

// Also run the check when the authentication state might have changed
// (e.g., after login)
if (typeof window !== 'undefined') {
  window.addEventListener('auth-state-changed', checkAdminRedirect);
}

export default checkAdminRedirect;
