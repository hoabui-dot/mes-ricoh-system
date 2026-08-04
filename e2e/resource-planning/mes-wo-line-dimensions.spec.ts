import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { credentials, login } from './phase3-helpers';

const manifestPath = path.resolve(process.env.MES_TWO_LINE_UAT_MANIFEST || 'artifacts/mes-two-line-uat/uat-fixture-manifest.json');
const evidenceDir = path.resolve(process.env.MES_LINE_DIMENSION_EVIDENCE_DIR || 'artifacts/mes-wo-line-dimension-fix/browser');

function manifest() {
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function fixture(scenario: string) {
  const found = manifest().fixtures.find((entry: any) => entry.scenario === scenario);
  if (!found) throw new Error(`Missing fixture ${scenario}`);
  return found;
}

async function openDetail(page: any, scenario: string) {
  const target = fixture(scenario);
  const responsePromise = page.waitForResponse((response: any) => response.url().includes(`/api/mes/execution/work-orders/${target.work_order_id}`) && response.request().method() === 'GET');
  await page.goto(`/work-orders/${target.work_order_id}`, { waitUntil: 'domcontentloaded' });
  const response = await responsePromise;
  const body = await response.json();
  await expect(page.getByText(target.work_order_code).first()).toBeVisible();
  return { target, body: body.header ? body : body.data || body };
}

async function expectNoRawTranslationKeys(page: any) {
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/(?:woDetail|lineSelection)\.[A-Za-z0-9_.-]+/);
}

test.beforeEach(async ({ page }) => {
  fs.mkdirSync(evidenceDir, { recursive: true });
  await login(page, credentials.manager);
});

test('Primary-ready line shows authoritative Ready and Deferred dimensions', async ({ page }) => {
  const { body } = await openDetail(page, 'primary-ready');
  const header = body.header || body;
  const line = header.evaluated_line_results[0];
  expect(line.policy_version).toBe('MES_LINE_SELECTION_V2');
  expect(line.dimensions).toHaveLength(13);
  expect(line.dimensions.filter((dimension: any) => dimension.status === 'READY')).toHaveLength(8);
  expect(line.dimensions.filter((dimension: any) => dimension.status === 'DEFERRED')).toHaveLength(5);
  expect(line.dimensions.some((dimension: any) => dimension.status === 'NOT_EVALUATED')).toBeFalsy();

  const matrix = page.getByTestId('line-dimension-matrix-primary');
  await expect(matrix.locator('tbody tr')).toHaveCount(13);
  await expect(matrix.getByText('Đạt', { exact: true }).first()).toBeVisible();
  await expect(matrix.getByText('Hoãn đến bước phân bổ nguồn lực', { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId('line-evaluation-legacy-notice')).toHaveCount(0);
  await expect(page.getByText('Nguồn lực cụ thể đã cam kết cho từng công đoạn.')).toBeVisible();
  await expect(page.getByText('Kết quả capacity sau phân bổ và tái kiểm tra.')).toBeVisible();
  await expectNoRawTranslationKeys(page);
  await page.screenshot({ path: path.join(evidenceDir, 'pv-01-primary-ready.png'), fullPage: true });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('line-dimension-matrix-primary').locator('tbody tr')).toHaveCount(13);
});

test('Backup fallback shows the Primary blocker and selected Backup evidence', async ({ page }) => {
  const { body } = await openDetail(page, 'backup-fallback');
  const header = body.header || body;
  expect(header.line_selection_status).toBe('READY');
  expect(header.line_selection_mode).toBe('BACKUP');
  expect(header.fallback_reason).toBeTruthy();
  expect(header.evaluated_line_results).toHaveLength(2);
  expect(header.evaluated_line_results[0].dimensions.some((dimension: any) => dimension.status === 'BLOCKED')).toBeTruthy();
  expect(header.evaluated_line_results[1].dimensions.filter((dimension: any) => dimension.status === 'DEFERRED')).toHaveLength(5);

  await expect(page.getByTestId('line-dimension-matrix-primary').locator('tbody tr')).toHaveCount(13);
  await expect(page.getByTestId('line-dimension-matrix-backup').locator('tbody tr')).toHaveCount(13);
  await expect(page.getByTestId('line-result-primary').getByText('Dây chuyền không được chọn')).toBeVisible();
  await expect(page.getByTestId('line-result-backup').getByText('Dây chuyền được chọn')).toBeVisible();
  await expect(page.getByTestId('line-result-primary').getByText('Bị chặn', { exact: true }).first()).toBeVisible();
  await expectNoRawTranslationKeys(page);
  await page.screenshot({ path: path.join(evidenceDir, 'pv-02-backup-fallback.png'), fullPage: true });
});

test('Both-lines-hold shows both blockers and keeps allocation unavailable', async ({ page }) => {
  const { body } = await openDetail(page, 'resource-hold');
  const header = body.header || body;
  expect(header.line_selection_status).toBe('RESOURCE_HOLD');
  expect(header.selected_production_line_id || '').toBe('');
  expect(header.evaluated_line_results).toHaveLength(2);
  for (const line of header.evaluated_line_results) {
    expect(line.status).toBe('Blocked');
    expect(line.dimensions.some((dimension: any) => dimension.status === 'BLOCKED')).toBeTruthy();
  }

  await expect(page.getByTestId('line-resource-hold-warning')).toBeVisible();
  await expect(page.getByTestId('line-result-primary').getByTestId('line-blocking-reason').first()).toBeVisible();
  await expect(page.getByTestId('line-result-backup').getByTestId('line-blocking-reason').first()).toBeVisible();
  await expect(page.getByTestId('resource-auto-propose-button')).toBeDisabled();
  await expectNoRawTranslationKeys(page);
  await page.screenshot({ path: path.join(evidenceDir, 'pv-03-resource-hold.png'), fullPage: true });
});

test('Line diagnostics remain readable at tablet width', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openDetail(page, 'primary-ready');
  const panel = page.getByTestId('work-order-line-selection-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('columnheader', { name: 'Giai đoạn đánh giá' })).toBeVisible();
  await expect(panel.getByRole('columnheader', { name: 'Bước tiếp theo' })).toBeVisible();
  await expectNoRawTranslationKeys(page);
  await page.screenshot({ path: path.join(evidenceDir, 'pv-01-tablet.png'), fullPage: true });
});
