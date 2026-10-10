import type { Request, RequestHandler } from 'express';
import { AppError, ErrorCode } from '../errors/app-error.js';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** `Sec-Fetch-Site` values that cannot come from another site. */
const TRUSTED_FETCH_SITES = new Set(['same-origin', 'none']);

const csrfRejected = () =>
  new AppError(403, ErrorCode.CSRF_REJECTED, 'Cross-site request rejected');

function hasBody(req: Request): boolean {
  const length = req.headers['content-length'];
  return req.headers['transfer-encoding'] !== undefined || (length !== undefined && length !== '0');
}

/**
 * CSRF defence for cookie-authenticated, state-changing requests (POST/PUT/PATCH/DELETE):
 * 1. `Origin` present → must be in the allowlist (FRONTEND_URL).
 * 2. `Origin` absent, `Sec-Fetch-Site` present → only `same-origin` / `none` pass
 *    (`same-site` cannot be checked against the allowlist without an origin, so it is rejected).
 * 3. Both absent → non-browser client (curl, server-to-server): allowed; it has no ambient cookie.
 * 4. A request body must be `application/json` → otherwise 415 UNSUPPORTED_MEDIA_TYPE.
 *    This rules out HTML-form and `text/plain` "simple" requests.
 */
export function csrfProtection(allowedOrigins: readonly string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);

  return (req, _res, next) => {
    if (!UNSAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    const origin = req.get('origin');
    if (origin !== undefined) {
      if (!allowed.has(origin)) {
        next(csrfRejected());
        return;
      }
    } else {
      const fetchSite = req.get('sec-fetch-site');
      if (fetchSite !== undefined && !TRUSTED_FETCH_SITES.has(fetchSite)) {
        next(csrfRejected());
        return;
      }
    }

    if (hasBody(req) && !req.is('application/json')) {
      next(
        new AppError(
          415,
          ErrorCode.UNSUPPORTED_MEDIA_TYPE,
          'Request body must be sent as application/json',
        ),
      );
      return;
    }

    next();
  };
}
