import type { Metadata } from 'next';
import { TaskDetailView } from '@/features/tasks/components/task-detail-view';
import { ADMIN_TASKS_PATH } from '@/features/tasks/lib/paths';

export const metadata: Metadata = { title: 'Task details' };

export default async function AdminTaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TaskDetailView taskId={id} backHref={ADMIN_TASKS_PATH} backLabel="Back to tasks" />;
}
