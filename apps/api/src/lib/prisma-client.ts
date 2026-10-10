import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client.js';
import { parseMysqlUrl } from './database-url.js';

export interface PrismaClientOptions {
  production: boolean;
}

/**
 * The only place a PrismaClient is constructed (app singleton, seed and tests use it).
 * Prisma 7 connects through a driver adapter; the `mariadb` driver supports MySQL 8.
 */
export function createPrismaClient(
  databaseUrl: string,
  options: PrismaClientOptions,
): PrismaClient {
  const adapter = new PrismaMariaDb({
    ...parseMysqlUrl(databaseUrl),
    connectionLimit: 10,
    connectTimeout: 5_000,
    // MySQL 8 `caching_sha2_password` needs the server RSA key on non-TLS connections.
    // Allowed for local development only; production connections must use TLS (Phase 7).
    allowPublicKeyRetrieval: !options.production,
  });
  return new PrismaClient({ adapter });
}
