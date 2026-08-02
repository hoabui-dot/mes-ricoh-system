import { test, expect } from '@playwright/test';
import { credentials, login, requireMutationEnvironment } from './phase3-helpers';

test('[@phase6] Production Line master-data authoring route is available in MES Console', async ({ page }) => {
  requireMutationEnvironment();
  await login(page, credentials.manager);

  const listResponse = page.waitForResponse((response) => response.url().includes('/api/mes/master-data/production-lines') && response.request().method() === 'GET');
  await page.goto('/master-data/production-lines', { waitUntil: 'domcontentloaded' });
  await expect.poll(async () => (await listResponse).ok(), { timeout: 15_000 }).toBeTruthy();
  await expect(page.getByRole('heading', { name: /Production Lines|Dây chuyền sản xuất/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Create|Tạo/i })).toBeVisible();

  await page.getByRole('button', { name: /Create|Tạo/i }).click();
  await expect(page).toHaveURL(/\/master-data\/production-lines\/new$/);
  await expect(page.getByRole('heading', { name: /Create.*Production Lines|Tạo.*Dây chuyền sản xuất/i })).toBeVisible();
  await expect(page.getByText(/Site|Factory|Nhà máy/i).first()).toBeVisible();
  await expect(page.getByText(/Production Area|Khu vực sản xuất/i).first()).toBeVisible();
  await expect(page.getByText(/Line type|Loại dây chuyền/i)).toBeVisible();
});
