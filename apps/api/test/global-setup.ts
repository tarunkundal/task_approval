import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { assertSafeTestDatabase } from './helpers/db-guard.js';
import { API_ROOT, loadTestEnv } from './helpers/test-env.js';

/** Runs once before all test files: verify the target is a test DB, then apply migrations. */
export default function globalSetup(): void {
  const testEnv = loadTestEnv();
  const database = assertSafeTestDatabase(testEnv);

  console.info(`[test] applying migrations to ${database}`);
  execFileSync(path.join(API_ROOT, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
    cwd: API_ROOT,
    env: { ...process.env, ...testEnv },
    stdio: 'inherit',
  });
}
