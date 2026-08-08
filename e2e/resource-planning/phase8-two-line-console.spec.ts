import { test, expect } from '@playwright/test';
import { credentials, login, requireMutationEnvironment } from './phase3-helpers';

const detailPath = /\/api\/mes\/execution\/work-orders\/phase8-(backup|hold)$/;
const replanPath = /\/api\/mes\/execution\/work-orders\/phase8-backup\/line-replan$/;

function workOrderDetail(kind: 'backup' | 'hold' | 'started') {
  const hold = kind === 'hold';
  const started = kind === 'started';
  return {
    header: {
      wo_id: `phase8-${kind}`,
      wo_code: `WO-PHASE8-${kind.toUpperCase()}`,
      item_code: 'FG-PHASE8',
      item_name: 'Phase 8 Item',
      quantity: 12,
      uom_id: 'PCS',
      site_id: 'SITE-P8',
      planned_start_at: '2026-08-02T08:00:00Z',
      planned_end_at: '2026-08-02T12:00:00Z',
      status: hold ? 'ResourceHold' : started ? 'InProgress' : 'Draft',
      row_version: 4,
      selected_production_line_id: hold ? '' : 'line-backup-hidden-id',
      selected_production_line_code: hold ? '' : 'P8-LINE-B',
      selected_production_line_name_i18n: hold ? {} : { en: 'Backup Line', vi: 'Dây chuyền dự phòng' },
      line_selection_mode: hold ? 'AUTO' : 'BACKUP',
      line_selection_status: hold ? 'RESOURCE_HOLD' : 'READY',
      line_selection_reason: hold ? 'NO_COMPLETE_FEASIBLE_LINE' : 'BACKUP_LINE_READY',
      fallback_reason: hold ? '' : 'PRIMARY_LINE_BLOCKED',
      line_locked_at: hold ? null : '2026-08-01T12:00:00Z',
      resource_hold_reason: hold ? { code: 'NO_COMPLETE_FEASIBLE_LINE' } : {},
      evaluated_line_results: hold ? [
        { production_line_code: 'P8-LINE-P', selection_role: 'PRIMARY', status: 'Blocked', complete_line_feasibility_status: 'BLOCKED', blockers: [{ code: 'LINE_OPERATION_CAPABILITY_MISSING', operation_code: 'OP-P8-20' }], operations: [{ operation_code: 'OP-P8-10', status: 'READY', total_candidate_count: 2, feasible_candidate_count: 1 }, { operation_code: 'OP-P8-20', status: 'BLOCKED', total_candidate_count: 1, feasible_candidate_count: 0, blocker_codes: ['LINE_OPERATION_FEASIBLE_CANDIDATE_MISSING'] }] },
        { production_line_code: 'P8-LINE-B', selection_role: 'BACKUP', status: 'Blocked', complete_line_feasibility_status: 'BLOCKED', blockers: [{ code: 'LINE_MISSING_WORK_CENTER', operation_code: 'OP-P8-30' }], operations: [{ operation_code: 'OP-P8-10', status: 'READY', total_candidate_count: 1, feasible_candidate_count: 1 }, { operation_code: 'OP-P8-20', status: 'BLOCKED', total_candidate_count: 0, feasible_candidate_count: 0, blocker_codes: ['LINE_OPERATION_FEASIBLE_CANDIDATE_MISSING'] }] },
      ] : [
        { production_line_id: 'line-primary-hidden-id', production_line_code: 'P8-LINE-P', selection_role: 'PRIMARY', status: 'Blocked', complete_line_feasibility_status: 'BLOCKED', blockers: [{ code: 'LINE_RESOURCE_CAPACITY_CONFLICT', operation_code: 'OP-P8-10' }], operations: [{ operation_code: 'OP-P8-10', status: 'BLOCKED', total_candidate_count: 1, feasible_candidate_count: 0, blocker_codes: ['RESOURCE_CAPACITY_CONFLICT'] }] },
        { production_line_id: 'line-backup-hidden-id', production_line_code: 'P8-LINE-B', selection_role: 'BACKUP', status: 'Ready', complete_line_feasibility_status: 'READY', blockers: [], operations: [{ operation_code: 'OP-P8-10', status: 'READY', total_candidate_count: 1, feasible_candidate_count: 1 }] },
      ],
      demo_print_on_approval: false,
    },
    operations: [
      { wo_operation_id: `op-phase8-${kind}-10`, sequence_no: 10, operation_code: 'OP-P8-10', operation_name: { en: 'Cut' }, work_center_id: 'wc-hidden', work_center_code: hold ? 'WC-HOLD' : 'WC-B-10', work_center_name: { en: hold ? 'Hold WC' : 'Backup WC 10' }, production_line_code: hold ? '' : 'P8-LINE-B', status: 'Pending', execution_target_type: 'KIOSK_DEMO', resource_allocation: { allocation_id: null, status: null, validation_status: null } },
    ],
    material_requirements: [],
    approval_logs: [],
    print_jobs: [],
  };
}

