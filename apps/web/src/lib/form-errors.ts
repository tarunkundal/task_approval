import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { isApiError, validationIssues } from '@/lib/api/errors';

/** API error codes that belong to a single form field. */
const FIELD_FOR_CODE: Record<string, string> = {
  EMAIL_TAKEN: 'email',
  INVALID_ASSIGNEE: 'assignedToId',
};

/** User-facing message for any thrown value. */
export function apiErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (isApiError(error)) return error.message;
  return fallback;
}

/**
 * Maps an API error onto React Hook Form errors:
 * - `VALIDATION_ERROR` details `{ path, message }` → the matching field (unknown paths → `root`),
 * - `EMAIL_TAKEN` → `email`, `INVALID_ASSIGNEE` → `assignedToId` (when the form has that field).
 * Returns `true` when the error was shown inline; `false` means the caller should toast it.
 */
export function applyApiErrorToForm<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fieldNames: readonly Path<T>[],
): boolean {
  if (!isApiError(error)) return false;
  const known = new Set<string>(fieldNames);

  const issues = validationIssues(error);
  if (issues.length > 0) {
    const rootMessages: string[] = [];
    const seen = new Set<string>();
    for (const issue of issues) {
      if (known.has(issue.path)) {
        if (seen.has(issue.path)) continue; // first message per field wins
        seen.add(issue.path);
        setError(issue.path as Path<T>, { type: 'server', message: issue.message });
      } else {
        rootMessages.push(issue.message);
      }
    }
    if (rootMessages.length > 0) {
      setError('root.server' as Path<T>, { type: 'server', message: rootMessages.join(' ') });
    }
    return true;
  }

  const field = FIELD_FOR_CODE[error.code];
  if (field && known.has(field)) {
    setError(field as Path<T>, { type: 'server', message: error.message });
    return true;
  }
  return false;
}
