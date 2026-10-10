import { prisma } from '../lib/prisma.js';

const DB_PING_TIMEOUT_MS = 3_000;

export type DatabaseCheck = () => Promise<boolean>;

/** Pings the database with `SELECT 1`; resolves false on error or timeout. */
export const checkDatabase: DatabaseCheck = async () => {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), DB_PING_TIMEOUT_MS);
  });
  const ping = prisma.$queryRaw`SELECT 1`.then(
    () => true,
    () => false,
  );
  try {
    return await Promise.race([ping, timeout]);
  } finally {
    clearTimeout(timer);
  }
};
