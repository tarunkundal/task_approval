import { QueryClient } from '@tanstack/react-query';
import { isApiError } from '@/lib/api/errors';

const MAX_RETRIES = 2;

/** Retry only transient failures (network or 5xx); 4xx responses are deterministic. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false;
  if (!isApiError(error)) return false;
  return error.status === 0 || error.status >= 500;
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: shouldRetry,
        refetchOnWindowFocus: true,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
