'use client';

import { ErrorState } from '@/components/common/error-state';

/** Fallback for errors outside the app shell (e.g. the session check fails because the API is down). */
export default function RootError({
  retry,
}: {
  error: Error & { digest?: string };
  // `retry` (stable since Next 16.3) re-fetches and re-renders the segment; `reset` would only
  // re-render the same failed payload.
  retry: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center p-6">
      <h1 className="sr-only">Error</h1>
      <ErrorState
        title="Something went wrong"
        message="The application could not reach the server. Please try again."
        onRetry={retry}
      />
    </main>
  );
}
