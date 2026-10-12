import { expect, test, type Locator, type Page } from '@playwright/test';
import { storageStatePath, uniqueTitle } from './fixtures';
import {
  apiAs,
  createTaskAs,
  seededEmployees,
  settle,
  startAndSubmit,
  type TaskDto,
} from './helpers';

/**
 * Phone viewport (390×844): pages never scroll sideways, task lists and the approval queue are
 * stacked cards (the tables only render from `lg` up) with every control inside the screen width,
 * the navigation sheet works, and the task detail stays readable.
 */

const PHONE = { width: 390, height: 844 };
test.use({ viewport: PHONE });

async function expectNoPageOverflow(page: Page): Promise<void> {
  await settle(page);
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `horizontal page overflow on ${page.url()}`).toBeLessThanOrEqual(innerWidth);
}

/**
 * Visible and horizontally inside the viewport without any sideways scrolling. Measured before
 * anything is scrolled, so a control hidden past the edge of a scroll container fails here.
 */
async function expectWithinScreenWidth(locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  const { left, right, innerWidth } = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, innerWidth: window.innerWidth };
  });
  expect(left, 'left edge on screen').toBeGreaterThanOrEqual(0);
  expect(right, 'right edge on screen').toBeLessThanOrEqual(innerWidth);
}

let task: TaskDto;
let awaitingReview: TaskDto;

test.beforeAll(async () => {
  const admin = await apiAs('admin');
  const employee1 = await apiAs('employee1');
  const employees = await seededEmployees(admin);
  task = await createTaskAs(
    admin,
    employees.employee1.id,
    uniqueTitle('mobile with a fairly long title that has to wrap on a phone screen'),
    { priority: 'HIGH' },
  );
  awaitingReview = await createTaskAs(admin, employees.employee1.id, uniqueTitle('mobile review'), {
    priority: 'LOW',
  });
  await startAndSubmit(employee1, awaitingReview.id);
  await admin.dispose();
  await employee1.dispose();
});

test.afterAll(async () => {
  // Leave nothing waiting in the approval queue for later specs.
  const admin = await apiAs('admin');
  await admin.post(`/api/v1/tasks/${awaitingReview.id}/approve`);
  await admin.dispose();
});

test.describe('admin', () => {
  test.use({ storageState: storageStatePath('admin') });

  test('dashboard, tasks, new task and employees do not overflow', async ({ page }) => {
    for (const path of ['/admin', '/admin/tasks', '/admin/tasks/new', '/admin/employees']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoPageOverflow(page);
    }
  });

  test('approval queue: Approve, Reject and priority are on screen without scrolling sideways', async ({
    page,
  }) => {
    await page.goto('/admin');
    await expect(page.getByTestId('stat-Total tasks')).toHaveText(/^\d+$/);
    await expectNoPageOverflow(page);
    // The queue is a list of cards on a phone; the table isn't rendered for assistive tech.
    await expect(page.getByRole('table', { name: 'Approval queue' })).toHaveCount(0);
    const card = page
      .getByRole('list', { name: 'Approval queue' })
      .getByTestId('approval-card')
      .filter({ hasText: awaitingReview.title });
    await expect(card).toHaveCount(1);

    await expectWithinScreenWidth(card);
    await expectWithinScreenWidth(
      card.getByRole('button', { name: `Approve “${awaitingReview.title}”` }),
    );
    await expectWithinScreenWidth(
      card.getByRole('button', { name: `Reject “${awaitingReview.title}”` }),
    );
    await expectWithinScreenWidth(card.locator('[data-priority="LOW"]'));

    // The card's Reject opens the same dialog as the desktop table.
    await card.getByRole('button', { name: `Reject “${awaitingReview.title}”` }).click();
    const dialog = page.getByRole('dialog', { name: 'Reject task' });
    await expect(dialog).toBeVisible();
    await expectWithinScreenWidth(dialog.getByRole('button', { name: 'Reject task' }));
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  });

  test('recent tasks and the task list are cards with priority, status and actions on screen', async ({
    page,
  }) => {
    await page.goto('/admin');
    const recent = page.getByRole('list', { name: 'Recent tasks' }).getByTestId('task-card');
    await expect(recent.first()).toBeVisible();
    await expect(page.getByRole('table', { name: 'Recent tasks' })).toHaveCount(0);

    await page.goto(`/admin/tasks?q=${encodeURIComponent(task.title)}`);
    const card = page.getByRole('list', { name: 'All tasks' }).getByTestId('task-card');
    await expect(card).toHaveCount(1);
    await expect(page.getByRole('table', { name: 'All tasks' })).toHaveCount(0);
    await expectNoPageOverflow(page);
    await expectWithinScreenWidth(card.getByRole('link', { name: task.title }));
    await expectWithinScreenWidth(card.locator('[data-priority="HIGH"]'));
    await expect(card).toContainText('Pending');
    await expect(card).toContainText('Jordan Lee');
    await expectWithinScreenWidth(
      card.getByRole('button', { name: `Actions for “${task.title}”` }),
    );
  });

  test('the navigation sheet opens, navigates and closes', async ({ page }) => {
    await page.goto('/admin');
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await sheet.getByRole('link', { name: 'Tasks' }).click();
    await expect(page).toHaveURL('/admin/tasks');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'Tasks' })).toBeVisible();
  });

  test('task detail is readable: title wraps, actions and history fit', async ({ page }) => {
    await page.goto(`/admin/tasks/${task.id}`);
    const heading = page.getByRole('heading', { level: 1, name: task.title });
    await expect(heading).toBeVisible();
    await expect(page.getByTestId('history-entry').first()).toBeVisible();
    await expectNoPageOverflow(page);
    const box = await heading.boundingBox();
    expect(box?.width ?? 0).toBeLessThanOrEqual(PHONE.width);
    for (const name of ['Edit', 'Delete']) {
      const control = page.getByRole(name === 'Edit' ? 'link' : 'button', { name, exact: true });
      await expect(control).toBeInViewport();
    }
  });
});

test.describe('desktop', () => {
  test.use({ storageState: storageStatePath('admin'), viewport: { width: 1280, height: 800 } });

  test('the tables are back from the lg breakpoint, and the cards are hidden', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('table', { name: 'Approval queue' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Recent tasks' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Approval queue' })).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Recent tasks' })).toHaveCount(0);
  });
});

test.describe('employee', () => {
  test.use({ storageState: storageStatePath('employee1') });

  test('dashboard and task detail do not overflow', async ({ page }) => {
    await page.goto('/employee');
    const card = page
      .getByRole('list', { name: 'Tasks assigned to you' })
      .getByTestId('task-card')
      .filter({ hasText: task.title });
    await expect(card).toHaveCount(1);
    await expectNoPageOverflow(page);
    await expectWithinScreenWidth(card.locator('[data-priority="HIGH"]'));
    await expect(card).not.toContainText('Assignee');

    await page.goto(`/employee/tasks/${task.id}`);
    await expect(page.getByRole('heading', { level: 1, name: task.title })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start task' })).toBeVisible();
    await expectNoPageOverflow(page);
  });
});
