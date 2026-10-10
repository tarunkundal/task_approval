/**
 * Idempotent seed (D7, D8).
 * - Upserts the 3 demo users by email. `update: {}` means an existing user's password,
 *   name and role are never changed by re-running the seed.
 * - Inserts sample tasks with consistent status history only when the Task table is empty.
 */
import bcrypt from 'bcryptjs';
import 'dotenv/config';
import { z } from 'zod';
import type { Prisma, PrismaClient } from '../src/generated/prisma/client.js';
import { formatDateOnly, parseDateOnly } from '../src/lib/dates.js';
import { createPrismaClient } from '../src/lib/prisma-client.js';

const BCRYPT_COST = 12;

// Empty values (e.g. copied from .env.example) fall back to the documented demo passwords.
const optionalPassword = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(8, 'must be at least 8 characters').max(72).optional(),
);

const seedEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().startsWith('mysql://', 'must be a mysql:// connection URL'),
  SEED_ADMIN_PASSWORD: optionalPassword,
  SEED_EMPLOYEE1_PASSWORD: optionalPassword,
  SEED_EMPLOYEE2_PASSWORD: optionalPassword,
});

type Role = 'ADMIN' | 'EMPLOYEE';
type Status = 'PENDING' | 'IN_PROGRESS' | 'PENDING_APPROVAL' | 'COMPLETED';
type UserKey = 'admin' | 'employee1' | 'employee2';

interface DemoUser {
  key: UserKey;
  name: string;
  email: string;
  role: Role;
  password: string;
}

interface SampleTransition {
  to: Status;
  by: UserKey;
  reason?: string;
}

interface SampleTask {
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  dueInDays: number;
  assignee: UserKey;
  /** Transitions after creation, in order. Each must follow the workflow table. */
  transitions: SampleTransition[];
}

const SAMPLE_TASKS: SampleTask[] = [
  {
    title: 'Prepare Q4 onboarding checklist',
    description: 'Compile the onboarding checklist for new hires starting in Q4.',
    priority: 'MEDIUM',
    dueInDays: 7,
    assignee: 'employee1',
    transitions: [],
  },
  {
    title: 'Update customer FAQ page',
    description: 'Refresh the FAQ answers about billing and account recovery.',
    priority: 'LOW',
    dueInDays: 3,
    assignee: 'employee1',
    transitions: [{ to: 'IN_PROGRESS', by: 'employee1' }],
  },
  {
    title: 'Reconcile September expense reports',
    description: 'Match submitted expense reports against card statements for September.',
    priority: 'HIGH',
    dueInDays: 2,
    assignee: 'employee2',
    transitions: [
      { to: 'IN_PROGRESS', by: 'employee2' },
      { to: 'PENDING_APPROVAL', by: 'employee2' },
    ],
  },
  {
    title: 'Draft security awareness newsletter',
    description: 'Write the monthly newsletter covering phishing and password hygiene.',
    priority: 'MEDIUM',
    dueInDays: -1,
    assignee: 'employee2',
    transitions: [
      { to: 'IN_PROGRESS', by: 'employee2' },
      { to: 'PENDING_APPROVAL', by: 'employee2' },
      {
        to: 'IN_PROGRESS',
        by: 'admin',
        reason: 'Please add a section on reporting suspicious emails and cite the policy page.',
      },
    ],
  },
  {
    title: 'Archive 2024 project files',
    description: 'Move closed 2024 project folders to the archive drive.',
    priority: 'LOW',
    dueInDays: -5,
    assignee: 'employee1',
    transitions: [
      { to: 'IN_PROGRESS', by: 'employee1' },
      { to: 'PENDING_APPROVAL', by: 'employee1' },
      { to: 'COMPLETED', by: 'admin' },
    ],
  },
];

function todayPlusDays(days: number): Date {
  const today = parseDateOnly(formatDateOnly(new Date()));
  today.setUTCDate(today.getUTCDate() + days);
  return today;
}

