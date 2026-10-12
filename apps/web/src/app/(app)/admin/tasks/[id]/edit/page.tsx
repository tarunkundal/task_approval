import type { Metadata } from 'next';
import { EditTaskView } from '@/features/tasks/components/edit-task-view';

export const metadata: Metadata = { title: 'Edit task' };

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditTaskView taskId={id} />;
}
