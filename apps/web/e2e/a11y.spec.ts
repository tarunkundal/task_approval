import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { storageStatePath, uniqueTitle, USERS } from './fixtures';
import {
  apiAs,
  createTaskAs,
  ok,
  seededEmployees,
  settle,
  startAndSubmit,
  type TaskDto,
} from './helpers';

/**
 * Automated WCAG 2.0/2.1 A + AA checks (axe-core) on every main screen, plus keyboard-only checks
 * for the skip link, the login form, the reject dialog, the Status select and the account menu.
 * No rule or selector is excluded.
 */

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function expectNoViolations(page: Page): Promise<void> {
  await settle(page);
  // Page structure checks that axe's WCAG tags don't cover: one h1 and a page-specific title.
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page).toHaveTitle(/^\S.* · Task & Approval$/);
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const summary = violations.map(
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.nodes
        .map((node) => node.target.join(' '))
        .join(' | ')}`,
  );
  expect(summary, `axe violations on ${page.url()}`).toEqual([]);
}

/** True when the focused element matches :focus-visible (the keyboard focus ring applies). */
function focusIsVisible(page: Page): Promise<boolean> {
  return page.evaluate(() => document.activeElement?.matches(':focus-visible') ?? false);
}

let admin: APIRequestContext;
let employee1: APIRequestContext;
/** PENDING_APPROVAL, assigned to employee1 (admin detail + reject dialog). */
let awaitingReview: TaskDto;
/** Rejected once, IN_PROGRESS with feedback (employee detail). */
let returned: TaskDto;

test.beforeAll(async () => {
  admin = await apiAs('admin');
  employee1 = await apiAs('employee1');
  const employees = await seededEmployees(admin);

  awaitingReview = await createTaskAs(admin, employees.employee1.id, uniqueTitle('a11y review'), {
    priority: 'HIGH',
  });
  await startAndSubmit(employee1, awaitingReview.id);

  returned = await createTaskAs(admin, employees.employee1.id, uniqueTitle('a11y returned'));
  await startAndSubmit(employee1, returned.id);
  await ok(
    await admin.post(`/api/v1/tasks/${returned.id}/reject`, {
      data: { reason: 'Please add the missing totals.' },
    }),
  );
  await ok(
    await employee1.post(`/api/v1/tasks/${returned.id}/comments`, {
      data: { body: 'Working on the totals now.' },
    }),
  );
});

test.afterAll(async () => {
  // Leave nothing waiting in the approval queue for later specs.
  await admin.post(`/api/v1/tasks/${awaitingReview.id}/approve`);
  await admin.dispose();
  await employee1.dispose();
});

test.describe('axe: signed out', () => {
  test('login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await expectNoViolations(page);
  });

  test('harness check: axe reports a planted violation', async ({ page }) => {
    // Guards against a silently broken setup that would make every check above pass.
    await page.goto('/login');
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.id = 'planted-unlabelled-input';
      document.querySelector('main')?.append(input);
    });
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(violations.map((violation) => violation.id)).toContain('label');
  });

  test('login page with field errors', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('#password-error')).toBeVisible();
    await expectNoViolations(page);
  });
});

test.describe('axe: admin', () => {
  test.use({ storageState: storageStatePath('admin') });

  test('dashboard', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByTestId('stat-Total tasks')).toHaveText(/^\d+$/);
    await expect(page.getByTestId('approval-row').first()).toBeVisible();
    await expectNoViolations(page);
  });

  test('tasks list', async ({ page }) => {
    await page.goto('/admin/tasks');
    await expect(page.getByTestId('task-row').first()).toBeVisible();
    await expectNoViolations(page);
  });

  test('new task form, empty and with errors', async ({ page }) => {
    await page.goto('/admin/tasks/new');
    await expect(page.getByRole('combobox', { name: 'Assignee' })).toBeEnabled();
    await expectNoViolations(page);
    await page.getByRole('button', { name: 'Create task' }).click();
    await expect(page.getByText('Title is required')).toBeVisible();
    await expectNoViolations(page);
  });

  test('task detail with the reject dialog open', async ({ page }) => {
    await page.goto(`/admin/tasks/${awaitingReview.id}`);
    await expect(page.getByRole('heading', { level: 1, name: awaitingReview.title })).toBeVisible();
    await expect(page.getByTestId('history-entry').first()).toBeVisible();
    await expectNoViolations(page);

    await page.getByRole('button', { name: /^Reject/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Reject task' });
    await expect(dialog).toBeVisible();
    await expectNoViolations(page);

    await dialog.getByRole('button', { name: 'Reject task' }).click();
    await expect(dialog.getByText('A rejection reason is required')).toBeVisible();
    await expectNoViolations(page);
  });

  test('task detail with feedback, comments and history', async ({ page }) => {
    await page.goto(`/admin/tasks/${returned.id}`);
    await expect(page.getByTestId('task-feedback')).toBeVisible();
    await expect(page.getByTestId('history-entry')).toHaveCount(4);
    await expectNoViolations(page);
  });

  test('employees page with the create dialog open', async ({ page }) => {
    await page.goto('/admin/employees');
    await expect(page.getByTestId('employee-row').first()).toBeVisible();
    await expectNoViolations(page);

    await page.getByRole('button', { name: 'New employee' }).click();
    const dialog = page.getByRole('dialog', { name: 'New employee' });
    await expect(dialog).toBeVisible();
    await expectNoViolations(page);
  });

  test('delete confirmation dialog', async ({ page }) => {
    await page.goto(`/admin/tasks/${awaitingReview.id}`);
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('alertdialog', { name: 'Delete this task?' })).toBeVisible();
    await expectNoViolations(page);
  });

  test('task not found', async ({ page }) => {
    await page.goto('/admin/tasks/not-a-cuid');
    await expect(page.getByRole('heading', { level: 1, name: 'Task not found' })).toBeVisible();
    await expectNoViolations(page);
  });
});

test.describe('axe: employee', () => {
  test.use({ storageState: storageStatePath('employee1') });

  test('dashboard', async ({ page }) => {
    await page.goto('/employee');
    await expect(page.getByTestId('task-row').first()).toBeVisible();
    await expectNoViolations(page);
  });

  test('task detail with the feedback alert', async ({ page }) => {
    await page.goto(`/employee/tasks/${returned.id}`);
    await expect(page.getByTestId('task-feedback')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit for approval' })).toBeVisible();
    await expect(page.getByTestId('history-entry')).toHaveCount(4);
    await expectNoViolations(page);
  });
});

test.describe('axe: mobile navigation', () => {
  test.use({ storageState: storageStatePath('admin'), viewport: { width: 390, height: 844 } });

  test('dashboard with the navigation sheet open', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByTestId('stat-Total tasks')).toHaveText(/^\d+$/);
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectNoViolations(page);
  });

  test('dashboard cards: approval queue and recent tasks', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByTestId('approval-card').first()).toBeVisible();
    await expect(page.getByTestId('task-card').first()).toBeVisible();
    await expectNoViolations(page);
  });

  test('task list cards', async ({ page }) => {
    await page.goto('/admin/tasks');
    await expect(page.getByTestId('task-card').first()).toBeVisible();
    await expectNoViolations(page);
  });
});

test.describe('axe: mobile employee', () => {
  test.use({ storageState: storageStatePath('employee1'), viewport: { width: 390, height: 844 } });

  test('dashboard cards', async ({ page }) => {
    await page.goto('/employee');
    await expect(page.getByTestId('task-card').first()).toBeVisible();
    await expectNoViolations(page);
  });
});

test.describe('keyboard: login form', () => {
  test('Tab order, visible focus, and Enter submits', async ({ page }) => {
    await page.goto('/login');

    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to sign-in form' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Email')).toBeFocused();
    expect(await focusIsVisible(page)).toBe(true);
    await page.keyboard.type(USERS.admin.email);

    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Password')).toBeFocused();
    expect(await focusIsVisible(page)).toBe(true);
    await page.keyboard.type('not-the-password');

    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeFocused();
    expect(await focusIsVisible(page)).toBe(true);

    // Enter from the password field submits the form.
    await page.getByLabel('Password').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#login-error')).toHaveText('Invalid email or password');
    await expect(page).toHaveURL('/login');
  });
});

test.describe('keyboard: admin', () => {
  test.use({ storageState: storageStatePath('admin') });

  test('the skip link is the first Tab stop and moves focus to the main content', async ({
    page,
  }) => {
    await page.goto('/admin');
    await expect(page.getByTestId('stat-Total tasks')).toHaveText(/^\d+$/);

    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    expect(await focusIsVisible(page)).toBe(true);

    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
    // The next Tab continues inside the main content, past the sidebar.
    await page.keyboard.press('Tab');
    const insideMain = await page.evaluate(
      () => document.getElementById('main-content')?.contains(document.activeElement) ?? false,
    );
    expect(insideMain).toBe(true);
  });

  test('reject dialog: opens with Enter, Escape closes it and focus returns', async ({ page }) => {
    await page.goto(`/admin/tasks/${awaitingReview.id}`);
    const trigger = page.getByRole('button', { name: /^Reject/ });
    await trigger.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog', { name: 'Reject task' });
    await expect(dialog).toBeVisible();
    // Focus moves into the dialog and the reason field is reachable with Tab.
    const focusInDialog = await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    );
    expect(focusInDialog).toBe(true);
    const reason = dialog.getByLabel('Reason for rejection');
    for (let i = 0; i < 5 && !(await reason.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('Tab');
    }
    await expect(reason).toBeFocused();
    expect(await focusIsVisible(page)).toBe(true);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page.getByTestId('task-badges')).toContainText('Pending approval');
  });

  test('status filter: arrow keys and Enter choose an option', async ({ page }) => {
    await page.goto('/admin/tasks');
    await expect(page.getByTestId('task-row').first()).toBeVisible();
    const search = page.getByRole('searchbox', { name: 'Search by title' });
    const status = page.getByRole('combobox', { name: 'Status' });
    // Start in the search box and reach the Status select with Tab (proves it is a Tab stop).
    await search.focus();
    await expect(search).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(status).toBeFocused();
    expect(await focusIsVisible(page)).toBe(true);

    await page.keyboard.press('ArrowDown');
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    await expect(page.getByRole('option', { name: 'All statuses' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('option', { name: 'Pending', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(listbox).toBeHidden();
    await expect(page).toHaveURL(/[?&]status=PENDING(&|$)/);
    await expect(status).toHaveText('Pending');
    await expect(status).toBeFocused();
  });

  test('account menu: Enter opens it and Sign out is reachable', async ({ page }) => {
    await page.goto('/admin');
    const trigger = page.getByRole('button', { name: /Account menu/ });
    await trigger.focus();
    await page.keyboard.press('Enter');

    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu).toContainText(USERS.admin.email);
    await expect(menu.getByRole('menuitem', { name: 'Sign out' })).toBeFocused();

    // Not activated (that would end the shared admin session); Escape closes the menu.
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});
