'use client';

import { ErrorState } from '@/components/common/error-state';

/** Error boundary for the signed-in area (e.g. the API is unreachable while loading a page). */
export default function AppError({
  retry,
}: {
  error: Error & { digest?: string };
  // `retry` (stable since Next 16.3) re-fetches and re-renders the segment; `reset` would only
  // re-render the same failed payload.
  retry: () => void;
}) {
  return (
    <div className="p-4 md:p-6">
      <h1 className="sr-only">Error</h1>
      <ErrorState
        title="Something went wrong"
        message="The page could not be loaded. Please try again."
        onRetry={retry}
      />
    </div>
  );
}
