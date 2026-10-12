'use client';

import { Role, type TaskDto } from '@workspace/shared';
import { MessageSquareWarning } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useCurrentUser } from '@/features/auth/components/current-user-provider';
import { formatDateTime } from '@/lib/dates';

/**
 * The latest rejection reason while the task is back In progress (`latestRejectionReason`).
 * The API clears it on resubmission or approval; the reason stays in the history.
 */
export function TaskFeedbackAlert({ task }: { task: TaskDto }) {
  const user = useCurrentUser();
  if (!task.latestRejectionReason) return null;

  const isAdmin = user.role === Role.ADMIN;
  return (
    <Alert
      className="border-amber-300 bg-amber-50 text-amber-950"
      data-testid="task-feedback"
      aria-labelledby="task-feedback-title"
    >
      <MessageSquareWarning aria-hidden="true" />
      <AlertTitle id="task-feedback-title" className="text-base">
        {isAdmin ? 'Returned with feedback' : 'Admin feedback'}
      </AlertTitle>
      <AlertDescription className="text-amber-950">
        <p className="break-words whitespace-pre-wrap" data-testid="task-feedback-reason">
          {task.latestRejectionReason}
        </p>
        {task.reviewedBy || task.reviewedAt ? (
          <p className="text-amber-900">
            {task.reviewedBy ? <>From {task.reviewedBy.name}</> : null}
            {task.reviewedBy && task.reviewedAt ? ' · ' : null}
            {task.reviewedAt ? (
              <time dateTime={task.reviewedAt}>{formatDateTime(task.reviewedAt)}</time>
            ) : null}
          </p>
        ) : null}
        {isAdmin ? null : (
          <p className="text-amber-900">
            Address the feedback, then submit the task for approval again.
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}
