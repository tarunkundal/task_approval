import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { storageStatePath, uniqueTitle, USERS } from './fixtures';

/**
 * Admin screens against the real API (test DB). Data is created with unique titles, setup steps
 * go through the API (same-origin through the Next.js proxy), and nothing asserts absolute counts.
 */

const WEB_ORIGIN = 'http://localhost:3100';

interface TaskDto {
  id: string;
  title: string;
  status: string;
  dueDate: string;
}
interface UserDto {
  id: string;
  name: string;
  email: string;
}

/** API client with a saved session. The Origin header matches a browser request from the web app. */
function apiAs(user: 'admin' | 'employee1'): Promise<APIRequestContext> {
  return playwrightRequest.newContext({
    baseURL: WEB_ORIGIN,
    storageState: storageStatePath(user),
    extraHTTPHeaders: { Origin: WEB_ORIGIN },
  });
}

async function ok<T>(response: Awaited<ReturnType<APIRequestContext['get']>>): Promise<T> {
  expect(response.ok(), `${response.url()} → ${response.status()}`).toBe(true);
  return (await response.json()) as T;
}

let admin: APIRequestContext;
let employee1: APIRequestContext;
let employees: Record<'employee1' | 'employee2', UserDto>;

async function createTask(
  title: string,
  options: { assignee?: 'employee1' | 'employee2'; dueDate?: string; priority?: string } = {},
): Promise<TaskDto> {
  return ok<TaskDto>(
    await admin.post('/api/v1/tasks', {
      data: {
        title,
        priority: options.priority ?? 'MEDIUM',
        dueDate: options.dueDate ?? '2030-06-15',
        assignedToId: employees[options.assignee ?? 'employee1'].id,
      },
    }),
  );
}

/** PENDING → IN_PROGRESS → PENDING_APPROVAL as employee1 (the assignee). */
async function submitAsEmployee(id: string): Promise<void> {
  await ok(await employee1.post(`/api/v1/tasks/${id}/start`));
  await ok(await employee1.post(`/api/v1/tasks/${id}/submit`));
}

function toast(page: Page, text: string) {
  return page.locator('[data-sonner-toast]').filter({ hasText: text });
}

/** Inline field error (`FieldError`, role="alert"). */
function fieldError(page: Page, text: string) {
  return page.locator('[data-slot="field-error"]').filter({ hasText: text });
}

async function choose(page: Page, combobox: string, option: string): Promise<void> {
  await page.getByRole('combobox', { name: combobox }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test.use({ storageState: storageStatePath('admin') });

test.beforeAll(async () => {
  admin = await apiAs('admin');
  employee1 = await apiAs('employee1');
  const { data } = await ok<{ data: UserDto[] }>(await admin.get('/api/v1/users'));
  const byEmail = (email: string) => {
    const user = data.find((item) => item.email === email);
    if (!user) throw new Error(`Seeded employee ${email} is missing`);
    return user;
  };
  employees = {
    employee1: byEmail(USERS.employee1.email),
    employee2: byEmail(USERS.employee2.email),
  };

  // Leftovers from an interrupted run could push this run's tasks off the dashboard queue's
  // first page (10 rows): approve any earlier E2E task still waiting for approval.
  const waiting = await ok<{ data: TaskDto[] }>(
    await admin.get('/api/v1/tasks?status=PENDING_APPROVAL&q=E2E&pageSize=100'),
  );
  for (const task of waiting.data) {
    await ok(await admin.post(`/api/v1/tasks/${task.id}/approve`));
  }
});

test.afterAll(async () => {
  await admin?.dispose();
  await employee1?.dispose();
});

test.describe('dashboard', () => {
  test('shows the six counts, the approval queue and recent tasks', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    for (const label of [
      'Total tasks',
      'Pending',
      'In progress',
      'Pending approval',
      'Completed',
      'Overdue',
    ]) {
      await expect(page.getByTestId(`stat-${label}`)).toHaveText(/^\d+$/);
    }
    await expect(page.getByRole('link', { name: /Pending approval/ })).toHaveAttribute(
      'href',
      '/admin/tasks?status=PENDING_APPROVAL',
    );
    await expect(page.getByRole('heading', { level: 2, name: /Approval queue/ })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Recent tasks' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Recent tasks' })).toBeVisible();
    await expect(
      page.getByRole('table', { name: 'Recent tasks' }).getByRole('columnheader', {
        name: 'Assignee',
      }),
    ).toBeVisible();
  });

  test('a new task shows up in the counts', async ({ page }) => {
    await page.goto('/admin');
    const total = page.getByTestId('stat-Total tasks');
    await expect(total).toHaveText(/^\d+$/);
    const before = Number(await total.textContent());
    await createTask(uniqueTitle('count'));
    await page.reload();
    await expect(total).toHaveText(String(before + 1));
  });
});

