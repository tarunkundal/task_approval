import { PageHeader } from '@/components/common/page-header';
import { TableSkeleton } from '@/components/common/table-skeleton';
import { SummaryCards } from '@/features/dashboard/components/summary-cards';
import { EmployeeTaskList } from '@/features/tasks/components/employee-task-list';
import { EMPLOYEE_HOME_PATH } from '@/features/tasks/lib/paths';
import type { Metadata } from 'next';
import { Suspense } from 'react';

export const metadata: Metadata = { title: 'My tasks' };

export default function EmployeeDashboardPage() {
  return (
    <>
      <PageHeader
        title="My tasks"
        description="Tasks assigned to you. Open a task to start it, comment or submit it for approval."
      />
      <SummaryCards listHref={EMPLOYEE_HOME_PATH} scope="own" />
      <section aria-labelledby="assigned-tasks-heading" className="space-y-4">
        <h2 id="assigned-tasks-heading" className="text-lg font-semibold">
          Assigned tasks
        </h2>
        {/* The list reads its filters from the URL (useSearchParams). */}
        <Suspense fallback={<TableSkeleton columns={4} label="Loading tasks" />}>
          <EmployeeTaskList />
        </Suspense>
      </section>
    </>
  );
}
