import { auth } from '../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

// Extend Window interface for React auth coordination
declare global {
  interface Window {
    __reactAuthHandled?: boolean;
  }
}

// Add loading styles
const addLoadingStyles = () => {
  const style = document.createElement('style');
  style.textContent = `
    #auth-loading-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: white;
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 9999;
      transition: opacity 0.3s ease-out;
    }
    .loading-spinner {
      border: 4px solid rgba(0, 0, 0, 0.1);
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border-left-color: #09f;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
};

// Create loading overlay
const createLoadingOverlay = () => {
  const overlay = document.createElement('div');
  overlay.id = 'auth-loading-overlay';
  overlay.innerHTML = '<div class="loading-spinner"></div>';
  document.body.appendChild(overlay);
  return overlay;
};

// Check if user is admin
const isAdmin = () => {
  try {
    const userRole = localStorage.getItem('userRole') || '';
    const roleNorm = userRole.toLowerCase().replace(/[_-]+/g, ' ').trim();
    return roleNorm === 'admin' || roleNorm === 'super admin';
  } catch {
    return false;
  }
};

// Redirect unauthenticated visitors of the user dashboard to home with auth modal.
// This replaces prior localStorage-based gates to ensure Firebase Auth is the source of truth.
(function initAuthGate() {
  if (typeof window === 'undefined') return;

  console.log('[AuthGate] Initializing for path:', window.location.pathname);

  let handled = false;
  let overlay: HTMLElement | null = null;
  
  // Initialize loading overlay
  const initOverlay = () => {
    addLoadingStyles();
    overlay = createLoadingOverlay();
    // Hide the main content while we check auth
    document.body.style.visibility = 'hidden';
  };

  const cleanup = () => {
    if (overlay) {
      overlay.style.opacity = '0';
      setTimeout(() => {
        if (overlay && overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
        document.body.style.visibility = 'visible';
      }, 300); // Match the transition duration
    }
  };
  
  const redirectToLogin = () => {
    console.log('[AuthGate] Redirecting to login (home page with modal)');
    if (handled) return;
    handled = true;
    cleanup();
    try {
      // Store current URL for post-login redirect
      const currentPath = window.location.pathname + window.location.search;
      sessionStorage.setItem('authReturnTo', currentPath);
      // Open auth modal on home page (modal will auto-open via sessionStorage check)
      sessionStorage.setItem('authOpenModal', 'login');
      window.location.href = '/';
    } catch {
      window.location.href = '/';
    }
  };

  const redirectToAdmin = () => {
    console.log('[AuthGate] Redirecting to admin dashboard');
    if (handled) return;
    handled = true;
    cleanup();
    try {
      window.location.href = '/dashboard/admin';
    } catch {}
  };

  // Show loading overlay immediately
  initOverlay();

  // Helper to check auth with small delay for Firebase persistence
  const checkAuthWithDelay = async () => {
    // First sync check
    if (auth.currentUser) {
      console.log('[AuthGate] User already authenticated:', auth.currentUser.uid);
      if (isAdmin()) {
        redirectToAdmin();
      } else {
        console.log('[AuthGate] Regular user, allowing access');
        cleanup();
      }
      return;
    }
    
    // Wait for Firebase to restore auth from persistence
    // Using a shorter delay and checking localStorage hint to prevent premature redirects
    const hasAuthHint = !!localStorage.getItem('userId');
    await new Promise(resolve => setTimeout(resolve, 400));
    
    // Check again after delay
    const userAfterDelay = auth.currentUser as any;
    if (userAfterDelay) {
      console.log('[AuthGate] User authenticated after delay:', userAfterDelay.uid);
      if (isAdmin()) {
        redirectToAdmin();
      } else {
        console.log('[AuthGate] Regular user, allowing access after delay');
        cleanup();
      }
      return;
    }

    // If we have no Firebase user yet but HAVE a localStorage hint, 
    // wait longer for onAuthStateChanged instead of redirecting.
    if (hasAuthHint) {
      console.log('[AuthGate] Firebase Auth not ready yet but localStorage hint found. Waiting...');
    } else {
      console.log('[AuthGate] No Firebase user and no localStorage hint. Proceeding with caution.');
    }
    
    console.log('[AuthGate] Waiting for auth state...');

    // Wait for the initial auth state to resolve.
    const unsub = onAuthStateChanged(auth, (user) => {
      console.log('[AuthGate] Auth state resolved:', user ? 'authenticated' : 'not authenticated');
      
      if (user) {
        unsub();
        if (isAdmin()) {
          redirectToAdmin();
        } else {
          console.log('[AuthGate] Regular user authenticated, allowing access');
          cleanup();
        }
      } else {
        // If we have no user yet...
        if (hasAuthHint) {
          console.log('[AuthGate] No user but hint found. Letting React app handle it.');
          handled = true; // Mark as handled to prevent safety timeout
          cleanup();
          return;
        }
        
        // No hint and no user: definitive redirect
        unsub();
        redirectToLogin();
      }
    });
  };
  
  // Start the check
  checkAuthWithDelay();

  // Safety timeout: If auth doesn't respond in time, fall back to localStorage hint.
  // Increased to 10 seconds to allow React app time to initialize and handle auth
  setTimeout(() => {
    if (handled) return;
    
    const hasAuthHint = !!localStorage.getItem('userId');
    if (hasAuthHint) {
      console.log('[AuthGate] Safety timeout reached but hint exists. Deferring to React.');
      cleanup();
      return;
    }

    if (!auth.currentUser) {
      console.log('[AuthGate] Safety timeout: No user and no hint. Redirecting.');
      redirectToLogin();
    } else if (isAdmin()) {
      redirectToAdmin();
    } else {
      cleanup();
    }
  }, 10000);
})();
