import type { MiddlewareHandler } from 'astro';

// Basic server-side guard example. Replace cookie/token check with your real auth logic.
export const onRequest: MiddlewareHandler = async (context, next) => {
  const { url, cookies } = context;
  const pathname = new URL(url).pathname;

  // Protect all super admin pages
  const isSuperAdminArea = pathname.startsWith('/super_admin-a1b2c3');

  if (isSuperAdminArea) {
    // Example: expect a session cookie set after Super Admin login
    const session = cookies.get('super_admin_session')?.value;

    if (!session) {
      // Redirect unauthenticated users to Super Admin login
      return Response.redirect(new URL('/admin_login', url), 302);
    }

    // TODO: validate session/JWT and confirm user has super-admin role
    // If invalid, redirect or return 401/403 accordingly
  }

  return next();
};
