import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { apiJson, credentials, login } from './phase3-helpers';

test('Routing is product-independent and Production Version derives output Revision from MBOM', async ({ page, request }) => {
  const session = await login(page, credentials.manager);

  await page.goto('/master-data/routings/new');
  await expect(page.getByRole('heading', { name: /Tạo Routing|Create Routing/i })).toBeVisible();
  await expect(page.getByRole('combobox', { name: /Item Revision|Revision đầu ra|Output Revision/i })).toHaveCount(0);

  await page.goto('/master-data/production-versions/new');
  await expect(page.getByRole('heading', { name: /Tạo Production Version|Create Production Version/i })).toBeVisible();
  await expect(page.getByRole('combobox', { name: /^Item$|Sản phẩm|Item Revision/i })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /^MBOM$/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Routing/i })).toBeVisible();

  let draftRoutingId = '';
  try {
    const draftRouting = await apiJson(request, session.base, '/api/mes/master-data/routing-headers', {
      method: 'POST',
      headers: session.headers,
      data: {
        name: { vi: 'Routing độc lập kiểm thử', en: 'Independent Routing test' },
        routing_type: 'Standard',
        item_revision_id: randomUUID(),
      },
    });
    draftRoutingId = String(draftRouting.body.master_id);
    expect(draftRouting.body.item_revision_id).toBeUndefined();
  } finally {
    if (draftRoutingId) {
      await apiJson(request, session.base, `/api/mes/master-data/routing-headers/${draftRoutingId}`, { method: 'DELETE', headers: session.headers });
    }
  }

  const mbomResult = await apiJson(request, session.base, '/api/mes/master-data/mbom-headers?limit=100&lifecycle_status=Released', { headers: session.headers });
  const routingResult = await apiJson(request, session.base, '/api/mes/master-data/routing-headers?limit=100&lifecycle_status=Released', { headers: session.headers });
  const revisionResult = await apiJson(request, session.base, '/api/mes/master-data/item-revisions?limit=500&lifecycle_status=Released', { headers: session.headers });
  const routing = routingResult.body.find((row: any) => row.site_id && row.lifecycle_status === 'Released');
  expect(routing, 'A Released single-Site Routing fixture is required').toBeTruthy();
  const revisionSites = new Map(revisionResult.body.map((row: any) => [row.master_id, row.site_id]));
  const mbom = mbomResult.body.find((row: any) => row.item_revision_id && revisionSites.get(row.item_revision_id) === routing.site_id);
  expect(mbom, 'A Released MBOM fixture at the Routing Site is required').toBeTruthy();

  let productionVersionId = '';
  try {
    const created = await apiJson(request, session.base, '/api/mes/master-data/production-versions', {
      method: 'POST',
      headers: session.headers,
      data: {
        name_i18n: { vi: 'PV kiểm thử suy ra MBOM', en: 'MBOM-derived PV test' },
        item_revision_id: randomUUID(),
        mbom_header_id: mbom.master_id,
        routing_header_id: routing.master_id,
        min_lot_size: 1,
        max_lot_size: 10,
        is_default: false,
      },
    });
    productionVersionId = String(created.body.master_id);
    expect(created.body.item_revision_id).toBe(mbom.item_revision_id);
    expect(created.body.site_id).toBe(routing.site_id);
  } finally {
    if (productionVersionId) {
      await apiJson(request, session.base, `/api/mes/master-data/production-versions/${productionVersionId}`, { method: 'DELETE', headers: session.headers });
    }
  }
});

test('Production Version create form only offers Production Lines eligible for the selected Routing', async ({ page, request }) => {
  const session = await login(page, credentials.manager);
  const routingResult = await apiJson(request, session.base, '/api/mes/master-data/routing-headers?limit=500&lifecycle_status=Released', { headers: session.headers });

  let routing: any;
  let preview: any;
  for (const candidate of routingResult.body) {
    if (!candidate.site_id) continue;
    const result = await apiJson(request, session.base, '/api/mes/master-data/production-versions/line-eligibility-candidates', {
      method: 'POST',
      headers: session.headers,
      data: { routing_header_id: candidate.master_id },
    }, false);
    if (result.response.ok() && result.body.candidates?.some((line: any) => line.eligible)) {
      routing = candidate;
      preview = result.body;
      break;
    }
  }

  expect(routing, 'A Released Routing with at least one eligible Production Line is required').toBeTruthy();
  const eligible = preview.candidates.filter((line: any) => line.eligible);
  expect(eligible.length).toBeGreaterThan(0);
  for (const line of eligible) {
    expect(line.site_id).toBe(routing.site_id);
    expect(line.lifecycle_status).toBe('Released');
    expect(line.blockers).toEqual([]);
  }

  await page.goto('/master-data/production-versions/new');
  const routingSelect = page.getByRole('combobox', { name: /Routing/i });
  await routingSelect.click();
  await page.getByRole('option').filter({ hasText: routing.code }).click();

  await expect(page.getByTestId('eligible-line-count')).toContainText(String(eligible.length));
  await page.getByRole('button', { name: /Thêm line|Add line/i }).click();
  await expect(page.getByTestId('eligible-line-row')).toHaveCount(1);
  await expect(page.getByTestId('eligible-line-select-0')).toContainText(eligible[0].production_line_code);
  await expect(page.getByRole('radio', { name: /Primary/i })).toHaveAttribute('aria-checked', 'true');

  if (eligible.length > 1) {
    await page.getByRole('button', { name: /Thêm line|Add line/i }).click();
    const primaryButtons = page.getByRole('radio', { name: /Primary/i });
    await primaryButtons.nth(1).click();
    await expect(primaryButtons.nth(0)).toHaveAttribute('aria-checked', 'false');
    await expect(primaryButtons.nth(1)).toHaveAttribute('aria-checked', 'true');
  }

  const editor = page.getByTestId('pv-line-eligibility-editor');
  await editor.scrollIntoViewIfNeeded();
  await editor.screenshot({ path: 'artifacts/production-version-line-eligibility-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(editor).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await editor.scrollIntoViewIfNeeded();
  await editor.screenshot({ path: 'artifacts/production-version-line-eligibility-mobile.png' });
});
