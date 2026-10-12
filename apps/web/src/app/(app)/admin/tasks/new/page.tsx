import type { Metadata } from 'next';
import { PageHeader } from '@/components/common/page-header';
import { CreateTaskView } from '@/features/tasks/components/create-task-view';

export const metadata: Metadata = { title: 'New task' };

export default function NewTaskPage() {
  return (
    <>
      <PageHeader
        title="New task"
        description="The task starts as Pending and appears in the assignee's task list."
      />
      <CreateTaskView />
    </>
  );
}
