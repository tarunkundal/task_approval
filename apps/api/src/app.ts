import express, { type Express } from 'express';
import helmet from 'helmet';
import { errorHandler } from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found.js';
import { healthRouter } from './routes/health.routes.js';
import { checkDatabase, type DatabaseCheck } from './services/health.service.js';

export const JSON_BODY_LIMIT = '100kb';

export interface AppDependencies {
  /** Overridable for tests (e.g. to simulate a database outage). */
  checkDatabase?: DatabaseCheck;
}

/** Builds the Express app without listening, so tests can drive it with Supertest. */
export function createApp(deps: AppDependencies = {}): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  const health = healthRouter(deps.checkDatabase ?? checkDatabase);
  app.use('/health', health);
  app.use('/api/v1/health', health);

  // Phase 3+: /api/v1/auth, /api/v1/users, /api/v1/tasks, /api/v1/dashboard

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
