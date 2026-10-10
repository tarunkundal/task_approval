import type { RequestHandler } from 'express';
import { notFound } from '../errors/app-error.js';

/** Catch-all for unmatched routes; the error handler renders the JSON 404. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(notFound(`Route ${req.method} ${req.path} not found`));
};
