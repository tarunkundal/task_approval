import { TaskStatus } from '@workspace/shared';
import { Button } from '@/components/ui/button';

// Phase 2 placeholder. Real login and dashboards arrive in Phase 5.
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Task &amp; Approval Management</h1>
        <p className="text-muted-foreground">
          Project foundation is in place. Login and dashboards are coming next.
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        Workflow statuses: {Object.values(TaskStatus).join(' → ')}
      </p>
      <div>
        <Button disabled>Sign in (coming soon)</Button>
      </div>
    </main>
  );
}
