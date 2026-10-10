import type { RequestHandler } from 'express';
import type { z } from 'zod';

/**
 * Parses `req.body` with a Zod schema and replaces it with the parsed (normalized) value.
 * A ZodError is rendered as 400 VALIDATION_ERROR by the error handler.
 */
export function validateBody(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    req.body = schema.parse(req.body);
    next();
  };
}
