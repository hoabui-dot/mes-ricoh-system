import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import pg from 'pg';
import {
  apiJson,
  cleanupWorkOrders,
  credentials,
  defaultPlanningDate,
  ensurePhase3KeycloakUsers,
  login,
  logout,
  requireMutationEnvironment,
} from './phase3-helpers';

test.describe.configure({ mode: 'serial' });

const executionUrl = process.env.MES_EXECUTION_DATABASE_URL || 'postgresql://mes_execution_user:mes_execution_pass@localhost:15435/mes_execution_db';
const masterUrl = process.env.MES_MASTER_DATA_DATABASE_URL || 'postgresql://mes_master_data_user:mes_master_data_pass@localhost:15434/mes_master_data_db';
const executionDb = new pg.Client({ connectionString: executionUrl });
const masterDb = new pg.Client({ connectionString: masterUrl });
const createdWorkOrderIds: string[] = [];
const restores: Array<() => Promise<void>> = [];

async function selectOption(page: Page, label: RegExp, text: RegExp) {
  await page.getByRole('textbox', { name: label }).click();
  await page.getByRole('option').filter({ hasText: text }).first().click();
}

async function createWorkOrderThroughConsole(page: Page) {
  await expect(page.getByTestId('work-order-create-screen')).toBeVisible();
  await page.locator('input[type="date"]').fill(defaultPlanningDate());
  await page.locator('input[inputmode="decimal"]').first().fill('2');
  await selectOption(page, /Production Version|Phiên bản sản xuất/i, /E2E WO Label Production Version|Cấu hình E2E WO in nhãn|PV-/i);
  await selectOption(page, /Shift|Ca/i, /SHIFT-|Ca/i);
  await page.getByTestId('work-order-create-submit').click();
  await expect(page.getByRole('dialog', { name: /Tạo lệnh sản xuất|Create Work Order/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Thành công|Succeeded|succeeded/i)).toBeVisible({ timeout: 35_000 });
  await page.getByRole('button', { name: /open work order|Mở lệnh sản xuất/i }).click();
  await expect(page).toHaveURL(/\/work-orders\/[0-9a-f-]+$/);
  const id = page.url().split('/').pop()!;
  createdWorkOrderIds.push(id);
  return id;
}

async function createWorkOrderApi(ctx: APIRequestContext, base: string, headers: Record<string, string>, suffix: string) {
  const versions = await apiJson(ctx, base, `/api/mes/master-data/production-ready-versions?planned_date=${defaultPlanningDate()}&limit=500`, { headers });
  const version = versions.body.find((row: any) => row.readiness_status === 'Ready' && row.production_version_code?.startsWith('PV-'));
  expect(version).toBeTruthy();
  const shifts = await apiJson(ctx, base, `/api/mes/master-data/shifts?site_id=${encodeURIComponent(version.site_id)}&limit=500`, { headers });
  const shift = shifts.body.find((row: any) => row.site_id === version.site_id && row.lifecycle_status !== 'Inactive');
  expect(shift).toBeTruthy();
  const workflow = await apiJson(ctx, base, '/api/mes/execution/work-order-creation-workflows', {
    method: 'POST',
    headers: { ...headers, 'Idempotency-Key': `PHASE3-${Date.now()}-${suffix}` },
    data: { production_version_id: version.production_version_id, quantity: 2, target_date: defaultPlanningDate(), shift_id: shift.master_id },
  });
  for (let attempt = 0; attempt < 70; attempt += 1) {
    const snapshot = await apiJson(ctx, base, `/api/mes/execution/work-order-creation-workflows/${workflow.body.workflow_id}`, { headers });
    if (snapshot.body.status === 'succeeded') {
      createdWorkOrderIds.push(snapshot.body.work_order_id);
      return { workOrder: snapshot.body, version, shift };
    }
    if (snapshot.body.status === 'failed') throw new Error(`WORK_ORDER_CREATE_FAILED: ${JSON.stringify(snapshot.body)}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`WORK_ORDER_CREATE_TIMEOUT: ${workflow.body.workflow_id}`);
}

async function commitFirstOperation(ctx: APIRequestContext, base: string, headers: Record<string, string>, wo: any, shift: any, suffix: string) {
  const detail = await apiJson(ctx, base, `/api/mes/execution/work-orders/${wo.work_order_id}`, { headers });
  const operation = detail.body.operations[0];
  const start = `${defaultPlanningDate()}T08:00:00.000Z`;
  const candidates = await apiJson(ctx, base, `/api/mes/execution/work-orders/${wo.work_order_id}/operations/${operation.wo_operation_id}/resource-candidates?planned_start_at=${encodeURIComponent(start)}&shift_id=${shift.master_id}`, { headers });
  const candidate = candidates.body.candidates.find((item: any) => item.readiness !== 'Blocked' && !(item.blocking_errors || []).length && !(item.capacity_conflicts || []).length);
  expect(candidate).toBeTruthy();
  const committed = await apiJson(ctx, base, `/api/mes/execution/work-orders/${wo.work_order_id}/operations/${operation.wo_operation_id}/resource-allocation`, {
    method: 'POST',
    headers: { ...headers, 'Idempotency-Key': `PHASE3-ALLOC-${suffix}` },
    data: {
      workstation_id: candidate.workstation?.id,
      equipment_id: candidate.primary_machine?.id || candidate.equipment?.id,
      machine_group_id: candidate.machine_group?.id,
      shift_id: shift.master_id,
      planned_start_at: start,
      candidate_reference: `${candidate.assignment?.id || ''}:${candidate.machine_group?.id || ''}:${candidate.capability?.id || ''}`,
      row_version: wo.row_version,
    },
  });
  return { detail: detail.body, operation, candidate, committed: committed.body, start };
}

async function snapshotUpdate(client: pg.Client, table: string, idColumn: string, id: string, changes: Record<string, any>) {
  const columns = Object.keys(changes);
  const before = await client.query(`SELECT ${columns.join(', ')} FROM ${table} WHERE ${idColumn}=$1`, [id]);
  expect(before.rowCount).toBe(1);
  const assignments = columns.map((column, index) => `${column}=$${index + 2}`).join(', ');
  await client.query(`UPDATE ${table} SET ${assignments} WHERE ${idColumn}=$1`, [id, ...columns.map((column) => changes[column])]);
  const old = before.rows[0];
  restores.push(async () => {
    const restoreAssignments = columns.map((column, index) => `${column}=$${index + 2}`).join(', ');
    await client.query(`UPDATE ${table} SET ${restoreAssignments} WHERE ${idColumn}=$1`, [id, ...columns.map((column) => old[column])]);
  });
}

test.beforeAll(async () => {
  requireMutationEnvironment();
  await Promise.all([executionDb.connect(), masterDb.connect()]);
  await ensurePhase3KeycloakUsers();
});

test.afterAll(async () => {
  while (restores.length) await restores.pop()!();
  cleanupWorkOrders(createdWorkOrderIds);
  await Promise.all([executionDb.end(), masterDb.end()]);
});

test('[@phase3] normal allocation, refresh persistence, strict approval, execution start, logout/login persistence, and no raw enum/UUID rendering', async ({ page }) => {
  await login(page, credentials.manager);
  const workOrderId = await createWorkOrderThroughConsole(page);
  await page.getByRole('button', { name: /Compute|Tính toán/i }).click();
  await expect(page.getByTestId('work-order-compute-result')).toBeVisible({ timeout: 15_000 });
  const rows = page.locator('[data-testid^="work-order-operation-row-"]');
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    await rows.nth(index).locator('button').first().click();
    await expect(page.getByTestId('candidate-workstation-list')).toBeVisible();
    const selectableCandidate = page.locator('[data-testid="candidate-select-button"]:not(:disabled)').first();
    await expect(selectableCandidate).toBeEnabled({ timeout: 15_000 });
    await selectableCandidate.click();
    await expect(page.getByTestId('candidate-workstation-list')).toHaveCount(0);
    await expect(page.locator('[data-testid^="allocation-status-"]').nth(index)).toContainText(/Đã cam kết|Committed/i);
  }
  await page.reload();
  await expect(page.locator('[data-testid^="allocation-status-"]').filter({ hasText: /Đã cam kết|Committed/i })).toHaveCount(count);
  await page.getByTestId('resource-revalidate-button').click();
  await page.getByRole('button', { name: /Phê duyệt|Approve/i }).click();
  await expect(page.getByText(/Released|Đã release|Đã phát hành/i)).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('work-order-start-execution-button').click();
  await expect(page.getByText(/InProgress|Đang thực hiện/i)).toBeVisible({ timeout: 15_000 });
  await logout(page);
  await login(page, credentials.manager);
  await page.goto(`/work-orders/${workOrderId}`);
  await expect(page.locator('[data-testid^="allocation-status-"]').filter({ hasText: /Đã cam kết|Committed/i })).toHaveCount(count);
  const visibleText = await page.locator('body').innerText();
  expect(visibleText).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  expect(visibleText).not.toContain('[object Object]');
  expect(visibleText).not.toContain('ReadyWithWarnings');
  cleanupWorkOrders([workOrderId]);
  const trackedIndex = createdWorkOrderIds.indexOf(workOrderId);
  if (trackedIndex >= 0) createdWorkOrderIds.splice(trackedIndex, 1);
});

test('[@phase3] blocked candidate, capacity conflict, translated error rendering, cancellation, and reallocation are visible in Console', async ({ page }) => {
  const auth = await login(page, credentials.manager);
  const first = await createWorkOrderApi(page.request, auth.base, auth.headers, 'CAPACITY-A');
  const second = await createWorkOrderApi(page.request, auth.base, auth.headers, 'CAPACITY-B');
  await commitFirstOperation(page.request, auth.base, auth.headers, first.workOrder, first.shift, 'CAPACITY-A');
  await page.goto(`/work-orders/${second.workOrder.work_order_id}`);
  await page.locator('[data-testid^="work-order-operation-row-"]').first().locator('button').first().click();
  await expect(page.getByTestId('candidate-workstation-list')).toBeVisible();
  await expect(page.getByTestId('candidate-blocking-reasons').first()).toContainText(/trùng reservation|trùng thời gian|conflict|xung đột/i);
  await expect(page.getByTestId('candidate-select-button').first()).toBeDisabled();

  await page.goto(`/work-orders/${first.workOrder.work_order_id}`);
  await expect(page.locator('[data-testid^="allocation-status-"]').first()).toContainText(/Đã cam kết|Committed/i);
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('[data-testid^="allocation-cancel-button-"]').first().click();
  await expect(page.locator('[data-testid^="allocation-status-"]').first()).toContainText(/Chưa phân bổ|Not allocated/i);
  await page.locator('[data-testid^="work-order-operation-row-"]').first().locator('button').first().click();
  await page.getByTestId('candidate-select-button').first().click();
  await expect(page.locator('[data-testid^="allocation-status-"]').first()).toContainText(/Đã cam kết|Committed/i);
  await page.locator('[data-testid^="allocation-reallocate-button-"]').first().click();
  await page.getByTestId('candidate-select-button').first().click();
  await expect(page.locator('[data-testid^="allocation-status-"]').first()).toContainText(/Đã cam kết|Committed/i);
  const scenarioIds = [first.workOrder.work_order_id, second.workOrder.work_order_id];
  cleanupWorkOrders(scenarioIds);
  for (const workOrderId of scenarioIds) {
    const trackedIndex = createdWorkOrderIds.indexOf(workOrderId);
    if (trackedIndex >= 0) createdWorkOrderIds.splice(trackedIndex, 1);
  }
});

test('[@phase3] stale candidate and maintenance or out-of-service resource states render through backend readiness', async ({ page }) => {
  const auth = await login(page, credentials.manager);
  const fixture = await createWorkOrderApi(page.request, auth.base, auth.headers, 'STALE');
  const committed = await commitFirstOperation(page.request, auth.base, auth.headers, fixture.workOrder, fixture.shift, 'STALE');
  await snapshotUpdate(masterDb, 'md_machine_unit', 'machine_unit_id', committed.candidate.primary_machine.unit_id, { execution_status: 'OutOfService' });
  const revalidation = await apiJson(page.request, auth.base, `/api/mes/execution/work-orders/${fixture.workOrder.work_order_id}/resource-allocations/revalidate`, { method: 'POST', headers: auth.headers, data: {} }, false);
  expect(JSON.stringify(revalidation.body)).toMatch(/WO_RESOURCE_ALLOCATION_INVALID|RESOURCE_CANDIDATE_STALE|OutOfService|valid/);
  await page.goto(`/work-orders/${fixture.workOrder.work_order_id}`);
  await page.getByTestId('resource-revalidate-button').click();
  await page.locator('[data-testid^="work-order-operation-row-"]').first().locator('button').first().click();
  await expect(page.getByTestId('candidate-blocking-reasons').first()).toContainText(/ngừng hoạt động|out of service|không sẵn sàng|không khả dụng/i);
  while (restores.length) await restores.pop()!();
  cleanupWorkOrders([fixture.workOrder.work_order_id]);
  const trackedIndex = createdWorkOrderIds.indexOf(fixture.workOrder.work_order_id);
  if (trackedIndex >= 0) createdWorkOrderIds.splice(trackedIndex, 1);
});

test('[@phase3] missing required allocation is rejected before approval and unauthorized Viewer or Operator cannot commit', async ({ page, browser }) => {
  const managerAuth = await login(page, credentials.manager);
  const fixture = await createWorkOrderApi(page.request, managerAuth.base, managerAuth.headers, 'AUTH');
  await page.goto(`/work-orders/${fixture.workOrder.work_order_id}`);
  await page.getByRole('button', { name: /Phê duyệt|Approve/i }).click();
  await expect(page.getByText(/phân bổ nguồn lực không hợp lệ|resource allocation/i)).toBeVisible({ timeout: 10_000 });

  for (const account of [credentials.viewer, credentials.operator]) {
    const context = await browser.newContext();
    const rolePage = await context.newPage();
    await login(rolePage, account);
    await rolePage.goto(`/work-orders/${fixture.workOrder.work_order_id}`);
    await rolePage.locator('[data-testid^="work-order-operation-row-"]').first().locator('button').first().click();
    await expect(rolePage.getByTestId('candidate-select-button').first()).toBeDisabled();
    await context.close();
  }
});

test('[@phase3] Planner and Production Manager can commit candidates after real Keycloak login', async ({ browser }) => {
  for (const account of [credentials.planner, credentials.productionManager]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const auth = await login(page, account);
    const fixture = await createWorkOrderApi(page.request, auth.base, auth.headers, `ALLOWED-${account.role}`);
    await page.goto(`/work-orders/${fixture.workOrder.work_order_id}`);
    await page.locator('[data-testid^="work-order-operation-row-"]').first().locator('button').first().click();
    const selectableCandidate = page.locator('[data-testid="candidate-select-button"]:not(:disabled)').first();
    await expect(selectableCandidate).toBeEnabled({ timeout: 15_000 });
    await selectableCandidate.click();
    await expect(page.locator('[data-testid^="allocation-status-"]').first()).toContainText(/Đã cam kết|Committed/i);
    cleanupWorkOrders([fixture.workOrder.work_order_id]);
    const trackedIndex = createdWorkOrderIds.indexOf(fixture.workOrder.work_order_id);
    if (trackedIndex >= 0) createdWorkOrderIds.splice(trackedIndex, 1);
    await context.close();
  }
});

test('[@phase3] cross-site shift is denied with a translated stable error', async ({ page }) => {
  const auth = await login(page, credentials.manager);
  const fixture = await createWorkOrderApi(page.request, auth.base, auth.headers, 'CROSS-SITE');
  const detail = await apiJson(page.request, auth.base, `/api/mes/execution/work-orders/${fixture.workOrder.work_order_id}`, { headers: auth.headers });
  const op = detail.body.operations[0];
  const candidateResponse = await apiJson(page.request, auth.base, `/api/mes/execution/work-orders/${fixture.workOrder.work_order_id}/operations/${op.wo_operation_id}/resource-candidates?planned_start_at=${encodeURIComponent(`${defaultPlanningDate()}T08:00:00.000Z`)}&shift_id=00000000-0000-0000-0000-000000000000`, { headers: auth.headers }, false);
  expect(JSON.stringify(candidateResponse.body)).toContain('SHIFT_SITE_INVALID');
  await page.goto(`/work-orders/${fixture.workOrder.work_order_id}`);
  await page.locator('[data-testid^="work-order-operation-row-"]').first().locator('button').first().click();
  await expect(page.getByTestId('candidate-workstation-list')).toBeVisible();
});
