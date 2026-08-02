import { test, expect } from '@playwright/test';
import { credentials, login } from './phase3-helpers';

test('[@phase4] shared UI foundation supports Production Version list filters and detail modal', async ({ page }) => {
  await login(page, credentials.manager);

  await page.goto('/master-data/production-versions', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main h1').filter({ hasText: /Production Version|Phiên bản sản xuất/i })).toBeVisible();
  await expect(page.locator('main table')).toBeVisible();
  await expect(page.getByLabel(/Status|Trạng thái/i)).toBeVisible();
  await expect(page.getByLabel(/Item Revision|Revision/i)).toBeVisible();

  await page.getByLabel(/Status|Trạng thái/i).click();
  await page.getByRole('option', { name: /Released|Đã release/i }).click();
  await expect(page).toHaveURL(/lifecycle_status=Released/);
  await expect(page.locator('main table tbody tr').first()).toBeVisible();

  await page.getByRole('button', { name: /Reset|Đặt lại/i }).click();
  await expect(page).not.toHaveURL(/lifecycle_status=Released/);

  const refreshResponse = page.waitForResponse((response) => response.url().includes('/api/mes/master-data/production-versions') && response.request().method() === 'GET');
  await page.getByTitle(/Refresh|Làm mới/i).click();
  await expect((await refreshResponse).ok()).toBeTruthy();

  await page.locator('main table tbody tr').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText(/MBOM/);
  await expect(page.getByRole('dialog')).toContainText(/Routing|Định tuyến/i);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('main table')).toBeVisible();
});
