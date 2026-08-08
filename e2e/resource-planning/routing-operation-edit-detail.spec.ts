import { Pool } from 'pg';
import { test, expect } from '@playwright/test';
import { apiJson, credentials, login } from './phase3-helpers';

const createdRoutingIds: string[] = [];

test.afterAll(async () => {
  if (!createdRoutingIds.length) return;
  const connectionString = process.env.MES_MASTER_DATA_DATABASE_URL;
  if (!connectionString) throw new Error('MES_MASTER_DATA_DATABASE_URL is required for Routing E2E cleanup');
  const db = new Pool({ connectionString });
  try {
    await db.query('BEGIN');
    await db.query(`DELETE FROM md_operation_skill_requirement WHERE routing_operation_id IN (SELECT master_id FROM md_routing_operation WHERE routing_header_id = ANY($1::uuid[]))`, [createdRoutingIds]);
    await db.query(`DELETE FROM md_production_standard WHERE routing_operation_id IN (SELECT master_id FROM md_routing_operation WHERE routing_header_id = ANY($1::uuid[]))`, [createdRoutingIds]);
    await db.query(`DELETE FROM md_routing_operation WHERE routing_header_id = ANY($1::uuid[])`, [createdRoutingIds]);
    await db.query(`DELETE FROM md_routing_header WHERE master_id = ANY($1::uuid[])`, [createdRoutingIds]);
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    await db.end();
  }
});

test('Routing edit preserves operation IDs and detail returns resolved planning facts', async ({ page, request }) => {
  const session = await login(page, credentials.manager);
  const operationResult = await apiJson(request, session.base, '/api/mes/master-data/operations?limit=100', { headers: session.headers });
  const workCenterResult = await apiJson(request, session.base, '/api/mes/master-data/work-centers?limit=100', { headers: session.headers });
  const operations = operationResult.body.filter((row: any) => !['Inactive', 'Obsolete'].includes(row.lifecycle_status)).slice(0, 2);
  const workCenter = workCenterResult.body.find((row: any) => row.active_flag !== false && !['Inactive', 'Obsolete'].includes(row.lifecycle_status));
  expect(operations).toHaveLength(2);
  expect(workCenter).toBeTruthy();

  const routing = await apiJson(request, session.base, '/api/mes/master-data/routing-headers', {
    method: 'POST', headers: session.headers,
    data: { name: { vi: 'Routing E2E chỉnh sửa công đoạn', en: 'Routing operation edit E2E' }, routing_type: 'Standard' },
  });
  const routingId = String(routing.body.master_id);
  createdRoutingIds.push(routingId);

  const firstSave = await apiJson(request, session.base, `/api/mes/master-data/routing-headers/${routingId}/operations`, {
    method: 'PUT', headers: session.headers,
    data: { operations: [
      { operation_id: operations[0].master_id, work_center_id: workCenter.master_id, seq: 10, predecessor_seq: null, planning_mode: 'INHERITED' },
      { operation_id: operations[1].master_id, work_center_id: workCenter.master_id, seq: 20, predecessor_seq: 10, planning_mode: 'INHERITED' },
    ] },
  });
  const firstByOperation = new Map(firstSave.body.map((row: any) => [row.operation_id, row]));
  expect(firstByOperation.size).toBe(2);

  const secondSave = await apiJson(request, session.base, `/api/mes/master-data/routing-headers/${routingId}/operations`, {
    method: 'PUT', headers: session.headers,
    data: { operations: [
      { master_id: firstByOperation.get(operations[1].master_id).master_id, operation_id: operations[1].master_id, work_center_id: workCenter.master_id, seq: 10, predecessor_seq: null, planning_mode: 'INHERITED' },
      { master_id: firstByOperation.get(operations[0].master_id).master_id, operation_id: operations[0].master_id, work_center_id: workCenter.master_id, seq: 20, predecessor_seq: 10, planning_mode: 'INHERITED' },
    ] },
  });
  const secondByOperation = new Map(secondSave.body.map((row: any) => [row.operation_id, row]));
  expect(secondByOperation.get(operations[0].master_id).master_id).toBe(firstByOperation.get(operations[0].master_id).master_id);
  expect(secondByOperation.get(operations[1].master_id).master_id).toBe(firstByOperation.get(operations[1].master_id).master_id);

  const detailResult = await apiJson(request, session.base, '/api/mes/master-data/routing-operations?limit=500', { headers: session.headers });
  const detailRows = detailResult.body.filter((row: any) => row.routing_header_id === routingId && !row.effective_to && !['Inactive', 'Obsolete'].includes(row.lifecycle_status));
  expect(detailRows).toHaveLength(2);
  for (const row of detailRows) {
    expect(row.resolved_source).toMatch(/ROUTING_OVERRIDE|WORK_CENTER_STANDARD|OPERATION_DEFAULT|UNRESOLVED/);
    expect(Array.isArray(row.worker_skill_requirements)).toBeTruthy();
    if (row.resolved_source !== 'UNRESOLVED') {
      expect(Number(row.resolved_cycle_time_sec)).toBeGreaterThan(0);
      expect(Number(row.resolved_required_workers)).toBeGreaterThan(0);
      expect(Number(row.estimated_lifecycle_time_sec)).toBeGreaterThan(0);
    }
  }

  await page.goto('/master-data/routings');
  await page.getByRole('textbox', { name: /Tìm kiếm|Search/i }).fill(String(routing.body.code));
  const routingRow = page.getByRole('row').filter({ hasText: String(routing.body.code) });
  await expect(routingRow).toBeVisible();
  await routingRow.getByRole('button', { name: /Chi tiết|Detail/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Thời gian vòng đời ước tính|Estimated lifecycle time/i)).toBeVisible();
  await expect(dialog.getByText(/Số nhân lực yêu cầu|Required workers/i)).toBeVisible();
  await expect(dialog.getByText(/Yêu cầu kỹ năng nhân lực|Worker skill requirements/i)).toBeVisible();
  await expect(dialog).not.toContainText(/Mỗi candidate được đánh giá|Each candidate is evaluated/i);
});
