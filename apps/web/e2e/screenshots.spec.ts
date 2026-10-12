import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { storageStatePath } from './fixtures';
import { apiAs, ok, seededEmployees, settle, startAndSubmit, type TaskDto } from './helpers';

/**
 * Full-page screenshots of the main screens for the docs (docs/screenshots/phase5/). Not part of
 * `pnpm test:e2e`: run `pnpm screenshots`, which resets and re-seeds the test database first, so
 * the images show only the seed data plus the tasks below. Those use a fictional company name
 * ("Northwind") so the list screenshot can filter to them; earlier copies are deleted first.
 */

const OUT_DIR = path.resolve(__dirname, '../../../docs/screenshots/phase5');
const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };
const MARKER = 'Northwind';

/**
 * Full-page capture. The viewport is grown to the page height first: the sidebar and dialog
 * overlays are `position: fixed` with viewport-height sizing, so a plain `fullPage` screenshot
 * would cut them off at the original viewport height.
 */
async function capture(page: Page, name: string): Promise<void> {
  await settle(page);
  const viewport = page.viewportSize() ?? DESKTOP;
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  if (height > viewport.height) {
    await page.setViewportSize({ width: viewport.width, height });
    await settle(page);
  }
  await page.screenshot({
    path: path.join(OUT_DIR, `${name}.png`),
    animations: 'disabled',
    caret: 'hide',
  });
}

let admin: APIRequestContext;
let employee1: APIRequestContext;
let employee2: APIRequestContext;
const tasks: Record<'contract' | 'onboarding' | 'budget', TaskDto> = {} as never;

test.beforeAll(async () => {
  mkdirSync(OUT_DIR, { recursive: true });
  admin = await apiAs('admin');
  employee1 = await apiAs('employee1');
  employee2 = await apiAs('employee2');
  const employees = await seededEmployees(admin);

  // Remove the previous run's screenshot tasks (deleted tasks disappear from every list).
  const previous = await ok<{ data: TaskDto[] }>(
    await admin.get(`/api/v1/tasks?q=${MARKER}&pageSize=100`),
  );
  for (const task of previous.data) {
    expect((await admin.delete(`/api/v1/tasks/${task.id}`)).status()).toBe(204);
  }

  const create = async (
    assignee: 'employee1' | 'employee2',
    title: string,
    priority: string,
    dueDate: string,
    description: string,
  ) =>
    ok<TaskDto>(
      await admin.post('/api/v1/tasks', {
        data: { title, priority, dueDate, description, assignedToId: employees[assignee].id },
      }),
    );

  // Created oldest first, so the dashboard's "Recent tasks" lists them newest first.
  await create(
    'employee2',
    `${MARKER} team offsite agenda`,
    'LOW',
    '2030-09-18',
    'Draft the agenda and book the venue for the autumn offsite.',
  );

  const training = await create(
    'employee2',
    `${MARKER} security training follow-up`,
    'MEDIUM',
    '2020-03-02',
    'Chase the remaining sign-offs for the annual security training.',
  );
  await ok(await employee2.post(`/api/v1/tasks/${training.id}/start`));

  tasks.budget = await create(
    'employee1',
    `${MARKER} budget forecast update`,
    'HIGH',
    '2030-10-31',
    'Update the Q4 budget forecast with the latest hiring plan and vendor costs.',
  );
  await startAndSubmit(employee1, tasks.budget.id);
  await ok(
    await admin.post(`/api/v1/tasks/${tasks.budget.id}/reject`, {
      data: {
        reason:
          'The hiring plan figures are from last quarter. Please use the October plan and add a short note on the vendor cost changes.',
      },
    }),
  );

  tasks.onboarding = await create(
    'employee1',
    `${MARKER} onboarding checklist`,
    'MEDIUM',
    '2030-11-07',
    'Compile the onboarding checklist for the November starters.',
  );
  await startAndSubmit(employee1, tasks.onboarding.id);

  tasks.contract = await create(
    'employee1',
    `${MARKER} vendor contract review`,
    'HIGH',
    '2030-11-14',
    'Review the renewal terms of the facilities vendor contract and flag any changes.\nAttach the signed quote when done.',
  );
  await startAndSubmit(employee1, tasks.contract.id);
  await ok(
    await admin.post(`/api/v1/tasks/${tasks.contract.id}/reject`, {
      data: { reason: 'Please attach the signed vendor quote and confirm the renewal date.' },
    }),
  );
  await ok(
    await employee1.post(`/api/v1/tasks/${tasks.contract.id}/comments`, {
      data: { body: 'Signed quote attached. The renewal date is 1 December.' },
    }),
  );
  await ok(
    await admin.post(`/api/v1/tasks/${tasks.contract.id}/comments`, {
      data: { body: 'Thanks, that covers it.' },
    }),
  );
  await ok(await employee1.post(`/api/v1/tasks/${tasks.contract.id}/submit`));
  await ok(await admin.post(`/api/v1/tasks/${tasks.contract.id}/approve`));
});

