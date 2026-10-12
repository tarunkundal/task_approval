import path from 'node:path';

/** Seeded demo accounts (apps/api/prisma/seed.ts defaults; test database only). */
export const USERS = {
  admin: { email: 'admin@demo.com', password: 'Admin@12345', name: 'Alex Admin', role: 'Admin' },
  employee1: {
    email: 'employee1@demo.com',
    password: 'Employee1@12345',
    name: 'Jordan Lee',
    role: 'Employee',
  },
  employee2: {
    email: 'employee2@demo.com',
    password: 'Employee2@12345',
    name: 'Priya Patel',
    role: 'Employee',
  },
} as const;

export type UserKey = keyof typeof USERS;

/** Saved sessions written by auth.setup.ts (gitignored). */
export function storageStatePath(user: UserKey): string {
  return path.join(__dirname, '.auth', `${user}.json`);
}

/** Unique, recognisable title for data created by a test run. */
export function uniqueTitle(label: string): string {
  return `E2E ${Date.now()} ${label}`;
}
