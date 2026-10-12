'use client';

import { ErrorState } from '@/components/common/error-state';
import { StatCard } from '@/components/common/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { STATUS_LABEL } from '@/lib/labels';
import { TaskStatus } from '@workspace/shared';
import { CircleCheck, CirclePlay, Clock, Hourglass, ListChecks, TriangleAlert } from 'lucide-react';
import { useDashboardSummary } from '../hooks/use-dashboard-summary';

// Six columns only on wide screens: next to the sidebar at 1280 px the labels would wrap and the
// counts would sit at different heights.
const GRID = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6';

/**
 * Dashboard counts from `GET /dashboard/summary` (server-computed over the caller's scope,
 * independent of pagination). Status cards link to the list filtered by that status.
 */
export function SummaryCards({
  listHref,
  scope = 'team',
}: {
  listHref: string;
  /** `own`: an employee's counts (the API scopes them to the caller's assigned tasks). */
  scope?: 'team' | 'own';
}) {
  const summary = useDashboardSummary();
  const own = scope === 'own';

  if (summary.isPending) {
    return (
      <div role="status" aria-busy="true" className={GRID}>
        <span className="sr-only">Loading task counts…</span>
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-[6.5rem] rounded-xl" />
        ))}
      </div>
    );
  }

  if (summary.isError) {
    return (
      <ErrorState
        title="Could not load task counts"
        error={summary.error}
        onRetry={() => void summary.refetch()}
        retrying={summary.isFetching}
      />
    );
  }

  const { total, byStatus, overdue } = summary.data;
  const statusHref = (status: TaskStatus) => `${listHref}?status=${status}`;

  return (
    <section aria-labelledby="summary-heading" className="space-y-3">
      <h2 id="summary-heading" className="sr-only">
        {own ? 'Counts for tasks assigned to you' : 'Task counts'}
      </h2>
      <div className={GRID}>
        <StatCard
          label="Total tasks"
          value={total}
          icon={ListChecks}
          href={listHref}
          description={own ? 'Assigned to you' : undefined}
        />
        <StatCard
          label={STATUS_LABEL.PENDING}
          value={byStatus.PENDING}
          icon={Clock}
          href={statusHref(TaskStatus.PENDING)}
          iconClassName="bg-amber-100 text-amber-900"
        />
        <StatCard
          label={STATUS_LABEL.IN_PROGRESS}
          value={byStatus.IN_PROGRESS}
          icon={CirclePlay}
          href={statusHref(TaskStatus.IN_PROGRESS)}
          iconClassName="bg-blue-100 text-blue-900"
        />
        <StatCard
          label={STATUS_LABEL.PENDING_APPROVAL}
          value={byStatus.PENDING_APPROVAL}
          icon={Hourglass}
          href={statusHref(TaskStatus.PENDING_APPROVAL)}
          iconClassName="bg-violet-100 text-violet-900"
        />
        <StatCard
          label={STATUS_LABEL.COMPLETED}
          value={byStatus.COMPLETED}
          icon={CircleCheck}
          href={statusHref(TaskStatus.COMPLETED)}
          iconClassName="bg-emerald-100 text-emerald-900"
        />
        <StatCard
          label="Overdue"
          value={overdue}
          icon={TriangleAlert}
          description={
            own
              ? 'Your tasks due before today (UTC) and not completed'
              : 'Due before today (UTC) and not completed'
          }
          iconClassName="bg-red-100 text-red-900"
        />
      </div>
    </section>
  );
}
