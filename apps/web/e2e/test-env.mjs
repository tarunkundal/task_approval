// Shared by prepare-db.mjs and playwright.config.ts: loads apps/api/.env.test and refuses to
// continue unless it targets a test database (same rule as apps/api/test/helpers/db-guard.ts).
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

export const API_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../api');

export function loadTestEnv() {
  const file = resolve(API_DIR, '.env.test');
  let env;
  try {
    env = parseEnv(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`E2E: cannot read ${file} (${error.message}). Create it from .env.example.`);
  }

  if (env.NODE_ENV !== 'test') {
    throw new Error(`E2E: ${file} must set NODE_ENV=test (got "${env.NODE_ENV ?? ''}").`);
  }
  let database = '';
  try {
    database = decodeURIComponent(new URL(env.DATABASE_URL ?? '').pathname.replace(/^\//, ''));
  } catch {
    throw new Error(`E2E: DATABASE_URL in ${file} is not a valid URL.`);
  }
  if (!database.endsWith('_test')) {
    throw new Error(`E2E: refusing to use database "${database}"; its name must end with "_test".`);
  }
  return env;
}
