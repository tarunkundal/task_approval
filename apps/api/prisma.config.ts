// Prisma 7 does not load .env automatically; dotenv reads apps/api/.env when present.
// Existing environment variables (e.g. the test DATABASE_URL) are never overridden.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Not using env() because `prisma generate` (postinstall/build) must work without a database URL.
    // Commands that need a database (migrate, db seed) fail clearly when it is empty.
    url: process.env.DATABASE_URL ?? '',
  },
});
