#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const mode = process.argv[2] || '';
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const artifactDir = path.resolve(process.env.MES_TWO_LINE_UAT_DIR || 'artifacts/mes-two-line-uat');
const manifestPath = path.join(artifactDir, 'uat-fixture-manifest.json');
const beforeStatePath = path.join(artifactDir, 'resource-before-state.json');
const mutatedStatePath = path.join(artifactDir, 'resource-mutated-state.json');
const restoredStatePath = path.join(artifactDir, 'resource-restored-state.json');
const primaryEvidencePath = path.join(artifactDir, 'primary-ready-evidence.json');
const backupEvidencePath = path.join(artifactDir, 'backup-fallback-evidence.json');
const holdEvidencePath = path.join(artifactDir, 'resource-hold-evidence.json');
const apiBase = (process.env.MES_EXECUTION_URL || 'http://100.68.50.41:18000/api/mes/execution').replace(/\/$/, '');
const masterDataBase = (process.env.MES_MASTER_DATA_URL || 'http://100.68.50.41:18000/api/mes/master-data').replace(/\/$/, '');
const executionUrl = process.env.MES_EXECUTION_DATABASE_URL || 'postgresql://mes_execution_user:mes_execution_pass@localhost:15435/mes_execution_db';
const environment = String(process.env.MES_ENV || '').toLowerCase();
const allowMutation = process.env.ALLOW_TWO_LINE_UAT_MUTATION === 'true';
const userId = process.env.MES_E2E_USER_ID || '00000000-0000-0000-0000-000000000001';
const roleCode = process.env.MES_E2E_ROLE_CODE || 'PLANT_MANAGER';
const targetDate = process.env.MES_TWO_LINE_UAT_DATE || '2026-08-03';
const prefix = 'MES-UAT-UI02';
const db = new Client({ connectionString: executionUrl });

function assertSafety() {
  if (!['development', 'local', 'test', 'staging'].includes(environment)) throw new Error('MES_ENV must be development, local, test, or staging.');
  if (!allowMutation) throw new Error('Set ALLOW_TWO_LINE_UAT_MUTATION=true for UI-02 fixture lifecycle.');
  const host = new URL(executionUrl).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error(`Execution DB must be local/test: ${host}`);
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJson(file, fallback = null) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}

