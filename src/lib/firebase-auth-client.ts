// Re-export Firebase Auth functions for use in module scripts within Astro
// This ensures Vite resolves the bare specifier during build/dev
export {
  sendPasswordResetEmail,
  verifyPasswordResetCode,
  confirmPasswordReset,
} from 'firebase/auth';
