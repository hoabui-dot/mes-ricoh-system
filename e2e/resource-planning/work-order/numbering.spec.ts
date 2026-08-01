import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { request as apiRequest } from '@playwright/test';

const username = process.env.MES_E2E_USERNAME;
const password = process.env.MES_E2E_PASSWORD;
const allowMutation = process.env.ALLOW_E2E_MUTATION === 'true';
const executionDb = process.env.MES_EXECUTION_DATABASE_URL;
const createdWorkOrderIds: string[] = [];

async function login(page: Page) {
  if (!username || !password) test.skip(true, 'MES_E2E_USERNAME and MES_E2E_PASSWORD are required.');
  if (!allowMutation) test.skip(true, 'Set ALLOW_E2E_MUTATION=true for the Work Order numbering flow.');
  if (!executionDb) test.skip(true, 'MES_EXECUTION_DATABASE_URL is required for exact numbering cleanup.');
  let headers: Record<string, string> = {};
  let origin = '';
  page.on('request', (request) => {
    const requestHeaders = request.headers();
    if (requestHeaders['x-user-id'] && request.url().includes('/api/mes/')) {
      headers = { 'X-User-ID': requestHeaders['x-user-id'], 'X-Role-Code': requestHeaders['x-role-code'] || 'PLANT_MANAGER' };
      origin = new URL(request.url()).origin;
    }
  });
  await page.goto('/work-orders/new', { waitUntil: 'domcontentloaded' });
  const field = page.locator('#username, input[name="username"]');
  await field.first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
  if (await field.count()) {
    await field.first().fill(username!);
    await page.locator('#password, input[name="password"]').first().fill(password!);
    await page.getByRole('button', { name: /sign in|log in|đăng nhập/i }).click();
  }
  await expect(page.getByTestId('work-order-create-screen')).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => Object.keys(headers).length, { timeout: 15_000 }).toBeGreaterThan(0);
  return { base: process.env.MES_E2E_API_BASE_URL || origin || 'http://100.68.50.41:18000', headers };
}

async function json(ctx: APIRequestContext, base: string, path: string, init: Parameters<APIRequestContext['fetch']>[1] = {}) {
  const response = await ctx.fetch(`${base}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const body = await response.json();
  expect(response.ok(), JSON.stringify(body)).toBeTruthy();
  return body?.data ?? body;
}

async function create(ctx: APIRequestContext, base: string, version: any, shift: any, key: string) {
  const workflow = await json(ctx, base, '/api/mes/execution/work-order-creation-workflows', {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    data: { production_version_id: version.production_version_id, quantity: 1, target_date: new Date().toISOString().slice(0, 10), shift_id: shift.master_id },
  });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const snapshot = await json(ctx, base, `/api/mes/execution/work-order-creation-workflows/${workflow.workflow_id}`);
    if (snapshot.status === 'succeeded') {
      createdWorkOrderIds.push(snapshot.work_order_id);
      return snapshot;
    }
    if (snapshot.status === 'failed') throw new Error(`WORK_ORDER_CREATE_FAILED: ${JSON.stringify(snapshot)}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`WORK_ORDER_CREATE_TIMEOUT: ${workflow.workflow_id}`);
}

test.afterAll(() => {
  if (!createdWorkOrderIds.length || !executionDb) return;
  execFileSync(process.execPath, ['scripts/cleanup-mes-resource-planning-e2e.mjs', ...createdWorkOrderIds], { stdio: 'inherit', env: process.env });
});

test('[@numbering] RP-E2E-130/131 Work Order codes remain unique sequentially and concurrently', async ({ page }) => {
  const auth = await login(page);
  const ctx = await apiRequest.newContext({ extraHTTPHeaders: auth.headers });
  try {
    const date = new Date().toISOString().slice(0, 10);
    const versions = await json(ctx, auth.base, `/api/mes/master-data/production-ready-versions?planned_date=${date}&limit=500`);
    const version = versions.find((row: any) => row.readiness_status === 'Ready' && row.production_version_code?.startsWith('PV-'));
    expect(version).toBeTruthy();
    const shifts = await json(ctx, auth.base, `/api/mes/master-data/shifts?site_id=${encodeURIComponent(version.site_id)}&limit=500`);
    const shift = shifts.find((row: any) => row.site_id === version.site_id && row.lifecycle_status !== 'Inactive');
    expect(shift).toBeTruthy();

    const first = await create(ctx, auth.base, version, shift, `E2E-RP-NUMBER-SEQUENTIAL-A-${Date.now()}`);
    const second = await create(ctx, auth.base, version, shift, `E2E-RP-NUMBER-SEQUENTIAL-B-${Date.now()}`);
    expect(first.work_order_id).not.toBe(second.work_order_id);
    expect(first.work_order_code).not.toBe(second.work_order_code);

    const concurrentRun = Date.now();
    const [third, fourth] = await Promise.all([
      create(ctx, auth.base, version, shift, `E2E-RP-NUMBER-CONCURRENT-A-${concurrentRun}`),
      create(ctx, auth.base, version, shift, `E2E-RP-NUMBER-CONCURRENT-B-${concurrentRun}`),
    ]);
    expect(third.work_order_id).not.toBe(fourth.work_order_id);
    expect(third.work_order_code).not.toBe(fourth.work_order_code);
  } finally {
    await ctx.dispose();
  }
});
