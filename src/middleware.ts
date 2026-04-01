import type { MiddlewareHandler } from 'astro';

export const onRequest: MiddlewareHandler = async (context, next) => {
  const { url, request } = context;

  // ── Enforce authentication for all /api/health/* endpoints ───────────────
  if (url.pathname.startsWith('/api/health')) {
    const authHeader = request.headers.get('Authorization');

    // Require a Bearer token — no token means 401 Unauthorized
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn(
        `[Middleware] Blocked unauthenticated access to: ${url.pathname}`
      );
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          message:
            'A valid Firebase Bearer token is required to access health data endpoints.',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Token is present — log and allow through for Firebase to validate server-side
    console.log(
      `[Middleware] Authenticated request to ${url.pathname} — token present.`
    );
  }

  return next();
};
