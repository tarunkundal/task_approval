'use client';

import { ArrowRight, MessageSquareWarning } from 'lucide-react';
import { ErrorState } from '@/components/common/error-state';
import { LoadingSkeleton } from '@/components/common/loading-skeleton';
import { StatusBadge } from '@/components/common/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/lib/dates';
import { ROLE_LABEL, STATUS_LABEL } from '@/lib/labels';
import { useTaskHistory } from '../hooks/use-task-queries';

/** Status history (oldest first): creation, every transition, rejection reasons highlighted. */
export function TaskHistory({ taskId }: { taskId: string }) {
  const history = useTaskHistory(taskId);

  let content;
  if (history.isPending) {
    content = <LoadingSkeleton rows={3} label="Loading history" />;
  } else if (history.isError) {
    content = (
      <ErrorState
        title="Could not load the history"
        error={history.error}
        onRetry={() => void history.refetch()}
        retrying={history.isFetching}
      />
    );
  } else if (history.data.length === 0) {
    content = <p className="text-sm text-muted-foreground">No history recorded.</p>;
  } else {
    content = (
      <ol className="relative space-y-5 border-l pl-6" aria-label="Status history">
        {history.data.map((entry) => (
          <li key={entry.id} className="relative" data-testid="history-entry">
            <span
              className="absolute top-1.5 -left-[1.82rem] size-3 rounded-full border-2 border-background bg-primary"
              aria-hidden="true"
            />
            <div className="flex flex-wrap items-center gap-2">
              {entry.fromStatus === null ? (
                <>
                  <span className="text-sm font-medium">Created</span>
                  <StatusBadge status={entry.toStatus} />
                </>
              ) : (
                <>
                  <span className="sr-only">
                    Changed from {STATUS_LABEL[entry.fromStatus]} to {STATUS_LABEL[entry.toStatus]}
                  </span>
                  <span aria-hidden="true" className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={entry.fromStatus} />
                    <ArrowRight className="size-4 text-muted-foreground" />
                    <StatusBadge status={entry.toStatus} />
                  </span>
                </>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              by <span className="font-medium text-foreground">{entry.actor.name}</span> (
              {ROLE_LABEL[entry.actor.role]}) ·{' '}
              <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
            </p>
            {entry.reason ? (
              <div
                className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
                data-testid="history-reason"
              >
                <p className="flex items-center gap-1.5 font-medium">
                  <MessageSquareWarning className="size-4" aria-hidden="true" />
                  Rejection reason
                </p>
                <p className="mt-1 break-words whitespace-pre-wrap">{entry.reason}</p>
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-base font-semibold">History</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
