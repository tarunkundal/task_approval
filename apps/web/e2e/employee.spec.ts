import { expect, test, type APIRequestContext } from '@playwright/test';
import { storageStatePath, uniqueTitle } from './fixtures';
import {
  apiAs,
  choose,
  createTaskAs,
  expectNoAdminControls,
  ok,
  seededEmployees,
  toast,
  type UserDto,
} from './helpers';

/**
 * Employee screens against the real API (test DB): own counts, URL-synced filters, overdue
 * badges, scope (another employee's task is "not found"), no admin controls, stale actions.
 */

let admin: APIRequestContext;
let employee1Api: APIRequestContext;
let employee2Api: APIRequestContext;
let employees: Record<'employee1' | 'employee2', UserDto>;

test.use({ storageState: storageStatePath('employee1') });

test.beforeAll(async () => {
  admin = await apiAs('admin');
  employee1Api = await apiAs('employee1');
  employee2Api = await apiAs('employee2');
  employees = await seededEmployees(admin);
});

test.afterAll(async () => {
  await admin?.dispose();
  await employee1Api?.dispose();
  await employee2Api?.dispose();
});

test.describe('dashboard', () => {
  test('shows the own counts and the assigned list without admin controls', async ({ page }) => {
    const mine = await createTaskAs(admin, employees.employee1.id, uniqueTitle('mine'));
    const theirs = await createTaskAs(admin, employees.employee2.id, uniqueTitle('theirs'));
    const summary = await ok<{ total: number; byStatus: Record<string, number> }>(
      await employee1Api.get('/api/v1/dashboard/summary'),
    );

    await page.goto('/employee');
    await expect(page.getByRole('heading', { level: 1, name: 'My tasks' })).toBeVisible();
    await expect(page.getByTestId('stat-Total tasks')).toHaveText(String(summary.total));
    await expect(page.getByTestId('stat-Pending')).toHaveText(String(summary.byStatus.PENDING));
    for (const label of ['In progress', 'Pending approval', 'Completed', 'Overdue']) {
      await expect(page.getByTestId(`stat-${label}`)).toHaveText(/^\d+$/);
    }
    await expect(page.getByRole('link', { name: /Pending approval/ })).toHaveAttribute(
      'href',
      '/employee?status=PENDING_APPROVAL',
    );

    const table = page.getByRole('table', { name: 'Tasks assigned to you' });
    await expect(table.getByRole('columnheader', { name: 'Assignee' })).toHaveCount(0);
    await expect(page.getByTestId('task-row').filter({ hasText: mine.title })).toHaveCount(1);
    await expect(page.getByTestId('task-row').filter({ hasText: theirs.title })).toHaveCount(0);
    await expect(
      page.getByTestId('task-row').filter({ hasText: mine.title }).getByRole('link'),
    ).toHaveAttribute('href', `/employee/tasks/${mine.id}`);
    await expect(page.getByRole('searchbox')).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Employee' })).toHaveCount(0);
    await expectNoAdminControls(page);
  });

  test('status and priority filters live in the URL and survive reload', async ({ page }) => {
    const prefix = uniqueTitle('filters');
    const high = await createTaskAs(admin, employees.employee1.id, `${prefix} high`, {
      priority: 'HIGH',
    });
    const low = await createTaskAs(admin, employees.employee1.id, `${prefix} low`, {
      priority: 'LOW',
    });
    const rows = page.getByTestId('task-row');

    await page.goto('/employee');
    await choose(page, 'Status', 'Pending');
    await expect(page).toHaveURL(/[?&]status=PENDING(&|$)/);
    await page.reload();
    await expect(page).toHaveURL(/[?&]status=PENDING(&|$)/);
    await expect(page.getByRole('combobox', { name: 'Status' })).toHaveText('Pending');
    await expect(rows.filter({ hasText: high.title })).toHaveCount(1);
    await expect(rows.filter({ hasText: low.title })).toHaveCount(1);

    await choose(page, 'Priority', 'High');
    await expect(page).toHaveURL(/[?&]priority=HIGH(&|$)/);
    await expect(page).toHaveURL(/[?&]status=PENDING(&|$)/);
    await expect(rows.filter({ hasText: high.title })).toHaveCount(1);
    await expect(rows.filter({ hasText: low.title })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Priority' })).toHaveText('High');
    await expect(rows.filter({ hasText: low.title })).toHaveCount(0);

    await choose(page, 'Status', 'Completed');
    await expect(rows.filter({ hasText: high.title })).toHaveCount(0);
    await page.getByRole('button', { name: 'Clear filters' }).first().click();
    await expect(page).toHaveURL('/employee');
    await expect(rows.filter({ hasText: low.title })).toHaveCount(1);
  });

  test('search and employee URL params are ignored (no hidden filters)', async ({ page }) => {
    const mine = await createTaskAs(admin, employees.employee1.id, uniqueTitle('hidden filters'));
    const rows = page.getByTestId('task-row');

    // Neither control exists on the employee list, so neither key may narrow it.
    await page.goto(
      `/employee?q=${encodeURIComponent('no task has this title')}&assignedToId=${employees.employee2.id}`,
    );
    await expect(rows.filter({ hasText: mine.title })).toHaveCount(1);
    await expect(page.getByText('No tasks match these filters')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0);

    // The next filter change writes a clean URL without the ignored keys.
    await choose(page, 'Status', 'Pending');
    await expect(page).toHaveURL('/employee?status=PENDING');
    await expect(rows.filter({ hasText: mine.title })).toHaveCount(1);
  });

  test('a summary card opens the filtered list', async ({ page }) => {
    await page.goto('/employee');
    await page.getByRole('link', { name: /^In progress/ }).click();
    await expect(page).toHaveURL('/employee?status=IN_PROGRESS');
    await expect(page.getByRole('combobox', { name: 'Status' })).toHaveText('In progress');
  });
});

test.describe('overdue', () => {
  test.use({ storageState: storageStatePath('employee2'), timezoneId: 'Pacific/Honolulu' });

  test('past-due open tasks show an Overdue badge; future and completed ones do not', async ({
    page,
  }) => {
    const prefix = uniqueTitle('overdue');
    const late = await createTaskAs(admin, employees.employee2.id, `${prefix} late`, {
      dueDate: '2020-01-15',
    });
    await ok(await employee2Api.post(`/api/v1/tasks/${late.id}/start`));
    const future = await createTaskAs(admin, employees.employee2.id, `${prefix} future`, {
      dueDate: '2031-01-15',
    });
    const done = await createTaskAs(admin, employees.employee2.id, `${prefix} done`, {
      dueDate: '2020-01-10',
    });
    await ok(await employee2Api.post(`/api/v1/tasks/${done.id}/start`));
    await ok(await employee2Api.post(`/api/v1/tasks/${done.id}/submit`));
    await ok(await admin.post(`/api/v1/tasks/${done.id}/approve`));

    await page.goto('/employee');
    const rows = page.getByTestId('task-row');
    const lateRow = rows.filter({ hasText: late.title });
    await expect(lateRow).toContainText('Overdue');
    await expect(lateRow).toContainText('Jan 15, 2020');
    await expect(rows.filter({ hasText: future.title })).not.toContainText('Overdue');
    await expect(rows.filter({ hasText: future.title })).toContainText('Jan 15, 2031');
    await expect(rows.filter({ hasText: done.title })).not.toContainText('Overdue');

    await lateRow.getByRole('link', { name: late.title }).click();
    await expect(page.getByTestId('task-badges')).toContainText('Overdue');
    await expect(page.getByTestId('task-due-date')).toHaveText('Jan 15, 2020');
  });
});

test.describe('scope', () => {
  test.use({ storageState: storageStatePath('employee2') });

  test("another employee's task id shows Task not found", async ({ page }) => {
    const other = await createTaskAs(admin, employees.employee1.id, uniqueTitle('not-yours'));
    await page.goto(`/employee/tasks/${other.id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Task not found' })).toBeVisible();
    await expect(page.getByText(other.title)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Back to my tasks' })).toHaveAttribute(
      'href',
      '/employee',
    );
  });

  test('a malformed task id shows Task not found', async ({ page }) => {
    await page.goto('/employee/tasks/not-a-cuid');
    await expect(page.getByRole('heading', { level: 1, name: 'Task not found' })).toBeVisible();
  });
});

test.describe('scope (employee1)', () => {
  test("employee2's task id shows Task not found", async ({ page }) => {
    const other = await createTaskAs(admin, employees.employee2.id, uniqueTitle('not-yours-1'));
    await page.goto(`/employee/tasks/${other.id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Task not found' })).toBeVisible();
    await expect(page.getByText(other.title)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Start task|Submit for approval/ })).toHaveCount(
      0,
    );
  });
});

test.describe('task detail', () => {
  test('in progress: Submit only, comments and history, no admin controls', async ({ page }) => {
    const task = await createTaskAs(admin, employees.employee1.id, uniqueTitle('detail'));
    await ok(await employee1Api.post(`/api/v1/tasks/${task.id}/start`));

    await page.goto(`/employee/tasks/${task.id}`);
    await expect(page.getByRole('heading', { level: 1, name: task.title })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit for approval' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start task' })).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: /Comments/ })).toBeVisible();
    await expect(page.getByText('No comments yet')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'History' })).toBeVisible();
    await expect(page.getByTestId('history-entry')).toHaveCount(2);
    await expect(page.getByTestId('task-feedback')).toHaveCount(0);
    await expectNoAdminControls(page);
  });

  test('a stale Start shows the API error and refetches the task', async ({ page, context }) => {
    const task = await createTaskAs(admin, employees.employee1.id, uniqueTitle('stale'));
    const other = await context.newPage();
    await page.goto(`/employee/tasks/${task.id}`);
    await other.goto(`/employee/tasks/${task.id}`);
    await expect(page.getByRole('button', { name: 'Start task' })).toBeVisible();
    await expect(other.getByRole('button', { name: 'Start task' })).toBeVisible();

    await other.getByRole('button', { name: 'Start task' }).click();
    await expect(toast(other, 'Task started')).toBeVisible();

    // This page still shows Pending.
    await page.getByRole('button', { name: 'Start task' }).click();
    await expect(
      toast(page, 'Task cannot be started while its status is IN_PROGRESS'),
    ).toBeVisible();
    await expect(page.getByTestId('task-badges')).toContainText('In progress');
    await expect(page.getByRole('button', { name: 'Start task' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Submit for approval' })).toBeVisible();
    await other.close();
  });

  test('commenting on a task deleted meanwhile shows the error and Task not found', async ({
    page,
  }) => {
    const task = await createTaskAs(admin, employees.employee1.id, uniqueTitle('gone'));
    await page.goto(`/employee/tasks/${task.id}`);
    await expect(page.getByRole('heading', { level: 1, name: task.title })).toBeVisible();
    await page.getByLabel('Add a comment').fill('Is this still needed?');

    expect((await admin.delete(`/api/v1/tasks/${task.id}`)).status()).toBe(204);

    await page.getByRole('button', { name: 'Post comment' }).click();
    // POST /comments → 404: the API message is toasted and the refetch shows "Task not found".
    await expect(
      page.locator('[data-sonner-toast][data-type="error"]').filter({ hasText: 'Task not found' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Task not found' })).toBeVisible();
  });

  test('commenting on a task reassigned meanwhile shows the error and Task not found', async ({
    page,
  }) => {
    const task = await createTaskAs(admin, employees.employee1.id, uniqueTitle('reassigned'));
    await page.goto(`/employee/tasks/${task.id}`);
    await expect(page.getByRole('heading', { level: 1, name: task.title })).toBeVisible();
    await page.getByLabel('Add a comment').fill('Picking this up now.');

    await ok(
      await admin.patch(`/api/v1/tasks/${task.id}`, {
        data: { assignedToId: employees.employee2.id },
      }),
    );

    await page.getByRole('button', { name: 'Post comment' }).click();
    await expect(
      page.locator('[data-sonner-toast][data-type="error"]').filter({ hasText: 'Task not found' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Task not found' })).toBeVisible();
    await expect(page.getByText(task.title)).toHaveCount(0);
  });
});
