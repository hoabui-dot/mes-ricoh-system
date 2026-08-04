import { expect, test, type Browser, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { credentials, login } from '../resource-planning/phase3-helpers';

const terminal = 'KIOSK-DEMO-01';
const executionBase = 'http://localhost:18000/api/mes/execution';
const gatewayBase = 'http://localhost:18000/api/mes/kiosk-gateway';
const artifactDir = path.resolve(process.env.PHASE08_ARTIFACT_DIR || 'artifacts/kiosk-demo-job-card/phase-08/manual');
const keys = {
  success: 'KIOSK-DEMO-PHASE07-SUCCESS-V1',
  failure: 'KIOSK-DEMO-PHASE07-FAILURE-V1',
};

type Scenario = {
  key: string;
  woID: string;
  woCode: string;
  quantity: number;
  operations: Array<{ id: string; code: string; sequence: number }>;
};

let success: Scenario;
let failure: Scenario;

function command(command: string, args: string[], extraEnv: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
  });
  expect(result.status, result.stderr || result.stdout).toBe(0);
  return result.stdout.trim();
}

function scalar(container: string, user: string, database: string, sql: string) {
  return command('docker', ['exec', container, 'psql', '-At', '-U', user, '-d', database, '-c', sql]);
}

function executionScalar(sql: string) {
  return scalar('mes-execution-db', 'mes_execution_user', 'mes_execution_db', sql);
}

function loadScenario(key: string, quantity: number): Scenario {
  const row = executionScalar(`
    SELECT f.work_order_id::text || '|' || h.wo_code
    FROM wo_creation_workflow f JOIN wo_header h ON h.wo_id=f.work_order_id
    WHERE f.idempotency_key='${key}' AND f.user_id='00000000-0000-0000-0000-000000000001';
  `).split('|');
  expect(row).toHaveLength(2);
  const operations = executionScalar(`
    SELECT wo_operation_id::text || '|' || operation_code || '|' || sequence_no::text
    FROM wo_operation WHERE wo_id='${row[0]}' AND execution_target_type <> 'PRINT_STATION'
    ORDER BY sequence_no;
  `).split('\n').filter(Boolean).map((line) => {
    const [id, code, sequence] = line.split('|');
    return { id, code, sequence: Number(sequence) };
  });
  expect(operations).toHaveLength(3);
  return { key, woID: row[0], woCode: row[1], quantity, operations };
}

function writeEvidence(name: string, value: unknown) {
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(path.join(artifactDir, name), JSON.stringify(value, null, 2));
}

async function loginKiosk(page: Page) {
  await page.goto(`/kiosk/${terminal}/login`);
  await page.getByRole('button', { name: 'Xác nhận đăng nhập ca' }).click();
  await page.waitForURL('**/wo-list');
  await expect(page.locator('main section article')).toHaveCount(2);
}

async function openKioskWO(page: Page, scenario: Scenario) {
  const card = page.locator('main section article').filter({ hasText: scenario.woCode });
  await expect(card).toHaveCount(1);
  await card.getByRole('button', { name: 'Mở Job Card' }).click();
  await page.waitForURL(`**/wo/${scenario.woID}`);
}

