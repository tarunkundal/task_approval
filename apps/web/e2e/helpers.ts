import {
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { storageStatePath, USERS, type UserKey } from './fixtures';

/** Shared helpers for the workflow and employee specs (setup through the real API). */

export const WEB_ORIGIN = 'http://localhost:3100';

export interface TaskDto {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string;
}
export interface UserDto {
  id: string;
  name: string;
  email: string;
}

/** API client with a saved session. The Origin header matches a browser request from the web app. */
export function apiAs(user: UserKey): Promise<APIRequestContext> {
  return playwrightRequest.newContext({
    baseURL: WEB_ORIGIN,
    storageState: storageStatePath(user),
    extraHTTPHeaders: { Origin: WEB_ORIGIN },
  });
}

export async function ok<T>(response: Awaited<ReturnType<APIRequestContext['get']>>): Promise<T> {
  expect(response.ok(), `${response.url()} → ${response.status()}`).toBe(true);
  return (await response.json()) as T;
}

/** Seeded employees by key, looked up through the admin API. */
export async function seededEmployees(
  admin: APIRequestContext,
): Promise<Record<'employee1' | 'employee2', UserDto>> {
  const { data } = await ok<{ data: UserDto[] }>(await admin.get('/api/v1/users'));
  const byEmail = (email: string) => {
    const user = data.find((item) => item.email === email);
    if (!user) throw new Error(`Seeded employee ${email} is missing`);
    return user;
  };
  return {
    employee1: byEmail(USERS.employee1.email),
    employee2: byEmail(USERS.employee2.email),
  };
}

export async function createTaskAs(
  admin: APIRequestContext,
  assignedToId: string,
  title: string,
  options: { dueDate?: string; priority?: string } = {},
): Promise<TaskDto> {
  return ok<TaskDto>(
    await admin.post('/api/v1/tasks', {
      data: {
        title,
        priority: options.priority ?? 'MEDIUM',
        dueDate: options.dueDate ?? '2030-06-15',
        assignedToId,
      },
    }),
  );
}

export function toast(page: Page, text: string) {
  return page.locator('[data-sonner-toast]').filter({ hasText: text });
}

/** Inline field error (`FieldError`, role="alert"). */
export function fieldError(page: Page, text: string) {
  return page.locator('[data-slot="field-error"]').filter({ hasText: text });
}

export async function choose(page: Page, combobox: string, option: string): Promise<void> {
  await page.getByRole('combobox', { name: combobox }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

/** PENDING → IN_PROGRESS → PENDING_APPROVAL through the assignee's API session. */
export async function startAndSubmit(employee: APIRequestContext, id: string): Promise<void> {
  await ok(await employee.post(`/api/v1/tasks/${id}/start`));
  await ok(await employee.post(`/api/v1/tasks/${id}/submit`));
}

/**
 * Waits until the page has finished loading data (no skeletons) and every finite CSS animation
 * (dialog fade/zoom, sheet slide) has ended, so axe and screenshots see the final state.
 */
export async function settle(page: Page): Promise<void> {
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}

/** Admin-only controls that must never render for an employee. */
export async function expectNoAdminControls(page: Page): Promise<void> {
  await expect(page.getByRole('link', { name: /New task/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /New task/ })).toHaveCount(0);
  // Exact names: substring matching would hit task titles such as "E2E … edit".
  await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Delete/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Approve/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Reject/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Employees', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Actions for/ })).toHaveCount(0);
}
