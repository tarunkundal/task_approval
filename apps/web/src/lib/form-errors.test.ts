import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { apiErrorMessage, applyApiErrorToForm } from './form-errors';

type Form = { name: string; email: string; assignedToId: string; title: string };

function run(error: unknown, fields: (keyof Form)[]) {
  const setError = vi.fn();
  const handled = applyApiErrorToForm<Form>(error, setError, fields);
  return { handled, setError };
}

describe('applyApiErrorToForm', () => {
  it('maps VALIDATION_ERROR details to fields and unknown paths to root', () => {
    const error = new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed', [
      { path: 'title', message: 'Title is required' },
      { path: 'title', message: 'second message ignored' },
      { path: 'status', message: 'Unrecognized key: "status"' },
    ]);
    const { handled, setError } = run(error, ['title']);
    expect(handled).toBe(true);
    expect(setError).toHaveBeenCalledWith('title', {
      type: 'server',
      message: 'Title is required',
    });
    expect(setError).toHaveBeenCalledWith('root.server', {
      type: 'server',
      message: 'Unrecognized key: "status"',
    });
    expect(setError).toHaveBeenCalledTimes(2);
  });

  it('maps EMAIL_TAKEN to the email field', () => {
    const error = new ApiError(409, 'EMAIL_TAKEN', 'A user with this email already exists');
    const { handled, setError } = run(error, ['name', 'email']);
    expect(handled).toBe(true);
    expect(setError).toHaveBeenCalledWith('email', {
      type: 'server',
      message: 'A user with this email already exists',
    });
  });

  it('maps INVALID_ASSIGNEE to the assignedToId field', () => {
    const error = new ApiError(400, 'INVALID_ASSIGNEE', 'Assignee must be an employee');
    const { handled, setError } = run(error, ['title', 'assignedToId']);
    expect(handled).toBe(true);
    expect(setError).toHaveBeenCalledWith('assignedToId', {
      type: 'server',
      message: 'Assignee must be an employee',
    });
  });

  it('leaves other errors to the caller (toast)', () => {
    expect(run(new ApiError(409, 'TASK_COMPLETED', 'x'), ['title']).handled).toBe(false);
    expect(run(new ApiError(409, 'EMAIL_TAKEN', 'x'), ['title']).handled).toBe(false);
    expect(run(new ApiError(0, 'NETWORK_ERROR', 'x'), ['title']).handled).toBe(false);
    expect(run(new Error('boom'), ['title']).handled).toBe(false);
  });
});

describe('apiErrorMessage', () => {
  it('uses the API message or the fallback', () => {
    expect(apiErrorMessage(new ApiError(409, 'TASK_COMPLETED', 'Task is completed'))).toBe(
      'Task is completed',
    );
    expect(apiErrorMessage(new Error('internal detail'), 'Could not save')).toBe('Could not save');
  });
});
