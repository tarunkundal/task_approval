import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { SummaryCards } from '@/features/dashboard/components/summary-cards';
import { ApprovalQueue } from '@/features/tasks/components/approval-queue';
import { RecentTasks } from '@/features/tasks/components/recent-tasks';
import { ADMIN_NEW_TASK_PATH, ADMIN_TASKS_PATH } from '@/features/tasks/lib/paths';
import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Admin dashboard' };

export default function AdminDashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Task counts across the team, work waiting for your review and the latest tasks."
        actions={
          <Button asChild>
            <Link href={ADMIN_NEW_TASK_PATH}>
              <Plus aria-hidden="true" />
              New task
            </Link>
          </Button>
        }
      />
      <SummaryCards listHref={ADMIN_TASKS_PATH} />
      <ApprovalQueue />
      <RecentTasks />
    </>
  );
}
