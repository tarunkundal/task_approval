import bcrypt from 'bcryptjs';

/**
 * Cost-12 bcrypt hash of a random value nobody knows. Compared against when the email is
 * unknown, so a failed login takes the same time whether or not the account exists.
 */
const DUMMY_HASH = '$2b$12$DslRw6iRA4rd18YB7MBJEe5C0MeJtzEUj51Mz40MZf.U2bnAHJqf.';

/** Checks a password against a stored hash, or against the dummy hash when there is none. */
export async function verifyPassword(password: string, hash: string | undefined): Promise<boolean> {
  const matches = await bcrypt.compare(password, hash ?? DUMMY_HASH);
  return hash !== undefined && matches;
}
