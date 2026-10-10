import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

export const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TEST_ENV_FILE = path.join(API_ROOT, '.env.test');

/** Reads apps/api/.env.test only (never the development .env). */
export function loadTestEnv(): Record<string, string> {
  if (!existsSync(TEST_ENV_FILE)) {
    throw new Error(
      `Missing ${TEST_ENV_FILE}. Create it from .env.example with a database name ending in _test.`,
    );
  }
  const parsed = parseEnv(readFileSync(TEST_ENV_FILE, 'utf8'));
  return Object.fromEntries(
    Object.entries(parsed).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}
