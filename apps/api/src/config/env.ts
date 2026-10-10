import { z } from 'zod';

const DURATION = /^\d+[smhd]$/;

const envSchema = z.object({
  // Required on purpose (no default): an unset NODE_ENV must not silently disable the
  // production-only safeguards such as the Secure cookie flag.
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((value) => value.startsWith('mysql://'), 'must be a mysql:// connection URL'),
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  JWT_EXPIRES_IN: z
    .string()
    .regex(DURATION, 'must be a duration such as 15m, 8h or 1d')
    .default('8h'),
  /** Comma-separated list of allowed browser origins (CORS / CSRF allowlist). */
  FRONTEND_URL: z
    .string()
    .min(1)
    .transform((value) => value.split(',').map((origin) => origin.trim()))
    .pipe(z.array(z.url({ protocol: /^https?$/ })).min(1))
    // Compare against the bare origin (scheme://host[:port]) the browser sends.
    .transform((urls) => urls.map((url) => new URL(url).origin)),
  /** Number of reverse-proxy hops in front of the API whose X-Forwarded-For is trusted. */
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
});

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(
      `Invalid environment configuration:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`,
    );
    this.name = 'EnvValidationError';
  }
}

/**
 * Validates environment variables. Pure (no process access) so it can be unit tested.
 * Error messages name the variable and the problem, never the value.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (result.success) return result.data;

  const problems = result.error.issues.map((issue) => {
    const name = String(issue.path[0] ?? 'environment');
    const raw = source[name];
    const missing = raw === undefined || raw === '';
    return missing ? `${name}: is missing` : `${name}: ${issue.message}`;
  });
  throw new EnvValidationError([...new Set(problems)]);
}

let cached: Env | undefined;

/** Returns the validated env, or prints a clear configuration error and exits the process. */
export function getEnv(): Env {
  if (cached) return cached;
  try {
    cached = parseEnv(process.env);
    return cached;
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error(`${error.message}\nSee .env.example for the required variables.`);
      process.exit(1);
    }
    throw error;
  }
}
