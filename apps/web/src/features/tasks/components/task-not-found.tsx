import { SearchX } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

/** Shown for 404 and malformed ids (400): the task is missing, deleted or not accessible. */
export function TaskNotFound({ backHref, backLabel }: { backHref: string; backLabel: string }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed p-10 text-center">
      <SearchX className="size-10 text-muted-foreground" aria-hidden="true" />
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Task not found</h1>
        <p className="text-muted-foreground">
          It may have been deleted, or you don&apos;t have access to it.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link href={backHref}>{backLabel}</Link>
      </Button>
    </div>
  );
}
