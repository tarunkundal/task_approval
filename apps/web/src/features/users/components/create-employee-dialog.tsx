'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createUserSchema } from '@workspace/shared';
import { AlertCircle, UserPlus } from 'lucide-react';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { LoadingButton } from '@/components/common/loading-button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { apiErrorMessage, applyApiErrorToForm } from '@/lib/form-errors';
import { useCreateEmployee } from '../hooks/use-create-employee';

type EmployeeInput = z.input<typeof createUserSchema>;
type EmployeeOutput = z.output<typeof createUserSchema>;

const FIELDS = ['name', 'email', 'password'] as const;

/** "New employee" button + dialog. Validated with the shared `createUserSchema`. */
export function CreateEmployeeDialog() {
  const [open, setOpen] = useState(false);
  const createMutation = useCreateEmployee();
  const ids = { name: useId(), email: useId(), password: useId() };

  const form = useForm<EmployeeInput, unknown, EmployeeOutput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: '', email: '', password: '' },
  });
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = form;
  const pending = createMutation.isPending;

  const changeOpen = (next: boolean) => {
    if (pending) return;
    setOpen(next);
    if (!next) reset();
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createMutation.mutateAsync(values);
      setOpen(false);
      reset();
    } catch (error) {
      // EMAIL_TAKEN → email field; validation details → their fields.
      if (applyApiErrorToForm(error, setError, FIELDS)) return;
      toast.error(apiErrorMessage(error, 'Could not create the employee.'));
    }
  });

  const rootError = errors.root?.server?.message;
  const errorId = (field: (typeof FIELDS)[number]) => `${ids[field]}-error`;

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button type="button">
          <UserPlus aria-hidden="true" />
          New employee
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>New employee</DialogTitle>
            <DialogDescription>
              Creates an Employee account. Share the password with them securely.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="gap-5">
            {rootError ? (
              <Alert variant="destructive">
                <AlertCircle aria-hidden="true" />
                <AlertDescription>{rootError}</AlertDescription>
              </Alert>
            ) : null}

            <Field data-invalid={errors.name ? true : undefined}>
              <FieldLabel htmlFor={ids.name}>Name</FieldLabel>
              <Input
                id={ids.name}
                autoComplete="off"
                maxLength={100}
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? errorId('name') : undefined}
                {...register('name')}
              />
              <FieldError id={errorId('name')} errors={[errors.name]} />
            </Field>

            <Field data-invalid={errors.email ? true : undefined}>
              <FieldLabel htmlFor={ids.email}>Email</FieldLabel>
              <Input
                id={ids.email}
                type="email"
                inputMode="email"
                autoComplete="off"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? errorId('email') : undefined}
                {...register('email')}
              />
              <FieldError id={errorId('email')} errors={[errors.email]} />
            </Field>

            <Field data-invalid={errors.password ? true : undefined}>
              <FieldLabel htmlFor={ids.password}>Password</FieldLabel>
              <Input
                id={ids.password}
                type="password"
                autoComplete="new-password"
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={[
                  `${ids.password}-hint`,
                  errors.password ? errorId('password') : null,
                ]
                  .filter(Boolean)
                  .join(' ')}
                {...register('password')}
              />
              <FieldDescription id={`${ids.password}-hint`}>
                At least 8 characters.
              </FieldDescription>
              <FieldError id={errorId('password')} errors={[errors.password]} />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <LoadingButton type="submit" loading={pending} loadingText="Creating…">
              Create employee
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