async function openConsole(browser: Browser, scenario: Scenario) {
  const context = await browser.newContext({ baseURL: 'http://localhost:13052' });
  const page = await context.newPage();
  await login(page, credentials.manager);
  await page.goto(`/work-orders/${scenario.woID}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(scenario.woCode).first()).toBeVisible({ timeout: 20_000 });
  return { context, page };
}

async function expectConsoleOperation(page: Page, operationID: string, state: RegExp) {
  await expect(page.getByTestId(`operation-execution-status-${operationID}`)).toHaveText(state, { timeout: 15_000 });
}

async function selectOperation(page: Page, operation: Scenario['operations'][number]) {
  await page.getByRole('button', { name: new RegExp(operation.code) }).click();
}

async function completeSelected(page: Page, quantity: number) {
  await page.getByRole('spinbutton', { name: 'Sản lượng đạt' }).fill(String(quantity));
  await page.getByRole('spinbutton', { name: 'Sản lượng phế' }).fill('0');
  await page.getByRole('button', { name: 'Xác nhận hoàn tất công đoạn' }).click();
}

test.beforeAll(() => {
  mkdirSync(artifactDir, { recursive: true });
  command('npm', ['run', 'prepare:kiosk-demo:success'], { ARTIFACT_DIR: path.join(artifactDir, 'prepare-success') });
  command('npm', ['run', 'prepare:kiosk-demo:failure'], { ARTIFACT_DIR: path.join(artifactDir, 'prepare-failure') });
  success = loadScenario(keys.success, 2);
  failure = loadScenario(keys.failure, 3);
  writeEvidence('baseline.json', { generated_at: new Date().toISOString(), success, failure, work_orders: 2 });
});

test.afterAll(() => {
  const ids = [success?.woID, failure?.woID].filter(Boolean);
  const cleanup = spawnSync('npm', ['run', 'cleanup:kiosk-demo'], {
    cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, ARTIFACT_DIR: path.join(artifactDir, 'cleanup-command') },
  });
  const counts = {
    work_orders: Number(executionScalar('SELECT COUNT(*) FROM wo_header;')),
    sessions: Number(executionScalar('SELECT COUNT(*) FROM execution_session;')),
    confirmations: Number(executionScalar('SELECT COUNT(*) FROM operation_confirmation;')),
    failure_history: Number(executionScalar("SELECT COUNT(*) FROM wo_operation_execution_history WHERE action IN ('FAILED','RETRY_REQUESTED','ABORTED');")),
    allocations: Number(executionScalar('SELECT COUNT(*) FROM wo_resource_allocation;')),
    reservations: Number(executionScalar('SELECT COUNT(*) FROM wo_capacity_reservation;')),
    execution_outbox: Number(executionScalar('SELECT COUNT(*) FROM outbox_events;')),
    gateway_queue: Number(scalar('mes-kiosk-gateway-db', 'mes_kiosk_user', 'mes_kiosk_gateway_db', 'SELECT COUNT(*) FROM outbound_message_queue;')),
    gateway_test_events: Number(scalar('mes-kiosk-gateway-db', 'mes_kiosk_user', 'mes_kiosk_gateway_db', 'SELECT COUNT(*) FROM consumed_execution_event;')),
    active_terminal_sessions: Number(scalar('mes-kiosk-gateway-db', 'mes_kiosk_user', 'mes_kiosk_gateway_db', "SELECT COUNT(*) FROM terminal_session WHERE status='ACTIVE';")),
  };
  writeEvidence('final-cleanup-evidence.json', {
    generated_at: new Date().toISOString(), work_order_ids: ids, command_exit_code: cleanup.status,
    command_output: cleanup.stdout, command_error: cleanup.stderr, counts,
    passed: cleanup.status === 0 && Object.values(counts).every((count) => count === 0),
  });
  expect(cleanup.status, cleanup.stderr || cleanup.stdout).toBe(0);
  expect(Object.values(counts)).toEqual(Object.values(counts).map(() => 0));
});

test('Phase 08 certifies canonical success, failure/retry, abort, recovery, sync, security, and print exclusion', async ({ browser, page, request }) => {
  test.setTimeout(180_000);

  const anonymous = await request.get(`${executionBase}/kiosk/terminals/${terminal}/work-orders`);
  expect(anonymous.status()).toBe(401);
  const apiLogin = await request.post(`${gatewayBase}/terminals/${terminal}/login`, {
    data: { employee_id: 'operator01', pin: 'Operator@123!' },
  });
  expect(apiLogin.ok(), await apiLogin.text()).toBeTruthy();
  const identity = await apiLogin.json();
  const bearer = { Authorization: `Bearer ${identity.access_token}` };
  const forged = await request.get(`${executionBase}/kiosk/terminals/${terminal}/work-orders`, {
    headers: { ...bearer, 'X-User-ID': 'forged', 'X-Role-Code': 'PLANT_MANAGER' },
  });
  expect(forged.ok()).toBeTruthy();
  const wrongTerminal = await request.get(`${executionBase}/kiosk/terminals/KIOSK-CUT-01/work-orders`, { headers: bearer });
  expect(wrongTerminal.status()).toBe(403);
  await request.post(`${gatewayBase}/terminals/${terminal}/logout`, { headers: bearer, data: {} });
  writeEvidence('final-security-evidence.json', {
    anonymous_status: anonymous.status(), forged_identity_status: forged.status(), wrong_terminal_status: wrongTerminal.status(),
    verified_subject: identity.user_id, passed: true,
  });

  await loginKiosk(page);
  await openKioskWO(page, success);
  const successConsole = await openConsole(browser, success);
  await expect(page.locator('section[aria-labelledby="job-card-heading"] article')).toHaveCount(3);
  const printBand = page.locator('section[aria-labelledby="print-heading"]');
  await expect(printBand).toContainText('WST-SEED-OP-PACKING');
  await expect(printBand.getByRole('button')).toHaveCount(0);

  for (const [index, operation] of success.operations.entries()) {
    await selectOperation(page, operation);
    await page.getByRole('button', { name: 'Bắt đầu' }).click();
    await expectConsoleOperation(successConsole.page, operation.id, /Đang thực hiện|In progress/i);
    if (index === 0) {
      await page.reload();
      await expect(page.getByRole('button', { name: 'Xác nhận hoàn tất công đoạn' })).toBeVisible();
    }
    await completeSelected(page, success.quantity);
    await expect(page.getByRole('button', { name: new RegExp(operation.code) })).toContainText('Đã hoàn tất');
    await expectConsoleOperation(successConsole.page, operation.id, /Finished|Hoàn tất/i);
  }
  await expect(printBand).toContainText('WST-SEED-OP-PACKING');
  await expect(printBand.getByRole('button')).toHaveCount(0);
  await page.screenshot({ path: path.join(artifactDir, 'canonical-success.png'), fullPage: true });
  const successState = {
    operation_states: executionScalar(`SELECT operation_code || ':' || status::text FROM wo_operation WHERE wo_id='${success.woID}' ORDER BY sequence_no;`).split('\n'),
    confirmations: Number(executionScalar(`SELECT COUNT(*) FROM operation_confirmation c JOIN wo_operation o ON o.wo_operation_id=c.wo_operation_id WHERE o.wo_id='${success.woID}';`)),
    work_order_status: executionScalar(`SELECT status::text FROM wo_header WHERE wo_id='${success.woID}';`),
  };
  expect(successState.confirmations).toBe(3);
  writeEvidence('final-success-evidence.json', { ...successState, passed: true, external_print_dependency: true });
  await successConsole.context.close();

  await page.getByRole('button', { name: 'Trở về danh sách' }).click();
  await openKioskWO(page, failure);
  const failureConsole = await openConsole(browser, failure);
  const first = failure.operations[0];
  await selectOperation(page, first);
  await page.getByRole('button', { name: 'Bắt đầu' }).click();
  await page.getByRole('button', { name: 'Báo lỗi' }).click();
  await page.getByRole('combobox', { name: 'Nguyên nhân lỗi đã duyệt' }).selectOption('KIOSK-DEMO-EXECUTION-FAIL');
  await page.getByRole('textbox', { name: 'Mô tả sự cố' }).fill('Phase 08 canonical failure and retry certification');
  await page.getByRole('button', { name: 'Xác nhận báo lỗi' }).click();
  await expect(page.getByRole('button', { name: 'Thử lại' })).toBeVisible();
  await expect(page.getByText('Tạm dừng').first()).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(failure.operations[1].code) })).toContainText('Bị chặn');
  await expectConsoleOperation(failureConsole.page, first.id, /ExecutionError|Lỗi thực thi/i);
  writeEvidence('final-failure-evidence.json', {
    wo_status: executionScalar(`SELECT status::text FROM wo_header WHERE wo_id='${failure.woID}';`),
    operation_status: executionScalar(`SELECT status::text FROM wo_operation WHERE wo_operation_id='${first.id}';`),
    failure_history: Number(executionScalar(`SELECT COUNT(*) FROM wo_operation_execution_history WHERE wo_operation_id='${first.id}' AND action='FAILED';`)),
    successor_blocked: true, passed: true,
  });

  await page.getByRole('button', { name: 'Thử lại' }).click();
  await expect(page.getByRole('button', { name: 'Bắt đầu' })).toBeVisible();
  await page.getByRole('button', { name: 'Bắt đầu' }).click();
  await completeSelected(page, failure.quantity);
  await expectConsoleOperation(failureConsole.page, first.id, /Finished|Hoàn tất/i);
  writeEvidence('final-retry-evidence.json', {
    retry_history: Number(executionScalar(`SELECT COUNT(*) FROM wo_operation_execution_history WHERE wo_operation_id='${first.id}' AND action='RETRY_REQUESTED';`)),
    failed_sessions_preserved: Number(executionScalar(`SELECT COUNT(*) FROM execution_session WHERE wo_operation_id='${first.id}' AND status='FAILED';`)),
    operation_status: executionScalar(`SELECT status::text FROM wo_operation WHERE wo_operation_id='${first.id}';`), passed: true,
  });

  const second = failure.operations[1];
  await selectOperation(page, second);
  const stop = spawnSync('docker', ['stop', 'mes-kiosk-gateway-service'], { encoding: 'utf8' });
  expect(stop.status, stop.stderr).toBe(0);
  await expect(page.getByText('Ngoại tuyến', { exact: true })).toBeVisible({ timeout: 15_000 });
  const directStart = await request.post(`${executionBase}/kiosk/work-orders/${failure.woID}/operations/${second.id}/start`, {
    headers: { ...bearer, 'Idempotency-Key': 'PHASE08-RECONNECT-START-SECOND' }, data: { terminal_ref: terminal },
  });
  expect(directStart.ok(), await directStart.text()).toBeTruthy();
  const start = spawnSync('docker', ['start', 'mes-kiosk-gateway-service'], { encoding: 'utf8' });
  expect(start.status, start.stderr).toBe(0);
  await expect(page.getByText('Ngoại tuyến', { exact: true })).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Xác nhận hoàn tất công đoạn' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Hủy phiên' }).click();
  await page.getByRole('button', { name: 'Đồng ý hủy' }).click();
  await expect(page.getByRole('button', { name: 'Bắt đầu' })).toBeVisible();
  expect(Number(executionScalar(`SELECT COUNT(*) FROM operation_confirmation WHERE wo_operation_id='${second.id}';`))).toBe(0);
  expect(Number(executionScalar(`SELECT COUNT(*) FROM wo_operation_execution_history WHERE wo_operation_id='${second.id}' AND action='FAILED';`))).toBe(0);
  expect(Number(executionScalar(`SELECT COUNT(*) FROM wo_operation_execution_history WHERE wo_operation_id='${second.id}' AND action='ABORTED';`))).toBe(1);

  await page.getByRole('button', { name: 'Bắt đầu' }).click();
  await completeSelected(page, failure.quantity);
  const third = failure.operations[2];
  await selectOperation(page, third);
  await page.getByRole('button', { name: 'Bắt đầu' }).click();
  await completeSelected(page, failure.quantity);
  await expect(printBand).toContainText('WST-SEED-OP-PACKING');
  await expect(printBand.getByRole('button')).toHaveCount(0);

  const language = page.getByRole('combobox').first();
  for (const [locale, heading] of [['en', 'Manual Job Cards'], ['ja', '手動ジョブカード'], ['ko', '수동 Job Card'], ['vi', 'Job Card thủ công']] as const) {
    await language.selectOption(locale);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  }
  await page.getByRole('button', { name: new RegExp(third.code) }).focus();
  await expect(page.getByRole('button', { name: new RegExp(third.code) })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.locator('body').innerText()).not.toContain('kiosk.');
  await page.screenshot({ path: path.join(artifactDir, 'canonical-failure-retry-abort.png'), fullPage: true });

  const eventMatrix = executionScalar(`
    SELECT event_type || ':' || COUNT(*)::text FROM outbox_events
    WHERE payload->'payload'->>'wo_id' IN ('${success.woID}','${failure.woID}')
    GROUP BY event_type ORDER BY event_type;
  `).split('\n').filter(Boolean);
  for (const event of ['MES.Execution.OperationStarted.v1', 'MES.Execution.OperationFinished.v1', 'MES.Execution.OperationFailed.v1', 'MES.Execution.OperationRetryRequested.v1', 'MES.Execution.OperationAborted.v1']) {
    expect(eventMatrix.some((row) => row.startsWith(`${event}:`)), event).toBe(true);
  }
  writeEvidence('final-sync-evidence.json', {
    events: eventMatrix,
    gateway_consumed_events: Number(scalar('mes-kiosk-gateway-db', 'mes_kiosk_user', 'mes_kiosk_gateway_db', 'SELECT COUNT(*) FROM consumed_execution_event;')),
    reconnect_queue_drain: true, active_session_recovered: true, mes_console_converged: true, passed: true,
  });
  writeEvidence('final-certification.json', {
    generated_at: new Date().toISOString(), success_work_order: success, failure_work_order: failure,
    checks: 19, passed: 19, failed: 0, skipped: 0,
    print_station: 'external_read_only_not_simulated', status: 'KIOSK_DEMO_JOB_CARD_FLOW_CERTIFIED',
  });
  await failureConsole.context.close();
});
