import type { MiddlewareHandler } from 'astro';

// We'll use a dynamic import approach or a more resilient top-level import
// to ensure Vite handles Node modules correctly in middleware.
let admin: any;

const getAdmin = async () => {
  if (admin) return admin;
  const firebaseAdmin = await import('firebase-admin');
  admin = firebaseAdmin.default || firebaseAdmin;
  
  if (!admin.apps.length) {
    try {
      admin.initializeApp({
        projectId: import.meta.env.FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
      });
      console.log('[Middleware] Firebase Admin successfully initialized.');
    } catch (error: any) {
      console.error('[Middleware] Firebase Admin initialization failed:', error.message);
    }
  }
  return admin;
};

export const onRequest: MiddlewareHandler = async (context, next) => {
  const { url, request } = context;

  // ── Protected Endpoints Authentication ———————————————————————————————————
  // Currently protecting health data and sensitive API routes.
  if (url.pathname.startsWith('/api/health')) {
    const authHeader = request.headers.get('Authorization');

    // Reject requests with missing or invalidly formatted headers
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn(`[Middleware] Blocked unauthenticated access to: ${url.pathname}`);
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          message: 'A valid Firebase Bearer token is required to access health data.',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const idToken = authHeader.split('Bearer ')[1];

    try {
      /**
       * ── Token Verification —————————————————————————————————————————————————
       * verifyIdToken() validates the token with Firebase servers.
       * Supports tokens from all providers (Email/Password, Google, etc.).
       */
      const adminAuth = await getAdmin();
      const decodedToken = await adminAuth.auth().verifyIdToken(idToken);
      
      // Log authentication details for auditing and debugging
      console.log(
        `[Middleware] Verified ${decodedToken.email || 'user'} (${decodedToken.uid}) ` +
        `via ${decodedToken.firebase.sign_in_provider}`
      );

      // Successfully verified — proceed to the next handler
    } catch (error: any) {
      console.warn(`[Middleware] Verification failed: ${error.message}`);
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          message: 'The provided authentication token is invalid or has expired.',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  }

  return next();
};
