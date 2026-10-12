'use client';

import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { PaginationControls } from '@/components/common/pagination-controls';
import { TableSkeleton } from '@/components/common/table-skeleton';
import { Button } from '@/components/ui/button';
import type { TaskDto } from '@workspace/shared';
import { ListX } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTaskListParams } from '../hooks/use-task-list-params';
import { useTaskList } from '../hooks/use-task-queries';
import { TaskFilters } from './task-filters';
import { TaskTable } from './task-table';

interface TaskListSectionProps {
  caption: string;
  detailHref: (id: string) => string;
  showAssignee?: boolean;
  showSearch?: boolean;
  showEmployeeFilter?: boolean;
  renderActions?: (task: TaskDto) => ReactNode;
  /** Shown in the "no tasks yet" empty state (e.g. a "New task" button). */
  emptyAction?: ReactNode;
  emptyDescription?: string;
}

/**
 * Filters + table + pagination, all driven by the URL query string (must render inside
 * `<Suspense>` because it reads `useSearchParams`).
 */
export function TaskListSection({
  caption,
  detailHref,
  showAssignee = false,
  showSearch = false,
  showEmployeeFilter = false,
  renderActions,
  emptyAction,
  emptyDescription = 'Tasks will appear here once they are created.',
}: TaskListSectionProps) {
  // Filters without a visible control are ignored (the API scope makes them harmless anyway).
  const ignore = [
    ...(showSearch ? [] : (['q'] as const)),
    ...(showEmployeeFilter ? [] : (['assignedToId'] as const)),
  ];
  const { params, setParams, setPage, clearFilters, filtered } = useTaskListParams({ ignore });
  const list = useTaskList(params);

  let content: ReactNode;
  if (list.isPending) {
    content = <TableSkeleton columns={showAssignee ? 5 : 4} label="Loading tasks" />;
  } else if (list.isError && !list.data) {
    content = (
      <ErrorState
        title="Could not load tasks"
        error={list.error}
        onRetry={() => void list.refetch()}
        retrying={list.isFetching}
      />
    );
  } else {
    const { data: tasks, meta } = list.data;
    if (tasks.length === 0) {
      content =
        meta.total > 0 ? (
          <EmptyState
            title="This page is empty"
            description={`There are ${meta.total} matching tasks on earlier pages.`}
            action={
              <Button type="button" variant="outline" onClick={() => setPage(1)}>
                Go to the first page
              </Button>
            }
          />
        ) : filtered ? (
          <EmptyState
            icon={ListX}
            title="No tasks match these filters"
            description={
              showSearch
                ? 'Try a different search or clear the filters.'
                : 'Try different filters or clear them.'
            }
            action={
              <Button type="button" variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState title="No tasks yet" description={emptyDescription} action={emptyAction} />
        );
    } else {
      content = (
        <div className="space-y-4">
          <TaskTable
            tasks={tasks}
            caption={caption}
            detailHref={detailHref}
            showAssignee={showAssignee}
            renderActions={renderActions}
            stale={list.isPlaceholderData}
          />
          <PaginationControls
            page={meta.page}
            totalPages={meta.totalPages}
            total={meta.total}
            itemLabel={meta.total === 1 ? 'task' : 'tasks'}
            onPageChange={setPage}
            disabled={list.isPlaceholderData}
          />
        </div>
      );
    }
  }

  return (
    <section aria-label={caption} className="space-y-4">
      <TaskFilters
        params={params}
        onChange={setParams}
        onClear={clearFilters}
        filtered={filtered}
        showSearch={showSearch}
        showEmployeeFilter={showEmployeeFilter}
      />
      {list.isError && list.data ? (
        <ErrorState
          title="Could not refresh tasks"
          error={list.error}
          onRetry={() => void list.refetch()}
          retrying={list.isFetching}
        />
      ) : null}
      {content}
    </section>
  );
}
