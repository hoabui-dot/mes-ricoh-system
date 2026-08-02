#!/usr/bin/env node

/*
 * Disposable API verification for the complete manual resource-planning flow.
 * It deliberately uses the real Work Order creation, candidate, allocation,
 * revalidation, and detail endpoints. Only the two created WO IDs are removed.
 */
import pg from 'pg';

const { Client } = pg;
const apiBase = (process.env.MES_EXECUTION_URL || 'http://100.68.50.41:18000/api/mes/execution').replace(/\/$/, '');
const masterBase = (process.env.MES_MASTER_DATA_URL || 'http://100.68.50.41:18000/api/mes/master-data').replace(/\/$/, '');
const executionUrl = process.env.MES_EXECUTION_DATABASE_URL || 'postgresql://mes_execution_user:mes_execution_pass@localhost:15435/mes_execution_db';
const environment = String(process.env.MES_ENV || '').toLowerCase();
const mutation = process.env.ALLOW_RESOURCE_PLANNING_MUTATION === 'true';
const userId = process.env.MES_E2E_USER_ID || '00000000-0000-0000-0000-000000000001';
const runId = `E2E-RP-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
const client = new Client({ connectionString: executionUrl });
const created = { workflowIds: [], workOrderIds: [] };

function defaultPlanningDate() {
  const date = new Date();
  const day = date.getUTCDay();
  if (day === 6) date.setUTCDate(date.getUTCDate() + 2);
  if (day === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function assertSafety() {
  if (!['development', 'local', 'test', 'staging'].includes(environment)) throw new Error('MES_ENV must be development, local, test, or staging.');
  const host = new URL(executionUrl).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error('MES_EXECUTION_DATABASE_URL must use a local/test host.');
  if (!mutation) throw new Error('Set ALLOW_RESOURCE_PLANNING_MUTATION=true to run this disposable flow.');
}

async function request(base, path, init = {}, allowed = []) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-User-ID': userId, 'X-Role-Code': 'PLANT_MANAGER', 'X-Trace-ID': runId, ...(init.headers || {}) },
    cache: 'no-store',
  });
  const text = await response.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!response.ok && !allowed.includes(response.status)) throw new Error(`${init.method || 'GET'} ${path} -> ${response.status}: ${typeof body === 'string' ? body : body.error || body.message || JSON.stringify(body)}`);
  return { status: response.status, body };
}

const execution = (path, init, allowed) => request(apiBase, path, init, allowed);
const master = (path, init, allowed) => request(masterBase, path, init, allowed);
const data = (body) => body?.data ?? body;

async function createWorkOrder(productionVersion, shift, quantity, fixtureName) {
  const result = await execution('/work-order-creation-workflows', {
    method: 'POST',
    headers: { 'Idempotency-Key': `${runId}-${fixtureName}-${quantity}` },
    body: JSON.stringify({ production_version_id: productionVersion.production_version_id, quantity, target_date: process.env.E2E_WO_TARGET_DATE || new Date().toISOString().slice(0, 10), shift_id: shift.master_id }),
  });
  const workflowId = result.body.workflow_id;
  if (!workflowId) throw new Error(`WORKFLOW_ID_MISSING: ${JSON.stringify(result.body)}`);
  created.workflowIds.push(workflowId);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const snapshot = (await execution(`/work-order-creation-workflows/${workflowId}`)).body;
    if (snapshot.status === 'succeeded') {
      created.workOrderIds.push(snapshot.work_order_id);
      return snapshot;
    }
    if (snapshot.status === 'failed') throw new Error(`WORK_ORDER_CREATE_FAILED: ${JSON.stringify(snapshot)}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`WORK_ORDER_CREATE_TIMEOUT: ${workflowId}`);
}

async function loadCandidates(wo, operation, shift, start) {
  const result = await execution(`/work-orders/${wo.work_order_id}/operations/${operation.wo_operation_id}/resource-candidates?planned_start_at=${encodeURIComponent(start)}&shift_id=${encodeURIComponent(shift.master_id)}`);
  return result.body;
}

