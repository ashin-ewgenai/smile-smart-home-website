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

  // ── Protected Health Endpoints Authentication ——————————————————————————————
  // Strict validation for /api/health to ensure only authenticated users access telemetry.
  if (url.pathname.startsWith('/api/health')) {
    const authHeader = request.headers.get('Authorization');

    // 1. Reject requests with missing or malformed Authorization header
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn(`[Middleware] Blocked malformed/unauthenticated access to: ${url.pathname}`);
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          message: 'Malformed request. A valid "Bearer <token>" header is strictly required for health endpoints.',
          code: 'AUTH_MALFORMED'
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const idToken = authHeader.split('Bearer ')[1]?.trim();
    
    // 2. Reject empty tokens
    if (!idToken) {
      console.warn(`[Middleware] Blocked empty token access to: ${url.pathname}`);
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          message: 'Token cannot be empty.',
          code: 'TOKEN_EMPTY'
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    try {
      /**
       * ── Firebase Admin Token Verification ——————————————————————————————————
       * Validates the token against Firebase Auth servers to ensure the request 
       * originates from a valid, currently authenticated user session.
       */
      const adminAuth = await getAdmin();
      const decodedToken = await adminAuth.auth().verifyIdToken(idToken);
      
      // Audit log for security tracking
      console.info(
        `[Middleware] Health Access: ${decodedToken.email || 'UID:' + decodedToken.uid} ` +
        `verified via ${decodedToken.firebase.sign_in_provider}`
      );

      // Authentication successful — allow request to proceed
    } catch (error: any) {
      console.error(`[Middleware] Security verification failed: ${error.message}`);
      
      const isExpired = error.code === 'auth/id-token-expired';
      
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          message: isExpired ? 'Your session has expired. Please sign in again.' : 'Invalid authentication token.',
          code: isExpired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID'
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