test.afterAll(async () => {
  await admin.dispose();
  await employee1.dispose();
  await employee2.dispose();
});

test.use({ viewport: DESKTOP });

test('login', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  await capture(page, 'login');
});

test.describe('admin', () => {
  test.use({ storageState: storageStatePath('admin') });

  test('dashboard', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByTestId('stat-Total tasks')).toHaveText(/^\d+$/);
    await expect(
      page.getByTestId('approval-row').filter({ hasText: tasks.onboarding.title }),
    ).toBeVisible();
    await capture(page, 'admin-dashboard');
  });

  test('tasks list with filters', async ({ page }) => {
    await page.goto(`/admin/tasks?q=${MARKER}&sort=dueDate&order=asc`);
    await expect(page.getByTestId('task-row')).toHaveCount(5);
    await expect(page.getByRole('searchbox', { name: 'Search by title' })).toHaveValue(MARKER);
    await capture(page, 'admin-tasks');
  });

  test('task detail with comments and history', async ({ page }) => {
    await page.goto(`/admin/tasks/${tasks.contract.id}`);
    await expect(page.getByTestId('history-entry')).toHaveCount(6);
    await expect(page.getByText('Thanks, that covers it.')).toBeVisible();
    await capture(page, 'admin-task-detail');
  });

  test('reject dialog', async ({ page }) => {
    await page.goto(`/admin/tasks/${tasks.onboarding.id}`);
    await expect(page.getByTestId('history-entry')).toHaveCount(3);
    await page.getByRole('button', { name: /^Reject/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Reject task' });
    await dialog
      .getByLabel('Reason for rejection')
      .fill('Please add the laptop request step and the building access form.');
    await capture(page, 'admin-reject-dialog');
  });

  test('employees', async ({ page }) => {
    await page.goto('/admin/employees');
    await expect(page.getByTestId('employee-row').first()).toBeVisible();
    await capture(page, 'admin-employees');
  });
});

test.describe('employee', () => {
  test.use({ storageState: storageStatePath('employee1') });

  test('dashboard', async ({ page }) => {
    await page.goto('/employee?pageSize=10');
    await expect(page.getByTestId('task-row').filter({ hasText: MARKER }).first()).toBeVisible();
    await capture(page, 'employee-dashboard');
  });

  test('task detail with the feedback alert', async ({ page }) => {
    await page.goto(`/employee/tasks/${tasks.budget.id}`);
    await expect(page.getByTestId('task-feedback')).toBeVisible();
    await expect(page.getByTestId('history-entry')).toHaveCount(4);
    await capture(page, 'employee-task-feedback');
  });
});

test.describe('mobile', () => {
  test.use({ storageState: storageStatePath('admin'), viewport: MOBILE });

  test('admin dashboard at 390 px', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByTestId('stat-Total tasks')).toHaveText(/^\d+$/);
    await capture(page, 'mobile-admin-dashboard');
  });

  test('navigation sheet at 390 px', async ({ page }) => {
    await page.goto('/admin/tasks');
    await expect(page.getByTestId('task-card').first()).toBeVisible();
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await settle(page);
    await page.screenshot({
      path: path.join(OUT_DIR, 'mobile-nav.png'),
      animations: 'disabled',
      caret: 'hide',
    });
  });
});