async function allocate(wo, operation, candidate, shift, start, key) {
  return execution(`/work-orders/${wo.work_order_id}/operations/${operation.wo_operation_id}/resource-allocation`, {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: JSON.stringify({
      workstation_id: candidate.workstation?.id,
      equipment_id: candidate.primary_machine?.id || candidate.equipment?.id,
      machine_group_id: candidate.machine_group?.id,
      shift_id: shift.master_id,
      planned_start_at: start,
      candidate_reference: `${candidate.assignment?.id || ''}:${candidate.machine_group?.id || ''}:${candidate.capability?.id || ''}`,
      row_version: wo.row_version,
    }),
  });
}

async function selectReadyContext(targetDate) {
  const versions = data((await master('/production-ready-versions?planned_date=' + encodeURIComponent(targetDate) + '&limit=500')).body)
    .filter((row) => row.readiness_status === 'Ready' && row.production_version_code?.startsWith('PV-'));
  for (const version of versions) {
    const shifts = data((await master(`/shifts?site_id=${encodeURIComponent(version.site_id)}&limit=500`)).body);
    const shift = shifts.find((row) => row.site_id === version.site_id && row.lifecycle_status !== 'Inactive');
    if (!shift) continue;
    let probe;
    try {
      probe = await createWorkOrder(version, shift, 1, `PROBE-${version.production_version_code}`);
      const detailBody = data((await execution(`/work-orders/${probe.work_order_id}`)).body);
      let cursor = new Date(`${targetDate}T08:00:00.000Z`);
      let allReady = true;
      for (const operation of detailBody.operations || []) {
        const result = await loadCandidates(probe, operation, shift, cursor.toISOString());
        const ready = result.candidates?.find((candidate) => candidate.readiness !== 'Blocked' && !(candidate.blocking_errors || []).length && !(candidate.capacity_conflicts || []).length);
        if (!ready) { allReady = false; break; }
        const duration = Number(ready.estimated_duration_min ?? ready.calculation?.estimated_duration_min ?? 1);
        cursor = new Date(cursor.getTime() + Math.max(duration, 1) * 60_000);
      }
      if (allReady && detailBody.operations?.length) return { version, shift };
    } catch {
      // Try the next Ready PV. The created probe, if any, is tracked for exact cleanup.
    }
  }
  throw new Error('No Ready Production Version has Ready candidates for every operation.');
}

