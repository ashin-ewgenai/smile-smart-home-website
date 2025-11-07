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
  const getRoleNorm = () => {
    try {
      const userRole = localStorage.getItem('userRole') || '';
      return userRole.toLowerCase().replace(/[_-]+/g, ' ').trim();
    } catch {
      return '';
    }
  };
  const isSuperAdmin = () => getRoleNorm() === 'super admin';
  const isAdminOnly = () => getRoleNorm() === 'admin';

  // Check if already on an admin/super-admin page to prevent redirect loops
  const path = window.location.pathname;
  const isAdminPage = path.startsWith('/dashboard/admin') || 
                      path === '/admin_login' ||
                      path.startsWith('/super_admin-a1b2c3');

  // If already on an admin page, no need to redirect
  if (isAdminPage) return;

  // Ensure auth persistence is set
  setPersistence(auth, browserLocalPersistence).then(() => {
    // Check auth state
    onAuthStateChanged(auth, (user) => {
      if (user) {
        // If user is signed in, check role priority: super admin first
        if (isSuperAdmin()) {
          // Small delay to ensure the page has loaded
          setTimeout(() => {
            if (!window.location.pathname.startsWith('/super_admin-a1b2c3')) {
              window.location.href = '/super_admin-a1b2c3/dashboard';
            }
          }, 100);
        } else if (isAdminOnly()) {
          // Small delay to ensure the page has loaded
          setTimeout(() => {
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