test('[@phase8] Work Order detail shows backend line fallback, blockers, replan, and refresh persistence', async ({ page }) => {
  requireMutationEnvironment();
  await login(page, credentials.manager);
  let replanBody: any = null;
  await page.route(detailPath, async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(workOrderDetail(route.request().url().includes('hold') ? 'hold' : 'backup')) }));
  await page.route(replanPath, async (route) => {
    replanBody = await route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ selected_production_line_code: 'P8-LINE-B', line_selection_status: 'READY' }) });
  });

  await page.goto('/work-orders/phase8-backup', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('work-order-line-selection-panel')).toBeVisible();
  await expect(page.getByText('P8-LINE-B').first()).toBeVisible();
  await expect(page.getByTestId('work-order-line-selection-panel')).toContainText(/Dây chuyền chính bị chặn|Primary Line blocked|Primary Line/i);
  await expect(page.getByTestId('line-result-primary')).toContainText(/Capacity|capacity|trùng|予約|충돌/i);
  await expect(page.getByTestId('line-operation-feasibility-matrix')).toBeVisible();
  await expect(page.getByTestId('line-operation-primary-OP-P8-10')).toContainText(/0 \/ 1/);
  await expect(page.getByTestId('line-operation-backup-OP-P8-10')).toContainText(/1 \/ 1/);
  await expect(page.getByTestId('line-replan-button')).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('work-order-line-selection-panel')).toContainText('P8-LINE-B');
  await page.getByTestId('line-replan-button').click();
  await page.getByPlaceholder(/reason|lý do|理由|사유/i).fill('Phase 8 browser replan');
  await page.getByTestId('line-replan-confirm-button').click();
  await expect.poll(() => replanBody?.reason).toBe('Phase 8 browser replan');
  await expect(page.getByTestId('work-order-line-selection-panel')).not.toContainText('line-backup-hidden-id');
});

test('[@phase8] Resource Hold page translates line blockers and hides replan from unauthorized role', async ({ page }) => {
  requireMutationEnvironment();
  await login(page, credentials.viewer);
  await page.route(detailPath, async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(workOrderDetail('hold')) }));

  await page.goto('/work-orders/phase8-hold', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('work-order-line-selection-panel')).toBeVisible();
  await expect(page.getByTestId('line-resource-hold-warning')).toBeVisible();
  await expect(page.getByTestId('line-blocking-reason').first()).not.toContainText('LINE_OPERATION_CAPABILITY_MISSING');
  await expect(page.getByTestId('line-replan-button')).toHaveCount(0);
});

test('[@phase8] Creation UI exposes Auto line selection and started WO blocks in-place line transfer', async ({ page }) => {
  requireMutationEnvironment();
  await page.route('**/api/mes/master-data/production-ready-versions**', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: [{
      item_id: 'item-p8',
      item_code: 'FG-P8',
      item_name: { en: 'Phase 8 FG' },
      item_revision_id: 'rev-p8',
      revision_code: 'A',
      display_code: 'FG-P8-A',
      base_uom_id: 'uom-p8',
      base_uom_code: 'PCS',
      production_version_id: 'pv-p8',
      production_version_code: 'PV-P8',
      production_version_name: { en: 'PV Phase 8' },
      mbom_header_id: 'mbom-p8',
      mbom_code: 'MBOM-P8',
      routing_header_id: 'rt-p8',
      routing_code: 'RT-P8',
      site_id: 'site-p8',
      site_code: 'SITE-P8',
      readiness_status: 'Ready',
    }] }),
  }));
  await page.route('**/api/mes/master-data/shifts**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ master_id: 'shift-p8', code: 'DAY', name: { en: 'Day' }, site_id: 'site-p8', lifecycle_status: 'Released' }] }) }));
  await page.route('**/api/mes/execution/work-order-code-preview', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ preview_code: 'WO-P8-0001' }) }));
  await login(page, credentials.manager);
  const productResponse = page.waitForResponse((response) => response.url().includes('/api/mes/master-data/production-ready-versions') && response.request().method() === 'GET');
  await page.getByRole('textbox', { name: /Production Version|Phiên bản sản xuất|生産バージョン|생산 버전/i }).fill('PV Phase 8');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await productResponse).ok(), { timeout: 15_000 }).toBeTruthy();
  const selectedConfiguration = page.getByText(/Cấu hình sản xuất đã chọn|Selected configuration/i);
  if (!(await selectedConfiguration.isVisible().catch(() => false))) {
    const productOption = page.getByRole('listbox').locator('[role="option"]').filter({ hasText: /PV Phase 8|PV-P8/i }).first();
    await expect(productOption).toBeVisible({ timeout: 15_000 });
    await productOption.click();
  }
  await expect(selectedConfiguration).toBeVisible();
  await expect(page.getByText(/Tự động|Auto Selection/i).first()).toBeVisible();
  await expect(page.getByText(/một dây chuyền hoàn chỉnh|one complete Production Line/i).first()).toBeVisible();

  await page.route(/\/api\/mes\/execution\/work-orders\/phase8-started$/, async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(workOrderDetail('started')) }));
  await page.goto('/work-orders/phase8-started', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('work-order-line-selection-panel')).toBeVisible();
  await expect(page.getByTestId('line-replan-button')).toHaveCount(0);
  await expect(page.getByText(/Execution Segment|Child WO|chuyển dây chuyền một phần/i)).toBeVisible();
});
