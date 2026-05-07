/**
 * Handles admin logout functionality
 * Clears all authentication state and redirects to public landing page
 */
export const handleLogout = () => {
  import('../../../lib/firebase').then(({ auth }) => {
    import('firebase/auth').then(({ signOut }) => {
      signOut(auth)
        .catch((err) => {
          console.error('Sign out failed', err);
        })
        .finally(() => {
          // Explicitly clear ALL localStorage data
          localStorage.clear();
          
          // Explicitly clear ALL sessionStorage data
          sessionStorage.clear();
          
          // Clear auth cookies/tokens by setting expiry to past
          document.cookie.split(";").forEach(function(c) { 
            document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/");
          });
          
          // Force reload of page to clear any in-memory state
          window.location.href = '/';
        });
    });
  });
};
