import type { Priority } from '@workspace/shared';
import { ArrowDown, ArrowRight, ArrowUp, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PRIORITY_LABEL } from '@/lib/labels';
import { cn } from '@/lib/utils';

/** Direction icon + text; contrast ≥ 4.5:1. */
const PRIORITY_STYLE: Record<Priority, { icon: LucideIcon; className: string }> = {
  LOW: { icon: ArrowDown, className: 'border-slate-300 bg-slate-100 text-slate-800' },
  MEDIUM: { icon: ArrowRight, className: 'border-sky-300 bg-sky-100 text-sky-900' },
  HIGH: { icon: ArrowUp, className: 'border-red-300 bg-red-100 text-red-900' },
};

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  const { icon: Icon, className: tone } = PRIORITY_STYLE[priority];
  return (
    <Badge variant="outline" className={cn(tone, className)} data-priority={priority}>
      <Icon aria-hidden="true" />
      {PRIORITY_LABEL[priority]}
      <span className="sr-only"> priority</span>
    </Badge>
  );
}
