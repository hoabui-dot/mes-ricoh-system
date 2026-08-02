import { test, expect, type Page } from '@playwright/test';
import { cleanupWorkOrders, credentials, defaultPlanningDate, login, requireMutationEnvironment } from './phase3-helpers';

const createdWorkOrderIds: string[] = [];

async function selectOption(page: Page, label: RegExp, text: RegExp) {
  await page.getByRole('textbox', { name: label }).click();
  await page.getByRole('option').filter({ hasText: text }).first().click();
}

test.afterAll(() => {
  cleanupWorkOrders(createdWorkOrderIds);
});

test('[@phase4] Work Order browser creation uses Production Version as the only production-definition authority', async ({ page }) => {
  requireMutationEnvironment();
  await login(page, credentials.manager);
  await expect(page.getByTestId('work-order-create-screen')).toBeVisible();
  await expect(page.getByTestId('work-order-production-version-field')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/MBOM ID|Routing ID|EBOM ID/i);

  await page.locator('input[type="date"]').fill(defaultPlanningDate());
  await page.locator('input[inputmode="decimal"]').first().fill('2');
  await selectOption(page, /Production Version|Phiên bản sản xuất/i, /E2E WO Label Production Version|Cấu hình E2E WO in nhãn|PV-/i);
  await selectOption(page, /Shift|Ca/i, /SHIFT-|Ca/i);

  const createRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().includes('/api/mes/execution/work-order-creation-workflows'));
  await page.getByTestId('work-order-create-submit').click();
  const request = await createRequest;
  const payload = request.postDataJSON();
  expect(payload.production_version_id).toMatch(/[0-9a-f-]{36}/i);
  expect(payload.quantity).toBe(2);
  expect(payload.target_date).toBe(defaultPlanningDate());
  expect(payload.shift_id).toMatch(/[0-9a-f-]{36}/i);
  expect(payload.item_revision_id).toBeUndefined();
  expect(payload.mbom_header_id).toBeUndefined();
  expect(payload.routing_header_id).toBeUndefined();
  expect(payload.ebom_header_id).toBeUndefined();

  await expect(page.getByRole('dialog', { name: /Tạo lệnh sản xuất|Create Work Order/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Thành công|Succeeded|succeeded/i)).toBeVisible({ timeout: 35_000 });
  await page.getByRole('button', { name: /open work order|Mở lệnh sản xuất/i }).click();
  await expect(page).toHaveURL(/\/work-orders\/[0-9a-f-]+$/);
  createdWorkOrderIds.push(page.url().split('/').pop()!);
});
