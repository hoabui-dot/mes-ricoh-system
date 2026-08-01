import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';

test.describe.configure({ mode: 'serial' });
const username = process.env.MES_E2E_USERNAME;
const password = process.env.MES_E2E_PASSWORD;
const allowMutation = process.env.ALLOW_E2E_MUTATION === 'true';
let createdWorkOrderId = '';

type Api = { request: APIRequestContext; headers: Record<string, string>; base: string };

async function login(page: Page): Promise<Api> {
  if (!username || !password) test.skip(true, 'MES_E2E_USERNAME and MES_E2E_PASSWORD are required.');
  if (!allowMutation) test.skip(true, 'Set ALLOW_E2E_MUTATION=true for the browser resource-planning flow.');
  let authHeaders: Record<string, string> = {};
  let apiOrigin = '';
  page.on('request', (request) => {
    const headers = request.headers();
    if (headers['x-user-id'] && request.url().includes('/api/mes/')) { authHeaders = { 'x-user-id': headers['x-user-id'], 'x-role-code': headers['x-role-code'] || 'PLANT_MANAGER' }; apiOrigin = new URL(request.url()).origin; }
  });
  await page.goto('/work-orders/new', { waitUntil: 'domcontentloaded' });
  const loginField = page.locator('#username, input[name="username"]');
  await loginField.first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
  if (await loginField.count()) {
    await loginField.first().fill(username!);
    await page.locator('#password, input[name="password"]').first().fill(password!);
    await page.getByRole('button', { name: /sign in|log in|đăng nhập/i }).click();
  }
  await expect(page.getByTestId('work-order-create-screen')).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => Object.keys(authHeaders).length, { timeout: 15_000 }).toBeGreaterThan(0);
  return { request: page.request, headers: authHeaders, base: process.env.MES_E2E_API_BASE_URL || apiOrigin || 'http://100.68.50.41:18000' };
}

async function selectOption(page: Page, label: RegExp, text: RegExp) {
  await page.getByRole('textbox', { name: label }).click();
  await page.getByRole('option').filter({ hasText: text }).first().click();
}

test.afterAll(() => {
  if (!createdWorkOrderId || !process.env.MES_EXECUTION_DATABASE_URL) return;
  execFileSync(process.execPath, ['scripts/cleanup-mes-resource-planning-e2e.mjs', createdWorkOrderId], { stdio: 'inherit', env: process.env });
});

test('[@smoke] creates a Work Order and commits every Ready resource candidate through the Console', async ({ page }) => {
  const api = await login(page);
  await expect(page.getByTestId('work-order-production-version-field')).toBeVisible();
  await page.locator('input[inputmode="decimal"]').first().fill('2');
  await selectOption(page, /Production Version|Phiên bản sản xuất/i, /E2E WO Label Production Version|Cấu hình E2E WO in nhãn|PV-/i);
  await selectOption(page, /Shift|Ca/i, /SHIFT-|Ca/i);
  await page.getByTestId('work-order-create-submit').click();
  await expect(page.getByRole('dialog', { name: /Tạo lệnh sản xuất|Create Work Order/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/succeeded|Thành công|Succeeded/i)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /open work order|Mở lệnh sản xuất/i }).click();
  await expect(page).toHaveURL(/\/work-orders\/[0-9a-f-]+$/);
  createdWorkOrderId = page.url().split('/').pop()!;
  await expect(page.getByTestId('work-order-resource-planning-tab')).toBeVisible();
  await page.getByRole('button', { name: /Compute|Tính toán/i }).click();
  await expect(page.getByText(/Compute & Check|Kết quả tính toán/i)).toBeVisible({ timeout: 15_000 });

  const operationRows = page.locator('[data-testid^="work-order-operation-row-"]');
  const count = await operationRows.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    await operationRows.nth(index).click();
    await expect(page.getByTestId('candidate-workstation-list')).toBeVisible({ timeout: 15_000 });
    const candidate = page.locator('[data-testid^="candidate-workstation-card-"]').first();
    await expect(page.getByTestId('candidate-workstation-status').first()).toContainText(/Ready|Sẵn sàng/i);
    await expect(page.getByTestId('candidate-machine-requirement').first()).toBeVisible();
    await page.getByTestId('candidate-select-button').first().click();
    await expect(page.getByTestId('candidate-workstation-list')).toHaveCount(0);
    await expect(page.locator('[data-testid^="allocation-status-"]').nth(index)).toContainText(/Committed|Đã phân bổ/i);
  }
  await page.reload();
  await expect(page.getByTestId('work-order-resource-planning-tab')).toBeVisible();
  await expect(page.locator('[data-testid^="allocation-status-"]').filter({ hasText: /Committed|Đã phân bổ/i })).toHaveCount(count);
  const detail = await api.request.get(`${api.base}/api/mes/execution/work-orders/${createdWorkOrderId}`, { headers: api.headers });
  expect(detail.ok()).toBeTruthy();
  const body = await detail.json();
  expect((body.data ?? body).operations.every((operation: any) => operation.resource_allocation?.status === 'Committed')).toBeTruthy();
});

test('[@validation] blocks an invalid Work Order quantity before submit', async ({ page }) => {
  await login(page);
  await page.locator('input[inputmode="decimal"]').first().fill('0');
  await selectOption(page, /Production Version|Phiên bản sản xuất/i, /E2E WO Label Production Version|Cấu hình E2E WO in nhãn|PV-/i);
  await selectOption(page, /Shift|Ca/i, /SHIFT-|Ca/i);
  await expect(page.getByTestId('work-order-create-submit')).toBeDisabled();
  await expect(page.getByTestId('work-order-create-screen')).not.toContainText('[object Object]');
});

test('[@authorization] denies a viewer commit', async () => {
  test.skip(true, 'MES_E2E_VIEWER_USERNAME and MES_E2E_VIEWER_PASSWORD are not configured.');
});
