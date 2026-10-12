'use client';

import { TaskStatus, type TaskDto } from '@workspace/shared';
import { Eye, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { adminTaskEditHref, adminTaskHref } from '../lib/paths';
import { DeleteTaskDialog } from './delete-task-dialog';

/** Admin row menu: View, Edit (not for COMPLETED tasks), Delete (with confirmation). */
export function TaskRowActions({ task }: { task: TaskDto }) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="size-8">
            <MoreHorizontal aria-hidden="true" />
            <span className="sr-only">Actions for &ldquo;{task.title}&rdquo;</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={adminTaskHref(task.id)}>
              <Eye aria-hidden="true" />
              View
            </Link>
          </DropdownMenuItem>
          {task.status !== TaskStatus.COMPLETED ? (
            <DropdownMenuItem asChild>
              <Link href={adminTaskEditHref(task.id)}>
                <Pencil aria-hidden="true" />
                Edit
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
            <Trash2 aria-hidden="true" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteTaskDialog task={task} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  );
}
