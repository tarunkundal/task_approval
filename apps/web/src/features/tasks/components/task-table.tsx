'use client';

import type { TaskDto } from '@workspace/shared';
import Link from 'next/link';
import type { ReactNode } from 'react';
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

export function TaskTable({
  tasks,
  caption,
  detailHref,
  showAssignee = false,
  renderActions,
  stale = false,
}: TaskTableProps) {
  return (
    <div className={cn('rounded-md border', stale && 'opacity-60')} aria-busy={stale || undefined}>
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
                <Link
                  href={detailHref(task.id)}
                  className="font-medium underline-offset-4 outline-none hover:underline focus-visible:rounded-sm focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
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
  );
}
