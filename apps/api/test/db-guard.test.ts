import { describe, expect, it } from 'vitest';
import { assertSafeTestDatabase } from './helpers/db-guard.js';

describe('assertSafeTestDatabase', () => {
  it('accepts NODE_ENV=test with a database name ending in _test', () => {
    expect(
      assertSafeTestDatabase({
        NODE_ENV: 'test',
        DATABASE_URL: 'mysql://u:p@localhost:3307/task_approval_test',
      }),
    ).toBe('task_approval_test');
  });

  it('rejects a database name that does not end in _test', () => {
    expect(() =>
      assertSafeTestDatabase({
        NODE_ENV: 'test',
        DATABASE_URL: 'mysql://u:p@localhost:3307/task_approval',
      }),
    ).toThrow(/does not end with "_test"/);
  });

  it('rejects a name that only contains _test in the middle', () => {
    expect(() =>
      assertSafeTestDatabase({
        NODE_ENV: 'test',
        DATABASE_URL: 'mysql://u:p@localhost:3307/my_test_prod',
      }),
    ).toThrow(/does not end with "_test"/);
  });

  it('rejects when NODE_ENV is not test', () => {
    expect(() =>
      assertSafeTestDatabase({
        NODE_ENV: 'development',
        DATABASE_URL: 'mysql://u:p@localhost:3307/task_approval_test',
      }),
    ).toThrow(/NODE_ENV must be "test"/);
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => assertSafeTestDatabase({ NODE_ENV: 'test' })).toThrow(/DATABASE_URL is not set/);
  });
});
