// Client-safe API exports. The server-only fetch module lives in `./server` and is imported
// directly by server components, never through this barrel.
export { api, createApiClient, redirectToLogin, API_BASE_PATH } from './client';
export type { ApiClient, ApiClientOptions } from './client';
export { ApiError, isApiError, parseApiError, validationIssues } from './errors';
export type { ValidationIssue } from './errors';
