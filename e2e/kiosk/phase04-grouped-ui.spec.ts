import { expect, test } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const terminal = 'KIOSK-DEMO-01';
const workOrderID = '04000000-0000-0000-0000-000000000001';
const listPath = `/api/mes/execution/kiosk/terminals/${terminal}/work-orders`;
const eventID = `phase04-ui-refresh-${Date.now()}`;
const fixtureDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(path.join(fixtureDirectory, name), 'utf8');

function runExecutionSQL(name: string) {
  const result = spawnSync(
    'docker',
    ['exec', '-i', 'mes-execution-db', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'mes_execution_user', '-d', 'mes_execution_db'],
    { input: fixture(name), encoding: 'utf8' },
  );
  expect(result.status, `${name}: ${result.stderr}`).toBe(0);
}

test.beforeAll(() => runExecutionSQL('phase04-fixture.sql'));

test.afterAll(() => {
  runExecutionSQL('phase04-cleanup.sql');
  const cleanup = spawnSync(
    'docker',
    ['exec', 'mes-kiosk-gateway-db', 'psql', '-U', 'mes_kiosk_user', '-d', 'mes_kiosk_gateway_db', '-c',
      "DELETE FROM outbound_message_queue WHERE event_id LIKE 'phase04-ui-refresh-%'; DELETE FROM consumed_execution_event WHERE event_id LIKE 'phase04-ui-refresh-%';"],
    { encoding: 'utf8' },
  );
  expect(cleanup.status, cleanup.stderr).toBe(0);
});

