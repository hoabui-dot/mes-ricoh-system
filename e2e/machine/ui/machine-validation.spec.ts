import { test, expect, type Page } from '@playwright/test';

const username = process.env.MES_E2E_USERNAME;
const password = process.env.MES_E2E_PASSWORD;

async function login(page: Page) {
  if (!username || !password) test.skip(true, 'MES_E2E_USERNAME and MES_E2E_PASSWORD are required.');
  let apiSeen = false;
  page.on('request', (request) => {
    if (request.headers()['x-user-id'] && request.url().includes('/api/mes/')) apiSeen = true;
  });
  await page.goto('/master-data/machines', { waitUntil: 'domcontentloaded' });
  const loginField = page.getByLabel('Username or email');
  await loginField.waitFor({ state: 'attached', timeout: 15_000 }).catch(() => undefined);
  if (await loginField.count()) {
    await loginField.fill(username!);
    await page.getByLabel('Password', { exact: true }).fill(password!);
    await page.getByRole('button', { name: /sign in|log in|đăng nhập/i }).click();
  }
  await expect(page.getByTestId('machine-list')).toBeVisible();
  await expect.poll(() => apiSeen, { timeout: 15_000 }).toBeTruthy();
}

test('[@validation] Machine Definition required fields remain visible and block an empty submit', async ({ page }) => {
  await login(page);
  await page.getByTestId('machine-create-button').click();
  const form = page.getByTestId('machine-form');
  await expect(form).toBeVisible();
  await page.getByTestId('machine-save-button').click();
  await expect(form).toBeVisible();
  await expect(page.getByTestId('machine-name-input')).toBeVisible();
  await expect(page.getByTestId('machine-site-select')).toBeVisible();
  await expect(page.getByTestId('machine-type-input')).toBeVisible();
  await expect(page.getByTestId('machine-expected-unit-count-input')).toBeVisible();
});
