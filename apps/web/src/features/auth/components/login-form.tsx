'use client';

import { LoadingButton } from '@/components/common/loading-button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { isApiError } from '@/lib/api/errors';
import { applyApiErrorToForm } from '@/lib/form-errors';
import { homeFor, safeReturnPath } from '@/lib/routes';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@workspace/shared';
import { AlertCircle } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { useLogin } from '../hooks/use-login';

type LoginFormInput = z.input<typeof loginSchema>;
type LoginFormOutput = z.output<typeof loginSchema>;

/** Errors shown in the form-level alert rather than as a toast. */
const INLINE_CODES = new Set(['INVALID_CREDENTIALS', 'RATE_LIMITED']);

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const loginMutation = useLogin();

  const form = useForm<LoginFormInput, unknown, LoginFormOutput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = form;

  const onSubmit = handleSubmit(async (values) => {
    try {
      const user = await loginMutation.mutateAsync(values);
      const next = safeReturnPath(searchParams.get('next'));
      router.replace(next ?? homeFor(user.role));
      router.refresh();
    } catch (error) {
      if (isApiError(error) && INLINE_CODES.has(error.code)) {
        setError('root.server', { type: 'server', message: error.message });
        return;
      }
      if (applyApiErrorToForm(error, setError, ['email', 'password'])) return;
      toast.error(isApiError(error) ? error.message : 'Could not sign in. Please try again.');
    }
  });

  const rootError = errors.root?.server?.message;
  const pending = loginMutation.isPending || loginMutation.isSuccess;

  return (
    <form
      id="login-form"
      onSubmit={onSubmit}
      noValidate
      aria-describedby={rootError ? 'login-error' : undefined}
    >
      <FieldGroup className="gap-5">
        {rootError ? (
          <Alert variant="destructive" id="login-error">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{rootError}</AlertDescription>
          </Alert>
        ) : null}

        <Field data-invalid={errors.email ? true : undefined}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'email-error' : undefined}
            {...register('email')}
          />
          <FieldError id="email-error" errors={[errors.email]} />
        </Field>

        <Field data-invalid={errors.password ? true : undefined}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? 'password-error' : undefined}
            {...register('password')}
          />
          <FieldError id="password-error" errors={[errors.password]} />
        </Field>

        <LoadingButton type="submit" className="w-full" loading={pending} loadingText="Signing in…">
          Sign in
        </LoadingButton>
      </FieldGroup>
    </form>
  );
}
