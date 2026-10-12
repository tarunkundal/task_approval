// Migrates and seeds the guarded TEST database before the e2e run (never the dev database).
import { spawnSync } from 'node:child_process';
import { delimiter, resolve } from 'node:path';
import { API_DIR, loadTestEnv } from './test-env.mjs';

const testEnv = loadTestEnv();
const binDir = resolve(API_DIR, 'node_modules/.bin');
const prisma = resolve(binDir, 'prisma');
// The test env wins over anything inherited from the shell (e.g. a dev DATABASE_URL).
// The api bin dir goes on PATH so the seed command (`tsx prisma/seed.ts`) resolves.
const env = {
  ...process.env,
  ...testEnv,
  PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
};

for (const args of [
  ['migrate', 'deploy'],
  ['db', 'seed'],
]) {
  console.info(`[e2e] prisma ${args.join(' ')} (test database)`);
  const result = spawnSync(prisma, args, { cwd: API_DIR, env, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`[e2e] prisma ${args.join(' ')} failed`);
    process.exit(result.status ?? 1);
  }
}
