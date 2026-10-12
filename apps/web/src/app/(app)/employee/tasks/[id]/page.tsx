import type { Metadata } from 'next';
import { TaskDetailView } from '@/features/tasks/components/task-detail-view';
import { EMPLOYEE_HOME_PATH } from '@/features/tasks/lib/paths';

export const metadata: Metadata = { title: 'Task details' };

export default async function EmployeeTaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TaskDetailView taskId={id} backHref={EMPLOYEE_HOME_PATH} backLabel="Back to my tasks" />;
}
