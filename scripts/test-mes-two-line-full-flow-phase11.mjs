#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const artifactDir = path.resolve(process.env.MES_TWO_LINE_PHASE11_DIR || 'artifacts/mes-two-line-phase11');
const executionBase = (process.env.MES_EXECUTION_URL || 'http://localhost:13030/api/mes/execution').replace(/\/$/, '');
const executionUrl = process.env.MES_EXECUTION_DATABASE_URL || 'postgresql://mes_execution_user:mes_execution_pass@localhost:15435/mes_execution_db';
const masterUrl = process.env.MES_MASTER_DATA_DATABASE_URL || 'postgresql://mes_master_data_user:mes_master_data_pass@localhost:15434/mes_master_data_db';
const environment = String(process.env.MES_ENV || 'development').toLowerCase();
const allowMutation = process.env.ALLOW_TWO_LINE_PHASE11_MUTATION === 'true';
const userId = process.env.MES_E2E_USER_ID || '00000000-0000-0000-0000-000000000001';
const targetDate = defaultPlanningDate();
const runId = `MES-PHASE11-${Date.now()}`;
const executionDb = new Client({ connectionString: executionUrl });
const masterDb = new Client({ connectionString: masterUrl });
const createdWorkOrders = new Set();
const results = [];

function defaultPlanningDate() {
  const date = new Date();
  if (date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 2);
  if (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function assertSafety() {
  if (!['development', 'local', 'test', 'uat', 'staging'].includes(environment)) throw new Error(`Unsafe MES_ENV: ${environment}`);
  if (!allowMutation) throw new Error('Set ALLOW_TWO_LINE_PHASE11_MUTATION=true.');
  for (const value of [executionUrl, masterUrl]) {
    if (!['localhost', '127.0.0.1', '::1'].includes(new URL(value).hostname)) throw new Error(`Database must be local/test: ${value}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(urlPath, init = {}, allowed = []) {
  const response = await fetch(`${executionBase}${urlPath}`, {
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
  if (!response.ok && !allowed.includes(response.status)) throw new Error(`${init.method || 'GET'} ${urlPath} -> ${response.status}: ${text}`);
  return { status: response.status, body: body?.data ?? body };
}

async function scenario(number, name, action) {
  const startedAt = new Date().toISOString();
  try {
    const evidence = await action();
    const result = { number, name, status: 'passed', started_at: startedAt, finished_at: new Date().toISOString(), evidence };
    results.push(result);
    await writeJson(`scenario-${String(number).padStart(2, '0')}.json`, result);
    console.log(`[phase11] PASS ${number}. ${name}`);
  } catch (error) {
    results.push({ number, name, status: 'failed', started_at: startedAt, finished_at: new Date().toISOString(), error: error.message });
    throw error;
  }
}

async function writeJson(name, value) {
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(path.join(artifactDir, name), `${JSON.stringify(value, null, 2)}\n`);
}

async function discover() {
  const productionVersion = (await executionDb.query(`
    SELECT pv.master_id, pv.code, pv.site_id, ir.base_uom_id
    FROM rm_production_version pv JOIN rm_item_revision ir ON ir.master_id=pv.item_revision_id
    WHERE pv.code='WST-SEED-PV-SEAL-ASM-01' AND pv.lifecycle_status='Released'
  `)).rows[0];
  assert(productionVersion, 'Canonical two-line Production Version is missing.');
  const lines = (await executionDb.query(`
    SELECT e.production_line_id, l.code, e.selection_role
    FROM rm_production_version_line_eligibility e JOIN rm_production_line l ON l.master_id=e.production_line_id
    WHERE e.production_version_id=$1 AND e.active_flag=true AND e.lifecycle_status='Released'
  `, [productionVersion.master_id])).rows;
  const primary = lines.find((row) => row.selection_role === 'PRIMARY');
  const backup = lines.find((row) => row.selection_role === 'BACKUP');
  assert(primary && backup, 'Canonical Primary/Backup eligibility is missing.');
  const shift = (await masterDb.query(`SELECT master_id,code FROM md_shift WHERE site_id=$1 AND code='SHIFT-A' AND lifecycle_status='Released'`, [productionVersion.site_id])).rows[0];
  assert(shift, 'Canonical SHIFT-A is missing.');
  const primaryBinding = (await masterDb.query(`
    SELECT ws.master_id AS workstation_id, ws.code AS workstation_code, ws.active_flag,
           ra.master_id AS assignment_id, ra.effective_from AS assignment_effective_from,
           ra.effective_to, cap.master_id AS capability_id,
           cap.active_flag AS capability_active, cal.master_id AS calendar_id,
           cal.availability_status, cal.available_minutes
    FROM md_workstation ws
    JOIN md_resource_assignment ra ON ra.workstation_id=ws.master_id
    JOIN md_resource_capability cap ON cap.equipment_id=ra.equipment_id
    JOIN md_resource_calendar cal ON cal.workstation_id=ws.master_id AND cal.calendar_date=$1::date AND cal.shift_id=$2
    WHERE ws.code IN ('WST-SEED-WS-L1-BINDING','WST-SEED-WS-L1-BINDING-ALT')
    ORDER BY ws.code
  `, [targetDate, shift.master_id])).rows;
  const backupBinding = (await masterDb.query(`SELECT master_id AS workstation_id,code AS workstation_code,active_flag FROM md_workstation WHERE code='WST-SEED-WS-L2-BINDING'`)).rows;
  assert(primaryBinding.length === 2 && backupBinding.length === 1, 'Canonical Binding resources are incomplete.');
  return { productionVersion, primary, backup, shift, primaryBinding, backupBinding };
}

async function createWorkOrder(model, suffix) {
  const key = `${runId}-${suffix}`;
  const response = await request('/work-order-creation-workflows', {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: JSON.stringify({
      production_version_id: model.productionVersion.master_id,
      quantity: 2,
      uom_id: model.productionVersion.base_uom_id,
      planned_start_at: `${targetDate}T08:00:00.000Z`,
      planned_end_at: `${targetDate}T12:00:00.000Z`,
      dispatch_mode: 'DEMO_SHARED_KIOSK',
    }),
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const snapshot = (await request(`/work-order-creation-workflows/${response.body.workflow_id}`)).body;
    if (snapshot.status === 'succeeded') {
      createdWorkOrders.add(snapshot.work_order_id);
      return snapshot;
    }
    if (snapshot.status === 'failed') throw new Error(`WO creation failed: ${JSON.stringify(snapshot)}`);
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error('WO creation timed out.');
}

async function detail(woId) {
  return (await request(`/work-orders/${woId}`)).body;
}

async function proposal(woId) {
  return (await request(`/work-orders/${woId}/resource-allocation-proposals`)).body;
}

function candidateInput(operation, candidate, rowVersion) {
  return {
    workstation_id: candidate.workstation?.id,
    equipment_id: candidate.primary_machine?.id || candidate.equipment?.id,
    machine_group_id: candidate.machine_group?.id,
    shift_id: operation.requested_window.shift_id,
    planned_start_at: operation.requested_window.start_at,
    candidate_reference: `${candidate.assignment?.id || ''}:${candidate.machine_group?.id || ''}:${candidate.capability?.id || ''}`,
    row_version: rowVersion,
    change_reason: 'Phase 11 release gate',
  };
}

async function commitOperation(woId, operation, candidate, rowVersion, suffix) {
  return request(`/work-orders/${woId}/operations/${operation.operation_id}/resource-allocation`, {
    method: 'POST',
    headers: { 'Idempotency-Key': `${runId}-${suffix}-${operation.operation_id}` },
    body: JSON.stringify(candidateInput(operation, candidate, rowVersion)),
  });
}

async function commitAll(woId) {
  const current = await detail(woId);
  const proposed = await proposal(woId);
  assert(proposed.complete === true, `Incomplete proposal: ${JSON.stringify(proposed)}`);
  const allocations = [];
  for (const operation of proposed.operations) {
    allocations.push((await commitOperation(woId, operation, operation.recommended_candidate, current.header.row_version, 'ALLOC')).body);
  }
  return { proposed, allocations };
}

async function setWorkstations(rows, active) {
  await masterDb.query(`UPDATE md_workstation SET active_flag=$2 WHERE master_id=ANY($1::uuid[])`, [rows.map((row) => row.workstation_id), active]);
}

async function releaseTestReservations(woId) {
  await executionDb.query(`UPDATE wo_capacity_reservation SET status='Cancelled',updated_at=NOW() WHERE wo_id=$1 AND status IN ('Tentative','Committed')`, [woId]);
  await executionDb.query(`UPDATE wo_resource_allocation SET status='Cancelled',validation_status='Invalid',row_version=row_version+1 WHERE wo_id=$1 AND status IN ('Draft','Validated','Committed')`, [woId]);
}

async function restoreModel(model) {
  for (const row of model.primaryBinding) {
    await masterDb.query(`UPDATE md_workstation SET active_flag=$2 WHERE master_id=$1`, [row.workstation_id, row.active_flag]);
    await masterDb.query(`UPDATE md_resource_assignment SET effective_from=$2,effective_to=$3 WHERE master_id=$1`, [row.assignment_id, row.assignment_effective_from, row.effective_to]);
    await masterDb.query(`UPDATE md_resource_capability SET active_flag=$2 WHERE master_id=$1`, [row.capability_id, row.capability_active]);
    await masterDb.query(`UPDATE md_resource_calendar SET availability_status=$2,available_minutes=$3 WHERE master_id=$1`, [row.calendar_id, row.availability_status, row.available_minutes]);
  }
  for (const row of model.backupBinding) await masterDb.query(`UPDATE md_workstation SET active_flag=$2 WHERE master_id=$1`, [row.workstation_id, row.active_flag]);
}

async function assertBackup(model, wo, expectedBlocker) {
  const value = await detail(wo.work_order_id);
  assert(value.header.selected_production_line_id === model.backup.production_line_id, `Backup not selected: ${JSON.stringify(value.header)}`);
  assert(value.header.fallback_reason === 'PRIMARY_LINE_BLOCKED', `Fallback reason missing: ${JSON.stringify(value.header)}`);
  if (expectedBlocker) assert(JSON.stringify(value.header.evaluated_line_results).includes(expectedBlocker), `Missing blocker ${expectedBlocker}`);
  return value;
}

async function cleanup() {
  const ids = [...createdWorkOrders];
  if (!ids.length) return { work_orders: 0, allocations: 0, reservations: 0 };
  await executionDb.query('BEGIN');
  try {
    const q = (sql) => executionDb.query(sql, [ids]);
    await q(`DELETE FROM wo_operation_execution_history WHERE wo_id=ANY($1::uuid[])`);
    await q(`DELETE FROM operation_confirmation WHERE wo_operation_id IN (SELECT wo_operation_id FROM wo_operation WHERE wo_id=ANY($1::uuid[]))`);
    await q(`DELETE FROM execution_session WHERE wo_operation_id IN (SELECT wo_operation_id FROM wo_operation WHERE wo_id=ANY($1::uuid[]))`);
    await q(`DELETE FROM material_consumption WHERE wo_id=ANY($1::uuid[]) OR wo_operation_id IN (SELECT wo_operation_id FROM wo_operation WHERE wo_id=ANY($1::uuid[]))`);
    await q(`DELETE FROM wo_print_job_event WHERE print_job_id IN (SELECT print_job_id FROM wo_print_job WHERE wo_id=ANY($1::uuid[]))`);
    await q(`DELETE FROM wo_print_job_attempt WHERE print_job_id IN (SELECT print_job_id FROM wo_print_job WHERE wo_id=ANY($1::uuid[]))`);
    await q(`DELETE FROM wo_capacity_reservation WHERE wo_id=ANY($1::uuid[])`);
    await q(`DELETE FROM wo_resource_allocation_audit WHERE wo_id=ANY($1::uuid[])`);
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
    await executionDb.query(`DELETE FROM outbox_events WHERE payload::text LIKE ANY($1::text[])`, [ids.map((id) => `%${id}%`)]);
    await q(`DELETE FROM wo_header WHERE wo_id=ANY($1::uuid[])`);
    await executionDb.query('COMMIT');
  } catch (error) {
    await executionDb.query('ROLLBACK');
    throw error;
  }
  const leaks = (await executionDb.query(`SELECT (SELECT COUNT(*)::int FROM wo_header WHERE wo_id=ANY($1::uuid[])) work_orders,(SELECT COUNT(*)::int FROM wo_resource_allocation WHERE wo_id=ANY($1::uuid[])) allocations,(SELECT COUNT(*)::int FROM wo_capacity_reservation WHERE wo_id=ANY($1::uuid[])) reservations`, [ids])).rows[0];
  return leaks;
}

assertSafety();
await executionDb.connect();
await masterDb.connect();
let model;
try {
  const stale = (await executionDb.query(`
    SELECT DISTINCT f.work_order_id::text
    FROM wo_creation_workflow f
    WHERE f.idempotency_key LIKE 'MES-PHASE11-%' AND f.work_order_id IS NOT NULL
  `)).rows.map((row) => row.work_order_id);
  for (const woId of stale) createdWorkOrders.add(woId);
  if (stale.length) {
    const staleLeaks = await cleanup();
    assert(Number(staleLeaks.work_orders) === 0 && Number(staleLeaks.allocations) === 0 && Number(staleLeaks.reservations) === 0, `Stale Phase 11 cleanup failed: ${JSON.stringify(staleLeaks)}`);
    createdWorkOrders.clear();
  }
  model = await discover();
  await restoreModel(model);

  let primaryReference;
  await scenario(1, 'Primary selected and candidate APIs remain on Primary', async () => {
    const wo = await createWorkOrder(model, 'PRIMARY');
    const value = await detail(wo.work_order_id);
    const proposed = await proposal(wo.work_order_id);
    assert(value.header.selected_production_line_id === model.primary.production_line_id, 'Primary was not selected.');
    assert(!value.header.fallback_reason, 'Primary selection unexpectedly has fallback reason.');
    assert(proposed.operations.every((operation) => operation.production_line.id === model.primary.production_line_id), 'Candidate proposal escaped Primary.');
    primaryReference = { wo, value, proposed };
    return { work_order_code: wo.work_order_code, selected_line: value.header.selected_production_line_code, operations: proposed.operations.length };
  });

  await scenario(2, 'Inactive Primary candidate is excluded while alternative remains', async () => {
    await setWorkstations([model.primaryBinding[0]], false);
    try {
      const wo = await createWorkOrder(model, 'ALTERNATIVE');
      const value = await detail(wo.work_order_id);
      const binding = value.header.evaluated_line_results.find((line) => line.production_line_id === model.primary.production_line_id).operations.find((operation) => operation.operation_code === 'WST-SEED-OP-BINDING');
      assert(value.header.selected_production_line_id === model.primary.production_line_id, 'Primary did not survive one inactive candidate.');
      assert(binding.feasible_candidate_count === 1 && binding.excluded_candidate_reasons.WORKSTATION_INACTIVE === 1, `Alternative evidence mismatch: ${JSON.stringify(binding)}`);
      return binding;
    } finally { await restoreModel(model); }
  });

  await scenario(3, 'All Primary candidates for one operation unavailable selects Backup', async () => {
    await setWorkstations(model.primaryBinding, false);
    try { return (await assertBackup(model, await createWorkOrder(model, 'PRIMARY-OP-DOWN'), 'WORKSTATION_INACTIVE')).header; }
    finally { await restoreModel(model); }
  });

  await scenario(4, 'Expired Primary assignments are excluded', async () => {
    const expiredFrom = new Date(`${targetDate}T00:00:00.000Z`);
    expiredFrom.setUTCDate(expiredFrom.getUTCDate() - 2);
    await masterDb.query(`UPDATE md_resource_assignment SET effective_from=$2,effective_to=$3 WHERE master_id=ANY($1::uuid[])`, [model.primaryBinding.map((row) => row.assignment_id), expiredFrom.toISOString(), `${targetDate}T00:00:00.000Z`]);
    try { return (await assertBackup(model, await createWorkOrder(model, 'ASSIGNMENT-EXPIRED'), 'ASSIGNMENT')).header; }
    finally { await restoreModel(model); }
  });

  await scenario(5, 'Primary capability mismatch follows blocking policy', async () => {
    await masterDb.query(`UPDATE md_resource_capability SET active_flag=false WHERE master_id=ANY($1::uuid[])`, [model.primaryBinding.map((row) => row.capability_id)]);
    try { return (await assertBackup(model, await createWorkOrder(model, 'CAPABILITY-MISMATCH'), 'CAPABILITY')).header; }
    finally { await restoreModel(model); }
  });

  await scenario(6, 'Primary calendar unavailable follows blocking policy', async () => {
    await masterDb.query(`UPDATE md_resource_calendar SET availability_status='PlannedDown',available_minutes=0 WHERE master_id=ANY($1::uuid[])`, [model.primaryBinding.map((row) => row.calendar_id)]);
    try { return (await assertBackup(model, await createWorkOrder(model, 'CALENDAR-DOWN'), 'CALENDAR')).header; }
    finally { await restoreModel(model); }
  });

  await scenario(7, 'Capacity exhaustion rejects a conflicting reservation', async () => {
    const first = await createWorkOrder(model, 'CAPACITY-A');
    const firstDetail = await detail(first.work_order_id);
    const firstProposal = await proposal(first.work_order_id);
    const bindingA = firstProposal.operations.find((operation) => operation.operation_code === 'WST-SEED-OP-BINDING');
    await commitOperation(first.work_order_id, bindingA, bindingA.recommended_candidate, firstDetail.header.row_version, 'CAPACITY-A');
    const second = await createWorkOrder(model, 'CAPACITY-B');
    const secondDetail = await detail(second.work_order_id);
    const secondProposal = await proposal(second.work_order_id);
    const bindingB = secondProposal.operations.find((operation) => operation.operation_code === 'WST-SEED-OP-BINDING');
    const conflict = await request(`/work-orders/${second.work_order_id}/operations/${bindingB.operation_id}/resource-allocation`, {
      method: 'POST', headers: { 'Idempotency-Key': `${runId}-CAPACITY-B-${bindingB.operation_id}` },
      body: JSON.stringify(candidateInput(bindingB, bindingB.recommended_candidate, secondDetail.header.row_version)),
    }, [409]);
    assert(conflict.status === 409 && JSON.stringify(conflict.body).includes('RESOURCE_CAPACITY_CONFLICT'), `Capacity conflict was not enforced: ${JSON.stringify(conflict)}`);
    await request(`/work-orders/${first.work_order_id}/operations/${bindingA.operation_id}/resource-allocation`, { method: 'DELETE' });
    return { policy: 'WorkCenter time-window reservation', response: conflict.body };
  });

  await scenario(8, 'Primary and Backup blocked persists RESOURCE_HOLD diagnostics', async () => {
    await setWorkstations([...model.primaryBinding, ...model.backupBinding], false);
    try {
      const wo = await createWorkOrder(model, 'BOTH-BLOCKED');
      const value = await detail(wo.work_order_id);
      assert(value.header.line_selection_status === 'RESOURCE_HOLD' && !value.header.selected_production_line_id, `Hold state mismatch: ${JSON.stringify(value.header)}`);
      assert(JSON.stringify(value.header.resource_hold_reason).includes('NO_COMPLETE_FEASIBLE_LINE'), 'Persisted hold diagnostics missing.');
      return value.header;
    } finally { await restoreModel(model); }
  });

  await scenario(9, 'Cross-line commit attack is rejected', async () => {
    await setWorkstations(model.primaryBinding, false);
    let backupWo;
    try { backupWo = await createWorkOrder(model, 'CROSS-LINE'); } finally { await restoreModel(model); }
    const backupDetail = await assertBackup(model, backupWo);
    const backupProposal = await proposal(backupWo.work_order_id);
    const target = backupProposal.operations[0];
    const primaryOperation = primaryReference.proposed.operations.find((operation) => operation.operation_code === target.operation_code);
    const attacked = await request(`/work-orders/${backupWo.work_order_id}/operations/${target.operation_id}/resource-allocation`, {
      method: 'POST', headers: { 'Idempotency-Key': `${runId}-CROSS-LINE` },
      body: JSON.stringify(candidateInput(target, primaryOperation.recommended_candidate, backupDetail.header.row_version)),
    }, [409]);
    assert(attacked.status === 409 && JSON.stringify(attacked.body).includes('RESOURCE_CANDIDATE_STALE'), `Cross-line commit was not rejected: ${JSON.stringify(attacked)}`);
    return attacked.body;
  });

  await scenario(10, 'Resource degradation before approval blocks approval', async () => {
    const wo = await createWorkOrder(model, 'BEFORE-APPROVAL');
    const committed = await commitAll(wo.work_order_id);
    const selected = committed.proposed.operations[0].recommended_candidate.workstation.id;
    await masterDb.query(`UPDATE md_workstation SET active_flag=false WHERE master_id=$1`, [selected]);
    try {
      const approved = await request(`/work-orders/${wo.work_order_id}/approve`, { method: 'POST', headers: { 'X-MES-Approval-Policy': 'Strict' }, body: JSON.stringify({ comment: 'Phase 11 stale approval guard' }) }, [409]);
      assert(approved.status === 409 && approved.body.error === 'WO_RESOURCE_ALLOCATION_INVALID', `Approval bypassed stale resource: ${JSON.stringify(approved)}`);
      return approved.body;
    } finally { await restoreModel(model); await releaseTestReservations(wo.work_order_id); }
  });

  await scenario(11, 'Resource degradation before execution start blocks start', async () => {
    const wo = await createWorkOrder(model, 'BEFORE-START');
    const committed = await commitAll(wo.work_order_id);
    const approval = await request(`/work-orders/${wo.work_order_id}/approve`, { method: 'POST', headers: { 'X-MES-Approval-Policy': 'Strict' }, body: JSON.stringify({ comment: 'Phase 11 approved before degradation' }) });
    assert(approval.body.status === 'Released', `Approval failed: ${JSON.stringify(approval.body)}`);
    const selected = committed.proposed.operations[0].recommended_candidate.workstation.id;
    await masterDb.query(`UPDATE md_workstation SET active_flag=false WHERE master_id=$1`, [selected]);
    try {
      const started = await request(`/work-orders/${wo.work_order_id}/start-execution`, { method: 'POST', body: '{}' }, [409]);
      assert(started.status === 409 && started.body.error === 'WO_RESOURCE_ALLOCATION_INVALID', `Execution start bypassed stale resource: ${JSON.stringify(started)}`);
      return started.body;
    } finally { await restoreModel(model); await releaseTestReservations(wo.work_order_id); }
  });

  await scenario(12, 'Failure after execution start uses controlled pause and retry', async () => {
    const wo = await createWorkOrder(model, 'POST-START-FAILURE');
    await commitAll(wo.work_order_id);
    const approval = await request(`/work-orders/${wo.work_order_id}/approve`, { method: 'POST', headers: { 'X-MES-Approval-Policy': 'Strict' }, body: JSON.stringify({ comment: 'Phase 11 full lifecycle' }) });
    assert(approval.body.status === 'Released', `Approval failed: ${JSON.stringify(approval.body)}`);
    const started = await request(`/work-orders/${wo.work_order_id}/start-execution`, { method: 'POST', body: '{}' });
    assert(started.body.status === 'InProgress', `Execution did not start: ${JSON.stringify(started.body)}`);
    const before = await detail(wo.work_order_id);
    const operation = before.operations.find((item) => item.execution_target_type !== 'PRINT_STATION');
    assert(operation, 'No manual operation is available for controlled failure test.');
    const terminal = 'PHASE11-KIOSK-01';
    const session = await request(`/work-orders/${wo.work_order_id}/operations/${operation.wo_operation_id}/start`, { method: 'POST', body: JSON.stringify({ terminal_ref: terminal }) });
    const failed = await request(`/work-orders/${wo.work_order_id}/operations/${operation.wo_operation_id}/fail`, {
      method: 'POST', headers: { 'Idempotency-Key': `${runId}-FAIL` },
      body: JSON.stringify({ session_id: session.body.session_id, reason_code: 'KIOSK-DEMO-EXECUTION-FAIL', reason_text: 'Phase 11 controlled machine failure', terminal_ref: terminal }),
    });
    const paused = await detail(wo.work_order_id);
    assert(failed.body.to_wo_status === 'Paused' && paused.header.status === 'Paused', `Failure did not pause WO: ${JSON.stringify(failed.body)}`);
    assert(paused.header.selected_production_line_id === before.header.selected_production_line_id, 'Failure silently moved the WO to another line.');
    const retried = await request(`/work-orders/${wo.work_order_id}/operations/${operation.wo_operation_id}/retry`, {
      method: 'POST', headers: { 'Idempotency-Key': `${runId}-RETRY`, 'X-Site-ID': model.productionVersion.site_id }, body: JSON.stringify({ terminal_ref: terminal }),
    });
    const events = (await executionDb.query(`SELECT event_type FROM outbox_events WHERE payload::text LIKE $1 AND event_type IN ('MES.Execution.OperationFailed.v1','MES.Execution.OperationRetryRequested.v1','MES.Execution.WOStatusChanged.v1') ORDER BY created_at`, [`%${wo.work_order_id}%`])).rows.map((row) => row.event_type);
    assert(events.includes('MES.Execution.OperationFailed.v1') && events.includes('MES.Execution.OperationRetryRequested.v1'), `Recovery events missing: ${JSON.stringify(events)}`);
    return { work_order_code: wo.work_order_code, selected_line: before.header.selected_production_line_code, failed: failed.body, retried: retried.body, events };
  });

  const summary = { success: true, phase: 11, gate: 'PASS', run_id: runId, declared: 12, executed: results.length, passed: results.filter((item) => item.status === 'passed').length, failed: 0, skipped: 0, scenarios: results };
  await writeJson('phase11-summary.json', summary);
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  await writeJson('phase11-summary.json', { success: false, phase: 11, gate: 'FAIL', run_id: runId, declared: 12, executed: results.length, passed: results.filter((item) => item.status === 'passed').length, failed: 1, skipped: 0, scenarios: results, error: error.stack || error.message });
  console.error(`[phase11] FAIL ${error.stack || error.message}`);
  process.exitCode = 1;
} finally {
  if (model) await restoreModel(model).catch((error) => console.error(`[phase11] RESTORE FAIL ${error.message}`));
  const leaks = await cleanup().catch((error) => ({ cleanup_error: error.message }));
  await writeJson('cleanup.json', leaks).catch(() => {});
  await masterDb.end().catch(() => {});
  await executionDb.end().catch(() => {});
}
