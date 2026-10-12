import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { TableSkeleton } from '@/components/common/table-skeleton';
import { Button } from '@/components/ui/button';
import { AdminTaskList } from '@/features/tasks/components/admin-task-list';
import { ADMIN_NEW_TASK_PATH } from '@/features/tasks/lib/paths';

export const metadata: Metadata = { title: 'Tasks' };

export default function AdminTasksPage() {
  return (
    <>
      <PageHeader
        title="Tasks"
        description="Every task in the team. Search, filter and open a task to review it."
        actions={
          <Button asChild>
            <Link href={ADMIN_NEW_TASK_PATH}>
              <Plus aria-hidden="true" />
              New task
            </Link>
          </Button>
        }
      />
      {/* The list reads its filters from the URL (useSearchParams). */}
      <Suspense fallback={<TableSkeleton label="Loading tasks" />}>
        <AdminTaskList />
      </Suspense>
    </>
  );
}
