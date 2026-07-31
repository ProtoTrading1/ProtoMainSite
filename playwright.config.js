import { defineConfig, devices } from '@playwright/test';
import process from 'node:process';

const port = 4173;

export default defineConfig({
  testDir: './e2e',
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
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port}`,
    env: {
      ...process.env,
      // Keep synthetic authentication on the same disposable local server so
      // Playwright can fulfil it without any real Supabase credentials.
      VITE_SUPABASE_URL: `http://127.0.0.1:${port}/mock-supabase`,
      VITE_SUPABASE_ANON_KEY: 'e2e-public-placeholder',
      VITE_INTERCOM_APP_ID: '',
    },
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
