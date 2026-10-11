import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { getEnv, type Env } from './config/env.js';
import type { AuthCookieConfig } from './lib/auth-cookie.js';
import { durationToSeconds } from './lib/jwt.js';
import { getDummyHash } from './lib/password.js';
import { createAuthenticate } from './middleware/authenticate.js';
import { csrfProtection } from './middleware/csrf.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found.js';
import {
  createLoginIpLimiter,
  createLoginLimiter,
  createWriteLimiter,
  DEFAULT_RATE_LIMITS,
  type RateLimitOptions,
} from './middleware/rate-limit.js';
import { authRouter } from './routes/auth.routes.js';
import { dashboardRouter } from './routes/dashboard.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { tasksRouter } from './routes/tasks.routes.js';
import { usersRouter } from './routes/users.routes.js';
import { checkDatabase, type DatabaseCheck } from './services/health.service.js';

export const JSON_BODY_LIMIT = '100kb';

export interface AppDependencies {
  /** Validated configuration; defaults to the process environment. */
  env?: Env;
  /** Overridable for tests (e.g. to simulate a database outage). */
  checkDatabase?: DatabaseCheck;
  /** Rate-limit rules; tests override them to stay deterministic. */
  rateLimits?: Partial<RateLimitOptions>;
}

/** Builds the Express app without listening, so tests can drive it with Supertest. */
export function createApp(deps: AppDependencies = {}): Express {
  const env = deps.env ?? getEnv();
  const rateLimits = { ...DEFAULT_RATE_LIMITS, ...deps.rateLimits };
  const cookie: AuthCookieConfig = {
    secure: env.NODE_ENV === 'production',
    maxAgeSeconds: durationToSeconds(env.JWT_EXPIRES_IN),
  };
  const authenticate = createAuthenticate({ jwtSecret: env.JWT_SECRET, cookie });
  // Compute the login dummy hash up front so the first unknown-email login isn't slower.
  void getDummyHash();

  const app = express();

  app.disable('x-powered-by');
  // Hop count of trusted reverse proxies (req.ip for rate limiting). 0 = trust none.
  app.set('trust proxy', env.TRUST_PROXY > 0 ? env.TRUST_PROXY : false);
  app.use(helmet());
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type'],
      maxAge: 600,
    }),
  );
  // Before body parsing, so rejected cross-site requests are never parsed.
  app.use(csrfProtection(env.FRONTEND_URL));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(cookieParser());

  const health = healthRouter(deps.checkDatabase ?? checkDatabase);
  app.use('/health', health);
  app.use('/api/v1/health', health);

  // Limiters are created per app instance so each test app starts with fresh counters.
  app.use('/api/v1', createWriteLimiter(rateLimits.write));
  app.use(
    '/api/v1/auth',
    authRouter({
      config: { jwtSecret: env.JWT_SECRET, cookie },
      authenticate,
      loginLimiters: [
        createLoginIpLimiter(rateLimits.loginIp),
        createLoginLimiter(rateLimits.login),
      ],
    }),
  );
  app.use('/api/v1/users', usersRouter(authenticate));
  app.use('/api/v1/tasks', tasksRouter(authenticate));
  app.use('/api/v1/dashboard', dashboardRouter(authenticate));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
