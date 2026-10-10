import { beforeAll, describe, expect, it } from 'vitest';
import { AppError } from '../src/errors/app-error.js';
import { parseDateOnly } from '../src/lib/dates.js';
import { prisma } from '../src/lib/prisma.js';
import { findTaskInScope, visibleTasksWhere, type TaskActor } from '../src/services/task-access.js';
import { createTestUser } from './helpers/auth.js';

let admin: TaskActor;
let employee1: TaskActor;
let employee2: TaskActor;
let ownTaskId: string;
let otherTaskId: string;
let deletedTaskId: string;

async function createTask(title: string, assignedToId: string, deletedAt: Date | null = null) {
  const task = await prisma.task.create({
    data: {
      title,
      description: `${title} description`,
      dueDate: parseDateOnly('2030-01-15'),
      assignedToId,
      createdById: admin.id,
      deletedAt,
    },
    select: { id: true },
  });
  return task.id;
}

beforeAll(async () => {
  const password = 'Password@12345';
  admin = await createTestUser({ name: 'Admin', email: 'a@test.local', role: 'ADMIN', password });
  employee1 = await createTestUser({
    name: 'Employee One',
    email: 'e1@test.local',
    role: 'EMPLOYEE',
    password,
  });
  employee2 = await createTestUser({
    name: 'Employee Two',
    email: 'e2@test.local',
    role: 'EMPLOYEE',
    password,
  });
  ownTaskId = await createTask('Employee 1 task', employee1.id);
  otherTaskId = await createTask('Employee 2 task', employee2.id);
  deletedTaskId = await createTask('Deleted employee 1 task', employee1.id, new Date());
});

async function expectNotFound(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ status: 404, code: 'NOT_FOUND', message: 'Task not found' });
}

describe('task ownership policy', () => {
  it('lets an employee load their own task', async () => {
    const task = await findTaskInScope(employee1, ownTaskId);

    expect(task.id).toBe(ownTaskId);
    expect(task.assignedToId).toBe(employee1.id);
  });

  it("returns 404 for another employee's task", async () => {
    await expectNotFound(findTaskInScope(employee1, otherTaskId));
    await expectNotFound(findTaskInScope(employee2, ownTaskId));
  });

  it('returns 404 for a soft-deleted task, for employees and admins', async () => {
    await expectNotFound(findTaskInScope(employee1, deletedTaskId));
    await expectNotFound(findTaskInScope(admin, deletedTaskId));
  });

  it('returns 404 for an id that does not exist', async () => {
    await expectNotFound(findTaskInScope(admin, 'cnonexistenttask0000000000'));
  });

  it('lets an admin load any non-deleted task', async () => {
    expect((await findTaskInScope(admin, ownTaskId)).id).toBe(ownTaskId);
    expect((await findTaskInScope(admin, otherTaskId)).id).toBe(otherTaskId);
  });

  it('scopes list queries in the database query itself', async () => {
    expect(visibleTasksWhere(employee1)).toEqual({ deletedAt: null, assignedToId: employee1.id });
    expect(visibleTasksWhere(admin)).toEqual({ deletedAt: null });

    const employeeTasks = await prisma.task.findMany({
      where: visibleTasksWhere(employee1),
      select: { id: true },
    });
    const adminTasks = await prisma.task.findMany({
      where: visibleTasksWhere(admin),
      select: { id: true },
    });

    expect(employeeTasks.map((task) => task.id)).toEqual([ownTaskId]);
    expect(adminTasks.map((task) => task.id).sort()).toEqual([ownTaskId, otherTaskId].sort());
  });
});
