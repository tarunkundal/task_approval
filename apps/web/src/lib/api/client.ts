import { isLoginPath, loginPath } from '@/lib/routes';
import { ApiError, networkError, parseApiError } from './errors';

/**
 * Browser API client. Every call goes to the RELATIVE path `/api/v1/...` on the web origin;
 * the Next.js rewrite proxies it to Express (ARCHITECTURE.md D1), so the httpOnly `tas_token`
 * cookie stays first-party. No absolute API URL lives in client code.
 */
export const API_BASE_PATH = '/api/v1';

type FetchImpl = (input: string, init: RequestInit) => Promise<Response>;

export interface ApiClientOptions {
  fetchImpl?: FetchImpl;
  /** Called once for a 401 `UNAUTHENTICATED` (expired / missing session). */
  onUnauthenticated?: (error: ApiError) => void;
}

export interface ApiClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  patch<T>(path: string, body?: unknown): Promise<T>;
  delete<T = void>(path: string): Promise<T>;
}

/** Default 401 handling: full navigation to `/login?next=<current path>` unless already there. */
export function redirectToLogin(): void {
  if (typeof window === 'undefined') return;
  const { pathname, search, hash } = window.location;
  if (isLoginPath(pathname)) return;
  window.location.assign(loginPath(`${pathname}${search}${hash}`));
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const fetchImpl: FetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const onUnauthenticated = options.onUnauthenticated ?? redirectToLogin;

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const init: RequestInit = {
      method,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
    };
    // Bodyless calls (start/submit/approve/logout) send no body and no Content-Type.
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await fetchImpl(`${API_BASE_PATH}${path}`, init);
    } catch {
      throw networkError();
    }

    if (!response.ok) {
      const error = await parseApiError(response);
      // Login's INVALID_CREDENTIALS is also a 401 but must stay an inline form error.
      if (error.status === 401 && error.code === 'UNAUTHENTICATED') onUnauthenticated(error);
      throw error;
    }

    if (response.status === 204) return undefined as T;
    const text = await response.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError(response.status, 'HTTP_ERROR', 'The server sent an unexpected response.');
    }
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    patch: (path, body) => request('PATCH', path, body),
    delete: (path) => request('DELETE', path),
  };
}

export const api = createApiClient();
