import { defineConfig, devices } from '@playwright/test';
import process from 'node:process';

const port = Number(process.env.PROTO_PLAYWRIGHT_PORT || 4173);

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.js',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
      // The basket spec creates its own isolated desktop + mobile contexts.
      testIgnore: '**/authenticated-basket-sync.spec.js',
    },
  ],
});
