import { Role } from '@workspace/shared';

export const LOGIN_PATH = '/login';
export const ADMIN_HOME = '/admin';
export const EMPLOYEE_HOME = '/employee';

/** Landing page for each role. */
export function homeFor(role: Role): string {
  return role === Role.ADMIN ? ADMIN_HOME : EMPLOYEE_HOME;
}

function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function isAdminPath(pathname: string): boolean {
  return isUnder(pathname, ADMIN_HOME);
}

export function isEmployeePath(pathname: string): boolean {
  return isUnder(pathname, EMPLOYEE_HOME);
}

export function isLoginPath(pathname: string): boolean {
  return isUnder(pathname, LOGIN_PATH);
}

/**
 * Returns `value` only if it is a same-origin relative path that is safe to redirect to
 * after login; otherwise `null`. Rejects protocol-relative (`//x`, `/\x`), absolute URLs,
 * control characters and the login page itself (prevents open redirects through `?next=`).
 */
export function safeReturnPath(value: string | null | undefined): string | null {
  if (!value || value.length > 2048) return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;

  let url: URL;
  try {
    // Resolve against a dummy origin: anything that escapes it is not a relative path.
    url = new URL(value, 'http://return.invalid');
  } catch {
    return null;
  }
  if (url.origin !== 'http://return.invalid') return null;
  if (isLoginPath(url.pathname)) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** `/login`, or `/login?next=<path>` when a safe return path is given. */
export function loginPath(returnPath?: string | null): string {
  const next = safeReturnPath(returnPath);
  if (!next || next === '/') return LOGIN_PATH;
  return `${LOGIN_PATH}?next=${encodeURIComponent(next)}`;
}