async function cleanup() {
  if (!created.workOrderIds.length) return;
  const ids = created.workOrderIds;
  await client.query('BEGIN');
  try {
    const q = async (sql) => client.query(sql, [ids]);
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
    await q(`DELETE FROM wo_creation_workflow_event WHERE workflow_id IN (SELECT workflow_id FROM wo_creation_workflow WHERE work_order_id=ANY($1::uuid[]))`);
    await q(`DELETE FROM wo_creation_workflow WHERE work_order_id=ANY($1::uuid[])`);
    await client.query(`DELETE FROM outbox_events WHERE payload::text LIKE ANY($1::text[])`, [ids.map((id) => `%${id}%`)]);
    await q(`DELETE FROM wo_header WHERE wo_id=ANY($1::uuid[])`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  assertSafety();
  await client.connect();
  const targetDate = process.env.E2E_WO_TARGET_DATE || defaultPlanningDate();
  const { version, shift } = await selectReadyContext(targetDate);
  const target = new Date(`${targetDate}T08:00:00.000Z`);
  const start = target.toISOString();
  console.log(`[resource-planning] run=${runId} pv=${version.production_version_code} shift=${shift.code}`);

  const first = await createWorkOrder(version, shift, 2, 'WO-A');
  const second = await createWorkOrder(version, shift, 2, 'WO-B');
  if (first.work_order_id === second.work_order_id) throw new Error('Fixture setup returned the same Work Order ID twice. Check idempotency keys.');
  if (first.work_order_code === second.work_order_code) throw new Error(`Work Order business code is not unique: ${first.work_order_code}`);
  const firstDetail = data((await execution(`/work-orders/${first.work_order_id}`)).body);
  const secondDetail = data((await execution(`/work-orders/${second.work_order_id}`)).body);
  if (!firstDetail.operations?.length || !secondDetail.operations?.length) throw new Error('Created Work Order has no operations.');
  console.log(`[resource-planning] created ${first.work_order_code} and ${second.work_order_code}`);

  const firstCandidates = [];
  let firstOperationStart = new Date(start);
  for (const operation of firstDetail.operations) {
    const operationStart = firstOperationStart.toISOString();
    const result = await loadCandidates(first, operation, shift, operationStart);
    if (!Array.isArray(result.candidates) || result.candidates.length === 0) throw new Error(`No candidate for ${operation.operation_code}: ${JSON.stringify(result)}`);
    const ready = result.candidates.find((candidate) => candidate.readiness !== 'Blocked' && !(candidate.blocking_errors || []).length && !(candidate.capacity_conflicts || []).length);
    if (!ready) throw new Error(`No Ready candidate for ${operation.operation_code}: ${JSON.stringify(result)}`);
    firstCandidates.push({ operation, result, ready, start: operationStart });
    const duration = Number(ready.estimated_duration_min ?? ready.calculation?.estimated_duration_min ?? 0);
    firstOperationStart = new Date(firstOperationStart.getTime() + Math.max(duration, 1) * 60_000);
  }
  const blockedProbe = await loadCandidates(second, secondDetail.operations[0], shift, start);
  const blockedBeforeAllocation = blockedProbe.candidates?.some((candidate) => candidate.readiness === 'Blocked' || (candidate.capacity_conflicts || []).length > 0) || false;
  console.log(`[resource-planning] first WO candidates Ready=${firstCandidates.length}; blocked-before-allocation=${blockedBeforeAllocation}`);

  const allocationKeys = [];
  const allocations = [];
  for (const entry of firstCandidates) {
    const key = `${runId}-${entry.operation.wo_operation_id}`; allocationKeys.push(key);
    const committed = await allocate(first, entry.operation, entry.ready, shift, entry.start, key);
    allocations.push(committed.body);
    const replay = await allocate(first, entry.operation, entry.ready, shift, entry.start, key);
    if (JSON.stringify(replay.body) !== JSON.stringify(committed.body)) throw new Error(`Idempotency replay differed for ${entry.operation.operation_code}`);
  }
  const secondAfter = await loadCandidates(second, secondDetail.operations[0], shift, start);
  const blockedAfterAllocation = secondAfter.candidates?.some((candidate) => candidate.readiness === 'Blocked' || (candidate.capacity_conflicts || []).length > 0) || false;
  if (!blockedAfterAllocation && !blockedBeforeAllocation) throw new Error(`Expected a capacity-blocked candidate after first allocation: ${JSON.stringify(secondAfter)}`);
  const revalidation = (await execution(`/work-orders/${first.work_order_id}/resource-allocations/revalidate`, { method: 'POST', body: '{}' })).body;
  if (revalidation.valid !== true) throw new Error(`Committed allocation revalidation failed: ${JSON.stringify(revalidation)}`);
  const refreshed = data((await execution(`/work-orders/${first.work_order_id}`)).body);
  const committedCount = refreshed.operations.filter((operation) => operation.resource_allocation?.status === 'Committed').length;
  if (committedCount !== firstDetail.operations.length) throw new Error(`Expected ${firstDetail.operations.length} committed allocations, got ${committedCount}`);
  const unitSnapshot = await client.query(`SELECT COUNT(*)::int AS total, COUNT(planned_primary_machine_unit_id)::int AS primary_units FROM wo_resource_allocation WHERE wo_id=$1 AND status='Committed'`, [first.work_order_id]);
  const unitSummary = unitSnapshot.rows[0];
  if (Number(unitSummary.primary_units) !== firstDetail.operations.length) throw new Error(`Committed allocations did not preserve an exact primary machine-unit snapshot: ${JSON.stringify(unitSummary)}`);
  console.log(JSON.stringify({ success: true, run_id: runId, production_version: version.production_version_code, first_work_order: first.work_order_code, second_work_order: second.work_order_code, operation_count: firstDetail.operations.length, committed_count: committedCount, exact_primary_unit_snapshots: Number(unitSummary.primary_units), blocked_candidate_observed: blockedAfterAllocation || blockedBeforeAllocation, idempotency_replays: allocationKeys.length, revalidation }, null, 2));
}

main().catch((error) => { console.error(`[resource-planning] FAILED: ${error.message}`); process.exitCode = 1; }).finally(async () => { try { await cleanup(); } catch (error) { console.error(`[resource-planning] CLEANUP_FAILED: ${error.message}`); process.exitCode = 1; } try { await client.end(); } catch {} });
