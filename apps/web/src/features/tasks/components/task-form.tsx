'use client';

import { ErrorState } from '@/components/common/error-state';
import { LoadingButton } from '@/components/common/loading-button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useEmployees } from '@/features/users/hooks/use-employees';
import { applyApiErrorToForm } from '@/lib/form-errors';
import { PRIORITY_LABEL } from '@/lib/labels';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createTaskSchema,
  PRIORITIES,
  type CreateTaskInput,
  type Priority,
  type TaskDto,
  type UpdateTaskInput,
} from '@workspace/shared';
import { AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useId } from 'react';
import { Controller, useForm, useWatch, type Control } from 'react-hook-form';
import type { z } from 'zod';

type TaskFormInput = z.input<typeof createTaskSchema>;
type TaskFormOutput = z.output<typeof createTaskSchema>;
type TaskField = keyof TaskFormOutput;

export const TASK_FORM_FIELDS = [
  'title',
  'description',
  'priority',
  'dueDate',
  'assignedToId',
] as const satisfies readonly TaskField[];

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 5000;

type TaskFormProps = {
  /** Where Cancel goes. */
  cancelHref: string;
  pending: boolean;
  /**
   * Called with the parsed values. Reject the promise (e.g. rethrow the ApiError) so the form
   * maps field errors inline; the caller toasts anything the form can't show.
   */
} & (
  | { mode: 'create'; task?: undefined; onSubmit: (values: CreateTaskInput) => Promise<unknown> }
  | { mode: 'edit'; task: TaskDto; onSubmit: (patch: UpdateTaskInput) => Promise<unknown> }
);

function defaultsFor(task?: TaskDto): TaskFormInput {
  if (!task) {
    return { title: '', description: '', priority: 'MEDIUM', dueDate: '', assignedToId: '' };
  }
  return {
    title: task.title,
    description: task.description,
    priority: task.priority,
    dueDate: task.dueDate,
    assignedToId: task.assignedTo.id,
  };
}

/**
 * Create / edit form, validated with the shared `createTaskSchema` (the same rules the API
 * applies). Edit sends only the changed fields, so the strict PATCH body always has ≥ 1 key.
 */