async function upsertUsers(prisma: PrismaClient, users: DemoUser[]) {
  const ids = {} as Record<UserKey, string>;
  for (const user of users) {
    const existing = await prisma.user.findUnique({
      where: { email: user.email },
      select: { id: true },
    });
    if (existing) {
      // Never touch an existing user (password, name and role stay as they are).
      ids[user.key] = existing.id;
      console.info(`  kept    ${user.email}`);
      continue;
    }
    const passwordHash = await bcrypt.hash(user.password, BCRYPT_COST);
    // upsert (not create) so a concurrent seed run cannot fail on the unique email.
    const saved = await prisma.user.upsert({
      where: { email: user.email },
      create: { name: user.name, email: user.email, role: user.role, passwordHash },
      update: {}, // never reset an existing user's password, name or role
      select: { id: true },
    });
    ids[user.key] = saved.id;
    console.info(`  created ${user.email} (${user.role})`);
  }
  return ids;
}

async function seedSampleTasks(prisma: PrismaClient, ids: Record<UserKey, string>) {
  await prisma.$transaction(async (tx) => {
    const existingTasks = await tx.task.count();
    if (existingTasks > 0) {
      console.info(`  skipped sample tasks (${existingTasks} task(s) already exist)`);
      return;
    }

    const base = Date.now() - 10 * 24 * 60 * 60 * 1000; // ten days ago

    for (const [index, sample] of SAMPLE_TASKS.entries()) {
      // Space events one hour apart so the history order is deterministic.
      let clock = base + index * 24 * 60 * 60 * 1000;
      const at = () => new Date((clock += 60 * 60 * 1000));

      const createdAt = at();
      const history: Prisma.TaskStatusHistoryCreateWithoutTaskInput[] = [
        { fromStatus: null, toStatus: 'PENDING', actor: { connect: { id: ids.admin } }, createdAt },
      ];

      let status: Status = 'PENDING';
      let review: { reviewedById: string; reviewedAt: Date } | undefined;
      for (const step of sample.transitions) {
        const when = at();
        history.push({
          fromStatus: status,
          toStatus: step.to,
          actor: { connect: { id: ids[step.by] } },
          reason: step.reason ?? null,
          createdAt: when,
        });
        if (step.by === 'admin') review = { reviewedById: ids.admin, reviewedAt: when };
        status = step.to;
      }

      await tx.task.create({
        data: {
          title: sample.title,
          description: sample.description,
          priority: sample.priority,
          status,
          dueDate: todayPlusDays(sample.dueInDays),
          assignedTo: { connect: { id: ids[sample.assignee] } },
          createdBy: { connect: { id: ids.admin } },
          ...(review
            ? {
                reviewedBy: { connect: { id: review.reviewedById } },
                reviewedAt: review.reviewedAt,
              }
            : {}),
          createdAt,
          history: { create: history },
        },
      });
    }
    console.info(`  created ${SAMPLE_TASKS.length} sample tasks with status history`);
  });
}

async function main() {
  const env = seedEnvSchema.parse(process.env);
  const users: DemoUser[] = [
    {
      key: 'admin',
      name: 'Alex Admin',
      email: 'admin@demo.com',
      role: 'ADMIN',
      password: env.SEED_ADMIN_PASSWORD ?? 'Admin@12345',
    },
    {
      key: 'employee1',
      name: 'Jordan Lee',
      email: 'employee1@demo.com',
      role: 'EMPLOYEE',
      password: env.SEED_EMPLOYEE1_PASSWORD ?? 'Employee1@12345',
    },
    {
      key: 'employee2',
      name: 'Priya Patel',
      email: 'employee2@demo.com',
      role: 'EMPLOYEE',
      password: env.SEED_EMPLOYEE2_PASSWORD ?? 'Employee2@12345',
    },
  ];

  const prisma = createPrismaClient(env.DATABASE_URL, {
    production: env.NODE_ENV === 'production',
  });
  try {
    console.info('Seeding demo users...');
    const ids = await upsertUsers(prisma, users);
    console.info('Seeding sample tasks...');
    await seedSampleTasks(prisma, ids);
    console.info('Seed complete.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  if (error instanceof z.ZodError) {
    console.error(
      `Invalid seed configuration:\n${error.issues
        .map((issue) => `  - ${String(issue.path[0])}: ${issue.message}`)
        .join('\n')}`,
    );
  } else {
    console.error('Seed failed:', error instanceof Error ? error.message : error);
  }
  process.exit(1);
});
