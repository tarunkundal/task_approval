// Loads apps/api/.env when present (local development). In production the host provides env vars.
import 'dotenv/config';
import { getEnv } from './config/env.js';
import { createApp } from './app.js';
import { prisma } from './lib/prisma.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const env = getEnv();
const app = createApp();

const server = app.listen(env.PORT, () => {
  console.info(`[api] listening on port ${env.PORT} (${env.NODE_ENV})`);
});

server.on('error', (error) => {
  console.error('[api] failed to start:', error.message);
  process.exit(1);
});

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`[api] ${signal} received, shutting down`);

  const forceExit = setTimeout(() => {
    console.error('[api] graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  server.close(() => {
    prisma
      .$disconnect()
      .catch((error: unknown) => console.error('[api] error while disconnecting Prisma', error))
      .finally(() => process.exit(0));
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
