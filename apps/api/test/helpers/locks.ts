import type { Prisma } from '../../src/generated/prisma/client.js';
import { prisma } from '../../src/lib/prisma.js';

/**
 * Helpers that make race tests deterministic: hold a row lock in a test transaction, wait until
 * the competing statements are observably blocked on it inside MySQL, then release it.
 * (Phase 4 review #1: the earlier tests relied on `Promise.all` timing or a fixed sleep.)
 */

export interface HeldLock {
  /** Lets the holding transaction commit (releasing its locks). */
  release: () => void;
  /** Settles once the holding transaction has committed. */
  done: Promise<void>;
}

/**
 * Runs `acquire` (statements that take row locks) in a transaction that stays open, holding
 * those locks, until `release()` is called.
 */
export async function holdLock(
  acquire: (tx: Prisma.TransactionClient) => Promise<unknown>,
): Promise<HeldLock> {
  let release!: () => void;
  let acquired!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  const isAcquired = new Promise<void>((resolve) => (acquired = resolve));
  const done = prisma.$transaction(
    async (tx) => {
      await acquire(tx);
      acquired();
      await released;
    },
    { timeout: 30_000 },
  );
  // If `acquire` fails, `done` rejects and so does this race.
  await Promise.race([isAcquired, done]);
  return { release, done };
}

/** Holds the row lock on one task (`SELECT … FOR UPDATE`) without changing it. */
export function holdTaskRowLock(id: string): Promise<HeldLock> {
  return holdLock((tx) => tx.$queryRaw`SELECT id FROM tasks WHERE id = ${id} FOR UPDATE`);
}

/** Holds the row lock on one user without changing it. */
export function holdUserRowLock(id: string): Promise<HeldLock> {
  return holdLock((tx) => tx.$queryRaw`SELECT id FROM users WHERE id = ${id} FOR UPDATE`);
}

/**
 * Waits until at least `count` other sessions are executing a statement whose text matches the
 * SQL LIKE `pattern`. While a test holds the row lock, an executing UPDATE / locking SELECT on
 * that row can only be waiting for it, so this proves the competing requests overlap.
 * `information_schema.PROCESSLIST` lists the caller's own sessions without the PROCESS
 * privilege, and every pool connection uses the same database user.
 */
export async function waitForBlockedStatements(
  pattern: string,
  count: number,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const rows = await prisma.$queryRaw<{ blocked: bigint | number }[]>`
      SELECT COUNT(*) AS blocked FROM information_schema.PROCESSLIST
      WHERE ID <> CONNECTION_ID() AND INFO LIKE ${pattern}`;
    if (Number(rows[0]?.blocked ?? 0) >= count) return;
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${count} blocked statement(s) like "${pattern}"`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
