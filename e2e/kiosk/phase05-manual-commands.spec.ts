import { expect, test, type Browser, type Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { credentials, login } from '../resource-planning/phase3-helpers';

const terminal = 'KIOSK-DEMO-01';
const workOrderID = '05000000-0000-0000-0000-000000000001';
const operationIDs = {
  prep: '05000000-0000-0000-0000-000000000101',
  quality: '05000000-0000-0000-0000-000000000102',
  finishing: '05000000-0000-0000-0000-000000000103',
};
const fixtureDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(path.join(fixtureDirectory, name), 'utf8');
let operatorID = '';
let gatewaySessionStart = '';

function runSQL(container: string, user: string, database: string, sql: string) {
  const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', database], {
    input: sql,
    encoding: 'utf8',
  });
  expect(result.status, result.stderr || result.stdout).toBe(0);
  return result.stdout.trim();
}

function runExecutionFixture(name: string) {
  runSQL(
    'mes-execution-db',
    'mes_execution_user',
    'mes_execution_db',
    fixture(name).replaceAll('__OPERATOR_ID__', operatorID),
  );
}

function executionScalar(sql: string) {
  const result = spawnSync(
    'docker',
    ['exec', 'mes-execution-db', 'psql', '-At', '-U', 'mes_execution_user', '-d', 'mes_execution_db', '-c', sql],
    { encoding: 'utf8' },
  );
  expect(result.status, result.stderr || result.stdout).toBe(0);
  return result.stdout.trim();
}

async function loginKiosk(page: Page) {
  await page.goto(`/kiosk/${terminal}/login`);
  await page.getByRole('button', { name: 'Xác nhận đăng nhập ca' }).click();
  await page.waitForURL('**/wo-list');
  await expect(page.getByText('WO-PHASE05-RUNTIME-01')).toBeVisible();
  await page.getByRole('button', { name: 'Mở Job Card' }).click();
  await page.waitForURL(`**/wo/${workOrderID}`);
}

async function openConsole(browser: Browser) {
  const context = await browser.newContext({ baseURL: 'http://localhost:13052' });
  const page = await context.newPage();
  await login(page, credentials.manager);
  await page.goto(`/work-orders/${workOrderID}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('WO-PHASE05-RUNTIME-01').first()).toBeVisible({ timeout: 20_000 });
  return { context, page };
}

async function expectConsoleStatus(page: Page, operationID: string, status: RegExp) {
  await expect(page.getByTestId(`operation-execution-status-${operationID}`)).toHaveText(status, { timeout: 12_000 });
}

test.beforeAll(async ({ request }) => {
  gatewaySessionStart = new Date().toISOString();
  const loginResponse = await request.post(`http://localhost:18000/api/mes/kiosk-gateway/terminals/${terminal}/login`, {
    data: { employee_id: 'operator01', pin: 'Operator@123!' },
  });
  const loginBody = await loginResponse.json();
  expect(loginResponse.ok(), JSON.stringify(loginBody)).toBeTruthy();
  operatorID = loginBody.user_id;
  expect(operatorID).toMatch(/^[0-9a-f-]{36}$/i);
  runSQL('mes-master-data-db', 'mes_master_data_user', 'mes_master_data_db', fixture('phase05-master-data-fixture.sql'));
  runExecutionFixture('phase05-fixture.sql');
});

test.afterAll(() => {
  runSQL(
    'mes-kiosk-gateway-db',
    'mes_kiosk_user',
    'mes_kiosk_gateway_db',
    `DELETE FROM consumed_execution_event WHERE event_id IN (
       SELECT event_id FROM outbound_message_queue
       WHERE payload->>'wo_id'='${workOrderID}' OR payload->'payload'->>'wo_id'='${workOrderID}'
     );
     DELETE FROM outbound_message_queue
     WHERE payload->>'wo_id'='${workOrderID}' OR payload->'payload'->>'wo_id'='${workOrderID}';`,
  );
  runExecutionFixture('phase05-cleanup.sql');
  runSQL('mes-master-data-db', 'mes_master_data_user', 'mes_master_data_db', fixture('phase05-master-data-cleanup.sql'));
  runSQL(
    'mes-kiosk-gateway-db',
    'mes_kiosk_user',
    'mes_kiosk_gateway_db',
    `DELETE FROM terminal_session WHERE operator_user_id='${operatorID}' AND logged_in_at >= '${gatewaySessionStart}'::timestamptz;`,
  );
});

