import type { ErrorRequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { AppError, ErrorCode } from '../errors/app-error.js';

interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}

function send(res: Response, status: number, error: ErrorBody['error']): void {
  res.status(status).json({ error } satisfies ErrorBody);
}

/** Errors raised by express.json() (body-parser) carry a `type` and `status`. */
function isBodyParserError(error: unknown): error is { type: string; status: number } {
  return typeof error === 'object' && error !== null && 'type' in error && 'status' in error;
}

/**
 * Centralized error handler. Responses always use `{ error: { code, message, details? } }`
 * and never include stack traces, driver messages or other internals.
 */
export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof AppError) {
    send(res, err.status, {
      code: err.code,
      message: err.message,
      ...(err.details === undefined ? {} : { details: err.details }),
    });
    return;
  }

  if (err instanceof ZodError) {
    send(res, 400, {
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Request validation failed',
      details: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
    return;
  }

  if (isBodyParserError(err)) {
    if (err.type === 'entity.too.large') {
      send(res, 413, { code: ErrorCode.PAYLOAD_TOO_LARGE, message: 'Request body is too large' });
      return;
    }
    if (err.type === 'entity.parse.failed') {
      send(res, 400, { code: ErrorCode.INVALID_JSON, message: 'Request body is not valid JSON' });
      return;
    }
    if (err.status >= 400 && err.status < 500) {
      send(res, err.status, { code: ErrorCode.VALIDATION_ERROR, message: 'Invalid request body' });
      return;
    }
  }

  // Unexpected: log server-side (name/message/stack only), return a generic message.
  console.error('[api] unhandled error', err instanceof Error ? (err.stack ?? err.message) : err);
  send(res, 500, { code: ErrorCode.INTERNAL_ERROR, message: 'An unexpected error occurred' });
};
