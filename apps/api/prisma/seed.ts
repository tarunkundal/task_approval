/**
 * `pnpm db:seed` entry point (`prisma db seed` → `tsx prisma/seed.ts`). The seed logic lives in
 * `demo-seed.ts` so the API tests can prove it is idempotent (test/seed.test.ts).
 */
import 'dotenv/config';
import { z } from 'zod';
import { createPrismaClient } from '../src/lib/prisma-client.js';
import { demoUsers, seedDatabase, seedEnvSchema } from './demo-seed.js';

async function main() {
  const env = seedEnvSchema.parse(process.env);
  const prisma = createPrismaClient(env.DATABASE_URL, {
    production: env.NODE_ENV === 'production',
  });
  try {
    await seedDatabase(prisma, demoUsers(env));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  if (error instanceof z.ZodError) {
    console.error(
      `Invalid seed configuration:\n${error.issues
        .map((issue) => `  - ${String(issue.path[0])}: ${issue.message}`)
        .join('\n')}`,
    );
  } else {
    console.error('Seed failed:', error instanceof Error ? error.message : error);
  }
  process.exit(1);
});
