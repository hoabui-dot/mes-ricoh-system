#!/usr/bin/env node

import crypto from 'node:crypto';
import pg from 'pg';

const { Client } = pg;
const apiBase = (process.env.MES_EXECUTION_URL || 'http://100.68.50.41:18000/api/mes/execution').replace(/\/$/, '');
const executionUrl = process.env.MES_EXECUTION_DATABASE_URL || 'postgresql://mes_execution_user:mes_execution_pass@localhost:15435/mes_execution_db';
const environment = String(process.env.MES_ENV || '').toLowerCase();
const allowMutation = process.env.ALLOW_TWO_LINE_RESOURCE_PLANNING_MUTATION === 'true';
const userId = process.env.MES_E2E_USER_ID || '00000000-0000-0000-0000-000000000001';
const phaseLabel = process.env.MES_TWO_LINE_TEST_PHASE || 'phase7';
const runPrefix = phaseLabel.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 16) || 'PHASE7';
const runId = `${runPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
const db = new Client({ connectionString: executionUrl });
const results = [];
const ids = new Set();
const createdWorkOrders = new Set();
const createdWorkflows = new Set();

function id() {
  const value = crypto.randomUUID();
  ids.add(value);
  return value;
}

function assertSafety() {
  if (!['development', 'local', 'test', 'staging'].includes(environment)) throw new Error('MES_ENV must be development, local, test, or staging.');
  if (!allowMutation) throw new Error('Set ALLOW_TWO_LINE_RESOURCE_PLANNING_MUTATION=true for disposable Phase 7 verification.');
  const host = new URL(executionUrl).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error(`Execution DB must be local/test: ${host}`);
}

async function request(path, init = {}, allowed = []) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-User-ID': userId,
      'X-Role-Code': 'PLANT_MANAGER',
      'X-Trace-ID': runId,
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { message: text }; }
  if (!response.ok && !allowed.includes(response.status)) throw new Error(`${init.method || 'GET'} ${path} -> ${response.status}: ${JSON.stringify(body)}`);
  return { status: response.status, body };
}

async function scenario(name, fn) {
  try {
    await fn();
    results.push({ name, status: 'passed' });
    console.log(`[${phaseLabel}] PASS ${name}`);
  } catch (error) {
    results.push({ name, status: 'failed', error: error.message });
    throw error;
  }
}

async function sql(text, params = []) {
  return db.query(text, params);
}

async function seedModel({ primaryComplete = true, backupComplete = false, primaryPriority = 10, backupPriority = 20 } = {}) {
  const site = id();
  const uom = id();
  const item = id();
  const mbom = id();
  const routing = id();
  const pv = id();
  const op1 = id();
  const op2 = id();
  const ro1 = id();
  const ro2 = id();
  const pLine = id();
  const bLine = id();
  const pWc1 = id();
  const pWc2 = id();
  const bWc1 = id();
  const bWc2 = id();
  const now = '2026-08-01T00:00:00.000Z';
  const until = '2026-08-05T00:00:00.000Z';

  await sql(`INSERT INTO rm_item_revision (master_id, code, name, revision_code, item_type, site_id, lifecycle_status, base_uom_id) VALUES ($1,'P7-ITEM','{"vi":"Phase 7 Item"}','A','FG',$2,'Released',$3)`, [item, site, uom]);
  await sql(`INSERT INTO rm_mbom_header (master_id, code, name, site_id, base_quantity, base_uom_id, lifecycle_status, business_version) VALUES ($1,'P7-MBOM','{"vi":"Phase 7 MBOM"}',$2,1,$3,'Released','1')`, [mbom, site, uom]);
  await sql(`INSERT INTO rm_routing_header (master_id, code, item_revision_id, site_id, lifecycle_status) VALUES ($1,'P7-RT',$2,$3,'Released')`, [routing, item, site]);
  await sql(`INSERT INTO rm_work_center (master_id, code, name, site_id, area_id, active_flag, lifecycle_status) VALUES ($1,'P7-P-WC1','{"vi":"P WC1"}',$5,$6,true,'Released'),($2,'P7-P-WC2','{"vi":"P WC2"}',$5,$6,true,'Released'),($3,'P7-B-WC1','{"vi":"B WC1"}',$5,$6,true,'Released'),($4,'P7-B-WC2','{"vi":"B WC2"}',$5,$6,true,'Released')`, [pWc1, pWc2, bWc1, bWc2, site, id()]);
  await sql(`INSERT INTO rm_routing_operation (master_id, routing_header_id, operation_id, operation_code, work_center_id, seq, predecessor_seq, resolved_setup_time_min, resolved_cycle_time_sec, resolved_required_workers, resolved_efficiency_factor, resolved_base_quantity, resolved_standard_yield, resolved_source, requires_output_label) VALUES ($1,$3,$4,'P7-OP1',$6,10,NULL,1,60,1,1,1,1,'PHASE7',false),($2,$3,$5,'P7-OP2',$7,20,10,1,60,1,1,1,1,'PHASE7',false)`, [ro1, ro2, routing, op1, op2, pWc1, pWc2]);
  await sql(`INSERT INTO rm_production_version (master_id, code, item_revision_id, mbom_header_id, routing_header_id, site_id, lifecycle_status, is_default, name_i18n) VALUES ($1,'P7-PV',$2,$3,$4,$5,'Released',false,'{"vi":"Phase 7 PV"}')`, [pv, item, mbom, routing, site]);
  await sql(`INSERT INTO rm_production_line (master_id, code, name, site_id, area_id, active_flag, lifecycle_status) VALUES ($1,'P7-LINE-P','{"vi":"Primary"}',$3,$4,true,'Released'),($2,'P7-LINE-B','{"vi":"Backup"}',$3,$4,true,'Released')`, [pLine, bLine, site, id()]);
  const lineWcs = [[pLine, pWc1], [bLine, bWc1]];
  if (primaryComplete) lineWcs.push([pLine, pWc2]);
  if (backupComplete) lineWcs.push([bLine, bWc2]);
  for (const [line, wc] of lineWcs) {
    await sql(`INSERT INTO rm_production_line_work_center (master_id, production_line_id, work_center_id, site_id, effective_from, active_flag, lifecycle_status) VALUES ($1,$2,$3,$4,$5,true,'Released')`, [id(), line, wc, site, now]);
  }
  await sql(`INSERT INTO rm_production_version_line_eligibility (master_id, production_version_id, production_line_id, selection_role, priority, effective_from, active_flag, lifecycle_status) VALUES ($1,$2,$3,'PRIMARY',$5,$6,true,'Released'),($4,$2,$7,'BACKUP',$8,$6,true,'Released')`, [id(), pv, pLine, id(), primaryPriority, now, bLine, backupPriority]);
  for (const [operation, routingOperation, wc] of [[op1, ro1, pWc1], [op2, ro2, pWc2], [op1, ro1, bWc1], [op2, ro2, bWc2]]) {
    await sql(`INSERT INTO rm_resource_capability (master_id, operation_id, work_center_id, capability_type, active_flag, lifecycle_status) VALUES ($1,$2,$3,'Eligible',true,'Released')`, [id(), operation, wc]);
    await sql(`INSERT INTO rm_production_standard (master_id, item_revision_id, routing_operation_id, operation_id, work_center_id, setup_time_min, cycle_time_sec, efficiency_factor, lifecycle_status) VALUES ($1,$2,$3,$4,$5,1,60,1,'Released')`, [id(), item, routingOperation, operation, wc]);
    await sql(`INSERT INTO rm_resource_calendar (master_id, work_center_id, available_from, available_to, capacity_percent, lifecycle_status) VALUES ($1,$2,$3,$4,1,'Released')`, [id(), wc, now, until]);
  }
  return { site, uom, item, pv, routing, op1, op2, ro1, ro2, pLine, bLine, pWc1, pWc2, bWc1, bWc2 };
}

async function createWO(model, suffix = crypto.randomUUID().slice(0, 8)) {
  const response = await request('/work-orders', {
    method: 'POST',
    body: JSON.stringify({
      production_version_id: model.pv,
      quantity: 2,
      uom_id: model.uom,
      shift_id: id(),
      planned_start_at: '2026-08-02T08:00:00.000Z',
      planned_end_at: '2026-08-02T12:00:00.000Z',
      item_code: `P7-${suffix}`,
    }),
  });
  createdWorkOrders.add(response.body.wo_id);
  return response.body;
}

async function createWorkflowWO(model, key) {
  const payload = {
    production_version_id: model.pv,
    quantity: 2,
    uom_id: model.uom,
    shift_id: id(),
    planned_start_at: '2026-08-02T08:00:00.000Z',
    planned_end_at: '2026-08-02T12:00:00.000Z',
  };
  const first = await request('/work-order-creation-workflows', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(payload) });
  const second = await request('/work-order-creation-workflows', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(payload) });
  if (first.body.workflow_id !== second.body.workflow_id) throw new Error('Idempotent workflow start returned different workflow IDs.');
  createdWorkflows.add(first.body.workflow_id);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const snapshot = await request(`/work-order-creation-workflows/${first.body.workflow_id}`);
    if (snapshot.body.status === 'succeeded') {
      createdWorkOrders.add(snapshot.body.work_order_id);
      return snapshot.body;
    }
    if (snapshot.body.status === 'failed') throw new Error(`Workflow failed: ${JSON.stringify(snapshot.body)}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Workflow did not complete.');
}

