/**
 * Translates technical error messages (like Firebase internal errors) 
 * into user-friendly, professional messages.
 */
export const getFriendlyErrorMessage = (err: any): string => {
  if (typeof window !== 'undefined' && !window.navigator.onLine) {
    return "No internet connection. Please check your network and try again.";
  }
  
  // Handle string errors
  if (typeof err === 'string') {
    if (err.toLowerCase().includes('internal')) return "Our secondary services are briefly busy. Please try again soon.";
    return err;
  }

  // Firebase HTTPS Errors
  const code = err?.code || (err?.message?.includes('internal') ? 'internal' : 'unknown');
  
  switch (code) {
    case 'internal':
      return "Our secondary services are briefly busy. Please try again in a few moments.";
    case 'unavailable':
      return "The cloud service is currently unreachable. Please check your connection.";
    case 'deadline-exceeded':
      return "The request timed out. This can happen on slower connections.";
    case 'permission-denied':
      return "You don't have permission to perform this action.";
    case 'unauthenticated':
      return "Your session has expired. Please sign in again.";
    default:
      return err?.message || "An unexpected error occurred. Please try again.";
  }
};
