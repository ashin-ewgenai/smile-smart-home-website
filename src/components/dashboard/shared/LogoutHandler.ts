/**
 * Handles user logout functionality
 * Clears local storage and redirects to login page
 */
export const handleLogout = () => {
  // Clear user data from local storage
  localStorage.removeItem('userEmail');
  localStorage.removeItem('userRole');
  
  // Redirect to login page
  window.location.href = '/login';
};
