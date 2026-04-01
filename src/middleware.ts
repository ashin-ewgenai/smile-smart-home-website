import type { MiddlewareHandler } from 'astro';

export const onRequest: MiddlewareHandler = async (context, next) => {
  const { url, locals } = context;
  
  // Example: Protect health-check or telemetry endpoints
  if (url.pathname.startsWith('/api/health')) {
    // In a real implementation, we'd check for a session cookie or Firebase token
    // For now, we assume the frontend handles Firebase Auth, but we log the access attempt
    console.log(`[Middleware] Health data access attempt: ${url.pathname}`);
  }

  return next();
};

