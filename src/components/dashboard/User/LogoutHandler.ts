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
          // Clear all user data from local storage to ensure complete logout
          localStorage.removeItem('userEmail');
          localStorage.removeItem('userRole');
          localStorage.removeItem('userId');
          localStorage.removeItem('userPhone');
          localStorage.removeItem('userAddress');
          localStorage.removeItem('userName');
          // Redirect to login page
          window.location.href = '/';
        });
    });
  });
};
