'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { makeQueryClient } from '@/lib/query-client';

/** Client-side providers for the whole app: TanStack Query, tooltips and the toast region. */
export function Providers({ children }: { children: ReactNode }) {
  // One QueryClient per browser session (not shared between server requests).
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{children}</TooltipProvider>
      <Toaster position="top-right" closeButton />
    </QueryClientProvider>
  );
}
