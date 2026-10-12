import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests for pure modules only (src/**/*.test.ts). Components are covered by Playwright.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // A timezone far from UTC so date helpers that shift calendar dates fail loudly.
    env: { TZ: 'Pacific/Honolulu' },
  },
});
