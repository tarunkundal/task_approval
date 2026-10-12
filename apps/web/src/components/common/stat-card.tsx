import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  /** Optional link (e.g. the list filtered to this status). */
  href?: string;
  description?: ReactNode;
  /** Classes for the icon chip (colour accent; the label carries the meaning). */
  iconClassName?: string;
}

/** One dashboard count. When `href` is set the whole card is a single link. */
export function StatCard({
  label,
  value,
  icon: Icon,
  href,
  description,
  iconClassName,
}: StatCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground',
            iconClassName,
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <p className="text-3xl font-semibold tabular-nums" data-testid={`stat-${label}`}>
        {value}
      </p>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
    </>
  );

  return (
    <Card className="gap-2 px-5 py-4 transition-colors has-[a:hover]:bg-muted/40">
      {href ? (
        <Link
          href={href}
          className="flex flex-col gap-2 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {body}
        </Link>
      ) : (
        <div className="flex flex-col gap-2">{body}</div>
      )}
    </Card>
  );
}
