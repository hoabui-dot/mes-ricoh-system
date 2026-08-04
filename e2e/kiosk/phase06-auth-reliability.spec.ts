import { expect, test } from '@playwright/test';
import { spawnSync } from 'node:child_process';

const terminal = 'KIOSK-DEMO-01';
const gatewayBase = 'http://localhost:18000';
const protectedList = `/api/mes/execution/kiosk/terminals/${terminal}/work-orders?page=1&page_size=50`;

function gatewayScalar(sql: string) {
  const result = spawnSync(
    'docker',
    ['exec', 'mes-kiosk-gateway-db', 'psql', '-At', '-U', 'mes_kiosk_user', '-d', 'mes_kiosk_gateway_db', '-c', sql],
    { encoding: 'utf8' },
  );
  expect(result.status, result.stderr || result.stdout).toBe(0);
  return result.stdout.trim();
}

test('Phase 06 protects routes, authenticates REST, reconnects, and performs complete logout', async ({ browser, request }) => {
  const artifactDir = process.env.PHASE06_ARTIFACT_DIR;
  const anonymous = await browser.newContext({ baseURL: 'http://localhost:13051' });
  const anonymousPage = await anonymous.newPage();
  await anonymousPage.goto(`/kiosk/${terminal}/wo-list`);
  await expect(anonymousPage).toHaveURL(new RegExp(`/kiosk/${terminal}/login$`));
  await anonymous.close();

  const missingToken = await request.get(`${gatewayBase}${protectedList}`);
  expect(missingToken.status()).toBe(401);

  const runtimeConfig = await request.get('http://localhost:13051/config.js');
  expect(runtimeConfig.ok()).toBeTruthy();
  const runtimeBody = await runtimeConfig.text();
  expect(runtimeBody).toContain('gatewayUrl: "http://localhost:18000"');
  expect(runtimeBody).toContain('websocketUrl: "ws://localhost:18000/api/mes/kiosk-gateway/ws"');
  expect(runtimeBody).toContain('demoCredentialsEnabled: true');

  const firstLogin = await request.post(`${gatewayBase}/api/mes/kiosk-gateway/terminals/${terminal}/login`, {
    data: { employee_id: 'operator01', pin: 'Operator@123!' },
  });
  expect(firstLogin.ok(), await firstLogin.text()).toBeTruthy();
  const firstBody = await firstLogin.json();
  expect(firstBody.terminal_session_id).toMatch(/^[0-9a-f-]{36}$/i);

  const secondLogin = await request.post(`${gatewayBase}/api/mes/kiosk-gateway/terminals/${terminal}/login`, {
    data: { employee_id: 'operator01', pin: 'Operator@123!' },
  });
  expect(secondLogin.ok(), await secondLogin.text()).toBeTruthy();
  const secondBody = await secondLogin.json();
  expect(secondBody.terminal_session_id).not.toBe(firstBody.terminal_session_id);
  expect(gatewayScalar(`SELECT COUNT(*) FROM terminal_session ts JOIN terminal t ON t.terminal_id=ts.terminal_id WHERE t.terminal_code='${terminal}' AND ts.status='ACTIVE';`)).toBe('1');

  const validList = await request.get(`${gatewayBase}${protectedList}`, {
    headers: {
      Authorization: `Bearer ${secondBody.access_token}`,
      'X-User-ID': 'browser-forged-user',
      'X-Role-Code': 'PLANT_MANAGER',
    },
  });
  expect(validList.status()).toBe(200);

  const context = await browser.newContext({ baseURL: 'http://localhost:13051' });
  const page = await context.newPage();
  let bearerSeen = false;
  let browserIdentityHeaderSeen = false;
  page.on('request', (outbound) => {
    if (new URL(outbound.url()).pathname.includes('/api/mes/execution/kiosk/terminals/')) {
      bearerSeen = bearerSeen || outbound.headers().authorization?.startsWith('Bearer ') === true;
      browserIdentityHeaderSeen = browserIdentityHeaderSeen || Boolean(outbound.headers()['x-user-id'] || outbound.headers()['x-role-code']);
    }
  });

  await page.goto(`/kiosk/${terminal}/login`);
  await page.getByRole('button', { name: 'Xác nhận đăng nhập ca' }).click();
  await page.waitForURL('**/wo-list');
  await expect.poll(() => bearerSeen).toBe(true);
  expect(browserIdentityHeaderSeen).toBe(false);
  await expect(page.getByText('Ngoại tuyến', { exact: true })).toBeHidden({ timeout: 15_000 });

  await page.evaluate(() => {
    sessionStorage.setItem('kiosk-command-attempt:test', 'attempt');
    sessionStorage.setItem('kiosk-active-work-order', 'test-wo');
  });

  const restart = spawnSync('docker', ['restart', 'mes-kiosk-gateway-service'], { encoding: 'utf8' });
  expect(restart.status, restart.stderr || restart.stdout).toBe(0);
  await expect(page.getByText('Ngoại tuyến', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Ngoại tuyến', { exact: true })).toBeHidden({ timeout: 30_000 });

  if (artifactDir) await page.screenshot({ path: `${artifactDir}/kiosk-phase06-reconnected.png`, fullPage: true });
  await page.getByRole('button', { name: 'Đăng xuất ca' }).click();
  await expect(page).toHaveURL(new RegExp(`/kiosk/${terminal}/login$`));
  expect(gatewayScalar(`SELECT COUNT(*) FROM terminal_session ts JOIN terminal t ON t.terminal_id=ts.terminal_id WHERE t.terminal_code='${terminal}' AND ts.status='ACTIVE';`)).toBe('0');

  const storage = await page.evaluate(async () => {
    const local = ['kiosk_access_token', 'kiosk_operator_id', 'kiosk_terminal_id', 'kiosk_terminal_session_id']
      .map((key) => localStorage.getItem(key));
    const session = [sessionStorage.getItem('kiosk-command-attempt:test'), sessionStorage.getItem('kiosk-active-work-order')];
    const request = indexedDB.open('kiosk-offline-db');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const workOrders = await new Promise<number>((resolve, reject) => {
      const count = db.transaction('work_orders').objectStore('work_orders').count();
      count.onsuccess = () => resolve(count.result);
      count.onerror = () => reject(count.error);
    });
    db.close();
    return { local, session, workOrders };
  });
  expect(storage.local).toEqual([null, null, null, null]);
  expect(storage.session).toEqual([null, null]);
  expect(storage.workOrders).toBe(0);
  await context.close();
});