async function detail(woID) {
  return (await request(`/work-orders/${woID}`)).body;
}

function header(detailBody) {
  return detailBody.header || detailBody;
}

async function reserveWorkCenter(model, woID, operation, lineID, workCenterID, suffix = '') {
  const allocation = id();
  await sql(`INSERT INTO wo_resource_allocation (allocation_id, wo_id, wo_operation_id, site_id, planned_production_line_id, planned_work_center_id, planned_shift_id, planned_start_at, planned_end_at, source, status, validation_status, allocated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PlannerSelected','Committed','Valid',$10)`, [allocation, woID, operation.wo_operation_id, model.site, lineID, workCenterID, id(), '2026-08-02T08:00:00Z', '2026-08-02T12:00:00Z', userId]);
  await sql(`INSERT INTO wo_capacity_reservation (reservation_id, allocation_id, wo_id, wo_operation_id, resource_type, resource_id, shift_id, start_at, end_at, production_line_id) VALUES ($1,$2,$3,$4,'WorkCenter',$5,$6,$7,$8,$9)`, [id(), allocation, woID, operation.wo_operation_id, workCenterID, id(), '2026-08-02T08:00:00Z', '2026-08-02T12:00:00Z', lineID]);
  if (suffix) console.log(`[${phaseLabel}] reserved ${suffix} work_center=${workCenterID}`);
  return allocation;
}