export function TaskForm(props: TaskFormProps) {
  const { mode, task, cancelHref, pending } = props;
  const ids = {
    title: useId(),
    description: useId(),
    priority: useId(),
    dueDate: useId(),
    assignee: useId(),
  };

  const form = useForm<TaskFormInput, unknown, TaskFormOutput>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: defaultsFor(task),
  });
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isDirty, dirtyFields },
  } = form;
  const description = useWatch({ control, name: 'description' }) ?? '';

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (props.mode === 'create') {
        await props.onSubmit(values);
      } else {
        const patch: UpdateTaskInput = {};
        for (const field of TASK_FORM_FIELDS) {
          if (dirtyFields[field]) (patch as Record<TaskField, unknown>)[field] = values[field];
        }
        await props.onSubmit(patch);
      }
    } catch (error) {
      applyApiErrorToForm(error, setError, TASK_FORM_FIELDS);
    }
  });

  const rootError = errors.root?.server?.message;
  const describe = (...items: (string | false | undefined)[]) =>
    items.filter(Boolean).join(' ') || undefined;

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-2xl">
      <FieldGroup className="gap-6">
        {rootError ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{rootError}</AlertDescription>
          </Alert>
        ) : null}

        <Field data-invalid={errors.title ? true : undefined}>
          <FieldLabel htmlFor={ids.title}>Title</FieldLabel>
          <Input
            id={ids.title}
            maxLength={TITLE_MAX}
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={describe(errors.title && `${ids.title}-error`)}
            {...register('title')}
          />
          <FieldError id={`${ids.title}-error`} errors={[errors.title]} />
        </Field>

        <Field data-invalid={errors.description ? true : undefined}>
          <FieldLabel htmlFor={ids.description}>
            Description <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Textarea
            id={ids.description}
            rows={5}
            maxLength={DESCRIPTION_MAX}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={describe(
              `${ids.description}-count`,
              errors.description && `${ids.description}-error`,
            )}
            {...register('description')}
          />
          <FieldDescription id={`${ids.description}-count`}>
            {description.length}/{DESCRIPTION_MAX} characters
          </FieldDescription>
          <FieldError id={`${ids.description}-error`} errors={[errors.description]} />
        </Field>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field data-invalid={errors.priority ? true : undefined}>
            <FieldLabel htmlFor={ids.priority}>Priority</FieldLabel>
            <Controller
              control={control}
              name="priority"
              render={({ field }) => (
                <Select
                  name={field.name}
                  value={field.value}
                  onValueChange={(value) => field.onChange(value as Priority)}
                >
                  <SelectTrigger
                    id={ids.priority}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    className="w-full"
                    aria-invalid={errors.priority ? true : undefined}
                    aria-describedby={describe(errors.priority && `${ids.priority}-error`)}
                  >
                    <SelectValue placeholder="Select a priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((priority) => (
                      <SelectItem key={priority} value={priority}>
                        {PRIORITY_LABEL[priority]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError
              id={`${ids.priority}-error`}
              errors={[fieldMessage(errors.priority, 'Select a priority')]}
            />
          </Field>

          <Field data-invalid={errors.dueDate ? true : undefined}>
            <FieldLabel htmlFor={ids.dueDate}>Due date</FieldLabel>
            {/* The value is already YYYY-MM-DD; it is sent as-is, never through new Date(). */}
            <Input
              id={ids.dueDate}
              type="date"
              aria-invalid={errors.dueDate ? true : undefined}
              aria-describedby={describe(errors.dueDate && `${ids.dueDate}-error`)}
              {...register('dueDate')}
            />
            <FieldError
              id={`${ids.dueDate}-error`}
              errors={[fieldMessage(errors.dueDate, 'Enter a valid due date')]}
            />
          </Field>
        </div>

        <AssigneeField
          id={ids.assignee}
          control={control}
          error={fieldMessage(errors.assignedToId, 'Select an employee')?.message}
        />

        <div className="flex flex-wrap gap-2">
          <LoadingButton
            type="submit"
            loading={pending}
            loadingText={mode === 'create' ? 'Creating…' : 'Saving…'}
            disabled={mode === 'edit' && !isDirty}
          >
            {mode === 'create' ? 'Create task' : 'Save changes'}
          </LoadingButton>
          <Button asChild variant="outline">
            <Link href={cancelHref}>Cancel</Link>
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

/**
 * Server messages are shown as sent. The shared schema's own messages for these fields are
 * generic ("Invalid ISO date", "Invalid cuid", enum lists), so the form words them for people.
 */
function fieldMessage(
  error: { type?: string; message?: string } | undefined,
  friendly: string,
): { message: string } | undefined {
  if (!error) return undefined;
  return { message: error.type === 'server' && error.message ? error.message : friendly };
}

function AssigneeField({
  id,
  control,
  error: message,
}: {
  id: string;
  control: Control<TaskFormInput, unknown, TaskFormOutput>;
  error: string | undefined;
}) {
  const employees = useEmployees();

  return (
    <Field data-invalid={message ? true : undefined}>
      <FieldLabel htmlFor={id}>Assignee</FieldLabel>
      {employees.isPending ? (
        <Skeleton className="h-9 w-full" aria-label="Loading employees" />
      ) : employees.isError ? (
        <ErrorState
          title="Could not load employees"
          error={employees.error}
          onRetry={() => void employees.refetch()}
          retrying={employees.isFetching}
        />
      ) : employees.data.length === 0 ? (
        <p className="text-sm text-muted-foreground" id={`${id}-empty`}>
          There are no employees yet.{' '}
          <Link href="/admin/employees" className="font-medium text-foreground underline">
            Create an employee first
          </Link>
          .
        </p>
      ) : (
        <Controller
          control={control}
          name="assignedToId"
          render={({ field }) => (
            <Select name={field.name} value={field.value} onValueChange={field.onChange}>
              <SelectTrigger
                id={id}
                ref={field.ref}
                onBlur={field.onBlur}
                className="w-full"
                aria-invalid={message ? true : undefined}
                aria-describedby={message ? `${id}-error` : undefined}
              >
                <SelectValue placeholder="Select an employee" />
              </SelectTrigger>
              <SelectContent>
                {employees.data.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.name} ({employee.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      )}
      <FieldError id={`${id}-error`} errors={[message ? { message } : undefined]} />
    </Field>
  );
}
