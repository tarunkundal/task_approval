import { getEnv } from '../config/env.js';
import { createPrismaClient } from './prisma-client.js';

const env = getEnv();

/** Application-wide Prisma client. */
export const prisma = createPrismaClient(env.DATABASE_URL, {
  production: env.NODE_ENV === 'production',
});
