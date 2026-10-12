import { ClipboardCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { LoginForm } from '@/features/auth/components/login-form';
import { getCurrentUser } from '@/lib/api/server';
import { homeFor } from '@/lib/routes';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage() {
  // A valid session goes straight home. A stale cookie (401) just shows the form, so no loop.
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));

  return (
    <>
      <a
        href="#login-form"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:shadow-md focus:ring-[3px] focus:ring-ring/50"
      >
        Skip to sign-in form
      </a>
      <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="space-y-3 text-center">
            <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ClipboardCheck className="size-5" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              Task &amp; Approval Management
            </p>
            <CardTitle>
              <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
            </CardTitle>
            <CardDescription>Use your work email and password.</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-48 w-full" />}>
              <LoginForm />
            </Suspense>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
