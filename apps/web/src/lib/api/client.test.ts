import { shouldRetry } from '@/lib/query-client';
import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from './client';
import { ApiError, isApiError } from './errors';

type Call = { url: string; init: RequestInit };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function setup(response: Response | (() => Promise<Response>)) {
  const calls: Call[] = [];
  const onUnauthenticated = vi.fn();
  const client = createApiClient({
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return typeof response === 'function' ? response() : response;
    },
    onUnauthenticated,
  });
  return { client, calls, onUnauthenticated };
}

async function catchError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (isApiError(error)) return error;
    throw error;
  }
  throw new Error('expected the call to reject');
}

describe('createApiClient', () => {
  it('calls the relative /api/v1 path on the same origin', async () => {
    const { client, calls } = setup(jsonResponse(200, { id: '1' }));
    await expect(client.get('/auth/me')).resolves.toEqual({ id: '1' });

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe('/api/v1/auth/me');
    expect(call?.init.method).toBe('GET');
    expect(call?.init.credentials).toBe('same-origin');
    expect(call?.init.cache).toBe('no-store');
    expect(call?.init.body).toBeUndefined();
    const headers = call?.init.headers as Record<string, string>;
    expect(headers.Accept).toBe('application/json');
    expect(headers['Content-Type']).toBeUndefined();
  });

  it('sends JSON with a Content-Type header only when a body is passed', async () => {
    const { client, calls } = setup(() => Promise.resolve(jsonResponse(201, { ok: true })));
    await client.post('/tasks/abc/reject', { reason: 'Needs more detail' });
    await client.post('/tasks/abc/start');

    const [withBody, withoutBody] = calls;
    expect(withBody?.init.method).toBe('POST');
    expect(withBody?.init.body).toBe(JSON.stringify({ reason: 'Needs more detail' }));
    expect((withBody?.init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
    expect(withoutBody?.init.body).toBeUndefined();
    expect((withoutBody?.init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('uses PATCH and DELETE methods', async () => {
    const { client, calls } = setup(() => Promise.resolve(new Response(null, { status: 204 })));
    await client.patch('/tasks/abc', { title: 'x' });
    await client.delete('/tasks/abc');
    expect(calls.map((c) => c.init.method)).toEqual(['PATCH', 'DELETE']);
  });

  it('resolves 204 responses to undefined', async () => {
    const { client } = setup(new Response(null, { status: 204 }));
    await expect(client.delete('/tasks/abc')).resolves.toBeUndefined();
  });

  it('parses the standard error shape into an ApiError with details', async () => {
    const details = [{ path: 'title', message: 'Title is required' }];
    const { client, onUnauthenticated } = setup(
      jsonResponse(400, {
        error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details },
      }),
    );
    const error = await catchError(client.post('/tasks', {}));
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.message).toBe('Request validation failed');
    expect(error.details).toEqual(details);
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  it('keeps object details (invalid transition)', async () => {
    const { client } = setup(
      jsonResponse(409, {
        error: {
          code: 'INVALID_TRANSITION',
          message: 'Task cannot be approved while its status is IN_PROGRESS',
          details: { action: 'approve', currentStatus: 'IN_PROGRESS' },
        },
      }),
    );
    const error = await catchError(client.post('/tasks/abc/approve'));
    expect(error.status).toBe(409);
    expect(error.details).toEqual({ action: 'approve', currentStatus: 'IN_PROGRESS' });
  });

  it('maps a non-JSON 500 to HTTP_ERROR with a generic message', async () => {
    const { client } = setup(new Response('Internal Server Error', { status: 500 }));
    const error = await catchError(client.get('/tasks'));
    expect(error.status).toBe(500);
    expect(error.code).toBe('HTTP_ERROR');
    expect(error.message).not.toContain('Internal Server Error');
  });

  it('maps JSON without the error shape to HTTP_ERROR', async () => {
    const { client } = setup(jsonResponse(502, { message: 'bad gateway' }));
    const error = await catchError(client.get('/tasks'));
    expect(error.code).toBe('HTTP_ERROR');
    expect(error.status).toBe(502);
  });

  it('maps a fetch rejection to NETWORK_ERROR with status 0', async () => {
    const { client } = setup(() => Promise.reject(new TypeError('Failed to fetch')));
    const error = await catchError(client.get('/tasks'));
    expect(error.status).toBe(0);
    expect(error.code).toBe('NETWORK_ERROR');
  });

  it('calls onUnauthenticated for 401 UNAUTHENTICATED', async () => {
    const { client, onUnauthenticated } = setup(
      jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } }),
    );
    const error = await catchError(client.get('/tasks'));
    expect(error.code).toBe('UNAUTHENTICATED');
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
    expect(onUnauthenticated).toHaveBeenCalledWith(error);
  });

  it('does not call onUnauthenticated for 401 INVALID_CREDENTIALS (login form error)', async () => {
    const { client, onUnauthenticated } = setup(
      jsonResponse(401, {
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      }),
    );
    const error = await catchError(client.post('/auth/login', { email: 'a@b.c', password: 'x' }));
    expect(error.status).toBe(401);
    expect(error.code).toBe('INVALID_CREDENTIALS');
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });
});

describe('shouldRetry', () => {
  it('retries network errors and 5xx at most twice, never 4xx', () => {
    const network = new ApiError(0, 'NETWORK_ERROR', 'x');
    const server = new ApiError(503, 'HTTP_ERROR', 'x');
    expect(shouldRetry(0, network)).toBe(true);
    expect(shouldRetry(1, server)).toBe(true);
    expect(shouldRetry(2, server)).toBe(false);
    expect(shouldRetry(0, new ApiError(404, 'NOT_FOUND', 'x'))).toBe(false);
    expect(shouldRetry(0, new ApiError(401, 'UNAUTHENTICATED', 'x'))).toBe(false);
    expect(shouldRetry(0, new Error('boom'))).toBe(false);
  });
});
