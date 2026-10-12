'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { TableSkeleton } from '@/components/common/table-skeleton';
import { Button } from '@/components/ui/button';
import { useTaskList } from '../hooks/use-task-queries';
import { ADMIN_NEW_TASK_PATH, ADMIN_TASKS_PATH, adminTaskHref } from '../lib/paths';
import { TaskTable } from './task-table';

/** The five newest tasks with their assignee (admin dashboard). */
export function RecentTasks() {
  const list = useTaskList({ pageSize: 5 });

  let content;
  if (list.isPending) {
    content = <TableSkeleton rows={5} columns={5} label="Loading recent tasks" />;
  } else if (list.isError) {
    content = (
      <ErrorState
        title="Could not load recent tasks"
        error={list.error}
        onRetry={() => void list.refetch()}
        retrying={list.isFetching}
      />
    );
  } else if (list.data.data.length === 0) {
    content = (
      <EmptyState
        title="No tasks yet"
        description="Create a task and assign it to an employee to get started."
        action={
          <Button asChild>
            <Link href={ADMIN_NEW_TASK_PATH}>New task</Link>
          </Button>
        }
      />
    );
  } else {
    content = (
      <TaskTable
        tasks={list.data.data}
        caption="Recent tasks"
        detailHref={adminTaskHref}
        showAssignee
      />
    );
  }

  return (
    <section aria-labelledby="recent-tasks-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="recent-tasks-heading" className="text-lg font-semibold">
          Recent tasks
        </h2>
        <Button asChild variant="ghost" size="sm">
          <Link href={ADMIN_TASKS_PATH}>
            View all tasks
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
      {content}
    </section>
  );
}
