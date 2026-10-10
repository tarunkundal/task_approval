import { afterAll, beforeAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { assertSafeTestDatabase } from './helpers/db-guard.js';
import { resetDatabase } from './helpers/db.js';

// Runs in every test file before its tests: refuse unsafe targets, then start from empty tables.
assertSafeTestDatabase(process.env);

beforeAll(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});
