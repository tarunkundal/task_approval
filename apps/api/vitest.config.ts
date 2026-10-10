import { defineConfig } from 'vitest/config';
import { loadTestEnv } from './test/helpers/test-env.js';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Only apps/api/.env.test is loaded; the development .env is never used by tests.
    env: loadTestEnv(),
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    // Test files share one database, so run them one at a time for determinism.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 60_000,
  },
});
