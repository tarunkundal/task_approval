import { describe, expect, it } from 'vitest';
import { EnvValidationError, parseEnv } from '../src/config/env.js';

const valid = {
  NODE_ENV: 'development',
  PORT: '4000',
  DATABASE_URL: 'mysql://user:pass@localhost:3307/task_approval',
  JWT_SECRET: 'x'.repeat(32),
  JWT_EXPIRES_IN: '8h',
  FRONTEND_URL: 'http://localhost:3000',
};

function problemsFor(source: Record<string, string | undefined>): string[] {
  try {
    parseEnv(source);
  } catch (error) {
    if (error instanceof EnvValidationError) return error.problems;
    throw error;
  }
  throw new Error('expected parseEnv to throw');
}

describe('parseEnv', () => {
  it('accepts a valid configuration and applies types', () => {
    const env = parseEnv(valid);

    expect(env.PORT).toBe(4000);
    expect(env.FRONTEND_URL).toEqual(['http://localhost:3000']);
  });

  it('requires NODE_ENV (no silent development default)', () => {
    expect(problemsFor({ ...valid, NODE_ENV: undefined })).toEqual(['NODE_ENV: is missing']);
  });

  it('defaults TRUST_PROXY to 0 and accepts a hop count', () => {
    expect(parseEnv(valid).TRUST_PROXY).toBe(0);
    expect(parseEnv({ ...valid, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
    expect(problemsFor({ ...valid, TRUST_PROXY: 'yes' })).toEqual([
      expect.stringMatching(/^TRUST_PROXY: /),
    ]);
  });

  it('normalizes FRONTEND_URL entries to bare origins', () => {
    const env = parseEnv({
      ...valid,
      FRONTEND_URL: 'https://app.example.com/, http://localhost:3000',
    });

    expect(env.FRONTEND_URL).toEqual(['https://app.example.com', 'http://localhost:3000']);
  });

  it('rejects a missing JWT_SECRET', () => {
    expect(problemsFor({ ...valid, JWT_SECRET: undefined })).toContain('JWT_SECRET: is missing');
  });

  it('rejects a JWT_SECRET shorter than 32 characters without echoing it', () => {
    const problems = problemsFor({ ...valid, JWT_SECRET: 'too-short-secret' });

    expect(problems).toContain('JWT_SECRET: must be at least 32 characters');
    expect(problems.join('\n')).not.toContain('too-short-secret');
  });

  it('lists every missing or invalid variable at once', () => {
    const problems = problemsFor({ NODE_ENV: 'staging', JWT_EXPIRES_IN: 'forever' });

    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^NODE_ENV: /),
        'DATABASE_URL: is missing',
        'JWT_SECRET: is missing',
        expect.stringMatching(/^JWT_EXPIRES_IN: /),
        'FRONTEND_URL: is missing',
      ]),
    );
  });

  it('rejects a non-MySQL DATABASE_URL', () => {
    expect(problemsFor({ ...valid, DATABASE_URL: 'postgres://localhost/db' })).toContain(
      'DATABASE_URL: must be a mysql:// connection URL',
    );
  });
});
