'use client';

import { DueDate } from '@/components/common/due-date';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { LoadingButton } from '@/components/common/loading-button';
import { PriorityBadge } from '@/components/common/priority-badge';
import { TableSkeleton } from '@/components/common/table-skeleton';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTime } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { TaskStatus, type TaskDto } from '@workspace/shared';
import { Check, Inbox } from 'lucide-react';
import Link from 'next/link';
import { useTaskTransition } from '../hooks/use-task-mutations';
import { useTaskList } from '../hooks/use-task-queries';
import { ADMIN_TASKS_PATH, adminTaskHref } from '../lib/paths';
import { RejectTaskDialog } from './reject-task-dialog';

const TITLE = 'Approval queue';
const PAGE_SIZE = 10;
const TITLE_LINK_CLASS =
  'font-medium underline-offset-4 outline-none hover:underline focus-visible:rounded-sm focus-visible:ring-[3px] focus-visible:ring-ring/50';

/** The full queue in the task list (same filter and order as the dashboard queue). */
const FULL_QUEUE_HREF = `${ADMIN_TASKS_PATH}?status=${TaskStatus.PENDING_APPROVAL}&sort=updatedAt&order=asc`;

/**
 * Dashboard queue of tasks waiting for review (PENDING_APPROVAL), longest-waiting first, with
 * inline Approve and Reject. A task leaves the queue once the list refetches after the action.
 * A table from `lg` up; stacked cards below it, so Approve/Reject never sit off-screen on a phone.
 */
export function ApprovalQueue() {
  const list = useTaskList({
    status: TaskStatus.PENDING_APPROVAL,
    sort: 'updatedAt',
    order: 'asc',
    pageSize: PAGE_SIZE,
  });
  const approve = useTaskTransition();

  const reviewButtons = (task: TaskDto) => (
    <>
      <LoadingButton
        type="button"
        size="sm"
        loading={approve.isPending && approve.variables?.id === task.id}
        loadingText="Approving…"
        disabled={approve.isPending}
        onClick={() => approve.mutate({ id: task.id, action: 'approve' })}
      >
        <Check aria-hidden="true" />
        Approve
        <span className="sr-only"> &ldquo;{task.title}&rdquo;</span>
      </LoadingButton>
      <RejectTaskDialog task={task} size="sm" disabled={approve.isPending} />
    </>
  );

  let content;
  if (list.isPending) {
    content = <TableSkeleton rows={3} columns={6} label="Loading the approval queue" />;
  } else if (list.isError && !list.data) {
    content = (
      <ErrorState
        title="Could not load the approval queue"
        error={list.error}
        onRetry={() => void list.refetch()}
        retrying={list.isFetching}
      />
    );
  } else if (list.data.data.length === 0) {
    content = (
      <EmptyState
        icon={Inbox}
        title="No tasks are waiting for approval"
        description="Tasks appear here when an employee submits them for review."
      />
    );
  } else {
    const { data: tasks, meta } = list.data;
    content = (
      <div className="space-y-4">
        <div
          className={cn(list.isPlaceholderData && 'opacity-60')}
          aria-busy={list.isPlaceholderData || undefined}
        >
          <div className="hidden rounded-md border lg:block">
            <Table>
              <TableCaption className="sr-only">{TITLE}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Task</TableHead>
                  <TableHead scope="col">Assignee</TableHead>
                  <TableHead scope="col">Priority</TableHead>
                  <TableHead scope="col">Due date</TableHead>
                  {/* updatedAt: the submission time unless the task was edited afterwards. */}
                  <TableHead scope="col">Last updated</TableHead>
                  <TableHead scope="col" className="text-right">
                    Review
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => (
                  <TableRow key={task.id} data-testid="approval-row">
                    <TableCell className="min-w-[12rem] whitespace-normal">
                      <Link href={adminTaskHref(task.id)} className={TITLE_LINK_CLASS}>
                        {task.title}
                      </Link>
                    </TableCell>
                    <TableCell>{task.assignedTo.name}</TableCell>
                    <TableCell>
                      <PriorityBadge priority={task.priority} />
                    </TableCell>
                    <TableCell>
                      <DueDate dueDate={task.dueDate} status={task.status} />
                    </TableCell>
                    <TableCell>
                      <time dateTime={task.updatedAt}>{formatDateTime(task.updatedAt)}</time>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">{reviewButtons(task)}</div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul aria-label={TITLE} className="grid gap-3 lg:hidden">
            {tasks.map((task) => (
              <li
                key={task.id}
                data-testid="approval-card"
                className="space-y-3 rounded-md border p-4"
              >
                <Link
                  href={adminTaskHref(task.id)}
                  className={cn(TITLE_LINK_CLASS, 'block break-words')}
                >
                  {task.title}
                </Link>
                <div className="flex flex-wrap items-center gap-2">
                  <PriorityBadge priority={task.priority} />
                </div>
                <dl className="grid gap-1 text-sm">
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="text-muted-foreground">Assignee</dt>
                    <dd>{task.assignedTo.name}</dd>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2">
                    <dt className="text-muted-foreground">Due date</dt>
                    <dd>
                      <DueDate dueDate={task.dueDate} status={task.status} />
                    </dd>
                  </div>
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="text-muted-foreground">Last updated</dt>
                    <dd>
                      <time dateTime={task.updatedAt}>{formatDateTime(task.updatedAt)}</time>
                    </dd>
                  </div>
                </dl>
                <div className="flex flex-wrap gap-2">{reviewButtons(task)}</div>
              </li>
            ))}
          </ul>
        </div>
        {meta.total > tasks.length ? (
          <p className="text-sm text-muted-foreground">
            Showing {tasks.length} of {meta.total}.{' '}
            <Link href={FULL_QUEUE_HREF} className="font-medium text-foreground underline">
              View all tasks awaiting approval
            </Link>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <section aria-labelledby="approval-queue-heading" className="space-y-3">
      <h2 id="approval-queue-heading" className="text-lg font-semibold">
        {TITLE}
        {list.data ? (
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            ({list.data.meta.total} waiting)
          </span>
        ) : null}
      </h2>
      {list.isError && list.data ? (
        <ErrorState
          title="Could not refresh the approval queue"
          error={list.error}
          onRetry={() => void list.refetch()}
          retrying={list.isFetching}
        />
      ) : null}
      {content}
    </section>
  );
}
