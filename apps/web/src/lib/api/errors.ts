/**
 * Error raised for every failed API call. Mirrors the API error shape
 * `{ error: { code, message, details? } }` (docs/API.md).
 * - `status: 0, code: 'NETWORK_ERROR'`: the request never got a response.
 * - `code: 'HTTP_ERROR'`: the response wasn't the standard JSON error shape
 *   (e.g. the API is down and the Next.js proxy returns a non-JSON 500).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/** One `VALIDATION_ERROR` detail entry. */
export interface ValidationIssue {
  path: string;
  message: string;
}

export function validationIssues(error: ApiError): ValidationIssue[] {
  if (error.code !== 'VALIDATION_ERROR' || !Array.isArray(error.details)) return [];
  return error.details.filter(
    (item): item is ValidationIssue =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as ValidationIssue).path === 'string' &&
      typeof (item as ValidationIssue).message === 'string',
  );
}

function genericMessage(status: number): string {
  if (status >= 500) return 'The server could not complete the request. Please try again.';
  return `Request failed (HTTP ${status}).`;
}

/** Builds an ApiError from a non-2xx response. Never throws. */
export async function parseApiError(response: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  const error =
    typeof body === 'object' && body !== null
      ? (body as { error?: { code?: unknown; message?: unknown; details?: unknown } }).error
      : undefined;

  if (error && typeof error.code === 'string' && typeof error.message === 'string') {
    return new ApiError(response.status, error.code, error.message, error.details);
  }
  return new ApiError(response.status, 'HTTP_ERROR', genericMessage(response.status));
}

export function networkError(): ApiError {
  return new ApiError(
    0,
    'NETWORK_ERROR',
    'Could not reach the server. Check your connection and try again.',
  );
}
