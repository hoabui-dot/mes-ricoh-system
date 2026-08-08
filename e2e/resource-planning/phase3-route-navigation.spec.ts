import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { credentials, login, apiJson } from './phase3-helpers';

const manifestPath = path.resolve(process.env.MES_TWO_LINE_UAT_MANIFEST || 'artifacts/mes-two-line-uat/uat-fixture-manifest.json');

function readUatManifest() {
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

async function expectOperationalPage(page: import('@playwright/test').Page) {
  await expect(page.locator('main h1').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('main')).not.toContainText(/Page not found|Không tìm thấy trang/i);
}

test.describe('[@phase3] MES Console route redirects and navigation', () => {
  test('canonical routes, legacy redirects, sidebar state, diagnostics visibility, and not-found behavior', async ({ page }) => {
    const auth = await login(page, credentials.manager);
    const manifest = readUatManifest();
    const workOrder = manifest.fixtures[0];
    expect(workOrder?.work_order_id, 'Phase UI-02 Work Order fixture is required').toBeTruthy();

    const mboms = await apiJson(page.request, auth.base, '/api/mes/master-data/mbom-headers?limit=1', { headers: auth.headers });
    const mbomId = mboms.body?.[0]?.master_id;
    expect(mbomId, 'seeded MBOM header is required for parameter redirect smoke').toBeTruthy();
    const machines = await apiJson(page.request, auth.base, '/api/mes/master-data/machines?limit=1', { headers: auth.headers });
    const machineId = machines.body?.[0]?.master_id;
    expect(machineId, 'seeded Machine Definition is required for equipment redirect smoke').toBeTruthy();

    await test.step('Normal navigation exposes canonical routes only', async () => {
      await page.goto('/work-orders', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('aside a[href="/master-data/production-areas"]')).toBeVisible();
      await expect(page.locator('aside a[href="/master-data/machines"]')).toHaveCount(1);
      await expect(page.locator('aside a[href="/master-data/equipment"]')).toHaveCount(0);
      await expect(page.locator('aside a[href="/master-data/eboms"]')).toHaveCount(0);
      await expect(page.locator('aside a[href="/console/mes/i18n-review"]')).toHaveCount(0);
      await expect(page.locator('aside a[href="/work-orders"]')).toHaveClass(/mes-nav-active/);
    });

    const canonicalRoutes = [
      '/work-orders',
      '/work-orders/new',
      `/work-orders/${workOrder.work_order_id}`,
      '/master-data/items',
      '/master-data/mboms',
      `/master-data/mboms/${mbomId}`,
      '/master-data/routings',
      '/master-data/production-versions',
      '/master-data/production-lines',
      '/master-data/production-areas',
      '/master-data/work-centers',
      '/master-data/workstations',
      '/master-data/machines',
      '/master-data/skills/workers',
      '/employees',
      '/shifts',
      '/work-calendar',
    ];

    for (const route of canonicalRoutes) {
      await test.step(`Canonical route ${route}`, async () => {
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        await expect(page).toHaveURL(new RegExp(`${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[?#].*)?$`));
        await expectOperationalPage(page);
      });
    }

    const redirects = [
      [`/console/mes/work-orders/${workOrder.work_order_id}?source=ui03#resource`, `/work-orders/${workOrder.work_order_id}?source=ui03#resource`],
      ['/console/mes/work-orders/new?source=ui03', '/work-orders/new?source=ui03'],
      ['/console/mes/work-orders?source=ui03', '/work-orders?source=ui03'],
      ['/console/mes/items?source=ui03', '/master-data/items?source=ui03'],
      ['/console/mes/routings?source=ui03', '/master-data/routings?source=ui03'],
      ['/console/mes/production-versions?source=ui03', '/master-data/production-versions?source=ui03'],
      ['/console/mes/employees?source=ui03', '/employees?source=ui03'],
      ['/console/mes/shifts?source=ui03', '/shifts?source=ui03'],
      ['/console/mes/work-calendar?source=ui03', '/work-calendar?source=ui03'],
      [`/console/mes/mboms/${mbomId}?source=ui03`, `/master-data/mboms/${mbomId}?source=ui03`],
      ['/console/mes/work-centers?source=ui03', '/master-data/work-centers?source=ui03'],
      ['/console/mes/skills?source=ui03', '/master-data/skills/workers?source=ui03'],
      ['/master-data/worker-skills?source=ui03', '/master-data/skills/workers?source=ui03'],
      ['/master-data/employee-skills?source=ui03', '/employees?source=ui03'],
      ['/worker-skills?source=ui03', '/master-data/skills/workers?source=ui03'],
      [`/master-data/equipment/${machineId}/edit?source=ui03`, `/master-data/machines/${machineId}/edit?source=ui03`],
      ['/console/mes/equipment?source=ui03', '/master-data/machines?source=ui03'],
      ['/master-data/product-recipes?source=ui03', '/master-data/production-versions?source=ui03'],
    ];

    for (const [from, to] of redirects) {
      await test.step(`Redirect ${from} -> ${to}`, async () => {
        await page.goto(from, { waitUntil: 'domcontentloaded' });
        await expect(page).toHaveURL(new RegExp(`${to.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
        await expectOperationalPage(page);
      });
    }

    await test.step('Work Order legacy detail redirect preserves parameter and fixture content', async () => {
      await page.goto(`/console/mes/work-orders/${workOrder.work_order_id}`, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(new RegExp(`/work-orders/${workOrder.work_order_id}$`));
      await expect(page.getByText(workOrder.work_order_code).first()).toBeVisible();
      await expect(page.locator('aside a[href="/work-orders"]')).toHaveClass(/mes-nav-active/);
    });

    await test.step('Refresh and back-forward navigation stay stable', async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(new RegExp(`/work-orders/${workOrder.work_order_id}$`));
      await page.goto('/work-orders', { waitUntil: 'domcontentloaded' });
      await page.locator('aside a[href="/master-data/machines"]').click();
      await expect(page).toHaveURL(/\/master-data\/machines$/);
      await page.locator('aside a[href="/master-data/production-areas"]').click();
      await expect(page).toHaveURL(/\/master-data\/production-areas$/);
      await page.goBack({ waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/\/master-data\/machines$/);
      await page.goForward({ waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/\/master-data\/production-areas$/);
    });

    await test.step('Diagnostic route is hidden from navigation but direct diagnostic URL remains reachable', async () => {
      await expect(page.locator('aside a[href="/console/mes/i18n-review"]')).toHaveCount(0);
      await page.goto('/console/mes/i18n-review', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('main h1').first()).toBeVisible();
    });

    await test.step('Not Found route remains explicit', async () => {
      await page.goto('/master-data/eboms', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('main')).toContainText(/404/);
      await expect(page.locator('main')).toContainText('/master-data/eboms');

      await page.goto('/ui03-route-does-not-exist', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('main')).toContainText(/404/);
      await expect(page.locator('main')).toContainText('/ui03-route-does-not-exist');
    });
  });
});
