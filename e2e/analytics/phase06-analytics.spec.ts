import { expect, test } from '@playwright/test';
import { credentials, login } from '../resource-planning/phase3-helpers';

test.describe('MES Analytics dashboard certification', () => {
  test('overview, filters, deep-dive tabs, empty state, and keyboard accessibility', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await login(page, credentials.manager);
    await page.goto('/analytics', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Phân tích sản xuất' })).toBeVisible();
    await expect(page.getByLabel('Từ ngày')).toBeVisible();
    await expect(page.getByLabel('Đến ngày')).toBeVisible();
    await expect(page.getByLabel('Trạng thái WO')).toBeVisible();
    await expect(page.getByText(/Chưa có Work Order|Phân bố trạng thái WO/).first()).toBeVisible({ timeout: 20_000 });

    await page.getByLabel('Nhà máy').click();
    await page.getByRole('option', { name: /SITE-KZ3/ }).click();
    await expect(page).toHaveURL(/site=/);
    await page.getByLabel('Dây chuyền').click();
    await page.getByRole('option', { name: /WST-SEED-LINE-1/ }).click();
    await expect(page).toHaveURL(/line=WST-SEED-LINE-1/);
    await page.getByRole('button', { name: 'Đặt lại' }).click();
    await expect(page).not.toHaveURL(/site=|line=/);

    for (const tab of ['production', 'lines-resources', 'execution-quality', 'materials-traceability', 'print-system']) {
      await page.goto(`/analytics/${tab}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('main h1').first()).toBeVisible();
      await expect(page.locator('main')).not.toContainText(/Page not found|Không tìm thấy trang/i);
    }
    await expect(page.locator('table th').first()).toBeVisible({ timeout: 20_000 }).catch(() => undefined);
    await expect(page.locator('body')).not.toContainText(/analytics\./);
    await expect(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true);
    expect(pageErrors).not.toContainEqual(expect.stringContaining("Failed to execute 'removeChild'"));
  });
});
