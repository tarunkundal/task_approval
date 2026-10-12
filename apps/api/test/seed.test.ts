import { beforeEach, describe, expect, it } from 'vitest';
import {
  demoUsers,
  SAMPLE_TASKS,
  seedDatabase,
  seedDemoUsers,
  seedSampleTasks,
} from '../prisma/demo-seed.js';
import { hashPassword, verifyPassword } from '../src/lib/password.js';
import { prisma } from '../src/lib/prisma.js';
import { resetDatabase } from './helpers/db.js';
import { holdUserRowLock, waitForBlockedStatements } from './helpers/locks.js';

/**
 * The real seed logic (`prisma/demo-seed.ts`, used by `pnpm db:seed`) run against the test DB:
 * re-running it is safe (Phase 2 review #7) and concurrent runs don't duplicate the sample tasks
 * (Phase 2 review #5).
 */

const quiet = () => undefined;
const EMAILS = ['admin@demo.com', 'employee1@demo.com', 'employee2@demo.com'];
const SAMPLE_HISTORY_ROWS = SAMPLE_TASKS.reduce(
  (sum, task) => sum + 1 + task.transitions.length,
  0,
);

async function snapshot() {
  const users = await prisma.user.findMany({
    orderBy: { email: 'asc' },
    select: { id: true, email: true, name: true, role: true, passwordHash: true, updatedAt: true },
  });
  const tasks = await prisma.task.findMany({
    orderBy: { id: 'asc' },
    select: { id: true, title: true, status: true, updatedAt: true },
  });
  const history = await prisma.taskStatusHistory.count();
  return { users, tasks, history };
}

beforeEach(async () => {
  await resetDatabase();
});

describe('seed', () => {
  it('first run: the 3 demo users with bcrypt hashes, and the sample tasks with history', async () => {
    const result = await seedDatabase(prisma, demoUsers(), quiet);

    expect(result.sampleTasksCreated).toBe(true);
    const { users, tasks, history } = await snapshot();
    expect(users.map((user) => [user.email, user.role])).toEqual([
      ['admin@demo.com', 'ADMIN'],
      ['employee1@demo.com', 'EMPLOYEE'],
      ['employee2@demo.com', 'EMPLOYEE'],
    ]);
    for (const [index, user] of users.entries()) {
      const password = demoUsers()[index]!.password;
      expect(user.passwordHash).toMatch(/^\$2[aby]\$12\$/);
      expect(user.passwordHash).not.toContain(password);
      expect(await verifyPassword(password, user.passwordHash)).toBe(true);
    }
    expect(tasks).toHaveLength(SAMPLE_TASKS.length);
    expect(history).toBe(SAMPLE_HISTORY_ROWS);
  });

  it('a second run changes nothing: same users, same hashes, no duplicate tasks', async () => {
    await seedDatabase(prisma, demoUsers(), quiet);
    const before = await snapshot();

    const result = await seedDatabase(prisma, demoUsers(), quiet);

    expect(result.sampleTasksCreated).toBe(false);
    const after = await snapshot();
    expect(after).toEqual(before);
    expect(after.users).toHaveLength(3);
    expect(after.tasks).toHaveLength(SAMPLE_TASKS.length);
  });

  it('never resets an existing password, name or role, even with new SEED_* passwords', async () => {
    await seedDatabase(prisma, demoUsers(), quiet);
    // The user changed their password (and an admin renamed them) after the first seed.
    const changedHash = await hashPassword('Changed@12345');
    await prisma.user.update({
      where: { email: 'employee1@demo.com' },
      data: { passwordHash: changedHash, name: 'Jordan Lee-Smith' },
    });

    await seedDatabase(
      prisma,
      demoUsers({ SEED_EMPLOYEE1_PASSWORD: 'Different@12345', SEED_ADMIN_PASSWORD: 'Other@12345' }),
      quiet,
    );

    const employee1 = await prisma.user.findUniqueOrThrow({
      where: { email: 'employee1@demo.com' },
    });
    expect(employee1.passwordHash).toBe(changedHash);
    expect(employee1.name).toBe('Jordan Lee-Smith');
    expect(employee1.role).toBe('EMPLOYEE');
    expect(await verifyPassword('Changed@12345', employee1.passwordHash)).toBe(true);
    expect(await verifyPassword('Different@12345', employee1.passwordHash)).toBe(false);
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@demo.com' } });
    expect(await verifyPassword('Admin@12345', admin.passwordHash)).toBe(true);
    expect(await prisma.user.count()).toBe(3);
  });

  it('a missing demo user is recreated without touching the others or the tasks', async () => {
    await seedDatabase(prisma, demoUsers(), quiet);
    // A database where only the admin exists yet already has tasks (e.g. created by hand).
    await prisma.taskStatusHistory.deleteMany();
    await prisma.task.deleteMany();
    await prisma.user.deleteMany({ where: { email: { not: 'admin@demo.com' } } });
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@demo.com' } });
    await prisma.task.create({
      data: {
        title: 'Hand-made task',
        description: '',
        dueDate: new Date('2030-01-01T00:00:00Z'),
        assignedToId: admin.id,
        createdById: admin.id,
      },
    });

    const result = await seedDatabase(prisma, demoUsers(), quiet);

    expect(result.sampleTasksCreated).toBe(false);
    const { users, tasks } = await snapshot();
    expect(users.map((user) => user.email)).toEqual(EMAILS);
    expect(users.find((user) => user.email === 'admin@demo.com')?.passwordHash).toBe(
      admin.passwordHash,
    );
    expect(tasks.map((task) => task.title)).toEqual(['Hand-made task']);
  });

  it('two overlapping runs insert the sample tasks once', async () => {
    const ids = await seedDemoUsers(prisma, demoUsers(), quiet);

    // Both runs start while the test holds the admin row lock, and both are observed waiting
    // on it, so they really overlap: each would see an empty task table without the lock.
    const lock = await holdUserRowLock(ids.admin);
    const runs = Promise.all([
      seedSampleTasks(prisma, ids, quiet),
      seedSampleTasks(prisma, ids, quiet),
    ]);
    try {
      await waitForBlockedStatements('SELECT id FROM users%FOR UPDATE', 2);
    } finally {
      lock.release();
      await lock.done;
    }
    const created = await runs;

    expect(created.sort()).toEqual([false, true]);
    expect(await prisma.task.count()).toBe(SAMPLE_TASKS.length);
    expect(await prisma.taskStatusHistory.count()).toBe(SAMPLE_HISTORY_ROWS);
  });
});
