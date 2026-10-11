import type { Request, RequestHandler } from 'express';
import type { z } from 'zod';

// Each validator replaces the raw input with the parsed (normalized) value. A ZodError is
// rendered as 400 VALIDATION_ERROR by the error handler.

/** Parses `req.body`. */
export function validateBody(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    req.body = schema.parse(req.body);
    next();
  };
}

/** Parses `req.params` (e.g. `{ id }` must be a cuid). */
export function validateParams(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    req.params = schema.parse(req.params) as Request['params'];
    next();
  };
}

/**
 * Parses `req.query`. Express 5 exposes `req.query` as a getter, so the parsed value is defined
 * on the request instance instead of assigned. Read it with `parsedQuery<T>(req)`.
 */
export function validateQuery(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    const parsed: unknown = schema.parse(req.query);
    Object.defineProperty(req, 'query', {
      value: parsed,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    next();
  };
}

/** The query parsed by `validateQuery`; use only behind it. */
export function parsedQuery<T>(req: Request): T {
  return req.query as unknown as T;
}
