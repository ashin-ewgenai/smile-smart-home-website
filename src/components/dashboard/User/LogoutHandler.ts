/**
 * Handles user logout functionality
 * Clears local storage and redirects to login page
 */
export const handleLogout = () => {
  import('../../../lib/firebase').then(({ auth }) => {
    import('firebase/auth').then(({ signOut }) => {
      signOut(auth)
        .catch((err) => {
          console.error('Sign out failed', err);
        })
        .finally(() => {
          // Clear user data from local storage (compatibility with existing checks)
          localStorage.removeItem('userEmail');
          localStorage.removeItem('userRole');
          // Redirect to home page
          window.location.href = '/';
        });
    });
  });
};
