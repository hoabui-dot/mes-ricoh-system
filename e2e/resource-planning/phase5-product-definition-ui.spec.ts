import { test, expect } from '@playwright/test';
import { credentials, login } from './phase3-helpers';

test('[@phase5] Production Version UI exposes line eligibility, readiness preview, and WO authority navigation', async ({ page }) => {
  await login(page, credentials.manager);

  await page.goto('/master-data/production-versions?lifecycle_status=Released', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main h1').filter({ hasText: /Production Version|Phiên bản sản xuất/i })).toBeVisible();
  await expect(page.getByTestId('pv-line-eligibility-summary').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('main table tbody tr').first()).toContainText(/LINE|Line|line/i);

  const eligibilityResponse = page.waitForResponse((response) => response.url().includes('/api/mes/master-data/production-versions/') && response.url().includes('/line-eligibility') && response.request().method() === 'GET');
  const readinessResponse = page.waitForResponse((response) => response.url().includes('/api/mes/master-data/production-versions/') && response.url().includes('/line-readiness-preview') && response.request().method() === 'POST');
  await page.locator('main table tbody tr').filter({ has: page.getByTestId('pv-line-eligibility-summary') }).first().click();
  await expect((await eligibilityResponse).ok()).toBeTruthy();
  await expect((await readinessResponse).ok()).toBeTruthy();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('pv-line-eligibility-panel')).toBeVisible();
  await expect(dialog).toContainText(/Primary|Backup|Production Line|Readiness/i);
  await expect(dialog.getByRole('button', { name: /Validate PV|PV 検証|검증|Validate/i })).toBeVisible();

  await dialog.getByRole('button', { name: /Create Work Order|Tạo Work Order|Work Order 作成|Work Order 생성/i }).click();
  await expect(page).toHaveURL(/\/work-orders\/new/);
  await expect(page.getByTestId('work-order-production-version-field')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/MBOM ID|Routing ID|EBOM ID/i);
});
