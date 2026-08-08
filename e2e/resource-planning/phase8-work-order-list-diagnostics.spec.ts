import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { credentials, login, requireMutationEnvironment } from './phase3-helpers';

const manifest = JSON.parse(fs.readFileSync(process.env.MES_TWO_LINE_UAT_MANIFEST || 'artifacts/mes-two-line-uat/uat-fixture-manifest.json', 'utf8'));
const fixtures = manifest.fixtures as Array<{ scenario: string; work_order_id: string; work_order_code: string }>;

test('[@phase8] persisted Work Order list triage, server filters, and detail matrix', async ({ page }) => {
  requireMutationEnvironment();
  await login(page, credentials.manager);
  const listResponse = page.waitForResponse((response) => response.url().includes('/api/mes/execution/work-orders?') && response.request().method() === 'GET');
  await page.goto('/work-orders', { waitUntil: 'domcontentloaded' });
  expect((await listResponse).ok()).toBeTruthy();
  for (const fixture of fixtures) await expect(page.getByText(fixture.work_order_code, { exact: true })).toBeVisible();
  if (process.env.MES_UI08_ARTIFACT_DIR) { fs.mkdirSync(process.env.MES_UI08_ARTIFACT_DIR, { recursive: true }); await page.screenshot({ path: `${process.env.MES_UI08_ARTIFACT_DIR}/work-order-list-three-states.png`, fullPage: true }); }

  const holdFixture = fixtures.find((fixture) => fixture.scenario === 'resource-hold');
  expect(holdFixture).toBeTruthy();
  const holdFilter = page.getByLabel(/Resource Hold|Resource Hold/i);
  await holdFilter.selectOption('true');
  await expect(page.getByText(holdFixture!.work_order_code, { exact: true })).toBeVisible();
  for (const fixture of fixtures.filter((candidate) => candidate.scenario !== 'resource-hold')) await expect(page.getByText(fixture.work_order_code, { exact: true })).toHaveCount(0);

  await page.goto(`/work-orders/${holdFixture!.work_order_id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('work-order-line-selection-panel')).toBeVisible();
  await expect(page.getByTestId('line-dimension-matrix-primary')).toBeVisible();
  await expect(page.getByTestId('line-dimension-matrix-backup')).toBeVisible();
  await expect(page.getByTestId('line-operation-feasibility-matrix')).toBeVisible();
  if (process.env.MES_UI08_ARTIFACT_DIR) {
    await page.screenshot({ path: `${process.env.MES_UI08_ARTIFACT_DIR}/work-order-hold-detail-matrix.png`, fullPage: true });
    await page.getByTestId('line-operation-feasibility-matrix').screenshot({ path: `${process.env.MES_UI08_ARTIFACT_DIR}/work-order-operation-feasibility-matrix.png` });
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('work-order-line-selection-panel')).toBeVisible();
});
