import type { TaskStatus } from '@workspace/shared';
import { CircleCheck, CirclePlay, Clock, Hourglass, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { STATUS_LABEL } from '@/lib/labels';
import { cn } from '@/lib/utils';

/** Icon + text (never colour alone); every pair is ≥ 4.5:1 (dark-900 text on a -100 fill). */
const STATUS_STYLE: Record<TaskStatus, { icon: LucideIcon; className: string }> = {
  PENDING: { icon: Clock, className: 'border-amber-300 bg-amber-100 text-amber-900' },
  IN_PROGRESS: { icon: CirclePlay, className: 'border-blue-300 bg-blue-100 text-blue-900' },
  PENDING_APPROVAL: {
    icon: Hourglass,
    className: 'border-violet-300 bg-violet-100 text-violet-900',
  },
  COMPLETED: { icon: CircleCheck, className: 'border-emerald-300 bg-emerald-100 text-emerald-900' },
};

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  const { icon: Icon, className: tone } = STATUS_STYLE[status];
  return (
    <Badge variant="outline" className={cn(tone, className)} data-status={status}>
      <Icon aria-hidden="true" />
      {STATUS_LABEL[status]}
    </Badge>
  );
}
