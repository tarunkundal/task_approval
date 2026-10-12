'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ADMIN_NEW_TASK_PATH, adminTaskHref } from '../lib/paths';
import { TaskListSection } from './task-list-section';
import { TaskRowActions } from './task-row-actions';

/** Admin task list: search, status / priority / employee filters, assignee column, row menu. */
export function AdminTaskList() {
  return (
    <TaskListSection
      caption="All tasks"
      detailHref={adminTaskHref}
      showAssignee
      showSearch
      showEmployeeFilter
      renderActions={(task) => <TaskRowActions task={task} />}
      emptyDescription="Create a task and assign it to an employee to get started."
      emptyAction={
        <Button asChild>
          <Link href={ADMIN_NEW_TASK_PATH}>New task</Link>
        </Button>
      }
    />
  );
}
