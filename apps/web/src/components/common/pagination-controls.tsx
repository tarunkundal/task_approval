'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Noun for the total, e.g. "tasks". */
  itemLabel?: string;
  disabled?: boolean;
}

/** Prev / Next with "Page X of Y" (client-side navigation, no full reloads). */
export function PaginationControls({
  page,
  totalPages,
  total,
  onPageChange,
  itemLabel = 'items',
  disabled = false,
}: PaginationControlsProps) {
  const pages = Math.max(totalPages, 1);
  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col items-center justify-between gap-3 sm:flex-row"
    >
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Page {Math.min(page, pages)} of {pages} · {total} {itemLabel}
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={disabled || page <= 1}
        >
          <ChevronLeft aria-hidden="true" />
          Previous
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={disabled || page >= pages}
        >
          Next
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
