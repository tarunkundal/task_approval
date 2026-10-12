import { expect, test as setup } from '@playwright/test';
import { storageStatePath, USERS, type UserKey } from './fixtures';

// One UI login per role, reused by every spec (keeps well under the login rate limits).
const HOMES: Record<UserKey, string> = {
  admin: '/admin',
  employee1: '/employee',
  employee2: '/employee',
};

for (const key of Object.keys(USERS) as UserKey[]) {
  setup(`sign in as ${key}`, async ({ page }) => {
    const user = USERS[key];
    await page.goto('/login');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(HOMES[key]);
    await expect(page.getByTestId('header-user-name')).toHaveText(user.name);
    await page.context().storageState({ path: storageStatePath(key) });
  });
}
