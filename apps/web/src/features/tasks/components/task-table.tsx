'use client';

import { DueDate } from '@/components/common/due-date';
import { PriorityBadge } from '@/components/common/priority-badge';
import { StatusBadge } from '@/components/common/status-badge';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { TaskDto } from '@workspace/shared';
import Link from 'next/link';
import type { ReactNode } from 'react';

interface TaskTableProps {
  tasks: TaskDto[];
  /** Accessible table name (rendered as a visually hidden caption). */
  caption: string;
  detailHref: (id: string) => string;
  showAssignee?: boolean;
  /** Per-row controls (e.g. an actions menu). */
  renderActions?: (task: TaskDto) => ReactNode;
  /** Dims the rows while a new page / filter is loading (previous data kept). */
  stale?: boolean;
}

const TITLE_LINK_CLASS =
  'font-medium underline-offset-4 outline-none hover:underline focus-visible:rounded-sm focus-visible:ring-[3px] focus-visible:ring-ring/50';

/**
 * Task list as a table from `lg` up, and as stacked cards below it, so every column (priority,
 * status, due date, row actions) is visible on a phone without scrolling sideways.
 */
export function TaskTable({
  tasks,
  caption,
  detailHref,
  showAssignee = false,
  renderActions,
  stale = false,
}: TaskTableProps) {
  return (
    <div className={cn(stale && 'opacity-60')} aria-busy={stale || undefined}>
      <div className="hidden rounded-md border lg:block">
        <Table>
          <TableCaption className="sr-only">{caption}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Task</TableHead>
              {showAssignee ? <TableHead scope="col">Assignee</TableHead> : null}
              <TableHead scope="col">Priority</TableHead>
              <TableHead scope="col">Status</TableHead>
              <TableHead scope="col">Due date</TableHead>
              {renderActions ? (
                <TableHead scope="col" className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((task) => (
              <TableRow key={task.id} data-testid="task-row">
                <TableCell className="min-w-[14rem] whitespace-normal">
                  <Link href={detailHref(task.id)} className={TITLE_LINK_CLASS}>
                    {task.title}
                  </Link>
                </TableCell>
                {showAssignee ? <TableCell>{task.assignedTo.name}</TableCell> : null}
                <TableCell>
                  <PriorityBadge priority={task.priority} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={task.status} />
                </TableCell>
                <TableCell>
                  <DueDate dueDate={task.dueDate} status={task.status} />
                </TableCell>
                {renderActions ? (
                  <TableCell className="text-right">{renderActions(task)}</TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul aria-label={caption} className="grid gap-3 lg:hidden">
        {tasks.map((task) => (
          <li key={task.id} data-testid="task-card" className="space-y-3 rounded-md border p-4">
            <div className="flex items-start justify-between gap-3">
              <Link
                href={detailHref(task.id)}
                className={cn(TITLE_LINK_CLASS, 'min-w-0 break-words')}
              >
                {task.title}
              </Link>
              {renderActions ? <div className="-my-1 shrink-0">{renderActions(task)}</div> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <PriorityBadge priority={task.priority} />
              <StatusBadge status={task.status} />
            </div>
            <dl className="grid gap-1 text-sm">
              {showAssignee ? (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-muted-foreground">Assignee</dt>
                  <dd>{task.assignedTo.name}</dd>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-x-2">
                <dt className="text-muted-foreground">Due date</dt>
                <dd>
                  <DueDate dueDate={task.dueDate} status={task.status} />
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
