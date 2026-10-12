import { Skeleton } from '@/components/ui/skeleton';

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  label?: string;
}

/** Table-shaped loading placeholder, announced once via `role="status"`. */
export function TableSkeleton({ rows = 5, columns = 5, label = 'Loading' }: TableSkeletonProps) {
  return (
    <div role="status" aria-busy="true" className="space-y-3 rounded-md border p-4">
      <span className="sr-only">{label}…</span>
      <div className="flex gap-4">
        {Array.from({ length: columns }, (_, index) => (
          <Skeleton key={index} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex gap-4">
          {Array.from({ length: columns }, (_, index) => (
            <Skeleton key={index} className="h-8 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
