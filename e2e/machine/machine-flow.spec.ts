import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';

test.describe.configure({ mode: 'serial' });

const username = process.env.MES_E2E_USERNAME;
const password = process.env.MES_E2E_PASSWORD;
const allowMutation = process.env.ALLOW_E2E_MUTATION === 'true';
const runId = `E2E-MACHINE-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

test.afterAll(() => {
  if (!username || !password || !allowMutation || (!process.env.MES_MASTER_DATA_DATABASE_URL && !process.env.DATABASE_URL)) return;
  execFileSync(process.execPath, ['scripts/cleanup-mes-machine-e2e.mjs', runId], { stdio: 'inherit', env: process.env });
});

type Api = { request: APIRequestContext; headers: Record<string, string>; base: string };

function assertSafety() {
  if (!username || !password) test.skip(true, 'MES_E2E_USERNAME and MES_E2E_PASSWORD are required.');
  if (!allowMutation) test.skip(true, 'Set ALLOW_E2E_MUTATION=true to run the mutating Machine browser flow.');
  if (!process.env.MES_MASTER_DATA_DATABASE_URL && !process.env.DATABASE_URL) test.skip(true, 'MES_MASTER_DATA_DATABASE_URL or DATABASE_URL is required for exact cleanup.');
}

async function login(page: Page): Promise<Api> {
  assertSafety();
  let authHeaders: Record<string, string> = {};
  let apiOrigin = '';
  page.on('request', (request) => {
    const headers = request.headers();
    if (headers['x-user-id'] && request.url().includes('/api/mes/')) { authHeaders = { 'x-user-id': headers['x-user-id'], 'x-role-code': headers['x-role-code'] || 'PLANT_MANAGER' }; apiOrigin = new URL(request.url()).origin; }
  });
  await page.goto('/master-data/machines', { waitUntil: 'domcontentloaded' });
  const loginField = page.getByLabel('Username or email');
  await loginField.waitFor({ state: 'attached', timeout: 15_000 }).catch(() => undefined);
  if (await loginField.count()) {
    await loginField.waitFor({ state: 'visible', timeout: 15_000 });
    await page.getByLabel('Username or email').fill(username!);
    await page.getByLabel('Password', { exact: true }).fill(password!);
    await page.getByRole('button', { name: /sign in|log in|đăng nhập/i }).click();
  }
  await expect(page.getByTestId('machine-list')).toBeVisible();
  await expect.poll(() => Object.keys(authHeaders).length, { timeout: 15_000 }).toBeGreaterThan(0);
  const base = process.env.MES_E2E_API_BASE_URL || apiOrigin || 'http://100.68.50.41:18000';
  return { request: page.request, headers: authHeaders, base };
}

async function apiJson(api: Api, path: string, init: Parameters<APIRequestContext['fetch']>[1] = {}) {
  const response = await api.request.fetch(`${api.base}${path}`, { ...init, headers: { ...api.headers, ...(init.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${init.method || 'GET'} ${path} -> ${response.status}: ${JSON.stringify(body)}`);
  return body.data ?? body;
}

async function selectOption(page: Page, testId: string, text: string) {
  await page.getByTestId(testId).click();
  await page.getByRole('option').filter({ hasText: text }).first().click();
}

