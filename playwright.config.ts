import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.MES_E2E_BASE_URL || 'http://100.68.50.41:13052';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: 'artifacts/playwright/report', open: 'never' }]],
  outputDir: 'artifacts/playwright/test-results',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
