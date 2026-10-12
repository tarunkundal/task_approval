// Manual-style end-to-end walkthrough against the DEVELOPMENT stack on the standard ports
// (Phase 6): built API on :4000 (apps/api/.env) behind `next start` on :3000 (API_URL set).
// Not part of `pnpm test:e2e`. It creates one task in the dev database and leaves it COMPLETED.
//
//   node e2e/dev-walkthrough.mjs            (from apps/web, both servers already running)
//
// Uses the documented seed demo accounts. Prints one line per check and exits 1 on a failure.
import { chromium, expect, request } from '@playwright/test';

const WEB = process.env.WALKTHROUGH_URL ?? 'http://localhost:3000';
const USERS = {
  admin: { email: 'admin@demo.com', password: 'Admin@12345' },
  employee1: { email: 'employee1@demo.com', password: 'Employee1@12345', name: 'Jordan Lee' },
  employee2: { email: 'employee2@demo.com', password: 'Employee2@12345' },
};
const REASON = 'Please attach the signed checklist and the date of the walkthrough.';

let failures = 0;
async function check(label, fn) {
  try {
    const detail = await fn();
    console.info(`PASS  ${label}${detail ? ` (${detail})` : ''}`);
  } catch (error) {
    failures += 1;
    console.info(
      `FAIL  ${label}: ${error instanceof Error ? error.message.split('\n')[0] : error}`,
    );
  }
}

async function signIn(browser, user) {
  const context = await browser.newContext({
    baseURL: WEB,
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(admin|employee)$/);
  return { context, page };
}

const browser = await chromium.launch();
const title = `Walkthrough ${new Date().toISOString().slice(0, 16).replace('T', ' ')} vendor onboarding`;
let taskId = '';

try {
  const admin = await signIn(browser, USERS.admin);
  const employee1 = await signIn(browser, USERS.employee1);
  const a = admin.page;
  const e = employee1.page;

  await check('admin creates a task in the UI (PENDING)', async () => {
    await a.goto('/admin/tasks/new');
    await a.getByLabel('Title').fill(title);
    await a.getByLabel('Description').fill('Created by the Phase 6 dev walkthrough.');
    await a.getByLabel('Due date').fill('2030-12-01');
    await a.getByRole('combobox', { name: 'Assignee' }).click();
    await a.getByRole('option', { name: new RegExp(USERS.employee1.email) }).click();
    await a.getByRole('button', { name: 'Create task' }).click();
    await a.waitForURL(/\/admin\/tasks\/(?!new$)[a-z0-9]+$/);
    taskId = a.url().split('/').pop();
    await expect(a.getByTestId('task-badges')).toContainText('Pending');
    return `id ${taskId}`;
  });

  await check('employee1 sees it and starts it (IN_PROGRESS)', async () => {
    await e.goto('/employee');
    await e.getByRole('link', { name: title }).first().click();
    await e.waitForURL(`**/employee/tasks/${taskId}`);
    await e.getByRole('button', { name: 'Start task' }).click();
    await expect(e.getByTestId('task-badges')).toContainText('In progress');
  });

  await check('employee1 submits it (PENDING_APPROVAL)', async () => {
    await e.getByRole('button', { name: 'Submit for approval' }).click();
    await expect(e.getByTestId('task-badges')).toContainText('Pending approval');
  });

  await check('admin rejects it with a reason (IN_PROGRESS)', async () => {
    await a.goto(`/admin/tasks/${taskId}`);
    await a.getByRole('button', { name: /^Reject/ }).click();
    const dialog = a.getByRole('dialog', { name: 'Reject task' });
    await dialog.getByLabel('Reason for rejection').fill(REASON);
    await dialog.getByRole('button', { name: 'Reject task' }).click();
    await expect(a.getByTestId('task-badges')).toContainText('In progress');
  });

  await check(
    'employee1 sees the feedback, comments and resubmits (PENDING_APPROVAL)',
    async () => {
      await e.reload();
      await expect(e.getByTestId('task-feedback')).toContainText(REASON);
      await e.getByLabel('Add a comment').fill('Checklist attached, walkthrough was on Monday.');
      await e.getByRole('button', { name: 'Post comment' }).click();
      await expect(e.getByText('Checklist attached, walkthrough was on Monday.')).toBeVisible();
      await e.getByRole('button', { name: 'Submit for approval' }).click();
      await expect(e.getByTestId('task-badges')).toContainText('Pending approval');
      await expect(e.getByTestId('task-feedback')).toHaveCount(0);
    },
  );

  await check(
    'admin approves it from the dashboard queue (COMPLETED, 6 history entries)',
    async () => {
      await a.goto('/admin');
      await a.getByRole('button', { name: `Approve “${title}”` }).click();
      await a.goto(`/admin/tasks/${taskId}`);
      await expect(a.getByTestId('task-badges')).toContainText('Completed');
      await expect(a.getByTestId('history-entry')).toHaveCount(6);
      return 'created → start → submit → reject → submit → approve';
    },
  );

  // Unauthorized attempts.
  await check('employee1 approve through the proxy → 403, task still COMPLETED', async () => {
    const res = await employee1.context.request.post(`/api/v1/tasks/${taskId}/approve`, {
      headers: { Origin: WEB },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error.code).toBe('FORBIDDEN');
    const detail = await admin.context.request.get(`/api/v1/tasks/${taskId}`);
    expect((await detail.json()).status).toBe('COMPLETED');
    return '403 FORBIDDEN';
  });

  await check("employee2 opens employee1's task → Task not found (API 404)", async () => {
    const employee2 = await signIn(browser, USERS.employee2);
    await employee2.page.goto(`/employee/tasks/${taskId}`);
    await expect(
      employee2.page.getByRole('heading', { level: 1, name: 'Task not found' }),
    ).toBeVisible();
    const res = await employee2.context.request.get(`/api/v1/tasks/${taskId}`);
    expect(res.status()).toBe(404);
    await employee2.context.close();
    return '404 NOT_FOUND';
  });

  await check('employee1 at /admin → redirected to /employee', async () => {
    await e.goto('/admin');
    await e.waitForURL(/\/employee$/);
  });

  await check('signed out at /admin → /login?next=%2Fadmin', async () => {
    const context = await browser.newContext({ baseURL: WEB });
    const page = await context.newPage();
    await page.goto('/admin');
    await page.waitForURL(/\/login\?next=%2Fadmin$/);
    await context.close();
  });

  await check('foreign Origin POST with a valid session → 403 CSRF_REJECTED', async () => {
    const res = await employee1.context.request.post(`/api/v1/tasks/${taskId}/comments`, {
      headers: { Origin: 'https://evil.example' },
      data: { body: 'cross-site' },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error.code).toBe('CSRF_REJECTED');
    return '403 CSRF_REJECTED';
  });

  await check('unauthenticated API call through the proxy → 401', async () => {
    const anonymous = await request.newContext({ baseURL: WEB });
    const res = await anonymous.get('/api/v1/tasks');
    expect(res.status()).toBe(401);
    await anonymous.dispose();
    return '401 UNAUTHENTICATED';
  });

  await admin.context.close();
  await employee1.context.close();
} finally {
  await browser.close();
}

console.info(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
