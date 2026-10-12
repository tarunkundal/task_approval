import { defineConfig, devices } from '@playwright/test';
import { API_DIR, loadTestEnv } from './e2e/test-env.mjs';

/**
 * E2E against real servers on non-default ports (web 3100, API 4100) and the guarded test DB
 * (`pnpm test:e2e` migrates + seeds it, then builds the web app into `.next-e2e`).
 */
const WEB_PORT = 3100;
const API_PORT = 4100;
const WEB_ORIGIN = `http://localhost:${WEB_PORT}`;
const API_ORIGIN = `http://localhost:${API_PORT}`;

const testEnv = loadTestEnv();

/**
 * `screenshots.spec.ts` rewrites the committed PNGs in docs/screenshots/phase5/, so it is left
 * out of `pnpm test:e2e` and only runs with SCREENSHOTS=1 (`pnpm screenshots`, which first
 * resets and re-seeds the test database so the images show only demo data).
 */
const SCREENSHOTS = process.env.SCREENSHOTS === '1';
const SCREENSHOT_SPEC = /screenshots\.spec\.ts/;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_ORIGIN,
    trace: 'retain-on-failure',
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      testMatch: /.*\.spec\.ts/,
      // The doc screenshots are not a test: they only run through `pnpm screenshots`.
      testIgnore: SCREENSHOT_SPEC,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
    },
    ...(SCREENSHOTS
      ? [
          {
            name: 'screenshots',
            testMatch: SCREENSHOT_SPEC,
            dependencies: ['setup'],
            use: {
              ...devices['Desktop Chrome'],
              channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
            },
          },
        ]
      : []),
  ],
  webServer: [
    {
      command: 'node dist/server.js',
      cwd: API_DIR,
      url: `${API_ORIGIN}/health`,
      // Test env overrides the shell; a fresh process per run also resets the in-memory limiters.
      env: {
        ...testEnv,
        NODE_ENV: 'test',
        PORT: String(API_PORT),
        FRONTEND_URL: WEB_ORIGIN,
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `pnpm exec next start --port ${WEB_PORT}`,
      url: `${WEB_ORIGIN}/login`,
      env: { NEXT_DIST_DIR: '.next-e2e', API_URL: API_ORIGIN },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
