import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { request as apiRequest } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const username = process.env.MES_E2E_USERNAME;
const password = process.env.MES_E2E_PASSWORD;
const allowMutation = process.env.ALLOW_E2E_MUTATION === 'true';
const executionDb = process.env.MES_EXECUTION_DATABASE_URL;
let createdWorkOrderIds: string[] = [];

type LoginResult = { base: string; headers: Record<string, string> };

async function login(page: Page): Promise<LoginResult> {
  if (!username || !password) test.skip(true, 'MES_E2E_USERNAME and MES_E2E_PASSWORD are required.');
  if (!allowMutation) test.skip(true, 'Set ALLOW_E2E_MUTATION=true for the mutating concurrency flow.');
  if (!executionDb) test.skip(true, 'MES_EXECUTION_DATABASE_URL is required for exact concurrency cleanup.');

  let headers: Record<string, string> = {};
  let apiOrigin = '';
  page.on('request', (request) => {
    const requestHeaders = request.headers();
    if (requestHeaders['x-user-id'] && request.url().includes('/api/mes/')) {
      headers = {
        'X-User-ID': requestHeaders['x-user-id'],
        'X-Role-Code': requestHeaders['x-role-code'] || 'PLANT_MANAGER',
      };
      apiOrigin = new URL(request.url()).origin;
    }
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
  await expect.poll(() => Object.keys(headers).length, { timeout: 15_000 }).toBeGreaterThan(0);
  return { base: process.env.MES_E2E_API_BASE_URL || apiOrigin || 'http://100.68.50.41:18000', headers };
}

async function json(ctx: APIRequestContext, base: string, path: string, init: Parameters<APIRequestContext['fetch']>[1] = {}) {
  const response = await ctx.fetch(`${base}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const text = await response.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = { message: text }; }
  return { response, body: body?.data ?? body };
}

async function createWorkOrder(ctx: APIRequestContext, base: string, version: any, shift: any, key: string) {
  const started = await json(ctx, base, '/api/mes/execution/work-order-creation-workflows', {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    data: { production_version_id: version.production_version_id, quantity: 2, target_date: new Date().toISOString().slice(0, 10), shift_id: shift.master_id },
  });
  expect(started.response.ok(), JSON.stringify(started.body)).toBeTruthy();
  const workflowId = started.body.workflow_id;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const snapshot = await json(ctx, base, `/api/mes/execution/work-order-creation-workflows/${workflowId}`);
    if (snapshot.body.status === 'succeeded') return snapshot.body;
    if (snapshot.body.status === 'failed') throw new Error(`WORK_ORDER_CREATE_FAILED: ${JSON.stringify(snapshot.body)}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`WORK_ORDER_CREATE_TIMEOUT: ${workflowId}`);
}

function candidatePayload(candidate: any, shift: any, start: string, rowVersion: number) {
  return {
    workstation_id: candidate.workstation?.id,
    equipment_id: candidate.primary_machine?.id || candidate.equipment?.id,
    machine_group_id: candidate.machine_group?.id,
    shift_id: shift.master_id,
    planned_start_at: start,
    candidate_reference: `${candidate.assignment?.id || ''}:${candidate.machine_group?.id || ''}:${candidate.capability?.id || ''}`,
    row_version: rowVersion,
  };
}

test.afterAll(() => {
  if (!createdWorkOrderIds.length || !executionDb) return;
  execFileSync(process.execPath, ['scripts/cleanup-mes-resource-planning-e2e.mjs', ...createdWorkOrderIds], { stdio: 'inherit', env: process.env });
});

test('[@concurrency] RP-E2E-063 simultaneous commits allow one exclusive Machine Unit allocation', async ({ page }) => {
  const loginResult = await login(page);
  const [clientA, clientB] = await Promise.all([
    apiRequest.newContext({ extraHTTPHeaders: loginResult.headers }),
    apiRequest.newContext({ extraHTTPHeaders: loginResult.headers }),
  ]);
  try {
    const targetDate = new Date().toISOString().slice(0, 10);
    const versions = await json(clientA, loginResult.base, `/api/mes/master-data/production-ready-versions?planned_date=${targetDate}&limit=500`);
    const version = (versions.body as any[]).find((row) => row.readiness_status === 'Ready' && row.production_version_code?.startsWith('PV-'));
    expect(version, 'released Ready Production Version').toBeTruthy();
    const shifts = await json(clientA, loginResult.base, `/api/mes/master-data/shifts?site_id=${encodeURIComponent(version.site_id)}&limit=500`);
    const shift = (shifts.body as any[]).find((row) => row.site_id === version.site_id && row.lifecycle_status !== 'Inactive');
    expect(shift, 'active shift').toBeTruthy();

    const runId = `E2E-RP-CONCURRENCY-${Date.now()}`;
    const [workOrderA, workOrderB] = await Promise.all([
      createWorkOrder(clientA, loginResult.base, version, shift, `${runId}-A`),
      createWorkOrder(clientB, loginResult.base, version, shift, `${runId}-B`),
    ]);
    createdWorkOrderIds = [workOrderA.work_order_id, workOrderB.work_order_id];
    expect(workOrderA.work_order_id).not.toBe(workOrderB.work_order_id);

    const [detailA, detailB] = await Promise.all([
      json(clientA, loginResult.base, `/api/mes/execution/work-orders/${workOrderA.work_order_id}`),
      json(clientB, loginResult.base, `/api/mes/execution/work-orders/${workOrderB.work_order_id}`),
    ]);
    const operationA = detailA.body.operations[0];
    const operationB = detailB.body.operations[0];
    const start = `${targetDate}T08:00:00.000Z`;
    const [candidateA, candidateB] = await Promise.all([
      json(clientA, loginResult.base, `/api/mes/execution/work-orders/${workOrderA.work_order_id}/operations/${operationA.wo_operation_id}/resource-candidates?planned_start_at=${encodeURIComponent(start)}&shift_id=${shift.master_id}`),
      json(clientB, loginResult.base, `/api/mes/execution/work-orders/${workOrderB.work_order_id}/operations/${operationB.wo_operation_id}/resource-candidates?planned_start_at=${encodeURIComponent(start)}&shift_id=${shift.master_id}`),
    ]);
    const readyA = candidateA.body.candidates?.find((candidate: any) => candidate.readiness !== 'Blocked' && !(candidate.blocking_errors || []).length && !(candidate.capacity_conflicts || []).length);
    expect(readyA, 'Work Order A observes a Ready candidate').toBeTruthy();
    const sameResourceB = candidateB.body.candidates?.find((candidate: any) => candidate.workstation?.id === readyA.workstation?.id && (candidate.primary_machine?.id || candidate.equipment?.id) === (readyA.primary_machine?.id || readyA.equipment?.id));
    expect(sameResourceB, 'Work Order B observes the same Ready exclusive resource').toBeTruthy();

    let arrived = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const commit = async (ctx: APIRequestContext, workOrder: any, operation: any, candidate: any, key: string) => {
      arrived += 1;
      if (arrived === 2) release();
      await barrier;
      return json(ctx, loginResult.base, `/api/mes/execution/work-orders/${workOrder.work_order_id}/operations/${operation.wo_operation_id}/resource-allocation`, {
        method: 'POST',
        headers: { 'Idempotency-Key': key, 'X-Trace-ID': runId },
        data: candidatePayload(candidate, shift, start, workOrder.row_version),
      });
    };
    const [resultA, resultB] = await Promise.all([
      commit(clientA, workOrderA, operationA, readyA, `${runId}-COMMIT-A`),
      commit(clientB, workOrderB, operationB, sameResourceB, `${runId}-COMMIT-B`),
    ]);
    const results = [resultA, resultB];
    expect(results.filter(({ response }) => response.ok())).toHaveLength(1);
    const conflict = results.find(({ response }) => !response.ok());
    expect(conflict?.response.status()).toBe(409);
    expect(JSON.stringify(conflict?.body)).toMatch(/RESOURCE_CAPACITY_CONFLICT|RESOURCE_CANDIDATE_STALE|RESOURCE_ALREADY_ALLOCATED/);

    const allocations = await json(clientA, loginResult.base, `/api/mes/execution/work-orders/${workOrderA.work_order_id}/resource-allocations/revalidate`, { method: 'POST', data: {} });
    expect([true, false]).toContain(allocations.body.valid);
    const details = await Promise.all(createdWorkOrderIds.map((id) => json(clientA, loginResult.base, `/api/mes/execution/work-orders/${id}`)));
    const committed = details.flatMap(({ body }) => body.operations || []).filter((operation: any) => operation.resource_allocation?.status === 'Committed');
    expect(committed).toHaveLength(1);
  } finally {
    await Promise.all([clientA.dispose(), clientB.dispose()]);
  }
});
