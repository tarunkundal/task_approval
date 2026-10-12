'use client';

import { employeeTaskHref } from '../lib/paths';
import { TaskListSection } from './task-list-section';

/**
 * The employee's assigned tasks (the API scopes `GET /tasks` to the caller): status, priority
 * and sort filters in the URL, overdue badges, no assignee column, no row actions.
 */
export function EmployeeTaskList() {
  return (
    <TaskListSection
      caption="Tasks assigned to you"
      detailHref={employeeTaskHref}
      emptyDescription="Tasks an admin assigns to you will appear here."
    />
  );
}
