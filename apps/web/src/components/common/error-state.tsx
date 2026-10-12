'use client';

import { AlertCircle, RotateCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { apiErrorMessage } from '@/lib/form-errors';

interface ErrorStateProps {
  title?: string;
  /** Explicit message; otherwise derived from `error` (the ApiError message). */
  message?: string;
  error?: unknown;
  onRetry?: () => void;
  retrying?: boolean;
}

/** Inline error with an optional Retry button (failed queries, error boundaries). */
export function ErrorState({
  title = 'Could not load data',
  message,
  error,
  onRetry,
  retrying = false,
}: ErrorStateProps) {
  const text = message ?? apiErrorMessage(error, 'Something went wrong. Please try again.');

  return (
    <Alert variant="destructive" role="alert">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{text}</p>
        {onRetry ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={onRetry}
            disabled={retrying}
            aria-busy={retrying || undefined}
          >
            <RotateCw className={retrying ? 'animate-spin' : undefined} aria-hidden="true" />
            Retry
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
