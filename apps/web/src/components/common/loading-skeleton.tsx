import { Skeleton } from '@/components/ui/skeleton';

interface LoadingSkeletonProps {
  /** Number of placeholder rows. */
  rows?: number;
  /** Accessible description of what is loading. */
  label?: string;
}

/** Generic list/card loading placeholder; announced once to screen readers via `aria-busy`. */
export function LoadingSkeleton({ rows = 3, label = 'Loading' }: LoadingSkeletonProps) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}
