#!/usr/bin/env node

/*
 * Phase 2 guarded full API verification for MES Resource Planning.
 * The script is API-first. Direct DB writes are limited to local disposable
 * print-station readiness repair and exact cleanup of generated Work Orders.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const apiBase = (process.env.MES_EXECUTION_URL || 'http://100.68.50.41:18000/api/mes/execution').replace(/\/$/, '');
const masterBase = (process.env.MES_MASTER_DATA_URL || 'http://100.68.50.41:18000/api/mes/master-data').replace(/\/$/, '');
const executionUrl = process.env.MES_EXECUTION_DATABASE_URL || 'postgresql://mes_execution_user:mes_execution_pass@localhost:15435/mes_execution_db';
const masterUrl = process.env.MES_MASTER_DATA_DATABASE_URL || 'postgresql://mes_master_data_user:mes_master_data_pass@localhost:15434/mes_master_data_db';
const environment = String(process.env.MES_ENV || '').toLowerCase();
const allowMutation = process.env.ALLOW_RESOURCE_PLANNING_MUTATION === 'true';
const skipPrintStationThirdParty = process.env.SKIP_PRINT_STATION_THIRD_PARTY === 'true' || process.env.SKIP_THIRD_PARTY_INTEGRATIONS === 'true';
const userId = process.env.MES_E2E_USER_ID || '00000000-0000-0000-0000-000000000001';
const roleCode = 'PLANT_MANAGER';
const runId = `PHASE2-RP-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
const artifactRoot = path.resolve(repoRoot, 'artifacts', 'mes-resource-planning-full-flow', runId);
const phase1Artifact = path.join(artifactRoot, 'phase1-negative-matrix.json');
const resultArtifact = path.join(artifactRoot, 'phase2-full-flow.json');
const markdownArtifact = path.join(artifactRoot, 'phase2-full-flow.md');
const targetDate = process.env.E2E_WO_TARGET_DATE || defaultPlanningDate();
const executionDb = new Client({ connectionString: executionUrl });
const masterDb = new Client({ connectionString: masterUrl });
const created = { workflowIds: [], workOrderIds: [] };
const restores = [];
const steps = [];

function defaultPlanningDate() {
  const date = new Date();
  const day = date.getUTCDay();
  if (day === 6) date.setUTCDate(date.getUTCDate() + 2);
  if (day === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function assertSafety() {
  if (!['development', 'local', 'test', 'staging'].includes(environment)) throw new Error('MES_ENV must be development, local, test, or staging.');
  if (!allowMutation) throw new Error('Set ALLOW_RESOURCE_PLANNING_MUTATION=true to run this disposable Phase 2 flow.');
  for (const url of [executionUrl, masterUrl]) {
    const host = new URL(url).hostname;
    if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error(`Database URL must use a local/test host: ${host}`);
  }
}

async function record(name, fn) {
  const startedAt = new Date().toISOString();
  try {
    const data = await fn();
    steps.push({ name, status: 'passed', started_at: startedAt, finished_at: new Date().toISOString(), data });
    console.log(`[phase2] PASS ${name}`);
    return data;
  } catch (error) {
    steps.push({ name, status: 'failed', started_at: startedAt, finished_at: new Date().toISOString(), error: error.message });
    throw error;
  }
}

function recordSkipped(name, reason) {
  steps.push({ name, status: 'skipped', started_at: new Date().toISOString(), finished_at: new Date().toISOString(), reason });
  console.log(`[phase2] SKIP ${name}: ${reason}`);
  return { skipped: true, reason };
}

async function request(base, requestPath, init = {}, allowed = []) {
  const response = await fetch(`${base}${requestPath}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-User-ID': userId,
      'X-Role-Code': roleCode,
      'X-Trace-ID': runId,
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { message: text }; }
  if (!response.ok && !allowed.includes(response.status)) {
    throw new Error(`${init.method || 'GET'} ${requestPath} -> ${response.status}: ${JSON.stringify(body)}`);
  }
  return { status: response.status, body: body?.data ?? body };
}

const execution = (requestPath, init, allowed) => request(apiBase, requestPath, init, allowed);
const master = (requestPath, init, allowed) => request(masterBase, requestPath, init, allowed);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runNodeScript(script, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: repoRoot,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); process.stdout.write(chunk); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); process.stderr.write(chunk); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${script} exited ${code}: ${stderr || stdout}`));
    });
  });
}

async function createWorkOrder(version, shift) {
  const response = await execution('/work-order-creation-workflows', {
    method: 'POST',
    headers: { 'Idempotency-Key': `${runId}-CREATE-WO-${version.production_version_code || version.production_version_id}-${created.workflowIds.length}` },
    body: JSON.stringify({
      production_version_id: version.production_version_id,
      quantity: 2,
      target_date: targetDate,
      shift_id: shift.master_id,
    }),
  });
  const workflowId = response.body.workflow_id;
  if (!workflowId) throw new Error(`WORKFLOW_ID_MISSING: ${JSON.stringify(response.body)}`);
  created.workflowIds.push(workflowId);
  for (let attempt = 0; attempt < 70; attempt += 1) {
    const snapshot = (await execution(`/work-order-creation-workflows/${workflowId}`)).body;
    if (snapshot.status === 'succeeded') {
      created.workOrderIds.push(snapshot.work_order_id);
      return snapshot;
    }
    if (snapshot.status === 'failed') throw new Error(`WORK_ORDER_CREATE_FAILED: ${JSON.stringify(snapshot)}`);
    await sleep(200);
  }
  throw new Error(`WORK_ORDER_CREATE_TIMEOUT: ${workflowId}`);
}

async function detail(workOrderId) {
  return (await execution(`/work-orders/${workOrderId}`)).body;
}

async function loadCandidates(workOrderId, operationId, shift, start) {
  return (await execution(`/work-orders/${workOrderId}/operations/${operationId}/resource-candidates?planned_start_at=${encodeURIComponent(start)}&shift_id=${encodeURIComponent(shift.master_id)}`)).body;
}

function readyCandidate(candidates) {
  return candidates.find((candidate) => candidate.readiness !== 'Blocked' && !(candidate.blocking_errors || []).length && !(candidate.capacity_conflicts || []).length);
}

async function selectReadyContextWithAllocatableOperations() {
  const versions = (await master(`/production-ready-versions?planned_date=${encodeURIComponent(targetDate)}&limit=500`)).body
    .filter((row) => row.readiness_status === 'Ready' && row.production_version_code?.startsWith('PV-'));
  for (const version of versions) {
    const shifts = (await master(`/shifts?site_id=${encodeURIComponent(version.site_id)}&limit=500`)).body;
    const shift = shifts.find((row) => row.site_id === version.site_id && row.lifecycle_status !== 'Inactive');
    if (!shift) continue;
    try {
      const probe = await createWorkOrder(version, shift);
      const snapshot = await detail(probe.work_order_id);
      let cursor = new Date(`${targetDate}T08:00:00.000Z`);
      let allReady = true;
      for (const operation of snapshot.operations || []) {
        const candidates = await loadCandidates(probe.work_order_id, operation.wo_operation_id, shift, cursor.toISOString());
        const candidate = readyCandidate(candidates.candidates || []);
        if (!candidate) { allReady = false; break; }
        const duration = Number(candidate.estimated_duration_min ?? candidate.calculation?.estimated_duration_min ?? 1);
        cursor = new Date(cursor.getTime() + Math.max(duration, 1) * 60_000);
      }
      if (allReady && snapshot.operations?.length) return { version, shift };
    } catch {
      // Continue probing; any created Work Order remains in the exact cleanup set.
    }
  }
  throw new Error('No released Ready Production Version has Ready candidates for every operation.');
}

function allocationPayload(candidate, shift, start, rowVersion) {
  return {
    workstation_id: candidate.workstation?.id,
    equipment_id: candidate.primary_machine?.id || candidate.equipment?.id,
    machine_group_id: candidate.machine_group?.id,
    shift_id: shift.master_id,
    planned_start_at: start,
    candidate_reference: `${candidate.assignment?.id || ''}:${candidate.machine_group?.id || ''}:${candidate.capability?.id || ''}`,
    row_version: rowVersion,
  };
}

async function commitCandidate(workOrderId, operation, candidate, shift, start, rowVersion) {
  return (await execution(`/work-orders/${workOrderId}/operations/${operation.wo_operation_id}/resource-allocation`, {
    method: 'POST',
    headers: { 'Idempotency-Key': `${runId}-ALLOC-${operation.wo_operation_id}` },
    body: JSON.stringify(allocationPayload(candidate, shift, start, rowVersion)),
  })).body;
}

async function snapshotUpdate(client, table, idColumn, id, changes) {
  const columns = Object.keys(changes);
  if (!/^[a-z_]+$/.test(table) || !/^[a-z_]+$/.test(idColumn) || columns.some((column) => !/^[a-z_]+$/.test(column))) {
    throw new Error(`Unsafe snapshot update target ${table}.${idColumn}`);
  }
  const before = await client.query(`SELECT ${columns.join(', ')} FROM ${table} WHERE ${idColumn}=$1`, [id]);
  if (before.rowCount !== 1) throw new Error(`Expected one row in ${table} for ${id}`);
  const assignments = columns.map((column, index) => `${column}=$${index + 2}`).join(', ');
  await client.query(`UPDATE ${table} SET ${assignments} WHERE ${idColumn}=$1`, [id, ...columns.map((column) => changes[column])]);
  const old = before.rows[0];
  restores.push(async () => {
    const restoreAssignments = columns.map((column, index) => `${column}=$${index + 2}`).join(', ');
    await client.query(`UPDATE ${table} SET ${restoreAssignments} WHERE ${idColumn}=$1`, [id, ...columns.map((column) => old[column])]);
  });
}

async function restoreFixtures() {
  while (restores.length) {
    const restore = restores.pop();
    await restore();
  }
}

async function ensurePrintStationReady(workstationId) {
  if (!workstationId) throw new Error('PRINT_STATION_BINDING_MISSING');
  const station = await masterDb.query(`SELECT master_id FROM md_print_station ORDER BY code LIMIT 1`);
  if (station.rowCount !== 1) throw new Error('PRINT_STATION_MASTER_MISSING');
  const stationId = station.rows[0].master_id;
  const binding = await masterDb.query(`
    SELECT binding_id, print_station_id
    FROM md_workstation_print_station_binding
    WHERE workstation_id=$1 AND role='PRIMARY' AND is_active=TRUE AND (effective_to IS NULL OR effective_to > NOW())
    ORDER BY created_at DESC LIMIT 1`, [workstationId]);
  if (binding.rowCount === 0) {
    const bindingId = cryptoRandomUuid();
    await masterDb.query(`
      INSERT INTO md_workstation_print_station_binding
        (binding_id, workstation_id, print_station_id, role, effective_from, is_active, created_by, allocated_printer_quantity)
      VALUES ($1, $2, $3, 'PRIMARY', NOW(), TRUE, $4, 1)`, [bindingId, workstationId, stationId, userId]);
    restores.push(async () => {
      await masterDb.query(`DELETE FROM md_workstation_print_station_binding WHERE binding_id=$1`, [bindingId]);
    });
  }
  await snapshotUpdate(masterDb, 'md_print_station', 'master_id', stationId, {
    status: 'ONLINE',
    is_active: true,
    configured_allocation_limit: 10,
  });
  const projection = await masterDb.query(`SELECT print_station_id FROM md_print_station_runtime_projection WHERE print_station_id=$1`, [stationId]);
  if (projection.rowCount === 0) {
    await masterDb.query(`
      INSERT INTO md_print_station_runtime_projection
        (print_station_id, station_code, adapter_id, runtime_status, kafka_status, printer_count, online_printer_count, error_printer_count, last_heartbeat_at, last_status_change_at, ready_printer_count, active_for_work_printer_count, registered_printer_count, busy_printer_count, offline_printer_count)
      SELECT master_id, code, 'PRINT-ADAPTER-01', 'ONLINE', 'CONNECTED', 1, 1, 0, NOW(), NOW(), 1, 1, 1, 0, 0
      FROM md_print_station WHERE master_id=$1`, [stationId]);
    restores.push(async () => {
      await masterDb.query(`DELETE FROM md_print_station_runtime_projection WHERE print_station_id=$1`, [stationId]);
    });
  } else {
    await snapshotUpdate(masterDb, 'md_print_station_runtime_projection', 'print_station_id', stationId, {
      runtime_status: 'ONLINE',
      kafka_status: 'CONNECTED',
      printer_count: 1,
      online_printer_count: 1,
      error_printer_count: 0,
      ready_printer_count: 1,
      active_for_work_printer_count: 1,
      registered_printer_count: 1,
      busy_printer_count: 0,
      offline_printer_count: 0,
    });
  }
  const readiness = await master(`/workstations/${workstationId}/print-station-readiness`);
  const ready = readiness.body.ready === true || (
    readiness.body.print_station_id
    && readiness.body.runtime_status === 'ONLINE'
    && readiness.body.kafka_status === 'CONNECTED'
    && Number(readiness.body.ready_printer_count || 0) > 0
    && Number(readiness.body.active_for_work_printer_count || 0) > 0
  );
  if (!ready) throw new Error(`PRINT_STATION_READINESS_NOT_REPAIRED: ${JSON.stringify(readiness.body)}`);
  return readiness.body;
}

function cryptoRandomUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
}

async function cleanupWorkOrders() {
  if (!created.workOrderIds.length) return { deleted_work_orders: 0, remaining_target_rows: 0 };
  const ids = created.workOrderIds;
  await executionDb.query('BEGIN');
  try {
    const q = (sql) => executionDb.query(sql, [ids]);
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
    await executionDb.query(`DELETE FROM outbox_events WHERE payload::text LIKE ANY($1::text[])`, [ids.map((id) => `%${id}%`)]);
    const deleted = await q(`DELETE FROM wo_header WHERE wo_id=ANY($1::uuid[])`);
    await executionDb.query('COMMIT');
    const remaining = await verifyZeroTargetRows(ids);
    return { deleted_work_orders: deleted.rowCount, remaining_target_rows: remaining };
  } catch (error) {
    await executionDb.query('ROLLBACK');
    throw error;
  }
}

async function verifyZeroTargetRows(ids) {
  const queries = [
    { sql: `SELECT COUNT(*)::int AS count FROM wo_header WHERE wo_id=ANY($1::uuid[])`, params: [ids] },
    { sql: `SELECT COUNT(*)::int AS count FROM wo_operation WHERE wo_id=ANY($1::uuid[])`, params: [ids] },
    { sql: `SELECT COUNT(*)::int AS count FROM wo_resource_allocation WHERE wo_id=ANY($1::uuid[])`, params: [ids] },
    { sql: `SELECT COUNT(*)::int AS count FROM wo_capacity_reservation WHERE wo_id=ANY($1::uuid[])`, params: [ids] },
    { sql: `SELECT COUNT(*)::int AS count FROM wo_resource_allocation_audit WHERE wo_id=ANY($1::uuid[])`, params: [ids] },
    { sql: `SELECT COUNT(*)::int AS count FROM outbox_events WHERE payload::text LIKE ANY($1::text[])`, params: [ids.map((id) => `%${id}%`)] },
  ];
  let total = 0;
  for (const { sql, params } of queries) {
    const result = await executionDb.query(sql, params);
    total += Number(result.rows[0].count);
  }
  return total;
}

async function verifyPersistence(workOrderId, operationCount) {
  const allocation = await executionDb.query(`
    SELECT COUNT(*)::int AS committed,
           COUNT(planned_primary_machine_unit_id)::int AS unit_snapshots
    FROM wo_resource_allocation
    WHERE wo_id=$1 AND status='Committed' AND validation_status IN ('Valid','ValidWithWarnings')`, [workOrderId]);
  const reservation = await executionDb.query(`SELECT COUNT(*)::int AS count FROM wo_capacity_reservation WHERE wo_id=$1 AND status='Committed'`, [workOrderId]);
  const audit = await executionDb.query(`SELECT COUNT(*)::int AS count FROM wo_resource_allocation_audit WHERE wo_id=$1`, [workOrderId]);
  const outbox = await executionDb.query(`
    SELECT event_type, COUNT(*)::int AS count
    FROM outbox_events
    WHERE payload::text LIKE $1
    GROUP BY event_type
    ORDER BY event_type`, [`%${workOrderId}%`]);
  const events = Object.fromEntries(outbox.rows.map((row) => [row.event_type, Number(row.count)]));
  if (Number(allocation.rows[0].committed) !== operationCount) throw new Error(`Expected ${operationCount} committed allocations, got ${allocation.rows[0].committed}`);
  if (Number(reservation.rows[0].count) < operationCount) throw new Error(`Expected at least ${operationCount} committed reservations, got ${reservation.rows[0].count}`);
  if (Number(audit.rows[0].count) < operationCount) throw new Error(`Expected allocation audit rows, got ${audit.rows[0].count}`);
  for (const required of ['MES.Execution.WOCreated.v1', 'MES.Execution.WOResourceAllocated.v1', 'MES.Execution.WOApproved.v1']) {
    if (!events[required]) throw new Error(`Missing outbox event ${required}: ${JSON.stringify(events)}`);
  }
  if (!events['MES.Execution.OperationDispatchQueued.v1'] && !events['command.printer.print.batch']) {
    throw new Error(`Missing dispatch outbox event: ${JSON.stringify(events)}`);
  }
  return {
    committed_allocations: Number(allocation.rows[0].committed),
    primary_unit_snapshots: Number(allocation.rows[0].unit_snapshots),
    committed_reservations: Number(reservation.rows[0].count),
    allocation_audit_rows: Number(audit.rows[0].count),
    outbox_events: events,
  };
}

function markdown(summary) {
  const scenarioRows = summary.phase1.scenarios.map((item) => `| ${item.name} | ${item.status.toUpperCase()} |`).join('\n');
  const stepRows = summary.steps.map((item) => `| ${item.name} | ${item.status.toUpperCase()} | ${item.error || ''} |`).join('\n');
  return `# MES Resource Planning Phase 2 Full API Verification

- Run ID: ${summary.run_id}
- Status: ${summary.status}
- Target date: ${summary.target_date}
- Artifact JSON: ${resultArtifact}
- Work Orders cleaned up: ${summary.cleanup.deleted_work_orders}
- Remaining target rows: ${summary.cleanup.remaining_target_rows}

## Full Flow Steps

| Step | Status | Error |
| --- | --- | --- |
${stepRows}

## Negative Scenario Matrix

| Scenario | Status |
| --- | --- |
${scenarioRows}
`;
}

async function writeArtifacts(summary) {
  await fs.mkdir(artifactRoot, { recursive: true });
  await fs.writeFile(resultArtifact, JSON.stringify(summary, null, 2));
  await fs.writeFile(markdownArtifact, markdown(summary));
}

async function main() {
  assertSafety();
  await fs.mkdir(artifactRoot, { recursive: true });
  await executionDb.connect();
  await masterDb.connect();

  await record('authenticate through supported trusted-gateway identity path', async () => {
    const health = await execution('/work-orders?limit=1');
    return { mode: 'trusted-gateway-headers', user_id_header: userId, role_code_header: roleCode, status: health.status };
  });

  const masterContext = await record('reuse deterministic released master-data chain', async () => {
    return selectReadyContextWithAllocatableOperations();
  });

  const workOrder = await record('create Work Order from production_version_id and wait workflow', async () => createWorkOrder(masterContext.version, masterContext.shift));
  const initialDetail = await record('load created Work Order routing snapshot', async () => {
    const snapshot = await detail(workOrder.work_order_id);
    if (!snapshot.operations?.length) throw new Error('Created Work Order has no operations.');
    return snapshot;
  });

  await record('run Compute and Check', async () => execution(`/work-orders/${workOrder.work_order_id}/compute-check`, { method: 'POST', body: '{}' }, [409]));

  const allocations = await record('retrieve candidates and commit one Ready candidate for every operation', async () => {
    const committed = [];
    let cursor = new Date(`${targetDate}T08:00:00.000Z`);
    for (const operation of initialDetail.operations) {
      const start = cursor.toISOString();
      const candidates = await loadCandidates(workOrder.work_order_id, operation.wo_operation_id, masterContext.shift, start);
      const candidate = readyCandidate(candidates.candidates || []);
      if (!candidate) throw new Error(`No Ready candidate for ${operation.operation_code}: ${JSON.stringify(candidates)}`);
      const allocation = await commitCandidate(workOrder.work_order_id, operation, candidate, masterContext.shift, start, initialDetail.row_version);
      committed.push({ operation_code: operation.operation_code, operation_id: operation.wo_operation_id, execution_target_type: operation.execution_target_type, workstation_id: candidate.workstation?.id, allocation_id: allocation.allocation_id });
      const duration = Number(candidate.estimated_duration_min ?? candidate.calculation?.estimated_duration_min ?? 1);
      cursor = new Date(cursor.getTime() + Math.max(duration, 1) * 60_000);
    }
    return committed;
  });
  const printAllocations = allocations.filter((item) => item.execution_target_type === 'PRINT_STATION');

  await record('repair local print-station readiness for exact allocated print workstations', async () => {
    if (skipPrintStationThirdParty && printAllocations.length) {
      return { skipped: true, reason: 'Print-station/third-party integration checks are skipped by request.', print_operations: printAllocations.length };
    }
    const readiness = [];
    for (const allocation of printAllocations) {
      readiness.push(await ensurePrintStationReady(allocation.workstation_id));
    }
    return { print_operations: printAllocations.length, readiness };
  });

  if (skipPrintStationThirdParty && printAllocations.length) {
    recordSkipped('refresh committed snapshots and revalidate allocations', 'Skipped because committed flow includes print-station operations.');
    recordSkipped('approve Work Order with strict resource-allocation policy', 'Skipped because strict approval revalidates print-station allocations.');
    const startResult = recordSkipped('start execution', 'Skipped because execution start depends on print-station dispatch readiness.');
    const persistence = recordSkipped('verify allocation reservation audit and outbox persistence', 'Skipped because print dispatch/outbox persistence is third-party dependent.');
    const cleanup = await record('clean up exact generated Work Order IDs and disposable fixtures', async () => {
      const cleaned = await cleanupWorkOrders();
      await restoreFixtures();
      if (cleaned.remaining_target_rows !== 0) throw new Error(`Cleanup left ${cleaned.remaining_target_rows} target rows.`);
      return cleaned;
    });
    const phase1 = await record('run required negative scenario matrix', async () => {
      await runNodeScript('scripts/test-mes-resource-planning-domain-phase1.mjs', {
        MES_ENV: environment,
        ALLOW_RESOURCE_PLANNING_MUTATION: 'true',
        MES_RESOURCE_PLANNING_PHASE1_OUTPUT: phase1Artifact,
      });
      return JSON.parse(await fs.readFile(phase1Artifact, 'utf8'));
    });
    const summary = {
      success: true,
      status: 'PASS_FOR_PHASE_2_WITH_PRINT_STATION_SKIPPED',
      run_id: runId,
      target_date: targetDate,
      production_version: masterContext.version.production_version_code,
      work_order: { id: workOrder.work_order_id, code: workOrder.work_order_code },
      skipped_reason: 'Print-station/third-party integration checks skipped by request.',
      skipped_print_operations: printAllocations.length,
      start_execution: startResult,
      persistence,
      phase1,
      cleanup,
      steps,
      artifacts: { json: resultArtifact, markdown: markdownArtifact, phase1_json: phase1Artifact },
    };
    await writeArtifacts(summary);
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  await record('refresh committed snapshots and revalidate allocations', async () => {
    const refreshed = await detail(workOrder.work_order_id);
    const committed = refreshed.operations.filter((operation) => operation.resource_allocation?.status === 'Committed');
    if (committed.length !== refreshed.operations.length) throw new Error(`Expected all operations committed, got ${committed.length}/${refreshed.operations.length}`);
    const revalidation = (await execution(`/work-orders/${workOrder.work_order_id}/resource-allocations/revalidate`, { method: 'POST', body: '{}' })).body;
    if (revalidation.valid !== true) throw new Error(`Revalidation failed: ${JSON.stringify(revalidation)}`);
    return { operation_count: refreshed.operations.length, committed_count: committed.length, revalidation };
  });

  await record('approve Work Order with strict resource-allocation policy', async () => {
    const approval = await execution(`/work-orders/${workOrder.work_order_id}/approve`, {
      method: 'POST',
      headers: { 'X-MES-Approval-Policy': 'Strict' },
      body: JSON.stringify({ comment: 'Phase 2 full API verification.' }),
    });
    if (approval.body.status !== 'Released') throw new Error(`Approval did not release WO: ${JSON.stringify(approval.body)}`);
    if (approval.body.approval_policy !== 'Strict' || approval.body.approval_mode !== 'STANDARD') {
      throw new Error(`Strict approval policy was not honored: ${JSON.stringify(approval.body)}`);
    }
    return approval.body;
  });

  const startResult = await record('start execution', async () => {
    const started = await execution(`/work-orders/${workOrder.work_order_id}/start-execution`, { method: 'POST', body: '{}' });
    if (started.body.status !== 'InProgress') throw new Error(`Start execution did not move WO InProgress: ${JSON.stringify(started.body)}`);
    return started.body;
  });

  const persistence = await record('verify allocation reservation audit and outbox persistence', async () => verifyPersistence(workOrder.work_order_id, initialDetail.operations.length));

  const cleanup = await record('clean up exact generated Work Order IDs and disposable fixtures', async () => {
    const cleaned = await cleanupWorkOrders();
    await restoreFixtures();
    if (cleaned.remaining_target_rows !== 0) throw new Error(`Cleanup left ${cleaned.remaining_target_rows} target rows.`);
    return cleaned;
  });

  const phase1 = await record('run required negative scenario matrix', async () => {
    await runNodeScript('scripts/test-mes-resource-planning-domain-phase1.mjs', {
      MES_ENV: environment,
      ALLOW_RESOURCE_PLANNING_MUTATION: 'true',
      MES_RESOURCE_PLANNING_PHASE1_OUTPUT: phase1Artifact,
    });
    return JSON.parse(await fs.readFile(phase1Artifact, 'utf8'));
  });

  const summary = {
    success: true,
    status: 'PASS_FOR_PHASE_2',
    run_id: runId,
    target_date: targetDate,
    production_version: masterContext.version.production_version_code,
    work_order: { id: workOrder.work_order_id, code: workOrder.work_order_code },
    start_execution: startResult,
    persistence,
    phase1,
    cleanup,
    steps,
    artifacts: { json: resultArtifact, markdown: markdownArtifact, phase1_json: phase1Artifact },
  };
  await writeArtifacts(summary);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(async (error) => {
  const cleanup = await cleanupWorkOrders().catch((cleanupError) => ({ error: cleanupError.message }));
  await restoreFixtures().catch((restoreError) => { cleanup.restore_error = restoreError.message; });
  const summary = { success: false, status: 'FAIL_PHASE_2', run_id: runId, target_date: targetDate, error: error.stack || error.message, cleanup, steps };
  await writeArtifacts(summary).catch(() => undefined);
  console.error(`[phase2] FAILED: ${error.stack || error.message}`);
  process.exitCode = 1;
}).finally(async () => {
  try { await executionDb.end(); } catch {}
  try { await masterDb.end(); } catch {}
});