test('[@smoke] complete Machine Definition -> Physical Unit -> assignment readiness flow', async ({ page }) => {
  const api = await login(page);
  const site = (await apiJson(api, '/api/mes/master-data/sites?limit=500')).find((row: any) => row.code === (process.env.MES_E2E_SITE_CODE || 'SITE-KZ3'));
  const workCenter = (await apiJson(api, '/api/mes/master-data/work-centers?limit=500')).find((row: any) => row.code === (process.env.MES_E2E_WORK_CENTER_CODE || 'WC-MIXING'));
  const workstationCode = process.env.MES_E2E_WORKSTATION_CODE || 'WS-MIXING-01';
  const workstation = (await apiJson(api, '/api/mes/master-data/workstations?limit=500')).find((row: any) => row.code === workstationCode && row.lifecycle_status === 'Released');
  expect(site?.master_id, 'released E2E Site').toBeTruthy();
  expect(workCenter?.master_id, 'released E2E Work Center').toBeTruthy();
  expect(workstation?.master_id, 'released E2E Workstation').toBeTruthy();

  const machineName = `${runId} Machine Definition`;
  const serial = `${runId}-SERIAL-001`;
  await test.step('Create Machine Definition through the browser', async () => {
    await page.getByTestId('machine-create-button').click();
    await expect(page.getByTestId('machine-form')).toBeVisible();
    await page.getByTestId('machine-name-input').fill(machineName);
    await selectOption(page, 'machine-site-select', 'SITE-KZ3');
    await selectOption(page, 'machine-work-center-select', workCenter.code);
    await page.getByTestId('machine-type-input').fill('E2E-MIXER');
    await page.getByTestId('machine-expected-unit-count-input').fill('1');
    const skill = page.locator('[data-testid^="machine-skill-"]').first();
    if (await skill.count()) await skill.check();
    await page.getByRole('button', { name: /^Lưu$|^Save$/ }).click();
    await expect(page).toHaveURL(/\/master-data\/machines$/);
    await expect(page.getByText(machineName)).toBeVisible();
  });

  const machine = (await apiJson(api, '/api/mes/master-data/machines?limit=500')).find((row: any) => String(row.name?.vi || row.name || '').includes(machineName));
  expect(machine?.master_id, 'created Machine Definition').toBeTruthy();

  let unit: any;
  await test.step('Register an identified Physical Machine Unit and refresh', async () => {
    await page.goto(`/master-data/machines/${machine.master_id}`);
    await expect(page.getByTestId('machine-unit-list')).toBeVisible();
    await page.getByTestId('machine-unit-add-button').click();
    await page.getByTestId('machine-unit-asset-code-input').fill(`${runId}-ASSET-001`);
    await page.getByTestId('machine-unit-serial-input').fill(serial);
    await page.getByTestId('machine-unit-save-button').click();
    await expect(page.getByText(serial)).toBeVisible();
    await page.reload();
    await expect(page.getByText(serial)).toBeVisible();
    unit = (await apiJson(api, `/api/mes/master-data/machines/${machine.master_id}/units`)).find((row: any) => row.serial_number === serial);
    expect(unit?.machine_unit_id).toBeTruthy();
  });

  await test.step('Reject duplicate Physical Machine Unit serial', async () => {
    await page.getByTestId('machine-unit-add-button').click();
    await page.getByTestId('machine-unit-serial-input').fill(serial);
    await page.getByTestId('machine-unit-save-button').click();
    await expect(page.getByText(/already used|đã được sử dụng|trùng/i)).toBeVisible();
    await expect(page.getByText(serial, { exact: true })).toHaveCount(1);
  });

  const groupName = `${runId} Requirement Group`;
  let e2eWorkstationId: string;
  let e2eWorkstationCode: string;
  await test.step('Create the disposable Workstation and Machine Requirement through the browser', async () => {
    await page.goto('/master-data/workstations/new');
    await expect(page.getByTestId('workstation-form')).toBeVisible();
    await page.getByTestId('workstation-name-input').fill(`${runId} Workstation`);
    await selectOption(page, 'workstation-work-center-select', workCenter.code);
    await page.getByTestId('machine-requirement-add-group').click();
    await page.getByTestId('machine-requirement-group-name-0').fill(groupName);
    await page.getByTestId('machine-requirement-add-line-0').click();
    await selectOption(page, 'machine-requirement-machine-select-0-0', machineName);
    await page.getByRole('button', { name: /^Lưu$|^Save$/ }).click();
    await expect(page).toHaveURL(/\/master-data\/workstations$/);
    const created = (await apiJson(api, '/api/mes/master-data/workstations?limit=500')).find((row: any) => String(row.name?.vi || row.name || '').includes(`${runId} Workstation`));
    expect(created?.master_id, 'created disposable Workstation').toBeTruthy();
    e2eWorkstationId = created.master_id;
    e2eWorkstationCode = created.code;
  });

  const assignments = await apiJson(api, `/api/mes/master-data/resource-assignments?workstation_id=${e2eWorkstationId}`);
  const assignment = assignments.find((row: any) => row.machine_unit_id === unit.machine_unit_id);
  expect(assignment?.master_id).toBeTruthy();
  expect(assignments.filter((row: any) => row.machine_unit_id === unit.machine_unit_id && !row.effective_to)).toHaveLength(1);
  const workstationDetail = await apiJson(api, `/api/mes/master-data/workstations/${e2eWorkstationId}`);
  expect(workstationDetail.machine_groups).toHaveLength(1);

  await test.step('Verify assigned unit, readiness and assignment history', async () => {
    await page.goto(`/master-data/workstations/${e2eWorkstationId}`);
    await expect(page.getByText(unit.code, { exact: true })).toBeVisible();
    await expect(page.getByText(/Ready|Sẵn sàng/i).first()).toBeVisible();
    await apiJson(api, `/api/mes/master-data/resource-assignments/${assignment.master_id}/end`, { method: 'POST', data: { effective_to: new Date().toISOString() } });
    await page.reload();
    await expect(page.getByText(/Blocked|Bị chặn/i).first()).toBeVisible();
    await expect(page.getByText(/Assignment History|Lịch sử gán/i)).toBeVisible();
  });

  await test.step('Verify dependency-aware unit deletion', async () => {
    const response = await api.request.delete(`${api.base}/api/mes/master-data/machine-units/${unit.machine_unit_id}`, { headers: api.headers });
    expect(response.status()).toBe(409);
    const body = await response.json();
    expect(body.error).toBe('MACHINE_UNIT_DELETE_DEPENDENCY_EXISTS');
  });

  console.log(JSON.stringify({ runId, baseURL: page.url().split('/master-data')[0], machineCode: machine.code, workstationCode: e2eWorkstationCode, cleanup: 'fixture namespace must be removed after run' }));
});
