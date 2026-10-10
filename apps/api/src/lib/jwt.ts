import { ROLES, type Role } from '@workspace/shared';
import { errors, jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';

/** The only algorithm accepted when verifying; `none` and asymmetric algs are rejected. */
const ALGORITHM = 'HS256';

const UNIT_SECONDS = { s: 1, m: 60, h: 3_600, d: 86_400 } as const;

/** Converts a validated duration such as `15m`, `8h` or `1d` to seconds. */
export function durationToSeconds(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) throw new Error(`Invalid duration "${duration}"`);
  const unit = match[2] as keyof typeof UNIT_SECONDS;
  return Number(match[1]) * UNIT_SECONDS[unit];
}

export interface TokenClaims {
  sub: string;
  role: Role;
}

const claimsSchema = z.object({
  sub: z.string().min(1),
  role: z.enum(ROLES),
});

function keyFrom(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(
  claims: TokenClaims,
  secret: string,
  expiresInSeconds: number,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: claims.role })
    .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
    .setSubject(claims.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + expiresInSeconds)
    .sign(keyFrom(secret));
}

/**
 * Verifies signature (HS256 only), expiry and claim shape.
 * Returns null for any invalid, expired or malformed token; never throws for bad input.
 */
export async function verifyAccessToken(
  token: string,
  secret: string,
): Promise<TokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, keyFrom(secret), {
      algorithms: [ALGORITHM],
      requiredClaims: ['sub', 'exp'],
    });
    const parsed = claimsSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch (error) {
    if (error instanceof errors.JOSEError) return null;
    throw error;
  }
}
