import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';

test.describe.configure({ mode: 'serial' });
const username = process.env.MES_E2E_USERNAME;
const password = process.env.MES_E2E_PASSWORD;
const allowMutation = process.env.ALLOW_E2E_MUTATION === 'true';
let createdWorkOrderId = '';

type Api = { request: APIRequestContext; headers: Record<string, string>; base: string };

function defaultPlanningDate() {
  const date = new Date();
  const day = date.getUTCDay();
  if (day === 6) date.setUTCDate(date.getUTCDate() + 2);
  if (day === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

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
  const targetDate = process.env.E2E_WO_TARGET_DATE || defaultPlanningDate();
  await expect(page.getByTestId('work-order-production-version-field')).toBeVisible();
  const dateInput = page.locator('input[type="date"]').first();
  if (await dateInput.count()) await dateInput.fill(targetDate);
  await page.locator('input[inputmode="decimal"]').first().fill('2');
  await selectOption(page, /Production Version|Phiên bản sản xuất/i, /E2E WO Label Production Version|Cấu hình E2E WO in nhãn|PV-|Won Seal Tech/i);
  await selectOption(page, /Shift|Ca/i, /SHIFT-|Ca/i);
  await page.getByTestId('work-order-create-submit').click();
  await expect(page.getByRole('dialog', { name: /Tạo lệnh sản xuất|Create Work Order/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/succeeded|Thành công|Succeeded/i)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /open work order|Mở lệnh sản xuất/i }).click();
  await expect(page).toHaveURL(/\/work-orders\/[0-9a-f-]+$/);
  createdWorkOrderId = page.url().split('/').pop()!;
  await expect(page.getByTestId('work-order-resource-planning-tab')).toBeVisible();
  await page.getByRole('button', { name: /Compute|Tính toán/i }).click();
  await expect(page.getByText(/Kết quả tính toán thời lượng|Duration calculation result/i).first()).toBeVisible({ timeout: 15_000 });

  const initialDetail = await api.request.get(`${api.base}/api/mes/execution/work-orders/${createdWorkOrderId}`, { headers: api.headers });
  expect(initialDetail.ok()).toBeTruthy();
  const initialBody = await initialDetail.json();
  const detailData = initialBody.data ?? initialBody;
  const operations = detailData.operations || [];
  expect(operations.length).toBeGreaterThan(0);
  let cursor = new Date(`${targetDate}T08:00:00.000Z`);
  for (const operation of operations) {
    const start = cursor.toISOString();
    const candidatesResponse = await api.request.get(`${api.base}/api/mes/execution/work-orders/${createdWorkOrderId}/operations/${operation.wo_operation_id}/resource-candidates?planned_start_at=${encodeURIComponent(start)}&shift_id=${encodeURIComponent(detailData.header?.shift_id || detailData.shift_id)}`, { headers: api.headers });
    expect(candidatesResponse.ok()).toBeTruthy();
    const candidatesBody = await candidatesResponse.json();
    const candidate = (candidatesBody.candidates || []).find((item: any) => item.readiness !== 'Blocked' && !(item.blocking_errors || []).length && !(item.capacity_conflicts || []).length);
    expect(candidate, `Ready candidate for ${operation.operation_code}`).toBeTruthy();
    const allocation = await api.request.post(`${api.base}/api/mes/execution/work-orders/${createdWorkOrderId}/operations/${operation.wo_operation_id}/resource-allocation`, {
      headers: { ...api.headers, 'Content-Type': 'application/json', 'Idempotency-Key': `resource-flow-${createdWorkOrderId}-${operation.wo_operation_id}` },
      data: {
        workstation_id: candidate.workstation?.id,
        equipment_id: candidate.primary_machine?.id || candidate.equipment?.id,
        machine_group_id: candidate.machine_group?.id,
        shift_id: detailData.header?.shift_id || detailData.shift_id,
        planned_start_at: start,
        candidate_reference: `${candidate.assignment?.id || ''}:${candidate.machine_group?.id || ''}:${candidate.capability?.id || ''}`,
        row_version: detailData.header?.row_version || detailData.row_version,
      },
    });
    expect(allocation.ok(), await allocation.text()).toBeTruthy();
    const duration = Number(candidate.estimated_duration_min ?? candidate.calculation?.estimated_duration_min ?? 1);
    cursor = new Date(cursor.getTime() + Math.max(duration, 1) * 60_000);
  }
  await page.reload();
  await expect(page.getByTestId('work-order-resource-planning-tab')).toBeVisible();
  const detail = await api.request.get(`${api.base}/api/mes/execution/work-orders/${createdWorkOrderId}`, { headers: api.headers });
  expect(detail.ok()).toBeTruthy();
  const body = await detail.json();
  const committedDetail = body.data ?? body;
  expect(committedDetail.operations.every((operation: any) => operation.resource_allocation?.status === 'Committed')).toBeTruthy();
  expect(committedDetail.resource_evaluation_dimensions).toHaveLength(5);
  expect(committedDetail.resource_evaluation_dimensions.every((dimension: any) => dimension.status === 'READY' && dimension.evaluation_stage === 'RESOURCE_ALLOCATION')).toBeTruthy();
  const selectedRole = String(committedDetail.header?.line_selection_mode || committedDetail.line_selection_mode || 'PRIMARY').toLowerCase();
  const selectedMatrix = page.getByTestId(`line-dimension-matrix-${selectedRole}`);
  for (const dimension of ['workstations', 'machine_requirements', 'equipment_units', 'assignments', 'worker_skill_labor']) {
    await expect(selectedMatrix.getByTestId(`line-dimension-${dimension}`)).toContainText(/Đạt|Ready/i);
  }
  await expect(selectedMatrix).not.toContainText(/Hoãn đến bước phân bổ nguồn lực|Deferred to resource allocation/i);
});

test('[@validation] blocks an invalid Work Order quantity before submit', async ({ page }) => {
  await login(page);
  const targetDate = process.env.E2E_WO_TARGET_DATE || defaultPlanningDate();
  const dateInput = page.locator('input[type="date"]').first();
  if (await dateInput.count()) await dateInput.fill(targetDate);
  await page.locator('input[inputmode="decimal"]').first().fill('0');
  await selectOption(page, /Production Version|Phiên bản sản xuất/i, /E2E WO Label Production Version|Cấu hình E2E WO in nhãn|PV-|Won Seal Tech/i);
  await selectOption(page, /Shift|Ca/i, /SHIFT-|Ca/i);
  await expect(page.getByTestId('work-order-create-submit')).toBeDisabled();
  await expect(page.getByTestId('work-order-create-screen')).not.toContainText('[object Object]');
});

test('[@authorization] denies a viewer commit', async ({ page }) => {
  const base = process.env.MES_E2E_API_BASE_URL || 'http://127.0.0.1:18000';
  const response = await page.request.post(`${base}/api/mes/execution/work-orders/00000000-0000-0000-0000-000000000000/operations/00000000-0000-0000-0000-000000000000/resource-allocation`, {
    headers: {
      'Content-Type': 'application/json',
      'X-User-ID': '00000000-0000-0000-0000-000000000001',
      'X-Role-Code': 'VIEWER',
    },
    data: {},
  });
  expect(response.status()).toBe(403);
  const body = await response.json();
  expect(body.error).toBe('RESOURCE_ALLOCATION_FORBIDDEN');
});
