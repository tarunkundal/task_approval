import { Prisma } from '../generated/prisma/client.js';

/**
 * Prisma error messages and `meta` can embed query arguments (emails, titles, comment bodies),
 * so only the error class name and code are ever logged.
 */

const PRISMA_ERROR_CLASSES = [
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientUnknownRequestError,
  Prisma.PrismaClientValidationError,
  Prisma.PrismaClientInitializationError,
  Prisma.PrismaClientRustPanicError,
];

export function isPrismaError(error: unknown): error is Error {
  return (
    PRISMA_ERROR_CLASSES.some((ErrorClass) => error instanceof ErrorClass) ||
    // Errors raised by the driver adapter (e.g. a lost connection) before Prisma wraps them.
    (error instanceof Error && /^(Prisma|DriverAdapter)/.test(error.name))
  );
}

/** `{ name, code }` only: safe to log. */
export function prismaErrorSummary(error: Error): { name: string; code?: string } {
  const code =
    error instanceof Prisma.PrismaClientKnownRequestError
      ? error.code
      : error instanceof Prisma.PrismaClientInitializationError
        ? error.errorCode
        : undefined;
  return code === undefined ? { name: error.name } : { name: error.name, code };
}

/** Known request error with the given code (e.g. P2002 unique constraint). */
export function isPrismaErrorCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}