test.describe('create task', () => {
  // A timezone west of UTC: a `new Date('YYYY-MM-DD')` bug would show the previous day here.
  test.use({ timezoneId: 'Pacific/Honolulu' });

  test('validates inline, then creates the task with the date as entered', async ({ page }) => {
    const title = uniqueTitle('create');
    await page.goto('/admin/tasks/new');
    await expect(page.getByRole('heading', { level: 1, name: 'New task' })).toBeVisible();

    await page.getByRole('button', { name: 'Create task' }).click();
    await expect(fieldError(page, 'Title is required')).toBeVisible();
    await expect(page.getByLabel('Title')).toHaveAttribute('aria-invalid', 'true');
    await expect(fieldError(page, 'Enter a valid due date')).toBeVisible();
    await expect(fieldError(page, 'Select an employee')).toBeVisible();
    await expect(page).toHaveURL('/admin/tasks/new');

    await page.getByLabel('Title').fill(title);
    await page.getByLabel('Description').fill('Line one\nLine two');
    await choose(page, 'Priority', 'High');
    await page.getByLabel('Due date').fill('2027-03-01');
    await choose(page, 'Assignee', `${USERS.employee2.name} (${USERS.employee2.email})`);
    await page.getByRole('button', { name: 'Create task' }).click();

    await expect(toast(page, 'Task created')).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/tasks\/(?!new$)[a-z0-9]+$/);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    const badges = page.getByTestId('task-badges');
    await expect(badges).toContainText('Pending');
    await expect(badges).toContainText('High');
    const due = page.getByTestId('task-due-date');
    await expect(due).toHaveText('Mar 1, 2027');
    await expect(due).toHaveAttribute('datetime', '2027-03-01');
    await expect(page.getByText(USERS.employee2.email)).toBeVisible();
    await expect(page.getByText('Line one')).toBeVisible();
  });
});

test.describe('task list', () => {
  test('search, status and employee filters live in the URL', async ({ page }) => {
    const prefix = uniqueTitle('list');
    const forJordan = await createTask(`${prefix} alpha`, { assignee: 'employee1' });
    await createTask(`${prefix} beta`, { assignee: 'employee2' });

    await page.goto('/admin/tasks');
    await expect(page.getByRole('heading', { level: 1, name: 'Tasks' })).toBeVisible();
    const rows = page.getByTestId('task-row');

    await page.getByRole('searchbox', { name: 'Search by title' }).fill(prefix);
    await expect(page).toHaveURL(/[?&]q=/);
    await expect(rows).toHaveCount(2);

    await choose(page, 'Status', 'Pending');
    await expect(page).toHaveURL(/[?&]status=PENDING(&|$)/);
    await page.reload();
    await expect(page).toHaveURL(/[?&]status=PENDING(&|$)/);
    await expect(page.getByRole('combobox', { name: 'Status' })).toHaveText('Pending');
    await expect(page.getByRole('searchbox', { name: 'Search by title' })).toHaveValue(prefix);
    await expect(rows).toHaveCount(2);

    await choose(page, 'Employee', USERS.employee1.name);
    await expect(page).toHaveURL(new RegExp(`[?&]assignedToId=${employees.employee1.id}`));
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(forJordan.title);
    await expect(rows.first()).toContainText(USERS.employee1.name);

    await choose(page, 'Status', 'Completed');
    await expect(page.getByText('No tasks match these filters')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).first().click();
    await expect(page).toHaveURL('/admin/tasks');
    await expect(page.getByRole('searchbox', { name: 'Search by title' })).toHaveValue('');
  });

  test('the priority filter lives in the URL', async ({ page }) => {
    const prefix = uniqueTitle('priority');
    const high = await createTask(`${prefix} high`, { priority: 'HIGH' });
    const low = await createTask(`${prefix} low`, { priority: 'LOW' });

    await page.goto(`/admin/tasks?q=${encodeURIComponent(prefix)}`);
    const rows = page.getByTestId('task-row');
    await expect(rows).toHaveCount(2);

    await choose(page, 'Priority', 'High');
    await expect(page).toHaveURL(/[?&]priority=HIGH(&|$)/);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(high.title);
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Priority' })).toHaveText('High');
    await expect(rows.filter({ hasText: low.title })).toHaveCount(0);

    await choose(page, 'Priority', 'Low');
    await expect(page).toHaveURL(/[?&]priority=LOW(&|$)/);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(low.title);
  });

  test('sort and pagination', async ({ page }) => {
    // The seed alone has 5 tasks, so a page size of 2 always gives several pages.
    await page.goto('/admin/tasks?pageSize=2');
    const pagination = page.getByRole('navigation', { name: 'Pagination' });
    await expect(pagination).toContainText(/Page 1 of \d+/);
    await expect(page.getByTestId('task-row')).toHaveCount(2);
    await pagination.getByRole('button', { name: 'Next' }).click();
    await expect(page).toHaveURL(/[?&]page=2(&|$)/);
    await expect(pagination).toContainText(/Page 2 of \d+/);
    await page.goBack();
    await expect(pagination).toContainText(/Page 1 of \d+/);

    await choose(page, 'Sort by', 'Due date: soonest');
    await expect(page).toHaveURL(/sort=dueDate&order=asc/);
    await expect(page).not.toHaveURL(/[?&]page=/);
  });

  test('invalid URL parameters fall back to defaults instead of failing', async ({ page }) => {
    await page.goto('/admin/tasks?status=DONE&page=-1&foo=bar');
    await expect(page.getByRole('combobox', { name: 'Status' })).toHaveText('All statuses');
    await expect(page.getByTestId('task-row').first()).toBeVisible();
  });
});