test('Phase 04 grouped Kiosk UI states, realtime, locales, accessibility, and tablet', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  const artifactDir = process.env.PHASE04_ARTIFACT_DIR;
  let listMode: 'network' | 'abort' | 'fail' | 'empty' = 'network';
  let delayInitialList = true;
  let listRequests = 0;

  await page.route(`**${listPath}*`, async (route) => {
    if (new URL(route.request().url()).pathname !== listPath) return route.continue();
    listRequests += 1;
    if (delayInitialList) {
      delayInitialList = false;
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    if (listMode === 'abort') return route.abort('internetdisconnected');
    if (listMode === 'fail') return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    if (listMode === 'empty') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], pagination: { page: 1, page_size: 50, total_items: 0, total_pages: 0 } }),
      });
    }
    return route.continue();
  });

  await page.goto(`/kiosk/${terminal}/login`);
  await page.getByRole('button', { name: /Xác nhận đăng nhập ca/ }).click();
  await page.waitForURL('**/wo-list');
  await expect(page.getByText('Đang tải lệnh sản xuất...')).toBeVisible();
  await expect(page.getByText('WO-PHASE04-RUNTIME-01')).toBeVisible();
  await expect(page.getByText('Dây chuyền Phase 04')).toBeVisible();
  await expect(page.getByText(/100\s+PCS/)).toBeVisible();
  await expect(page.getByText('1 công đoạn đang lỗi')).toBeVisible();
  for (const text of ['Tổng', 'Chờ', 'Sẵn sàng', 'Đang chạy', 'Hoàn tất', 'Lỗi', 'Bị chặn']) {
    await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText('Tiến độ toàn lệnh')).toBeVisible();
  await expect(page.getByText('Tiến độ thủ công')).toBeVisible();
  await expect(page.locator('article')).toHaveCount(1);

  const openButton = page.getByRole('button', { name: 'Mở Job Card' });
  const openBox = await openButton.boundingBox();
  expect(openBox?.height).toBeGreaterThanOrEqual(44);
  await openButton.focus();
  await expect(openButton).toBeFocused();
  await page.keyboard.press('Enter');
  await page.waitForURL(`**/wo/${workOrderID}`);

  await expect(page.locator('section[aria-labelledby="job-card-heading"] article')).toHaveCount(5);
  for (const code of ['OP-PREP', 'OP-ASSEMBLY', 'OP-QC', 'OP-PACK', 'OP-FINAL']) {
    await expect(page.getByText(code, { exact: true })).toBeVisible();
  }
  await expect(page.getByText('OPERATOR-PHASE04').first()).toBeVisible();
  await expect(page.getByText('WC-PHASE04-RUNTIME').first()).toBeVisible();
  await expect(page.getByText('WS-PHASE04-RUNTIME').first()).toBeVisible();
  await expect(page.getByText('EQ-PHASE04-RUNTIME').first()).toBeVisible();
  await expect(page.getByText('EXEC-EQUIPMENT')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Trạng thái Print Station' })).toBeVisible();
  await expect(page.getByText('PJ-PHASE04-RUNTIME')).toBeVisible();
  await expect(page.getByText('Chỉ đọc')).toBeVisible();
  await expect(page.getByRole('button', { name: /Bắt đầu|Hoàn tất|Báo lỗi|Hủy phiên|Thử lại/ })).toHaveCount(0);

  let bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  expect(bodyText).not.toContain('kiosk.');
  for (const raw of ['DispatchQueued', 'ExecutionError', 'InProgress', 'PREDECESSOR_NOT_FINISHED']) expect(bodyText).not.toContain(raw);

  const localeCases = [
    ['en', 'Manual Job Cards', 'Assembly'],
    ['ja', '手動ジョブカード', '組立'],
    ['ko', '수동 Job Card', '조립'],
    ['vi', 'Job Card thủ công', 'Lắp ráp'],
  ] as const;
  const language = page.getByRole('combobox').first();
  for (const [locale, heading, operationName] of localeCases) {
    await language.selectOption(locale);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(page.getByText(operationName, { exact: true })).toBeVisible();
  }
  if (artifactDir) await page.screenshot({ path: path.join(artifactDir, 'kiosk-phase04-job-cards-tablet.png'), fullPage: true });

  await page.getByRole('button', { name: 'Trở về danh sách' }).click();
  await expect(page.getByText('WO-PHASE04-RUNTIME-01')).toBeVisible();
  const requestsBeforeEvent = listRequests;
  const event = JSON.stringify({
    event_id: eventID,
    event_type: 'MES.Execution.WOStatusChanged.v1',
    occurred_at: new Date().toISOString(),
    source_service: 'phase04-playwright',
    trace_id: eventID,
    payload: { wo_id: workOrderID, wo_code: 'WO-PHASE04-RUNTIME-01', dispatch_mode: 'DEMO_SHARED_KIOSK' },
  });
  const produced = spawnSync(
    'docker',
    ['exec', '-i', 'platform-kafka', 'kafka-console-producer', '--bootstrap-server', 'localhost:9092', '--topic', 'MES.Execution.WOStatusChanged.v1'],
    { input: `${event}\n`, encoding: 'utf8' },
  );
  expect(produced.status, produced.stderr).toBe(0);
  await expect.poll(() => listRequests, { timeout: 15_000 }).toBeGreaterThan(requestsBeforeEvent);

  await page.getByRole('button', { name: 'Mở Job Card' }).click();
  await page.reload();
  await expect(page.locator('section[aria-labelledby="job-card-heading"] article')).toHaveCount(5);
  await expect(page.getByText('OPERATOR-PHASE04').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: /Thứ tự 20 OP-ASSEMBLY/ }).click();
  await expect(page.getByRole('button', { name: 'Xác nhận hoàn tất công đoạn' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Hủy phiên' })).toBeEnabled();
  await page.getByRole('button', { name: 'Trở về danh sách' }).click();
  await expect(page.getByText('WO-PHASE04-RUNTIME-01')).toBeVisible();

  listMode = 'abort';
  await page.reload();
  await expect(page.getByText('Dữ liệu ngoại tuyến chỉ đọc', { exact: true })).toBeVisible();
  await expect(page.getByText(/Bản lưu/)).toBeVisible();
  await expect(page.getByText('WO-PHASE04-RUNTIME-01')).toBeVisible();

  listMode = 'fail';
  await page.evaluate(async () => {
    const request = indexedDB.open('kiosk-offline-db');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction('work_orders', 'readwrite');
    transaction.objectStore('work_orders').clear();
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Không thể tải dữ liệu' })).toBeVisible();
  listMode = 'network';
  await page.getByRole('button', { name: 'Thử tải lại' }).click();
  await expect(page.getByText('WO-PHASE04-RUNTIME-01')).toBeVisible();

  listMode = 'empty';
  await page.getByRole('button', { name: 'Làm mới dữ liệu' }).click();
  await expect(page.getByRole('heading', { name: 'Chưa có lệnh sản xuất' })).toBeVisible();
  await expect(page.getByText('Không có lệnh Demo Shared Kiosk nào đang khả dụng tại trạm này.')).toBeVisible();
  listMode = 'network';
  await page.getByRole('button', { name: 'Làm mới dữ liệu' }).click();
  await expect(page.getByText('WO-PHASE04-RUNTIME-01')).toBeVisible();

  if (artifactDir) await page.screenshot({ path: path.join(artifactDir, 'kiosk-phase04-tablet.png'), fullPage: true });
});
