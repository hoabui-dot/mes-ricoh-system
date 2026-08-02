import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { credentials, login } from './phase3-helpers';

const manifestPath = path.resolve(process.env.MES_TWO_LINE_UAT_MANIFEST || 'artifacts/mes-two-line-uat/uat-fixture-manifest.json');

function manifest() {
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function rowsFrom(body: any) {
  return body?.header ? body : body?.data || body;
}

test('[@phase2] two-line UAT Work Order fixtures load and persist in current detail UI', async ({ page }) => {
  const data = manifest();
  await login(page, credentials.manager);

  for (const fixture of data.fixtures) {
    const detailResponse = page.waitForResponse((response) => response.url().includes(`/api/mes/execution/work-orders/${fixture.work_order_id}`) && response.request().method() === 'GET');
    await page.goto(`/work-orders/${fixture.work_order_id}`, { waitUntil: 'domcontentloaded' });
    const detail = rowsFrom(await (await detailResponse).json());
    const header = detail.header || detail;
    await expect(page.getByText(fixture.work_order_code).first()).toBeVisible();

    if (fixture.scenario === 'primary-ready') {
      expect(header.line_selection_status).toBe('READY');
      expect(header.selected_production_line_id).toBe(data.model.primary_line.production_line_id);
      expect(header.fallback_reason || '').toBe('');
    }
    if (fixture.scenario === 'backup-fallback') {
      expect(header.line_selection_status).toBe('READY');
      expect(header.selected_production_line_id).toBe(data.model.backup_line.production_line_id);
      expect(header.fallback_reason).toBeTruthy();
    }
    if (fixture.scenario === 'resource-hold') {
      expect(header.line_selection_status).toBe('RESOURCE_HOLD');
      expect(header.selected_production_line_id || '').toBe('');
      expect(JSON.stringify(header.resource_hold_reason || {})).toContain('NO_COMPLETE_FEASIBLE_LINE');
    }

    await page.screenshot({ path: `artifacts/mes-two-line-uat/${fixture.scenario}-detail.png`, fullPage: true });
    const refreshResponse = page.waitForResponse((response) => response.url().includes(`/api/mes/execution/work-orders/${fixture.work_order_id}`) && response.request().method() === 'GET');
    await page.reload({ waitUntil: 'domcontentloaded' });
    const refreshed = rowsFrom(await (await refreshResponse).json());
    expect((refreshed.header || refreshed).line_selection_status).toBe(header.line_selection_status);
    expect((refreshed.header || refreshed).selected_production_line_id || '').toBe(header.selected_production_line_id || '');
  }
});
