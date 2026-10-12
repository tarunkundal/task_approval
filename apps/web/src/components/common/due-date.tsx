'use client';

import type { TaskStatus } from '@workspace/shared';
import { formatDueDate, isOverdue } from '@/lib/dates';
import { OverdueBadge } from './overdue-badge';

/**
 * A `YYYY-MM-DD` due date shown without timezone shifts, plus an "Overdue" badge when it is
 * before the viewer's local today and the task isn't COMPLETED. Rendered only with
 * client-fetched data, so the local date never mismatches a server render.
 */
export function DueDate({ dueDate, status }: { dueDate: string; status: TaskStatus }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <time dateTime={dueDate}>{formatDueDate(dueDate)}</time>
      {isOverdue({ dueDate, status }) ? <OverdueBadge /> : null}
    </span>
  );
}
