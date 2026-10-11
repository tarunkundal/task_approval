import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

/**
 * The one bcrypt cost used everywhere: the seed, `POST /users` and the login dummy hash.
 * Sharing it keeps unknown-email and wrong-password logins equally slow.
 */
export const BCRYPT_COST = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

let dummyHash: Promise<string> | undefined;

/**
 * Hash of a random value nobody knows, created once at BCRYPT_COST. Compared against when the
 * email is unknown, so a failed login takes the same time whether or not the account exists.
 */
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomUUID());
  return dummyHash;
}

/** Checks a password against a stored hash, or against the dummy hash when there is none. */
export async function verifyPassword(password: string, hash: string | undefined): Promise<boolean> {
  const matches = await bcrypt.compare(password, hash ?? (await getDummyHash()));
  return hash !== undefined && matches;
}