async function request(requestPath, init = {}, allowed = []) {
  const response = await fetch(`${apiBase}${requestPath}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-User-ID': userId,
      'X-Role-Code': roleCode,
      'X-Trace-ID': `${prefix}-${mode}`,
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { message: text }; }
  if (!response.ok && !allowed.includes(response.status)) throw new Error(`${init.method || 'GET'} ${requestPath} -> ${response.status}: ${JSON.stringify(body)}`);
  return { status: response.status, body: body?.data ?? body };
}

async function masterData(requestPath) {
  const response = await fetch(`${masterDataBase}${requestPath}`, {
    headers: { 'Content-Type': 'application/json', 'X-User-ID': userId, 'X-Role-Code': roleCode, 'X-Trace-ID': `${prefix}-${mode}` },
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { message: text }; }
  if (!response.ok) throw new Error(`GET ${requestPath} -> ${response.status}: ${JSON.stringify(body)}`);
  return body?.data ?? body;
}

async function discoverModel() {
  const pv = (await db.query(`
    SELECT pv.master_id, pv.code, pv.item_revision_id, pv.site_id, ir.base_uom_id
    FROM rm_production_version pv
    JOIN rm_item_revision ir ON ir.master_id=pv.item_revision_id
    WHERE pv.code='WST-SEED-PV-SEAL-ASM-01' AND pv.lifecycle_status='Released'
  `)).rows[0];
  if (!pv) throw new Error('Canonical WST-SEED two-line Production Version is missing.');
  const shift = (await db.query(`SELECT master_id, code FROM rm_employee_shift_schedule sch RIGHT JOIN rm_employee e ON e.master_id=sch.employee_id, rm_production_version pv WHERE pv.master_id=$1 LIMIT 0`, [pv.master_id]).catch(() => ({ rows: [] })));
  void shift;
  const lineRows = (await db.query(`
    SELECT e.production_line_id, l.code, e.selection_role, e.priority
    FROM rm_production_version_line_eligibility e
    JOIN rm_production_line l ON l.master_id=e.production_line_id
    WHERE e.production_version_id=$1 AND e.active_flag=true AND e.lifecycle_status='Released'
    ORDER BY e.priority
  `, [pv.master_id])).rows;
  const primary = lineRows.find((row) => row.selection_role === 'PRIMARY');
  const backup = lineRows.find((row) => row.selection_role === 'BACKUP');
  if (!primary || !backup) throw new Error(`Expected primary and backup lines, got ${JSON.stringify(lineRows)}`);
  const operations = (await db.query(`
    SELECT ro.master_id AS routing_operation_id, ro.operation_id, ro.operation_code, ro.seq, ro.work_center_id AS source_work_center_id
    FROM rm_routing_operation ro
    JOIN rm_production_version pv ON pv.routing_header_id=ro.routing_header_id
    WHERE pv.master_id=$1
    ORDER BY ro.seq
  `, [pv.master_id])).rows;
  if (operations.length === 0) throw new Error('Canonical WST-SEED routing has no operations.');
  const shifts = await masterData(`/shifts?site_id=${encodeURIComponent(pv.site_id)}&limit=500`);
  const shiftRow = (Array.isArray(shifts) ? shifts : []).find((row) => row.code === 'SHIFT-A' && row.site_id === pv.site_id && row.lifecycle_status !== 'Inactive');
  if (!shiftRow) throw new Error(`Canonical SHIFT-A is missing for site ${pv.site_id}.`);
  const calendars = await calendarRows();
  if (calendars.length < 8) throw new Error(`Expected at least 8 canonical line calendars, got ${calendars.length}`);
  return { production_version: pv, primary_line: primary, backup_line: backup, operations, shift: shiftRow, target_date: targetDate, calendars };
}

async function calendarRows() {
  return (await db.query(`
    SELECT cal.master_id, l.master_id AS production_line_id, l.code AS production_line_code,
           wc.master_id AS work_center_id, wc.code AS work_center_code,
           cal.lifecycle_status, cal.available_from, cal.available_to, cal.capacity_percent
    FROM rm_resource_calendar cal
    JOIN rm_work_center wc ON wc.master_id=cal.work_center_id
    JOIN rm_production_line_work_center lwc ON lwc.work_center_id=wc.master_id AND lwc.active_flag=true
    JOIN rm_production_line l ON l.master_id=lwc.production_line_id
    WHERE l.code IN ('WST-SEED-LINE-1','WST-SEED-LINE-2')
    ORDER BY l.code, wc.code, cal.master_id
  `)).rows;
}

async function restoreCalendars(beforeState) {
  for (const row of beforeState.calendars || []) {
    await db.query(`UPDATE rm_resource_calendar SET lifecycle_status=$2, available_from=$3, available_to=$4, capacity_percent=$5 WHERE master_id=$1`, [row.master_id, row.lifecycle_status, row.available_from, row.available_to, row.capacity_percent]);
  }
}

async function mutateCalendars(lineIds, lifecycleStatus) {
  await db.query(`
    UPDATE rm_resource_calendar cal
       SET lifecycle_status=$2
      FROM rm_production_line_work_center lwc
     WHERE lwc.work_center_id=cal.work_center_id
       AND lwc.production_line_id=ANY($1::uuid[])
       AND lwc.active_flag=true
  `, [lineIds, lifecycleStatus]);
}

async function createWorkflow(model, scenario, idempotencyKey) {
  const payload = {
    production_version_id: model.production_version.master_id,
    quantity: 2,
    uom_id: model.production_version.base_uom_id,
    shift_id: model.shift.master_id,
    planned_start_at: `${targetDate}T08:00:00.000Z`,
    planned_end_at: `${targetDate}T12:00:00.000Z`,
  };
  const first = await request('/work-order-creation-workflows', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(payload) });
  const second = await request('/work-order-creation-workflows', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(payload) });
  if (first.body.workflow_id !== second.body.workflow_id) throw new Error(`${scenario}: idempotent workflow returned different IDs.`);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const snapshot = (await request(`/work-order-creation-workflows/${first.body.workflow_id}`)).body;
    if (snapshot.status === 'succeeded') return { workflow_id: snapshot.workflow_id, work_order_id: snapshot.work_order_id, work_order_code: snapshot.work_order_code };
    if (snapshot.status === 'failed') throw new Error(`${scenario}: workflow failed ${JSON.stringify(snapshot)}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${scenario}: workflow did not complete.`);
}

async function detail(woID) {
  return (await request(`/work-orders/${woID}`)).body;
}

function header(body) {
  return body.header || body;
}

function evaluated(body) {
  const raw = header(body).evaluated_line_results || [];
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

async function cleanupWorkOrders(ids) {
  const woIds = [...new Set((ids || []).filter(Boolean))];
  if (!woIds.length) return { work_orders_removed: 0, remaining_work_orders: 0 };
  const beforeCount = Number((await db.query(`SELECT COUNT(*)::int AS count FROM wo_header WHERE wo_id=ANY($1::uuid[])`, [woIds])).rows[0].count);
  await db.query('BEGIN');
  try {
    const q = (sql) => db.query(sql, [woIds]);
    await q(`DELETE FROM operation_confirmation WHERE wo_operation_id IN (SELECT wo_operation_id FROM wo_operation WHERE wo_id=ANY($1::uuid[]))`);
    await q(`DELETE FROM execution_session WHERE wo_operation_id IN (SELECT wo_operation_id FROM wo_operation WHERE wo_id=ANY($1::uuid[]))`);
    await q(`DELETE FROM material_consumption WHERE wo_id=ANY($1::uuid[]) OR wo_operation_id IN (SELECT wo_operation_id FROM wo_operation WHERE wo_id=ANY($1::uuid[]))`);
    await q(`DELETE FROM wo_print_job_event WHERE print_job_id IN (SELECT print_job_id FROM wo_print_job WHERE wo_id=ANY($1::uuid[]))`);
    await q(`DELETE FROM wo_print_job_attempt WHERE print_job_id IN (SELECT print_job_id FROM wo_print_job WHERE wo_id=ANY($1::uuid[]))`);
    await q(`DELETE FROM wo_capacity_reservation WHERE wo_id=ANY($1::uuid[]) OR allocation_id IN (SELECT allocation_id FROM wo_resource_allocation WHERE wo_id=ANY($1::uuid[]))`);
    await q(`DELETE FROM wo_resource_allocation_audit WHERE wo_id=ANY($1::uuid[]) OR allocation_id IN (SELECT allocation_id FROM wo_resource_allocation WHERE wo_id=ANY($1::uuid[]))`);
    await q(`DELETE FROM wo_resource_allocation_idempotency WHERE allocation_id IN (SELECT allocation_id FROM wo_resource_allocation WHERE wo_id=ANY($1::uuid[]))`);
    await q(`DELETE FROM wo_print_job WHERE wo_id=ANY($1::uuid[])`);
    await q(`DELETE FROM wo_resource_allocation WHERE wo_id=ANY($1::uuid[])`);
    await q(`DELETE FROM wo_operation_labor_assignment WHERE wo_id=ANY($1::uuid[])`);
    await q(`DELETE FROM wo_material_requirement WHERE wo_id=ANY($1::uuid[])`);
    await q(`DELETE FROM wo_operation WHERE wo_id=ANY($1::uuid[])`);
    await q(`DELETE FROM wo_approval_log WHERE wo_id=ANY($1::uuid[])`);
    await q(`DELETE FROM wo_line_selection_audit WHERE wo_id=ANY($1::uuid[])`);
    await q(`DELETE FROM wo_creation_workflow_event WHERE workflow_id IN (SELECT workflow_id FROM wo_creation_workflow WHERE work_order_id=ANY($1::uuid[]))`);
    await q(`DELETE FROM wo_creation_workflow WHERE work_order_id=ANY($1::uuid[])`);
    await db.query(`DELETE FROM outbox_events WHERE payload::text LIKE ANY($1::text[])`, [woIds.map((id) => `%${id}%`)]);
    await q(`DELETE FROM wo_header WHERE wo_id=ANY($1::uuid[])`);
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
  const remaining = Number((await db.query(`SELECT COUNT(*)::int AS count FROM wo_header WHERE wo_id=ANY($1::uuid[])`, [woIds])).rows[0].count);
  return { work_orders_removed: beforeCount, requested_work_order_ids: woIds.length, remaining_work_orders: remaining };
}

async function validateScenario(name, fixture, model) {
  const body = await detail(fixture.work_order_id);
  const h = header(body);
  const lines = evaluated(body);
  const selectedLine = h.selected_production_line_id || '';
  const operationLineIds = (body.operations || []).map((op) => op.production_line_id || '');
  const selectedOperationMismatch = selectedLine ? operationLineIds.some((lineID) => lineID !== selectedLine) : operationLineIds.some(Boolean);
  if (selectedOperationMismatch) throw new Error(`${name}: operation line mismatch ${JSON.stringify(operationLineIds)}`);
  if (name === 'primary-ready') {
    if (h.line_selection_status !== 'READY' || selectedLine !== model.primary_line.production_line_id || h.fallback_reason) throw new Error(`${name}: header mismatch ${JSON.stringify(h)}`);
    if (!lines.some((line) => line.production_line_id === model.primary_line.production_line_id && line.status === 'Ready')) throw new Error(`${name}: primary line not Ready`);
  }
  if (name === 'backup-fallback') {
    if (h.line_selection_status !== 'READY' || selectedLine !== model.backup_line.production_line_id || !h.fallback_reason) throw new Error(`${name}: header mismatch ${JSON.stringify(h)}`);
    if (!lines.some((line) => line.production_line_id === model.primary_line.production_line_id && line.status === 'Blocked')) throw new Error(`${name}: primary line not blocked`);
    if (!lines.some((line) => line.production_line_id === model.backup_line.production_line_id && line.status === 'Ready')) throw new Error(`${name}: backup line not Ready`);
  }
  if (name === 'resource-hold') {
    if (h.line_selection_status !== 'RESOURCE_HOLD' || selectedLine || !JSON.stringify(h.resource_hold_reason || {}).includes('NO_COMPLETE_FEASIBLE_LINE')) throw new Error(`${name}: header mismatch ${JSON.stringify(h)}`);
    if (!lines.some((line) => line.production_line_id === model.primary_line.production_line_id && line.status === 'Blocked')) throw new Error(`${name}: primary line not blocked`);
    if (!lines.some((line) => line.production_line_id === model.backup_line.production_line_id && line.status === 'Blocked')) throw new Error(`${name}: backup line not blocked`);
  }
  if (selectedLine) {
    for (const op of body.operations || []) {
      const candidates = (await request(`/work-orders/${fixture.work_order_id}/operations/${op.wo_operation_id}/resource-candidates?planned_start_at=${encodeURIComponent(op.planned_start_at || `${targetDate}T08:00:00.000Z`)}&shift_id=${encodeURIComponent(model.shift.master_id)}`)).body;
      const serialized = JSON.stringify(candidates);
      if (serialized.includes(model.primary_line.production_line_id) && selectedLine !== model.primary_line.production_line_id) throw new Error(`${name}: candidate leaked primary line`);
      if (serialized.includes(model.backup_line.production_line_id) && selectedLine !== model.backup_line.production_line_id) throw new Error(`${name}: candidate leaked backup line`);
    }
  } else if ((body.operations || [])[0]) {
    const candidates = (await request(`/work-orders/${fixture.work_order_id}/operations/${body.operations[0].wo_operation_id}/resource-candidates`, {}, [409])).body;
    if (!JSON.stringify(candidates).includes('WO_LINE_RESOURCE_HOLD')) throw new Error(`${name}: hold candidates were not blocked`);
  }
  return { header: h, evaluated_line_results: lines, operation_line_ids: operationLineIds };
}

async function prepare() {
  const existing = await readJson(manifestPath);
  if (existing?.fixtures?.length === 3) {
    try {
      await verify(false);
      console.log(JSON.stringify({ success: true, mode: 'prepare', idempotent_reuse: true, manifest: manifestPath }));
      return;
    } catch {
      await cleanup();
    }
  }
  const model = await discoverModel();
  const before = { generated_at: new Date().toISOString(), calendars: await calendarRows() };
  await writeJson(beforeStatePath, before);
  await restoreCalendars(before);
  const fixtures = [];
  const primary = await createWorkflow(model, 'primary-ready', `${prefix}-PRIMARY-READY`);
  fixtures.push({ scenario: 'primary-ready', ...primary });
  await mutateCalendars([model.primary_line.production_line_id], 'Inactive');
  await writeJson(mutatedStatePath, { generated_at: new Date().toISOString(), mutation: 'primary calendars inactive', calendars: await calendarRows() });
  const backup = await createWorkflow(model, 'backup-fallback', `${prefix}-BACKUP-FALLBACK`);
  fixtures.push({ scenario: 'backup-fallback', ...backup });
  await restoreCalendars(before);
  await mutateCalendars([model.primary_line.production_line_id, model.backup_line.production_line_id], 'Inactive');
  const hold = await createWorkflow(model, 'resource-hold', `${prefix}-RESOURCE-HOLD`);
  fixtures.push({ scenario: 'resource-hold', ...hold });
  await restoreCalendars(before);
  const restored = { generated_at: new Date().toISOString(), calendars: await calendarRows() };
  await writeJson(restoredStatePath, restored);
  const manifest = {
    success: true,
    generated_at: new Date().toISOString(),
    api_base: apiBase,
    target_date: targetDate,
    model: {
      production_version: model.production_version,
      primary_line: model.primary_line,
      backup_line: model.backup_line,
      shift: model.shift,
      operation_count: model.operations.length,
    },
    fixtures,
    artifacts: { before_state: beforeStatePath, mutated_state: mutatedStatePath, restored_state: restoredStatePath },
  };
  await writeJson(manifestPath, manifest);
  await verify(false);
  console.log(JSON.stringify({ success: true, mode: 'prepare', manifest: manifestPath, fixtures }, null, 2));
}

async function verify(log = true) {
  const manifest = await readJson(manifestPath);
  if (!manifest?.fixtures?.length) throw new Error('UAT fixture manifest is missing. Run prepare first.');
  const model = await discoverModel();
  const evidence = {};
  for (const fixture of manifest.fixtures) {
    evidence[fixture.scenario] = await validateScenario(fixture.scenario, fixture, model);
  }
  await writeJson(primaryEvidencePath, evidence['primary-ready']);
  await writeJson(backupEvidencePath, evidence['backup-fallback']);
  await writeJson(holdEvidencePath, evidence['resource-hold']);
  const result = { success: true, mode: 'verify', manifest: manifestPath, declared: 3, executed: 3, passed: 3, failed: 0, skipped: 0, evidence };
  if (log) console.log(JSON.stringify(result, null, 2));
  return result;
}

async function cleanup() {
  const manifest = await readJson(manifestPath, {});
  const before = await readJson(beforeStatePath, null);
  if (before) await restoreCalendars(before);
  const ids = (manifest.fixtures || []).map((fixture) => fixture.work_order_id);
  const cleanupResult = await cleanupWorkOrders(ids);
  const restored = { generated_at: new Date().toISOString(), calendars: await calendarRows() };
  await writeJson(restoredStatePath, restored);
  const leaks = await db.query(`
    SELECT
      (SELECT COUNT(*)::int FROM wo_capacity_reservation WHERE wo_id=ANY($1::uuid[])) AS reservations,
      (SELECT COUNT(*)::int FROM wo_resource_allocation WHERE wo_id=ANY($1::uuid[])) AS allocations,
      (SELECT COUNT(*)::int FROM wo_header WHERE wo_id=ANY($1::uuid[])) AS work_orders
  `, [ids.length ? ids : ['00000000-0000-0000-0000-000000000000']]);
  const result = { success: true, mode: 'cleanup', ...cleanupResult, leaks: leaks.rows[0], restored_state: restoredStatePath };
  console.log(JSON.stringify(result, null, 2));
}

assertSafety();
if (!['prepare', 'verify', 'cleanup'].includes(mode)) throw new Error(`Usage: node ${path.relative(repoRoot, process.argv[1])} <prepare|verify|cleanup>`);
await db.connect();
try {
  if (mode === 'prepare') await prepare();
  if (mode === 'verify') await verify();
  if (mode === 'cleanup') await cleanup();
} finally {
  await db.end();
}
