import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_COOKIE, PATHNAME_HEADER, proxyDecision } from '@/lib/auth-redirect';

/**
 * Next.js 16 Proxy (formerly Middleware). Cheap cookie-presence check for page routes:
 * no `tas_token` → `/login?next=<path>`. Session validity and role are checked server-side in
 * the `(app)` layouts via `GET /auth/me`; the API enforces authorization on every request.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const decision = proxyDecision({
    pathname,
    search,
    hasToken: Boolean(request.cookies.get(AUTH_COOKIE)?.value),
  });

  if (decision.type === 'redirect') {
    return NextResponse.redirect(new URL(decision.location, request.url));
  }

  const headers = new Headers(request.headers);
  headers.set(PATHNAME_HEADER, `${pathname}${search}`);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Page routes only: not the /api/v1 rewrite, Next internals or static files.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
