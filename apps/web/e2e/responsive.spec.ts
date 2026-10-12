import { expect, test, type Page } from '@playwright/test';
import { storageStatePath, uniqueTitle } from './fixtures';
import { apiAs, createTaskAs, seededEmployees, settle, type TaskDto } from './helpers';

/**
 * Phone viewport (390×844): pages never scroll sideways (wide tables scroll inside their own
 * container), the navigation sheet works, and the task detail stays readable.
 */

test.use({ viewport: { width: 390, height: 844 } });

async function expectNoPageOverflow(page: Page): Promise<void> {
  await settle(page);
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `horizontal page overflow on ${page.url()}`).toBeLessThanOrEqual(innerWidth);
}

let task: TaskDto;

test.beforeAll(async () => {
  const admin = await apiAs('admin');
  const employees = await seededEmployees(admin);
  task = await createTaskAs(
    admin,
    employees.employee1.id,
    uniqueTitle('mobile with a fairly long title that has to wrap on a phone screen'),
    { priority: 'HIGH' },
  );
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

  test('the task table scrolls inside its own container', async ({ page }) => {
    await page.goto('/admin/tasks');
    await expect(page.getByTestId('task-row').first()).toBeVisible();
    await expectNoPageOverflow(page);
    const container = page.locator('[data-slot="table-container"]').first();
    const { scrollWidth, clientWidth, overflowX } = await container.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      overflowX: getComputedStyle(element).overflowX,
    }));
    expect(overflowX).toBe('auto');
    // The table is wider than the phone, so the container (not the page) scrolls.
    expect(scrollWidth).toBeGreaterThan(clientWidth);
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
    expect(box?.width ?? 0).toBeLessThanOrEqual(390);
    for (const name of ['Edit', 'Delete']) {
      const control = page.getByRole(name === 'Edit' ? 'link' : 'button', { name, exact: true });
      await expect(control).toBeInViewport();
    }
  });
});

test.describe('employee', () => {
  test.use({ storageState: storageStatePath('employee1') });

  test('dashboard and task detail do not overflow', async ({ page }) => {
    await page.goto('/employee');
    await expect(page.getByTestId('task-row').first()).toBeVisible();
    await expectNoPageOverflow(page);

    await page.goto(`/employee/tasks/${task.id}`);
    await expect(page.getByRole('heading', { level: 1, name: task.title })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start task' })).toBeVisible();
    await expectNoPageOverflow(page);
  });
});
