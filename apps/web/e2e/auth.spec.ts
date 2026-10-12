import { expect, test } from '@playwright/test';
import { storageStatePath, USERS } from './fixtures';

test.describe('signed out', () => {
  test('an app route redirects to /login with the return path', async ({ page }) => {
    await page.goto('/admin/tasks');
    await expect(page).toHaveURL('/login?next=%2Fadmin%2Ftasks');
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  });

  test('/ redirects to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/login');
  });

  test('an invalid session cookie lands on the login form without a loop', async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: 'tas_token', value: 'not-a-valid-token', url: 'http://localhost:3100' },
    ]);
    await page.goto('/admin');
    await expect(page).toHaveURL('/login?next=%2Fadmin');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('empty submit shows inline field errors', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#email-error')).toBeVisible();
    await expect(page.locator('#password-error')).toHaveText('Password is required');
    await expect(page).toHaveURL('/login');
  });

  test('wrong password shows an inline error and stays on /login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(USERS.admin.email);
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('#login-error')).toHaveText('Invalid email or password');
    await expect(page).toHaveURL('/login');
  });

  test('a server error on login shows a toast and keeps the form', async ({ page }) => {
    // Simulates the API being down behind the Next proxy (non-JSON 500); never reaches the API.
    await page.route('**/api/v1/auth/login', (route) =>
      route.fulfill({ status: 500, contentType: 'text/html', body: 'Internal Server Error' }),
    );
    await page.goto('/login');
    await page.getByLabel('Email').fill(USERS.admin.email);
    await page.getByLabel('Password').fill(USERS.admin.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(
      page
        .locator('[data-sonner-toast]')
        .filter({ hasText: 'The server could not complete the request. Please try again.' }),
    ).toBeVisible();
    await expect(page.locator('#login-error')).toHaveCount(0);
    await expect(page).toHaveURL('/login');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  test('a network failure on login shows a toast', async ({ page }) => {
    await page.route('**/api/v1/auth/login', (route) => route.abort('connectionrefused'));
    await page.goto('/login');
    await page.getByLabel('Email').fill(USERS.admin.email);
    await page.getByLabel('Password').fill(USERS.admin.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: 'Could not reach the server.' }),
    ).toBeVisible();
    await expect(page).toHaveURL('/login');
  });

  test('login with ?next= lands on the requested page', async ({ page }) => {
    await page.goto('/login?next=%2Femployee%3Fstatus%3DPENDING');
    await page.getByLabel('Email').fill(USERS.employee2.email);
    await page.getByLabel('Password').fill(USERS.employee2.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL('/employee?status=PENDING');
    await expect(page.getByTestId('header-user-name')).toHaveText(USERS.employee2.name);
  });

  test('logout clears the session', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(USERS.employee1.email);
    await page.getByLabel('Password').fill(USERS.employee1.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL('/employee');

    await page.getByRole('button', { name: /Account menu/ }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page).toHaveURL('/login');

    await page.goto('/admin');
    await expect(page).toHaveURL('/login?next=%2Fadmin');
  });
});

test.describe('admin session', () => {
  test.use({ storageState: storageStatePath('admin') });

  test('/login and / redirect to the admin home', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL('/admin');
    await page.goto('/');
    await expect(page).toHaveURL('/admin');
  });

  test('the employee section redirects to /admin', async ({ page }) => {
    await page.goto('/employee');
    await expect(page).toHaveURL('/admin');
  });

  test('header shows name and role; admin navigation is shown', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByTestId('header-user-name')).toHaveText(USERS.admin.name);
    await expect(page.getByTestId('header-user-role')).toHaveText('Admin');
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(nav.getByRole('link', { name: 'Tasks' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Employees' })).toBeVisible();
  });

  test('user menu shows the account details', async ({ page }) => {
    await page.goto('/admin');
    await page.getByRole('button', { name: /Account menu/ }).click();
    const menu = page.getByRole('menu');
    await expect(menu).toContainText(USERS.admin.email);
    await expect(menu.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
  });
});

test.describe('employee session', () => {
  test.use({ storageState: storageStatePath('employee1') });

  test('the admin section redirects to /employee', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL('/employee');
    await expect(page.getByRole('heading', { level: 1, name: 'My tasks' })).toBeVisible();
    for (const path of ['/admin/tasks', '/admin/tasks/new', '/admin/employees']) {
      await page.goto(path);
      await expect(page).toHaveURL('/employee');
    }
  });

  test('header shows name and role; only employee navigation is shown', async ({ page }) => {
    await page.goto('/employee');
    await expect(page.getByTestId('header-user-name')).toHaveText(USERS.employee1.name);
    await expect(page.getByTestId('header-user-role')).toHaveText('Employee');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'My tasks' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Employees' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Tasks', exact: true })).toHaveCount(0);
  });
});

test.describe('mobile navigation', () => {
  test.use({ storageState: storageStatePath('admin'), viewport: { width: 390, height: 844 } });

  test('the menu button opens the sheet; a link navigates and closes it', async ({ page }) => {
    await page.goto('/admin');
    // On mobile the sidebar is not rendered until the sheet is opened.
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await sheet.getByRole('link', { name: 'Dashboard' }).click();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL('/admin');

    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    await page.getByRole('dialog').getByRole('link', { name: 'Employees' }).click();
    await expect(page).toHaveURL('/admin/employees');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