test('Phase 05 authoritative manual commands, recovery, synchronization, and print exclusion', async ({ browser }) => {
  const kioskContext = await browser.newContext({ baseURL: 'http://localhost:13051' });
  const kiosk = await kioskContext.newPage();
  let detailRequests = 0;
  kiosk.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith(`/work-orders/${workOrderID}`) && request.method() === 'GET') detailRequests += 1;
  });
  await loginKiosk(kiosk);
  const mesConsole = await openConsole(browser);

  await expect(kiosk.locator('section[aria-labelledby="job-card-heading"] article')).toHaveCount(3);
  const printBand = kiosk.locator('section[aria-labelledby="print-heading"]');
  await expect(printBand).toContainText('OP-PRINT');
  await expect(printBand.getByRole('button')).toHaveCount(0);
  await expect(kiosk.locator('body')).not.toContainText('MOCK-');
  await expectConsoleStatus(mesConsole.page, operationIDs.prep, /Sẵn sàng|Ready/i);

  const startPath = `/api/mes/execution/kiosk/work-orders/${workOrderID}/operations/${operationIDs.prep}/start`;
  const startKeys: string[] = [];
  let startCalls = 0;
  await kiosk.route(`**${startPath}`, async (route) => {
    startCalls += 1;
    startKeys.push(route.request().headers()['idempotency-key']);
    if (startCalls === 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"DEPENDENCY_UNAVAILABLE"}' });
    }
    return route.continue();
  });
  await kiosk.getByRole('button', { name: 'Bắt đầu' }).dblclick();
  await expect.poll(() => startCalls).toBe(1);
  await kiosk.getByRole('button', { name: 'Bắt đầu' }).click();
  await expect.poll(() => startCalls).toBe(2);
  expect(startKeys[0]).toBeTruthy();
  expect(startKeys[1]).toBe(startKeys[0]);
  await kiosk.unroute(`**${startPath}`);

  await expect(kiosk.getByRole('button', { name: 'Xác nhận hoàn tất công đoạn' })).toBeVisible();
  await expectConsoleStatus(mesConsole.page, operationIDs.prep, /Đang thực hiện|In progress/i);
  const requestsBeforeRefresh = detailRequests;
  await kiosk.reload();
  await expect(kiosk.getByRole('button', { name: 'Xác nhận hoàn tất công đoạn' })).toBeVisible();
  await expect.poll(() => detailRequests).toBeGreaterThan(requestsBeforeRefresh);

  const good = kiosk.getByRole('spinbutton', { name: 'Sản lượng đạt' });
  const scrap = kiosk.getByRole('spinbutton', { name: 'Sản lượng phế' });
  await good.fill('0');
  await scrap.fill('0');
  await kiosk.getByRole('button', { name: 'Xác nhận hoàn tất công đoạn' }).click();
  await expect(kiosk.getByText(/tổng sản lượng phải lớn hơn 0/i)).toBeVisible();
  await good.fill('10');
  await kiosk.getByRole('button', { name: 'Xác nhận hoàn tất công đoạn' }).click();
  await expect(kiosk.getByText('Cần quét mã tem hoặc mã vật tư.')).toBeVisible();
  await kiosk.getByRole('textbox', { name: 'Quét mã vật tư' }).fill('MAT-PHASE05-001');
  await kiosk.getByRole('button', { name: 'Xác nhận hoàn tất công đoạn' }).click();
  await expect(kiosk.getByRole('button', { name: /Thứ tự 10 OP-PREP/ })).toContainText('Đã hoàn tất');
  await expectConsoleStatus(mesConsole.page, operationIDs.prep, /Finished|Hoàn tất/i);

  await kiosk.getByRole('button', { name: /Thứ tự 20 OP-QC/ }).click();
  await kiosk.getByRole('button', { name: 'Bắt đầu' }).click();
  await expectConsoleStatus(mesConsole.page, operationIDs.quality, /Đang thực hiện|In progress/i);
  await kiosk.getByRole('button', { name: 'Báo lỗi' }).click();
  await expect(kiosk.getByText(/các công đoạn sau sẽ bị chặn/i)).toBeVisible();
  await kiosk.getByRole('button', { name: 'Xác nhận báo lỗi' }).click();
  await expect(kiosk.getByText('Cần chọn một nguyên nhân lỗi thực thi đã duyệt.')).toBeVisible();
  await kiosk.getByRole('combobox', { name: 'Nguyên nhân lỗi đã duyệt' }).selectOption('EXEC-PHASE05-EQUIPMENT');
  await kiosk.getByRole('button', { name: 'Xác nhận báo lỗi' }).click();
  await expect(kiosk.getByText('Nguyên nhân đã chọn yêu cầu mô tả sự cố.')).toBeVisible();
  await kiosk.getByRole('textbox', { name: 'Mô tả sự cố' }).fill('Motor stopped during Phase 05 UAT');
  await kiosk.getByRole('button', { name: 'Xác nhận báo lỗi' }).click();
  await expect(kiosk.getByRole('button', { name: 'Thử lại' })).toBeVisible();
  await expect(kiosk.getByText('Tạm dừng').first()).toBeVisible();
  await expect(kiosk.getByRole('button', { name: /Thứ tự 30 OP-TRIM/ })).toContainText('Bị chặn');
  await expectConsoleStatus(mesConsole.page, operationIDs.quality, /ExecutionError|Lỗi thực thi/i);

  await kiosk.getByRole('button', { name: 'Thử lại' }).click();
  await expect(kiosk.getByRole('button', { name: 'Bắt đầu' })).toBeVisible();
  await expectConsoleStatus(mesConsole.page, operationIDs.quality, /Sẵn sàng|Ready/i);
  await kiosk.getByRole('button', { name: 'Bắt đầu' }).click();
  await good.fill('0');
  await scrap.fill('10');
  await kiosk.getByRole('button', { name: 'Xác nhận hoàn tất công đoạn' }).click();
  await expect(kiosk.getByText('Cần chọn nguyên nhân khi có sản lượng phế.')).toBeVisible();
  await kiosk.getByRole('combobox', { name: 'Mã nguyên nhân phế' }).selectOption('QUALITY-PHASE05-SCRAP');
  await kiosk.getByRole('button', { name: 'Xác nhận hoàn tất công đoạn' }).click();
  await expectConsoleStatus(mesConsole.page, operationIDs.quality, /Finished|Hoàn tất/i);

  await kiosk.getByRole('button', { name: /Thứ tự 30 OP-TRIM/ }).click();
  await kiosk.getByRole('button', { name: 'Bắt đầu' }).click();
  await expectConsoleStatus(mesConsole.page, operationIDs.finishing, /Đang thực hiện|In progress/i);
  await kiosk.getByRole('button', { name: 'Hủy phiên' }).click();
  await expect(kiosk.getByRole('heading', { name: 'Xác nhận hủy phiên?' })).toBeVisible();
  await kiosk.getByRole('button', { name: 'Đồng ý hủy' }).click();
  await expect(kiosk.getByRole('button', { name: 'Bắt đầu' })).toBeVisible();
  await expectConsoleStatus(mesConsole.page, operationIDs.finishing, /Sẵn sàng|Ready/i);

  await expect.poll(() => Number(executionScalar(`SELECT COUNT(*) FROM wo_operation_execution_history WHERE wo_id='${workOrderID}' AND action='FAILED';`))).toBe(1);
  expect(Number(executionScalar(`SELECT COUNT(*) FROM wo_operation_execution_history WHERE wo_id='${workOrderID}' AND action='RETRY_REQUESTED';`))).toBe(1);
  expect(Number(executionScalar(`SELECT COUNT(*) FROM wo_operation_execution_history WHERE wo_id='${workOrderID}' AND action='ABORTED';`))).toBe(1);
  expect(Number(executionScalar(`SELECT COUNT(*) FROM operation_confirmation WHERE wo_operation_id IN ('${operationIDs.prep}','${operationIDs.quality}');`))).toBe(2);
  expect(Number(executionScalar(`SELECT COUNT(*) FROM wo_operation_execution_history WHERE wo_id='${workOrderID}' AND action='FAILED' AND wo_operation_id='${operationIDs.finishing}';`))).toBe(0);
  await expect.poll(() => Number(executionScalar(`SELECT COUNT(*) FROM outbox_events WHERE payload->'payload'->>'wo_id'='${workOrderID}' AND event_type IN ('MES.Execution.OperationStarted.v1','MES.Execution.OperationFinished.v1','MES.Execution.OperationFailed.v1','MES.Execution.OperationRetryRequested.v1','MES.Execution.OperationAborted.v1');`)), { timeout: 15_000 }).toBeGreaterThanOrEqual(9);

  const artifactDir = process.env.PHASE05_ARTIFACT_DIR;
  if (artifactDir) {
    await kiosk.screenshot({ path: path.join(artifactDir, 'kiosk-phase05-final.png'), fullPage: true });
    await mesConsole.page.screenshot({ path: path.join(artifactDir, 'mes-console-phase05-final.png'), fullPage: true });
  }
  await mesConsole.context.close();
  await kioskContext.close();
});
