import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';

export const credentials = {
  manager: { username: process.env.MES_E2E_USERNAME || 'plant.manager', password: process.env.MES_E2E_PASSWORD || 'Manager@123!', role: 'PLANT_MANAGER' },
  operator: { username: process.env.MES_E2E_OPERATOR_USERNAME || 'operator01', password: process.env.MES_E2E_OPERATOR_PASSWORD || 'Operator@123!', role: 'OPERATOR' },
  viewer: { username: process.env.MES_E2E_VIEWER_USERNAME || 'phase3.viewer', password: process.env.MES_E2E_VIEWER_PASSWORD || 'Viewer@123!', role: 'VIEWER' },
  planner: { username: process.env.MES_E2E_PLANNER_USERNAME || 'phase3.planner', password: process.env.MES_E2E_PLANNER_PASSWORD || 'Planner@123!', role: 'PLANNER' },
  productionManager: { username: process.env.MES_E2E_PROD_MANAGER_USERNAME || 'phase3.prod.manager', password: process.env.MES_E2E_PROD_MANAGER_PASSWORD || 'ProdManager@123!', role: 'PROD_MANAGER' },
};

export function defaultPlanningDate() {
  const date = new Date();
  const day = date.getUTCDay();
  if (day === 6) date.setUTCDate(date.getUTCDate() + 2);
  if (day === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function requireMutationEnvironment() {
  expect(process.env.ALLOW_E2E_MUTATION, 'ALLOW_E2E_MUTATION must be true for Phase 3 mutating browser tests').toBe('true');
  expect(process.env.MES_EXECUTION_DATABASE_URL, 'MES_EXECUTION_DATABASE_URL is required for exact cleanup').toBeTruthy();
  expect(process.env.MES_MASTER_DATA_DATABASE_URL, 'MES_MASTER_DATA_DATABASE_URL is required for disposable fixture restore').toBeTruthy();
}

export async function login(page: Page, account = credentials.manager) {
  let headers: Record<string, string> = {};
  let apiOrigin = '';
  page.on('request', (request) => {
    const requestHeaders = request.headers();
    if (requestHeaders['x-user-id'] && request.url().includes('/api/mes/')) {
      headers = {
        'X-User-ID': requestHeaders['x-user-id'],
        'X-Role-Code': requestHeaders['x-role-code'] || account.role,
      };
      apiOrigin = new URL(request.url()).origin;
    }
  });
  await page.goto('/work-orders/new', { waitUntil: 'domcontentloaded' });
  const field = page.locator('#username, input[name="username"]');
  await field.first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
  if (await field.count()) {
    await field.first().fill(account.username);
    await page.locator('#password, input[name="password"]').first().fill(account.password);
    await page.getByRole('button', { name: /sign in|log in|đăng nhập/i }).click();
  }
  await expect(page.getByTestId('work-order-create-screen')).toBeVisible({ timeout: 25_000 });
  await expect.poll(() => Object.keys(headers).length, { timeout: 15_000 }).toBeGreaterThan(0);
  return { base: process.env.MES_E2E_API_BASE_URL || apiOrigin || 'http://100.68.50.41:18000', headers };
}

export async function logout(page: Page) {
  await page.locator('button[title="Đăng xuất"], button[title="Log out"]').click();
  await page.locator('#username, input[name="username"]').first().waitFor({ state: 'visible', timeout: 20_000 });
}

export async function apiJson(ctx: APIRequestContext, base: string, path: string, init: Parameters<APIRequestContext['fetch']>[1] = {}, ok = true) {
  const response = await ctx.fetch(`${base}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const text = await response.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = { message: text }; }
  if (ok) expect(response.ok(), `${path} ${response.status()} ${JSON.stringify(body)}`).toBeTruthy();
  return { response, body: body?.data ?? body };
}

export function cleanupWorkOrders(ids: string[]) {
  if (!ids.length) return;
  execFileSync(process.execPath, ['scripts/cleanup-mes-resource-planning-e2e.mjs', ...ids], { stdio: 'inherit', env: process.env });
}

async function keycloakAdminToken() {
  const base = process.env.KEYCLOAK_ADMIN_URL || 'http://127.0.0.1:18080';
  const body = new URLSearchParams({
    client_id: 'admin-cli',
    grant_type: 'password',
    username: process.env.KEYCLOAK_ADMIN_USERNAME || 'admin',
    password: process.env.KEYCLOAK_ADMIN_PASSWORD || 'Admin@123!',
  });
  const response = await fetch(`${base}/realms/master/protocol/openid-connect/token`, { method: 'POST', body });
  const payload = await response.json();
  expect(response.ok, JSON.stringify(payload)).toBeTruthy();
  return { base, token: payload.access_token as string };
}

export async function ensurePhase3KeycloakUsers() {
  const { base, token } = await keycloakAdminToken();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  for (const roleName of ['VIEWER', 'PLANNER', 'PROD_MANAGER']) {
    const role = await fetch(`${base}/admin/realms/wonsealtech/roles/${roleName}`, { headers });
    if (role.status === 404) {
      const created = await fetch(`${base}/admin/realms/wonsealtech/roles`, { method: 'POST', headers, body: JSON.stringify({ name: roleName }) });
      expect([201, 204].includes(created.status), `${roleName} role create ${created.status}`).toBeTruthy();
    } else {
      expect(role.ok, `${roleName} role lookup ${role.status}`).toBeTruthy();
    }
  }
  for (const account of [credentials.viewer, credentials.planner, credentials.productionManager]) {
    const usersResponse = await fetch(`${base}/admin/realms/wonsealtech/users?username=${encodeURIComponent(account.username)}&exact=true`, { headers });
    expect(usersResponse.ok).toBeTruthy();
    const users = await usersResponse.json();
    let userId = users[0]?.id as string | undefined;
    if (!userId) {
      const created = await fetch(`${base}/admin/realms/wonsealtech/users`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          username: account.username,
          enabled: true,
          emailVerified: true,
          email: `${account.username}@phase3.local`,
          firstName: account.role,
          lastName: 'Phase3',
          requiredActions: [],
          credentials: [{ type: 'password', value: account.password, temporary: false }],
        }),
      });
      expect([201, 204].includes(created.status), `${account.username} create ${created.status}`).toBeTruthy();
      const location = created.headers.get('location') || '';
      userId = location.split('/').pop();
    } else {
      await fetch(`${base}/admin/realms/wonsealtech/users/${userId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          username: account.username,
          enabled: true,
          emailVerified: true,
          email: `${account.username}@phase3.local`,
          firstName: account.role,
          lastName: 'Phase3',
          requiredActions: [],
        }),
      });
      await fetch(`${base}/admin/realms/wonsealtech/users/${userId}/reset-password`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ type: 'password', value: account.password, temporary: false }),
      });
    }
    expect(userId, `user id for ${account.username}`).toBeTruthy();
    const roleResponse = await fetch(`${base}/admin/realms/wonsealtech/roles/${account.role}`, { headers });
    expect(roleResponse.ok).toBeTruthy();
    const role = await roleResponse.json();
    const mapped = await fetch(`${base}/admin/realms/wonsealtech/users/${userId}/role-mappings/realm`, { method: 'POST', headers, body: JSON.stringify([role]) });
    expect([201, 204, 409].includes(mapped.status), `${account.username} role map ${mapped.status}`).toBeTruthy();
  }
}