test.describe('API errors on the task form', () => {
  /** Answers the next POST /api/v1/tasks with `body` (status 400); other requests go through. */
  async function failCreateWith(page: Page, body: object): Promise<void> {
    await page.route(
      (url) => url.pathname === '/api/v1/tasks',
      (route) =>
        route.request().method() === 'POST'
          ? route.fulfill({ status: 400, contentType: 'application/json', json: body })
          : route.fallback(),
    );
  }

  async function fillValidTask(page: Page, title: string): Promise<void> {
    await page.goto('/admin/tasks/new');
    await page.getByLabel('Title').fill(title);
    await page.getByLabel('Due date').fill('2030-05-01');
    await choose(page, 'Assignee', `${USERS.employee1.name} (${USERS.employee1.email})`);
  }

  test('a 400 with details puts each message on its field', async ({ page }) => {
    // The client mirrors the API rules, so this response is mocked: the server-side mapping
    // (validation details → fields) has no other way to be reached from the browser.
    await failCreateWith(page, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        details: [
          { path: 'title', message: 'Server says the title is invalid' },
          { path: 'dueDate', message: 'Server says the due date is invalid' },
          { path: 'unknownField', message: 'Server says something else is off' },
        ],
      },
    });
    await fillValidTask(page, uniqueTitle('server field errors'));
    await page.getByRole('button', { name: 'Create task' }).click();

    await expect(fieldError(page, 'Server says the title is invalid')).toBeVisible();
    await expect(page.getByLabel('Title')).toHaveAttribute('aria-invalid', 'true');
    await expect(fieldError(page, 'Server says the due date is invalid')).toBeVisible();
    await expect(page.getByLabel('Due date')).toHaveAttribute('aria-invalid', 'true');
    // A path the form doesn't know becomes the form-level error.
    await expect(
      page.getByRole('alert').filter({ hasText: 'Server says something else is off' }),
    ).toBeVisible();
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
    await expect(page).toHaveURL('/admin/tasks/new');
  });

  test('a 400 VALIDATION_ERROR without details shows a form-level error', async ({ page }) => {
    await failCreateWith(page, {
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request body' },
    });
    await fillValidTask(page, uniqueTitle('server body error'));
    await page.getByRole('button', { name: 'Create task' }).click();

    await expect(page.getByRole('alert').filter({ hasText: 'Invalid request body' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create task' })).toBeEnabled();
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
    await expect(page).toHaveURL('/admin/tasks/new');
  });
});

test.describe('edit and delete', () => {
  test('saving after the task was approved meanwhile → toast, detail shows Completed', async ({
    page,
  }) => {
    const task = await createTask(uniqueTitle('edit approved'));
    await submitAsEmployee(task.id);
    await page.goto(`/admin/tasks/${task.id}/edit`);
    await page.getByLabel('Title').fill(`${task.title} (too late)`);

    await ok(await admin.post(`/api/v1/tasks/${task.id}/approve`));
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(toast(page, 'A completed task can no longer be edited')).toBeVisible();
    await expect(page).toHaveURL(`/admin/tasks/${task.id}`);
    await expect(page.getByTestId('task-badges')).toContainText('Completed');
    await expect(page.getByRole('heading', { level: 1, name: task.title })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
  });

  test('saving after the task was deleted meanwhile → toast and Task not found', async ({
    page,
  }) => {
    const task = await createTask(uniqueTitle('edit deleted'));
    await page.goto(`/admin/tasks/${task.id}/edit`);
    await page.getByLabel('Title').fill(`${task.title} (gone)`);

    expect((await admin.delete(`/api/v1/tasks/${task.id}`)).status()).toBe(204);
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(toast(page, 'Task not found')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Task not found' })).toBeVisible();
  });

  test('edit the title from the detail page', async ({ page }) => {
    const task = await createTask(uniqueTitle('edit'));
    await page.goto(`/admin/tasks/${task.id}`);
    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page).toHaveURL(`/admin/tasks/${task.id}/edit`);
    await expect(page.getByRole('heading', { level: 1, name: 'Edit task' })).toBeVisible();

    const save = page.getByRole('button', { name: 'Save changes' });
    await expect(save).toBeDisabled();
    const newTitle = `${task.title} (renamed)`;
    await page.getByLabel('Title').fill(newTitle);
    await expect(save).toBeEnabled();
    await save.click();

    await expect(toast(page, 'Task updated')).toBeVisible();
    await expect(page).toHaveURL(`/admin/tasks/${task.id}`);
    await expect(page.getByRole('heading', { level: 1, name: newTitle })).toBeVisible();
    // Untouched fields keep their values.
    await expect(page.getByTestId('task-due-date')).toHaveAttribute('datetime', task.dueDate);
  });

  test('delete from the row menu after confirming', async ({ page }) => {
    const task = await createTask(uniqueTitle('delete'));
    await page.goto(`/admin/tasks?q=${encodeURIComponent(task.title)}`);
    await expect(page.getByTestId('task-row')).toHaveCount(1);

    await page.getByRole('button', { name: `Actions for “${task.title}”` }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Delete this task?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('task-row')).toHaveCount(1);

    await page.getByRole('button', { name: `Actions for “${task.title}”` }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete task' }).click();

    await expect(toast(page, 'Task deleted')).toBeVisible();
    await expect(page.getByText('No tasks match these filters')).toBeVisible();

    await page.goto(`/admin/tasks/${task.id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Task not found' })).toBeVisible();
  });

  test('delete from the detail page returns to the list', async ({ page }) => {
    const task = await createTask(uniqueTitle('delete detail'));
    await page.goto(`/admin/tasks/${task.id}`);
    await expect(page.getByRole('heading', { level: 1, name: task.title })).toBeVisible();

    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete task' }).click();
    await expect(toast(page, 'Task deleted')).toBeVisible();
    await expect(page).toHaveURL('/admin/tasks');
    await expect(page.getByRole('heading', { level: 1, name: 'Tasks' })).toBeVisible();
    await expect(page.getByTestId('task-row').filter({ hasText: task.title })).toHaveCount(0);

    // Going back to the detail shows the not-found state, not a cached copy.
    await page.goBack();
    await expect(page).toHaveURL(`/admin/tasks/${task.id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Task not found' })).toBeVisible();
  });

  test('a malformed task id shows "Task not found"', async ({ page }) => {
    await page.goto('/admin/tasks/not-a-cuid');
    await expect(page.getByRole('heading', { level: 1, name: 'Task not found' })).toBeVisible();
  });
});

test.describe('review', () => {
  test('approve from the dashboard queue', async ({ page }) => {
    const task = await createTask(uniqueTitle('approve'));
    await submitAsEmployee(task.id);

    await page.goto('/admin');
    const queue = page.getByRole('table', { name: 'Approval queue' });
    const row = queue.getByTestId('approval-row').filter({ hasText: task.title });
    await expect(row).toHaveCount(1);
    await row.getByRole('button', { name: `Approve “${task.title}”` }).click();

    await expect(toast(page, 'Task approved')).toBeVisible();
    await expect(queue.getByTestId('approval-row').filter({ hasText: task.title })).toHaveCount(0);

    // COMPLETED is final: no workflow buttons and no Edit on the detail page.
    await page.goto(`/admin/tasks/${task.id}`);
    await expect(page.getByTestId('task-badges')).toContainText('Completed');
    await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
    await page.goto(`/admin/tasks/${task.id}/edit`);
    await expect(page.getByText('This task is completed')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
  });

  test('reject requires a reason and returns the task to In progress', async ({ page }) => {
    const task = await createTask(uniqueTitle('reject'));
    await submitAsEmployee(task.id);

    await page.goto(`/admin/tasks/${task.id}`);
    await expect(page.getByTestId('task-badges')).toContainText('Pending approval');
    await page.getByRole('button', { name: /^Reject/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Reject task' });
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: 'Reject task' }).click();
    await expect(dialog.getByText('A rejection reason is required')).toBeVisible();
    await expect(dialog.getByLabel('Reason for rejection')).toHaveAttribute('aria-invalid', 'true');

    await dialog.getByLabel('Reason for rejection').fill('Please attach the receipts.');
    await expect(dialog.getByText('27/1000 characters')).toBeVisible();
    await dialog.getByRole('button', { name: 'Reject task' }).click();

    await expect(toast(page, 'Task returned to the employee')).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('task-badges')).toContainText('In progress');
    await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Reject/ })).toHaveCount(0);
  });

  test('a stale approve shows the API error and refetches the task', async ({ page }) => {
    const task = await createTask(uniqueTitle('stale'));
    await submitAsEmployee(task.id);

    await page.goto(`/admin/tasks/${task.id}`);
    const approve = page.getByRole('button', { name: 'Approve' });
    await expect(approve).toBeVisible();
    // Approved elsewhere while this page still shows Pending approval.
    await ok(await admin.post(`/api/v1/tasks/${task.id}/approve`));
    await approve.click();

    await expect(
      toast(page, 'Task cannot be approved while its status is COMPLETED'),
    ).toBeVisible();
    await expect(page.getByTestId('task-badges')).toContainText('Completed');
    await expect(approve).toHaveCount(0);
  });
});

test.describe('employees', () => {
  test('create an employee; a duplicate email is a field error', async ({ page }) => {
    const email = `e2e-${Date.now()}@demo.com`;
    await page.goto('/admin/employees');
    await expect(page.getByRole('heading', { level: 1, name: 'Employees' })).toBeVisible();
    await expect(
      page.getByTestId('employee-row').filter({ hasText: USERS.employee1.email }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'New employee' }).click();
    let dialog = page.getByRole('dialog', { name: 'New employee' });
    await dialog.getByRole('button', { name: 'Create employee' }).click();
    await expect(dialog.getByText('Name is required')).toBeVisible();
    await expect(dialog.getByText('Password must be at least 8 characters')).toBeVisible();

    await dialog.getByLabel('Name').fill('E2E Employee');
    await dialog.getByLabel('Email').fill(email);
    await dialog.getByLabel('Password').fill('Welcome@12345');
    await dialog.getByRole('button', { name: 'Create employee' }).click();

    await expect(toast(page, 'Employee account created for E2E Employee')).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('employee-row').filter({ hasText: email })).toBeVisible();

    await page.getByRole('button', { name: 'New employee' }).click();
    dialog = page.getByRole('dialog', { name: 'New employee' });
    await expect(dialog.getByLabel('Name')).toHaveValue('');
    await dialog.getByLabel('Name').fill('E2E Duplicate');
    await dialog.getByLabel('Email').fill(email);
    await dialog.getByLabel('Password').fill('Welcome@12345');
    await dialog.getByRole('button', { name: 'Create employee' }).click();

    await expect(dialog.getByText('A user with this email already exists')).toBeVisible();
    await expect(dialog.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
    await expect(dialog).toBeVisible();
  });

  test('a new employee is offered as an assignee', async ({ page }) => {
    const email = `e2e-${Date.now()}-assignee@demo.com`;
    await ok(
      await admin.post('/api/v1/users', {
        data: { name: 'E2E Assignee', email, password: 'Welcome@12345' },
      }),
    );
    await page.goto('/admin/tasks/new');
    await page.getByRole('combobox', { name: 'Assignee' }).click();
    await expect(page.getByRole('option', { name: `E2E Assignee (${email})` })).toBeVisible();
  });
});
