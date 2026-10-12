import type { ErrorRequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { AppError, ErrorCode } from '../errors/app-error.js';
import { isPrismaError, prismaErrorSummary } from '../lib/prisma-errors.js';

/** Prisma known-request codes that are client errors rather than server faults. */
const PRISMA_ERROR_MAP: Record<string, { status: number; code: ErrorCode; message: string }> = {
  P2002: { status: 409, code: ErrorCode.CONFLICT, message: 'A record with these values exists' },
  P2003: {
    status: 400,
    code: ErrorCode.VALIDATION_ERROR,
    message: 'A referenced record does not exist',
  },
  P2025: { status: 404, code: ErrorCode.NOT_FOUND, message: 'Resource not found' },
};

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

  if (isPrismaError(err)) {
    // Never log the message, meta or invocation: they can contain request values.
    const summary = prismaErrorSummary(err);
    console.error('[api] database error', summary);
    const mapped = summary.code === undefined ? undefined : PRISMA_ERROR_MAP[summary.code];
    if (mapped) {
      send(res, mapped.status, { code: mapped.code, message: mapped.message });
      return;
    }
    send(res, 500, { code: ErrorCode.INTERNAL_ERROR, message: 'An unexpected error occurred' });
    return;
  }

  // Unexpected: log the error's name and message only. No stack trace (spec §7: none in API
  // errors or logs) and no other properties, which could hold request data. Non-Error values are
  // logged by type only, since they could be anything.
  console.error(
    '[api] unhandled error',
    err instanceof Error ? { name: err.name, message: err.message } : { type: typeof err },
  );
  send(res, 500, { code: ErrorCode.INTERNAL_ERROR, message: 'An unexpected error occurred' });
};
