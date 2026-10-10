/**
 * Safety guard for destructive test setup (migrate + table cleanup).
 * Throws unless NODE_ENV is "test" and the DATABASE_URL database name ends in "_test".
 */
export function assertSafeTestDatabase(env: Record<string, string | undefined>): string {
  if (env.NODE_ENV !== 'test') {
    throw new Error(
      `Refusing to run tests: NODE_ENV must be "test" (got "${env.NODE_ENV ?? ''}").`,
    );
  }
  const url = env.DATABASE_URL;
  if (!url) {
    throw new Error('Refusing to run tests: DATABASE_URL is not set.');
  }
  let database: string;
  try {
    database = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    throw new Error('Refusing to run tests: DATABASE_URL is not a valid URL.');
  }
  if (!database.endsWith('_test')) {
    throw new Error(
      `Refusing to run tests: database "${database}" does not end with "_test". ` +
        'Tests truncate tables and must never touch a development or production database.',
    );
  }
  return database;
}
