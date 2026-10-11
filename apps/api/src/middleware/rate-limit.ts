import type { RequestHandler } from 'express';
import type { Options } from 'express-rate-limit';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { AppError, ErrorCode } from '../errors/app-error.js';

export interface RateLimitRule {
  /** Maximum requests per window. */
  limit: number;
  windowMs: number;
}

export interface RateLimitOptions {
  /** Coarse per-IP ceiling on login attempts, whatever the email (stops password spraying). */
  loginIp: RateLimitRule;
  /** Login attempts per IP + email. */
  login: RateLimitRule;
  /** All state-changing /api/v1 requests (POST/PUT/PATCH/DELETE). */
  write: RateLimitRule;
}

const FIFTEEN_MINUTES = 15 * 60 * 1000;

export const DEFAULT_RATE_LIMITS: RateLimitOptions = {
  loginIp: { limit: 50, windowMs: FIFTEEN_MINUTES },
  login: { limit: 10, windowMs: FIFTEEN_MINUTES },
  write: { limit: 300, windowMs: FIFTEEN_MINUTES },
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function limiter(rule: RateLimitRule, message: string, extra: Partial<Options>) {
  return rateLimit({
    windowMs: rule.windowMs,
    limit: rule.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Rendered by the central error handler: { error: { code: 'RATE_LIMITED', message } }.
    handler: (_req, _res, next) => next(new AppError(429, ErrorCode.RATE_LIMITED, message)),
    ...extra,
  });
}

/**
 * Login attempts, keyed by client IP + normalized email so one address cannot be brute-forced
 * and one IP cannot lock out an account for everyone. Mount after express.json().
 */
export function createLoginLimiter(rule: RateLimitRule): RequestHandler {
  return limiter(rule, 'Too many login attempts, please try again later', {
    keyGenerator: (req) => {
      const body: unknown = req.body;
      const rawEmail =
        typeof body === 'object' && body !== null && 'email' in body ? body.email : undefined;
      const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
      return `${ipKeyGenerator(req.ip ?? '')}|${email}`;
    },
  });
}

/**
 * Login attempts per client IP only. Runs before the IP + email limiter so rotating the email
 * cannot spray passwords across many accounts from one address.
 */
export function createLoginIpLimiter(rule: RateLimitRule): RequestHandler {
  return limiter(rule, 'Too many login attempts, please try again later', {
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? ''),
  });
}

/** General limiter for state-changing requests, keyed by client IP. */
export function createWriteLimiter(rule: RateLimitRule): RequestHandler {
  return limiter(rule, 'Too many requests, please try again later', {
    skip: (req) => SAFE_METHODS.has(req.method),
  });
}