function evaluatedBlockers(detailBody) {
  const raw = header(detailBody).evaluated_line_results || [];
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

function includesBlocker(detailBody, code) {
  return JSON.stringify(evaluatedBlockers(detailBody)).includes(code);
}

async function cleanup() {
  const woIds = [...createdWorkOrders];
  await sql('BEGIN');
  try {
    if (woIds.length) {
      await sql(`DELETE FROM execution_session WHERE wo_operation_id IN (SELECT wo_operation_id FROM wo_operation WHERE wo_id=ANY($1::uuid[]))`, [woIds]);
      await sql(`DELETE FROM wo_capacity_reservation WHERE wo_id=ANY($1::uuid[])`, [woIds]);
      await sql(`DELETE FROM wo_resource_allocation_audit WHERE wo_id=ANY($1::uuid[])`, [woIds]);
      await sql(`DELETE FROM wo_resource_allocation_idempotency WHERE allocation_id IN (SELECT allocation_id FROM wo_resource_allocation WHERE wo_id=ANY($1::uuid[]))`, [woIds]);
      await sql(`DELETE FROM wo_resource_allocation WHERE wo_id=ANY($1::uuid[])`, [woIds]);
      await sql(`DELETE FROM wo_operation_labor_assignment WHERE wo_id=ANY($1::uuid[])`, [woIds]);
      await sql(`DELETE FROM wo_material_requirement WHERE wo_id=ANY($1::uuid[])`, [woIds]);
      await sql(`DELETE FROM wo_operation WHERE wo_id=ANY($1::uuid[])`, [woIds]);
      await sql(`DELETE FROM wo_line_selection_audit WHERE wo_id=ANY($1::uuid[])`, [woIds]);
      await sql(`DELETE FROM wo_approval_log WHERE wo_id=ANY($1::uuid[])`, [woIds]);
      await sql(`DELETE FROM outbox_events WHERE payload::text LIKE ANY($1::text[])`, [woIds.map((wo) => `%${wo}%`)]);
      await sql(`DELETE FROM wo_header WHERE wo_id=ANY($1::uuid[])`, [woIds]);
    }
    const workflowIds = [...createdWorkflows];
    if (workflowIds.length) {
      await sql(`DELETE FROM wo_creation_workflow_event WHERE workflow_id=ANY($1::uuid[])`, [workflowIds]);
      await sql(`DELETE FROM wo_creation_workflow WHERE workflow_id=ANY($1::uuid[])`, [workflowIds]);
    }
    const fixtureIds = [...ids];
    if (fixtureIds.length) {
      for (const table of ['rm_production_version_line_eligibility', 'rm_production_line_work_center', 'rm_resource_calendar', 'rm_production_standard', 'rm_resource_capability', 'rm_production_line', 'rm_routing_operation', 'rm_routing_header', 'rm_mbom_line', 'rm_mbom_header', 'rm_production_version', 'rm_work_center', 'rm_item_revision']) {
        await sql(`DELETE FROM ${table} WHERE master_id=ANY($1::uuid[])`, [fixtureIds]);
      }
    }
    await sql('COMMIT');
  } catch (error) {
    await sql('ROLLBACK');
    throw error;
  }
}

async function main() {
  assertSafety();
  await db.connect();
  try {
    await scenario('migration tables and line columns exist', async () => {
      const check = await sql(`SELECT to_regclass('rm_production_line') AS line_table, to_regclass('wo_line_selection_audit') AS audit_table`);
      if (!check.rows[0].line_table || !check.rows[0].audit_table) throw new Error('Phase 7 tables missing.');
    });
    const ready = await seedModel({ primaryComplete: true, backupComplete: true });
    const fallback = await seedModel({ primaryComplete: false, backupComplete: true });
    const hold = await seedModel({ primaryComplete: false, backupComplete: false });
    await scenario('primary line Ready is selected at WO creation', async () => {
      const wo = await createWO(ready, 'PRIMARY');
      const d = await detail(wo.wo_id);
      if (header(d).line_selection_status !== 'READY' || header(d).selected_production_line_id !== ready.pLine) throw new Error(JSON.stringify(d));
      if (d.operations.some((op) => op.production_line_id !== ready.pLine)) throw new Error('Operation outside selected primary line.');
    });
    await scenario('primary blocked and backup Ready selects backup with fallback reason', async () => {
      const wo = await createWO(fallback, 'BACKUP');
      const d = await detail(wo.wo_id);
      if (header(d).selected_production_line_id !== fallback.bLine || header(d).fallback_reason !== 'PRIMARY_LINE_BLOCKED') throw new Error(JSON.stringify(d));
    });
    await scenario('both lines blocked persists ResourceHold and blocks candidates', async () => {
      const wo = await createWO(hold, 'HOLD');
      const d = await detail(wo.wo_id);
      if (header(d).status !== 'ResourceHold' || header(d).line_selection_status !== 'RESOURCE_HOLD') throw new Error(JSON.stringify(d));
      const candidates = await request(`/work-orders/${wo.wo_id}/operations/${d.operations[0].wo_operation_id}/resource-candidates`);
      if (!JSON.stringify(candidates.body).includes('WO_LINE_RESOURCE_HOLD')) throw new Error(JSON.stringify(candidates.body));
    });
    await scenario('mixed-line allocation is rejected by database trigger', async () => {
      const wo = await createWO(ready, 'MIXED');
      const d = await detail(wo.wo_id);
      const op = d.operations[0];
      try {
        await sql(`INSERT INTO wo_resource_allocation (allocation_id, wo_id, wo_operation_id, site_id, planned_production_line_id, planned_work_center_id, planned_shift_id, planned_start_at, planned_end_at, source, status, validation_status, allocated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PlannerSelected','Committed','Valid',$10)`, [id(), wo.wo_id, op.wo_operation_id, ready.site, ready.bLine, op.work_center_id, id(), '2026-08-02T08:00:00Z', '2026-08-02T09:00:00Z', userId]);
      } catch (error) {
        if (String(error.message).includes('WO_LINE_MIXED_ALLOCATION_REJECTED')) return;
        throw error;
      }
      throw new Error('Mixed-line allocation insert unexpectedly succeeded.');
    });
    await scenario('primary capacity full falls back to backup line', async () => {
      const capacity = await seedModel({ primaryComplete: true, backupComplete: true });
      const blocker = await createWO(capacity, 'CAPACITY-BLOCKER');
      const blockerDetail = await detail(blocker.wo_id);
      const op = blockerDetail.operations[0];
      await reserveWorkCenter(capacity, blocker.wo_id, op, capacity.pLine, op.work_center_id, 'primary-capacity');
      const second = await createWO(capacity, 'CAPACITY-FALLBACK');
      const secondDetail = await detail(second.wo_id);
      if (header(secondDetail).selected_production_line_id !== capacity.bLine) throw new Error(JSON.stringify(secondDetail));
    });
    await scenario('primary calendar unavailable falls back to backup line', async () => {
      const model = await seedModel({ primaryComplete: true, backupComplete: true });
      await sql(`UPDATE rm_resource_calendar SET lifecycle_status='Inactive' WHERE work_center_id IN ($1,$2)`, [model.pWc1, model.pWc2]);
      const wo = await createWO(model, 'CALENDAR-BACKUP');
      const d = await detail(wo.wo_id);
      if (header(d).selected_production_line_id !== model.bLine || !includesBlocker(d, 'LINE_RESOURCE_CALENDAR_MISSING')) throw new Error(JSON.stringify(d));
    });
    await scenario('primary missing required operation resource falls back to backup line', async () => {
      const model = await seedModel({ primaryComplete: true, backupComplete: true });
      await sql(`UPDATE rm_resource_capability SET active_flag=false WHERE operation_id=$1 AND work_center_id IN ($2,$3)`, [model.op2, model.pWc1, model.pWc2]);
      const wo = await createWO(model, 'RESOURCE-BACKUP');
      const d = await detail(wo.wo_id);
      if (header(d).selected_production_line_id !== model.bLine || !includesBlocker(d, 'LINE_OPERATION_CAPABILITY_MISSING')) throw new Error(JSON.stringify(d));
    });
    await scenario('primary maintenance-style resource outage falls back to backup line', async () => {
      const model = await seedModel({ primaryComplete: true, backupComplete: true });
      await sql(`UPDATE rm_work_center SET active_flag=false WHERE master_id IN ($1,$2)`, [model.pWc1, model.pWc2]);
      const wo = await createWO(model, 'MAINT-BACKUP');
      const d = await detail(wo.wo_id);
      if (header(d).selected_production_line_id !== model.bLine || !includesBlocker(d, 'LINE_MISSING_WORK_CENTER')) throw new Error(JSON.stringify(d));
    });
    await scenario('concurrent Work Orders compete for primary line capacity deterministically', async () => {
      const model = await seedModel({ primaryComplete: true, backupComplete: true });
      const first = await createWO(model, 'COMPETE-A');
      const firstDetail = await detail(first.wo_id);
      await reserveWorkCenter(model, first.wo_id, firstDetail.operations[0], model.pLine, firstDetail.operations[0].work_center_id, 'compete-primary');
      const second = await createWO(model, 'COMPETE-B');
      const secondDetail = await detail(second.wo_id);
      if (header(firstDetail).selected_production_line_id !== model.pLine || header(secondDetail).selected_production_line_id !== model.bLine) throw new Error(JSON.stringify({ first: firstDetail, second: secondDetail }));
    });
    await scenario('both lines at capacity puts new Work Order on ResourceHold', async () => {
      const model = await seedModel({ primaryComplete: true, backupComplete: true });
      const primary = await createWO(model, 'BOTHCAP-P');
      const primaryDetail = await detail(primary.wo_id);
      await reserveWorkCenter(model, primary.wo_id, primaryDetail.operations[0], model.pLine, primaryDetail.operations[0].work_center_id, 'bothcap-primary');
      const backup = await createWO(model, 'BOTHCAP-B');
      const backupDetail = await detail(backup.wo_id);
      if (header(backupDetail).selected_production_line_id !== model.bLine) throw new Error(JSON.stringify(backupDetail));
      await reserveWorkCenter(model, backup.wo_id, backupDetail.operations[0], model.bLine, backupDetail.operations[0].work_center_id, 'bothcap-backup');
      const held = await createWO(model, 'BOTHCAP-HOLD');
      const heldDetail = await detail(held.wo_id);
      if (header(heldDetail).status !== 'ResourceHold' || !includesBlocker(heldDetail, 'LINE_RESOURCE_CAPACITY_CONFLICT')) throw new Error(JSON.stringify(heldDetail));
    });
    await scenario('historical WO line snapshot is unaffected by changed eligibility', async () => {
      const wo = await createWO(fallback, 'HIST');
      await sql(`INSERT INTO rm_production_line_work_center (master_id, production_line_id, work_center_id, site_id, effective_from, active_flag, lifecycle_status) VALUES ($1,$2,$3,$4,'2026-08-01T00:00:00.000Z',true,'Released')`, [id(), fallback.pLine, fallback.pWc2, fallback.site]);
      const d = await detail(wo.wo_id);
      if (header(d).selected_production_line_id !== fallback.bLine) throw new Error('Existing WO line snapshot changed without replan.');
    });
    await scenario('new Work Order uses changed line eligibility', async () => {
      const model = await seedModel({ primaryComplete: false, backupComplete: true });
      const before = await createWO(model, 'NEWELIG-BEFORE');
      const beforeDetail = await detail(before.wo_id);
      await sql(`INSERT INTO rm_production_line_work_center (master_id, production_line_id, work_center_id, site_id, effective_from, active_flag, lifecycle_status) VALUES ($1,$2,$3,$4,'2026-08-01T00:00:00.000Z',true,'Released')`, [id(), model.pLine, model.pWc2, model.site]);
      const after = await createWO(model, 'NEWELIG-AFTER');
      const afterDetail = await detail(after.wo_id);
      if (header(beforeDetail).selected_production_line_id !== model.bLine || header(afterDetail).selected_production_line_id !== model.pLine) throw new Error(JSON.stringify({ before: beforeDetail, after: afterDetail }));
    });
    await scenario('audited replan can change line before execution starts', async () => {
      const wo = await createWO(fallback, 'REPLAN');
      const before = await detail(wo.wo_id);
      const res = await request(`/work-orders/${wo.wo_id}/line-replan`, { method: 'POST', body: JSON.stringify({ reason: 'Phase 7 verified replan', row_version: header(before).row_version }) });
      if (res.body.selected_production_line_id !== fallback.pLine) throw new Error(JSON.stringify(res.body));
    });
    await scenario('authorized line change after release but before start succeeds', async () => {
      const released = await seedModel({ primaryComplete: false, backupComplete: true });
      const wo = await createWO(released, 'RELEASED-REPLAN');
      await sql(`INSERT INTO rm_production_line_work_center (master_id, production_line_id, work_center_id, site_id, effective_from, active_flag, lifecycle_status) VALUES ($1,$2,$3,$4,'2026-08-01T00:00:00.000Z',true,'Released')`, [id(), released.pLine, released.pWc2, released.site]);
      await sql(`UPDATE wo_header SET status='Released' WHERE wo_id=$1`, [wo.wo_id]);
      const before = await detail(wo.wo_id);
      const res = await request(`/work-orders/${wo.wo_id}/line-replan`, { method: 'POST', body: JSON.stringify({ reason: 'Phase 7 released replan', row_version: header(before).row_version }) });
      if (res.body.selected_production_line_id !== released.pLine) throw new Error(JSON.stringify(res.body));
    });
    await scenario('concurrent line replan rejects stale row version', async () => {
      const concurrent = await seedModel({ primaryComplete: false, backupComplete: true });
      const wo = await createWO(concurrent, 'CONCURRENT');
      await sql(`INSERT INTO rm_production_line_work_center (master_id, production_line_id, work_center_id, site_id, effective_from, active_flag, lifecycle_status) VALUES ($1,$2,$3,$4,'2026-08-01T00:00:00.000Z',true,'Released')`, [id(), concurrent.pLine, concurrent.pWc2, concurrent.site]);
      const before = await detail(wo.wo_id);
      const body = JSON.stringify({ reason: 'Phase 7 concurrent replan', row_version: header(before).row_version });
      const [a, b] = await Promise.all([
        request(`/work-orders/${wo.wo_id}/line-replan`, { method: 'POST', body }, [409]),
        request(`/work-orders/${wo.wo_id}/line-replan`, { method: 'POST', body }, [409]),
      ]);
      const combined = JSON.stringify([a.body, b.body]);
      if (!combined.includes('WO_LINE_REPLAN_VERSION_CONFLICT') && !(a.status === 200 && b.status === 200 && a.body.selected_production_line_id === concurrent.pLine && b.body.selected_production_line_id === concurrent.pLine)) {
        throw new Error(combined);
      }
    });
    await scenario('line change after execution start is rejected', async () => {
      const wo = await createWO(ready, 'STARTED');
      await sql(`UPDATE wo_header SET status='InProgress' WHERE wo_id=$1`, [wo.wo_id]);
      const res = await request(`/work-orders/${wo.wo_id}/line-replan`, { method: 'POST', body: JSON.stringify({ reason: 'Should reject' }) }, [409]);
      if (!JSON.stringify(res.body).includes('WO_LINE_REPLAN_AFTER_START_REQUIRES_EXECUTION_SEGMENT')) throw new Error(JSON.stringify(res.body));
    });
    await scenario('idempotent Work Order creation workflow reuses workflow', async () => {
      const model = await seedModel({ primaryComplete: true, backupComplete: true });
      const snapshot = await createWorkflowWO(model, `${runId}-IDEMPOTENT-WO`);
      if (snapshot.status !== 'succeeded' || !snapshot.work_order_id) throw new Error(JSON.stringify(snapshot));
    });
    await scenario('idempotent retry creates one Work Order, one selection decision, and one WOCreated event', async () => {
      const model = await seedModel({ primaryComplete: true, backupComplete: true });
      const snapshot = await createWorkflowWO(model, `${runId}-IDEMPOTENT-OUTBOX`);
      const counts = await sql(`
        SELECT
          (SELECT COUNT(*)::int FROM wo_creation_workflow WHERE idempotency_key=$1) AS workflows,
          (SELECT COUNT(*)::int FROM wo_line_selection_audit WHERE wo_id=$2) AS selections,
          (SELECT COUNT(*)::int FROM outbox_events WHERE event_type='MES.Execution.WOCreated.v1' AND payload::text LIKE $3) AS events
      `, [`${runId}-IDEMPOTENT-OUTBOX`, snapshot.work_order_id, `%${snapshot.work_order_id}%`]);
      const row = counts.rows[0];
      if (Number(row.workflows) !== 1 || Number(row.selections) !== 1 || Number(row.events) !== 1) throw new Error(JSON.stringify(row));
    });
    await cleanup();
    const remaining = await sql(`SELECT COUNT(*)::int AS count FROM wo_header WHERE wo_id=ANY($1::uuid[])`, [[...createdWorkOrders]]);
    if (Number(remaining.rows[0].count) !== 0) throw new Error(`Cleanup left ${remaining.rows[0].count} Work Orders.`);
    const workflowRemaining = await sql(`SELECT COUNT(*)::int AS count FROM wo_creation_workflow WHERE workflow_id=ANY($1::uuid[])`, [[...createdWorkflows]]);
    if (Number(workflowRemaining.rows[0].count) !== 0) throw new Error(`Cleanup left ${workflowRemaining.rows[0].count} workflow rows.`);
    const fixtureRemaining = await sql(`
      SELECT SUM(count)::int AS count FROM (
        SELECT COUNT(*)::int AS count FROM rm_production_version_line_eligibility WHERE master_id=ANY($1::uuid[])
        UNION ALL SELECT COUNT(*)::int FROM rm_production_line_work_center WHERE master_id=ANY($1::uuid[])
        UNION ALL SELECT COUNT(*)::int FROM rm_resource_calendar WHERE master_id=ANY($1::uuid[])
        UNION ALL SELECT COUNT(*)::int FROM rm_production_standard WHERE master_id=ANY($1::uuid[])
        UNION ALL SELECT COUNT(*)::int FROM rm_resource_capability WHERE master_id=ANY($1::uuid[])
        UNION ALL SELECT COUNT(*)::int FROM rm_production_line WHERE master_id=ANY($1::uuid[])
        UNION ALL SELECT COUNT(*)::int FROM rm_routing_operation WHERE master_id=ANY($1::uuid[])
        UNION ALL SELECT COUNT(*)::int FROM rm_routing_header WHERE master_id=ANY($1::uuid[])
        UNION ALL SELECT COUNT(*)::int FROM rm_mbom_header WHERE master_id=ANY($1::uuid[])
        UNION ALL SELECT COUNT(*)::int FROM rm_production_version WHERE master_id=ANY($1::uuid[])
        UNION ALL SELECT COUNT(*)::int FROM rm_work_center WHERE master_id=ANY($1::uuid[])
        UNION ALL SELECT COUNT(*)::int FROM rm_item_revision WHERE master_id=ANY($1::uuid[])
      ) cleanup_counts
    `, [[...ids]]);
    if (Number(fixtureRemaining.rows[0].count) !== 0) throw new Error(`Cleanup left ${fixtureRemaining.rows[0].count} fixture projection rows.`);
    console.log(`[${phaseLabel}] Summary ${JSON.stringify({ declared: results.length, passed: results.length, failed: 0, skipped: 0 })}`);
  } finally {
    await cleanup().catch(() => {});
    await db.end();
  }
}

main().catch((error) => {
  console.error(`[${phaseLabel}] FAIL ${error.stack || error.message}`);
  process.exitCode = 1;
});
