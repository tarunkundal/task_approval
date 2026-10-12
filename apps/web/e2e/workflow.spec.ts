import { expect, test, type Browser, type Page } from '@playwright/test';
import { storageStatePath, uniqueTitle, USERS, type UserKey } from './fixtures';
import { choose, expectNoAdminControls, fieldError, toast } from './helpers';

/**
 * The whole approval cycle through the UI, switching between the admin and employee1 sessions:
 * create → start → submit → reject (with feedback) → comment → resubmit → approve → history.
 */

async function pageAs(browser: Browser, user: UserKey): Promise<Page> {
  const context = await browser.newContext({ storageState: storageStatePath(user) });
  return context.newPage();
}

test('create → start → submit → reject → comment → resubmit → approve', async ({ browser }) => {
  const title = uniqueTitle('workflow');
  const reason = 'Please attach the signed checklist.\nThe second section is missing.';
  const comment = 'Checklist attached, section two added.';
  const admin = await pageAs(browser, 'admin');
  const employee = await pageAs(browser, 'employee1');
  let detailPath = '';

  await test.step('admin creates a task for Jordan Lee', async () => {
    await admin.goto('/admin/tasks/new');
    await admin.getByLabel('Title').fill(title);
    await choose(admin, 'Priority', 'High');
    await admin.getByLabel('Due date').fill('2030-01-15');
    await choose(admin, 'Assignee', `${USERS.employee1.name} (${USERS.employee1.email})`);
    await admin.getByRole('button', { name: 'Create task' }).click();
    await expect(toast(admin, 'Task created')).toBeVisible();
    // Not `/admin/tasks/new`: the toast shows before the navigation to the new task finishes.
    await expect(admin).toHaveURL(/\/admin\/tasks\/(?!new$)[a-z0-9]+$/);
    const id = new URL(admin.url()).pathname.split('/').pop() ?? '';
    detailPath = `/employee/tasks/${id}`;
  });

  await test.step('admin finds it in the list through URL filters', async () => {
    await admin.goto(`/admin/tasks?q=${encodeURIComponent(title)}&status=PENDING`);
    await expect(admin.getByRole('combobox', { name: 'Status' })).toHaveText('Pending');
    await choose(admin, 'Employee', USERS.employee1.name);
    await expect(admin).toHaveURL(/[?&]assignedToId=[a-z0-9]+/);
    const rows = admin.getByTestId('task-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(title);
    await expect(rows.first()).toContainText(USERS.employee1.name);

    // Back to the detail page; later steps reload it.
    await rows.first().getByRole('link', { name: title }).click();
    await expect(admin).toHaveURL(/\/admin\/tasks\/[a-z0-9]+$/);
    await expect(admin.getByRole('heading', { level: 1, name: title })).toBeVisible();
  });

  await test.step('employee sees it on the dashboard as Pending; only Start is offered', async () => {
    await employee.goto('/employee');
    await expect(employee.getByRole('heading', { level: 1, name: 'My tasks' })).toBeVisible();
    const row = employee.getByTestId('task-row').filter({ hasText: title });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Pending');
    await expect(row).toContainText('High');
    await expect(
      employee.getByRole('table', { name: 'Tasks assigned to you' }).getByRole('columnheader', {
        name: 'Assignee',
      }),
    ).toHaveCount(0);

    await row.getByRole('link', { name: title }).click();
    await expect(employee).toHaveURL(detailPath);
    await expect(employee.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(employee.getByTestId('task-badges')).toContainText('Pending');
    await expect(employee.getByRole('button', { name: 'Start task' })).toBeVisible();
    await expect(employee.getByRole('button', { name: 'Submit for approval' })).toHaveCount(0);
    await expectNoAdminControls(employee);
  });

  await test.step('employee starts, then submits', async () => {
    await employee.getByRole('button', { name: 'Start task' }).click();
    await expect(toast(employee, 'Task started')).toBeVisible();
    await expect(employee.getByTestId('task-badges')).toContainText('In progress');
    await expect(employee.getByRole('button', { name: 'Start task' })).toHaveCount(0);

    await employee.getByRole('button', { name: 'Submit for approval' }).click();
    await expect(toast(employee, 'Submitted for approval')).toBeVisible();
    await expect(employee.getByTestId('task-badges')).toContainText('Pending approval');
    await expect(employee.getByRole('button', { name: 'Start task' })).toHaveCount(0);
    await expect(employee.getByRole('button', { name: 'Submit for approval' })).toHaveCount(0);
    await expectNoAdminControls(employee);
  });

  await test.step('admin rejects with a required reason', async () => {
    await admin.reload();
    await expect(admin.getByTestId('task-badges')).toContainText('Pending approval');
    await admin.getByRole('button', { name: /^Reject/ }).click();
    const dialog = admin.getByRole('dialog', { name: 'Reject task' });
    await dialog.getByRole('button', { name: 'Reject task' }).click();
    await expect(dialog.getByText('A rejection reason is required')).toBeVisible();
    await dialog.getByLabel('Reason for rejection').fill(reason);
    await dialog.getByRole('button', { name: 'Reject task' }).click();
    await expect(toast(admin, 'Task returned to the employee')).toBeVisible();
    await expect(admin.getByTestId('task-badges')).toContainText('In progress');
    // The admin sees the same feedback, worded for the reviewer.
    await expect(admin.getByTestId('task-feedback')).toContainText('Returned with feedback');
  });

  await test.step('employee sees the admin feedback with the exact reason', async () => {
    await employee.reload();
    await expect(employee.getByTestId('task-badges')).toContainText('In progress');
    const feedback = employee.getByTestId('task-feedback');
    await expect(feedback).toBeVisible();
    await expect(feedback).toContainText('Admin feedback');
    await expect(feedback).toContainText(`From ${USERS.admin.name}`);
    await expect(employee.getByTestId('task-feedback-reason')).toHaveText(reason);
    await expect(employee.getByRole('button', { name: 'Submit for approval' })).toBeVisible();
  });

  await test.step('employee comments (empty is an inline error)', async () => {
    await employee.getByRole('button', { name: 'Post comment' }).click();
    await expect(fieldError(employee, 'Comment cannot be empty')).toBeVisible();
    await expect(employee.getByLabel('Add a comment')).toHaveAttribute('aria-invalid', 'true');

    await employee.getByLabel('Add a comment').fill(comment);
    await expect(employee.getByText(`${comment.length}/2000 characters`)).toBeVisible();
    await employee.getByRole('button', { name: 'Post comment' }).click();
    await expect(toast(employee, 'Comment added')).toBeVisible();
    const thread = employee.getByRole('list', { name: 'Comments' });
    await expect(thread.getByRole('listitem').filter({ hasText: comment })).toContainText(
      USERS.employee1.name,
    );
    await expect(employee.getByLabel('Add a comment')).toHaveValue('');
  });

  await test.step('admin sees the comment with its author', async () => {
    await admin.reload();
    const item = admin
      .getByRole('list', { name: 'Comments' })
      .getByRole('listitem')
      .filter({ hasText: comment });
    await expect(item).toContainText(USERS.employee1.name);
    await expect(item).toContainText('Employee');
  });

  await test.step('employee resubmits; the feedback alert goes away', async () => {
    await employee.getByRole('button', { name: 'Submit for approval' }).click();
    await expect(toast(employee, 'Submitted for approval')).toBeVisible();
    await expect(employee.getByTestId('task-badges')).toContainText('Pending approval');
    await expect(employee.getByTestId('task-feedback')).toHaveCount(0);
  });

  await test.step('admin approves; Edit is hidden', async () => {
    await admin.reload();
    await expect(admin.getByTestId('task-feedback')).toHaveCount(0);
    await admin.getByRole('button', { name: 'Approve' }).click();
    await expect(toast(admin, 'Task approved')).toBeVisible();
    await expect(admin.getByTestId('task-badges')).toContainText('Completed');
    await expect(admin.getByRole('link', { name: 'Edit' })).toHaveCount(0);
    await expect(admin.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  });

  await test.step('history shows all six entries in order, with the reason highlighted', async () => {
    for (const page of [admin, employee]) {
      await page.reload();
      await expect(page.getByTestId('task-badges')).toContainText('Completed');
      const entries = page.getByTestId('history-entry');
      await expect(entries).toHaveCount(6);
      const expected: Array<[RegExp | string, string]> = [
        ['Created', USERS.admin.name],
        ['Changed from Pending to In progress', USERS.employee1.name],
        ['Changed from In progress to Pending approval', USERS.employee1.name],
        ['Changed from Pending approval to In progress', USERS.admin.name],
        ['Changed from In progress to Pending approval', USERS.employee1.name],
        ['Changed from Pending approval to Completed', USERS.admin.name],
      ];
      for (const [index, [change, actor]] of expected.entries()) {
        await expect(entries.nth(index)).toContainText(change);
        await expect(entries.nth(index)).toContainText(actor);
      }
      await expect(page.getByTestId('history-reason')).toHaveCount(1);
      await expect(entries.nth(3).getByTestId('history-reason')).toContainText('Rejection reason');
      await expect(entries.nth(3).getByTestId('history-reason')).toContainText(
        'The second section is missing.',
      );
    }
    await expect(
      employee.getByRole('button', { name: /Start task|Submit for approval/ }),
    ).toHaveCount(0);
  });

  await admin.context().close();
  await employee.context().close();
});
