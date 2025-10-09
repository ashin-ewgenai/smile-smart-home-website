import { auth } from '../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

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

// Redirect unauthenticated visitors of the user dashboard to /login.
// This replaces prior localStorage-based gates to ensure Firebase Auth is the source of truth.
(function initAuthGate() {
  if (typeof window === 'undefined') return;

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
    if (handled) return;
    handled = true;
    cleanup();
    try {
      window.location.href = '/login';
    } catch {}
  };

  const redirectToAdmin = () => {
    if (handled) return;
    handled = true;
    cleanup();
    try {
      window.location.href = '/dashboard/admin';
    } catch {}
  };

  // Show loading overlay immediately
  initOverlay();

  // If we already have a currentUser synchronously, check role
  if (auth.currentUser) {
    if (isAdmin()) {
      redirectToAdmin();
    } else {
      cleanup();
    }
    return;
  }

  // Wait for the initial auth state to resolve, then decide.
  const unsub = onAuthStateChanged(auth, (user) => {
    unsub();
    if (!user) {
      redirectToLogin();
    } else if (isAdmin()) {
      redirectToAdmin();
    } else {
      cleanup();
    }
  });

  // Safety timeout: If auth doesn't respond in time, fall back to localStorage hint.
  setTimeout(() => {
    if (handled) return;
    if (!auth.currentUser) {
      redirectToLogin();
    } else if (isAdmin()) {
      redirectToAdmin();
    } else {
      cleanup();
    }
  }, 4000);
})();
