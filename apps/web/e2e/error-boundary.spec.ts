import { expect, test } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { storageStatePath, USERS } from './fixtures';

/**
 * The root error boundary's Retry (Next 16 `retry` prop) recovers once the API is back.
 *
 * The shared e2e servers can't be stopped mid-run, so this spec starts its own pair on spare
 * ports: a second `next start` of the same `.next-e2e` build whose server-side session check
 * (`API_URL`, read at runtime by `src/lib/api/server.ts`) points at port 4101, where no API runs
 * at first. Client `/api/v1` calls still go to the shared API through the build-time rewrite.
 */

const WEB_PORT = 3101;
const API_PORT = 4101;
const WEB_ORIGIN = `http://localhost:${WEB_PORT}`;
const API_ORIGIN = `http://localhost:${API_PORT}`;
const WEB_DIR = path.resolve(__dirname, '..');

const children: ChildProcess[] = [];

/** Starts a process in its own group so the whole tree can be stopped afterwards. */
function start(args: string[], cwd: string, env: NodeJS.ProcessEnv): ChildProcess {
  const child = spawn(process.execPath, args, { cwd, env, detached: true, stdio: 'ignore' });
  children.push(child);
  return child;
}

async function isUp(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { redirect: 'manual' });
    return response.status < 500;
  } catch {
    return false;
  }
}

async function waitUntilUp(url: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isUp(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${url} did not come up within ${timeoutMs} ms`);
}

test.afterAll(async () => {
  for (const child of children) {
    if (child.pid && child.exitCode === null) {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        // Already gone.
      }
    }
  }
  // Both ports must be free again before the next spec.
  await expect.poll(() => isUp(`${WEB_ORIGIN}/login`), { timeout: 15_000 }).toBe(false);
  await expect.poll(() => isUp(`${API_ORIGIN}/health`), { timeout: 15_000 }).toBe(false);
});

test('Retry re-renders the app once the API is reachable again', async ({ browser }) => {
  test.setTimeout(150_000);
  expect(await isUp(`${WEB_ORIGIN}/login`), `port ${WEB_PORT} is already in use`).toBe(false);
  expect(await isUp(`${API_ORIGIN}/health`), `port ${API_PORT} is already in use`).toBe(false);

  start(
    [path.join(WEB_DIR, 'node_modules/next/dist/bin/next'), 'start', '--port', `${WEB_PORT}`],
    WEB_DIR,
    {
      ...process.env,
      NEXT_DIST_DIR: '.next-e2e',
      API_URL: API_ORIGIN,
    },
  );
  await waitUntilUp(`${WEB_ORIGIN}/login`);

  const context = await browser.newContext({ storageState: storageStatePath('admin') });
  const page = await context.newPage();

  await test.step('API down: the session check fails and the root boundary renders', async () => {
    await page.goto(`${WEB_ORIGIN}/admin`);
    await expect(page.getByText('Something went wrong')).toBeVisible();
    await expect(page.getByText('The application could not reach the server.')).toBeVisible();
    await expect(page.getByTestId('header-user-name')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  await test.step('API back: Retry renders the app shell and the dashboard', async () => {
    // Same test-env guard and settings as the shared e2e API (NODE_ENV=test, *_test database).
    start([path.join(WEB_DIR, 'e2e/start-api.mjs'), `${API_PORT}`, WEB_ORIGIN], WEB_DIR, {
      ...process.env,
    });
    await waitUntilUp(`${API_ORIGIN}/health`);

    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByTestId('header-user-name')).toHaveText(USERS.admin.name);
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    await expect(page.getByTestId('stat-Total tasks')).toHaveText(/^\d+$/);
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
    await expect(page).toHaveURL(`${WEB_ORIGIN}/admin`);
  });

  await context.close();
});
