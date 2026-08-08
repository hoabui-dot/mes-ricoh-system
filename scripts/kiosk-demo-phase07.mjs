#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

const { Client } = pg;
const action = process.argv[2];
const environment = String(process.env.MES_ENV || '').trim().toLowerCase();
const executionBase = (process.env.MES_EXECUTION_URL || 'http://localhost:18000/api/mes/execution').replace(/\/$/, '');
const masterBase = (process.env.MES_MASTER_DATA_URL || 'http://localhost:18000/api/mes/master-data').replace(/\/$/, '');
const gatewayBase = (process.env.MES_KIOSK_GATEWAY_URL || 'http://localhost:18000/api/mes/kiosk-gateway').replace(/\/$/, '');
const executionUrl = process.env.MES_EXECUTION_DATABASE_URL || 'postgresql://mes_execution_user:mes_execution_pass@localhost:15435/mes_execution_db';
const masterUrl = process.env.MES_MASTER_DATA_DATABASE_URL || 'postgresql://mes_master_data_user:mes_master_data_pass@localhost:15434/mes_master_data_db';
const gatewayUrl = process.env.MES_KIOSK_GATEWAY_DATABASE_URL || 'postgresql://mes_kiosk_user:mes_kiosk_pass@localhost:15437/mes_kiosk_gateway_db';
const artifactDir = path.resolve(process.env.ARTIFACT_DIR || 'artifacts/kiosk-demo-job-card/phase-07/manual');
const managerUserId = process.env.MES_E2E_USER_ID || '00000000-0000-0000-0000-000000000001';
const managerRole = process.env.MES_KIOSK_PREP_ROLE || 'PLANT_MANAGER';
const terminalCode = 'KIOSK-DEMO-01';
const productionVersionCode = 'WST-SEED-PV-SEAL-ASM-01';
// Keep the demo fixture aligned with the canonical MES seed. The seed uses
// the next working day because the current date may be a weekend.
const targetDate = process.env.KIOSK_DEMO_TARGET_DATE || '2026-08-10';
const expectedManualOperations = ['WST-SEED-OP-BINDING', 'WST-SEED-OP-TEST5IN1', 'WST-SEED-OP-AIRTEST'];
const scenarios = {
  success: { idempotencyKey: 'KIOSK-DEMO-PHASE07-SUCCESS-V1', quantity: 2, start: `${targetDate}T08:00:00.000Z` },
  failure: { idempotencyKey: 'KIOSK-DEMO-PHASE07-FAILURE-V1', quantity: 3, start: `${targetDate}T13:00:00.000Z` },
};

const report = { success: false, action, generated_at: new Date().toISOString(), checks: [], data: {} };
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function safetyCheck(mutationRequired) {
  const failures = [];
  if (!['development', 'local', 'test', 'uat'].includes(environment)) failures.push('MES_ENV must be development, local, test, or uat');
  if (mutationRequired && process.env.ALLOW_KIOSK_DEMO_MUTATION !== 'true') failures.push('ALLOW_KIOSK_DEMO_MUTATION must equal true');
  for (const rawUrl of [executionUrl, masterUrl, gatewayUrl]) {
    const parsed = new URL(rawUrl);
    if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) failures.push(`database host must be local/test: ${parsed.hostname}`);
    if (/prod|production|live/i.test(parsed.pathname)) failures.push(`database name is production-like: ${parsed.pathname}`);
  }
  if (failures.length) throw new Error(`KIOSK_DEMO_SAFETY_CHECK_FAILED: ${failures.join('; ')}`);
}

function check(name, condition, details = {}) {
  const passed = Boolean(condition);
  report.checks.push({ name, passed, ...details });
  if (!passed) throw new Error(`KIOSK_DEMO_VERIFY_FAILED: ${name}`);
}

async function request(base, requestPath, init = {}, identity = 'manager') {
  const headers = { 'Content-Type': 'application/json', 'X-Trace-ID': `phase07-${action}`, ...(init.headers || {}) };
  if (identity === 'manager') {
    headers['X-User-ID'] = managerUserId;
    headers['X-Role-Code'] = managerRole;
  }
  const response = await fetch(`${base}${requestPath}`, { ...init, headers, cache: 'no-store' });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { message: text }; }
  if (!response.ok) throw new Error(`${init.method || 'GET'} ${requestPath} -> ${response.status}: ${JSON.stringify(body)}`);
  return body?.data ?? body;
}

const execution = (requestPath, init) => request(executionBase, requestPath, init);
const master = (requestPath, init) => request(masterBase, requestPath, init);

async function canonicalPreparationContext() {
  const versions = await master(`/production-ready-versions?planned_date=${encodeURIComponent(targetDate)}&limit=500`);
  const version = versions.find((item) => item.production_version_code === productionVersionCode && item.readiness_status === 'Ready');
  if (!version) throw new Error(`KIOSK_DEMO_PRODUCTION_VERSION_NOT_READY: ${productionVersionCode}`);
  const shifts = await master(`/shifts?site_id=${encodeURIComponent(version.site_id)}&limit=500`);
  const shift = shifts.find((item) => item.code === 'SHIFT-A' && item.lifecycle_status !== 'Inactive');
  if (!shift) throw new Error('KIOSK_DEMO_SHIFT_A_NOT_READY');
  return { version, shift };
}

async function awaitWorkflow(workflowId) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const snapshot = await execution(`/work-order-creation-workflows/${workflowId}`);
    if (snapshot.status === 'succeeded') return snapshot;
    if (snapshot.status === 'failed') throw new Error(`KIOSK_DEMO_WORKFLOW_FAILED: ${JSON.stringify(snapshot)}`);
    await sleep(200);
  }
  throw new Error(`KIOSK_DEMO_WORKFLOW_TIMEOUT: ${workflowId}`);
}

function readyCandidate(candidates, selectedLineId) {
  return (candidates || []).find((candidate) =>
    candidate.readiness !== 'Blocked'
    && !(candidate.blocking_errors || []).length
    && !(candidate.capacity_conflicts || []).length
    && (!candidate.production_line?.id || candidate.production_line.id === selectedLineId));
}

async function allocateAll(workOrderId, detail, shift, scenario) {
  let cursor = new Date(scenario.start);
  const allocations = [];
  for (const operation of detail.operations || []) {
    const candidates = await execution(`/work-orders/${workOrderId}/operations/${operation.wo_operation_id}/resource-candidates?planned_start_at=${encodeURIComponent(cursor.toISOString())}&shift_id=${encodeURIComponent(shift.master_id)}`);
    const candidate = readyCandidate(candidates.candidates, detail.header.selected_production_line_id);
    if (!candidate) throw new Error(`KIOSK_DEMO_NO_READY_RESOURCE:${operation.operation_code}:${JSON.stringify(candidates)}`);
    const allocation = await execution(`/work-orders/${workOrderId}/operations/${operation.wo_operation_id}/resource-allocation`, {
      method: 'POST',
      headers: { 'Idempotency-Key': `${scenario.idempotencyKey}-ALLOC-${operation.sequence_no}` },
      body: JSON.stringify({
        workstation_id: candidate.workstation?.id,
        equipment_id: candidate.primary_machine?.id || candidate.equipment?.id,
        machine_group_id: candidate.machine_group?.id,
        shift_id: shift.master_id,
        planned_start_at: cursor.toISOString(),
        candidate_reference: `${candidate.assignment?.id || ''}:${candidate.machine_group?.id || ''}:${candidate.capability?.id || ''}`,
        row_version: detail.header.row_version,
      }),
    });
    allocations.push({ operation_code: operation.operation_code, allocation_id: allocation.allocation_id });
    const duration = Math.max(Number(candidate.estimated_duration_min || candidate.calculation?.estimated_duration_min || 1), 1);
    cursor = new Date(cursor.getTime() + duration * 60_000);
  }
  return allocations;
}

async function prepareScenario(name) {
  safetyCheck(true);
  const scenario = scenarios[name];
  if (!scenario) throw new Error(`unknown scenario ${name}`);
  const context = await canonicalPreparationContext();
  const started = await execution('/work-order-creation-workflows', {
    method: 'POST',
    headers: { 'Idempotency-Key': scenario.idempotencyKey },
    body: JSON.stringify({
      production_version_id: context.version.production_version_id,
      quantity: scenario.quantity,
      shift_id: context.shift.master_id,
      planned_start_at: scenario.start,
      planned_end_at: new Date(new Date(scenario.start).getTime() + 4 * 60 * 60_000).toISOString(),
      dispatch_mode: 'DEMO_SHARED_KIOSK',
    }),
  });
  const workflow = await awaitWorkflow(started.workflow_id);
  const workOrderId = workflow.work_order_id;
  let detail = await execution(`/work-orders/${workOrderId}`);
  if (detail.header.status === 'InProgress') {
    report.data = { scenario: name, workflow_id: workflow.workflow_id, work_order_id: workOrderId, work_order_code: workflow.work_order_code, idempotent_replay: true };
    return;
  }
  if (detail.header.status !== 'Draft' && detail.header.status !== 'Released') {
    throw new Error(`KIOSK_DEMO_PREPARATION_STALE_STATE:${detail.header.status}`);
  }
  let allocations = [];
  if (detail.header.status === 'Draft') {
    allocations = await allocateAll(workOrderId, detail, context.shift, scenario);
    const revalidation = await execution(`/work-orders/${workOrderId}/resource-allocations/revalidate`, { method: 'POST', body: '{}' });
    if (revalidation.valid !== true) throw new Error(`KIOSK_DEMO_REVALIDATION_FAILED:${JSON.stringify(revalidation)}`);
    await execution(`/work-orders/${workOrderId}/approve`, {
      method: 'POST', headers: { 'X-MES-Approval-Policy': 'Strict' }, body: JSON.stringify({ comment: `Phase 07 ${name} Demo Kiosk preparation.` }),
    });
  }
  const startedExecution = await execution(`/work-orders/${workOrderId}/start-execution`, { method: 'POST', body: '{}' });
  if (startedExecution.status !== 'InProgress') throw new Error(`KIOSK_DEMO_START_EXECUTION_FAILED:${JSON.stringify(startedExecution)}`);
  detail = await execution(`/work-orders/${workOrderId}`);
  report.data = {
    scenario: name, workflow_id: workflow.workflow_id, work_order_id: workOrderId,
    work_order_code: workflow.work_order_code, status: detail.header.status,
    dispatch_mode: detail.header.dispatch_mode, selected_line_code: detail.header.selected_production_line_code,
    operation_count: detail.operations.length, allocations,
  };
}

async function loginOperator() {
  return request(gatewayBase, `/terminals/${terminalCode}/login`, {
    method: 'POST',
    body: JSON.stringify({
      employee_id: process.env.KIOSK_DEMO_USERNAME || 'operator01',
      pin: process.env.KIOSK_DEMO_PASSWORD || 'Operator@123!',
    }),
  }, 'none');
}

async function verifyPreparedScenarios() {
  safetyCheck(false);
  const executionDb = new Client({ connectionString: executionUrl });
  const masterDb = new Client({ connectionString: masterUrl });
  const gatewayDb = new Client({ connectionString: gatewayUrl });
  await executionDb.connect(); await masterDb.connect(); await gatewayDb.connect();
  let login;
  try {
    const rows = (await executionDb.query(`
      SELECT f.idempotency_key,f.workflow_id::text,f.work_order_id::text,h.wo_code,h.status::text,h.dispatch_mode
      FROM wo_creation_workflow f JOIN wo_header h ON h.wo_id=f.work_order_id
      WHERE f.user_id=$1 AND f.idempotency_key=ANY($2::text[])
      ORDER BY f.idempotency_key
    `, [managerUserId, Object.values(scenarios).map((item) => item.idempotencyKey)])).rows;
    check('exactly two deterministic preparation workflows', rows.length === 2, { actual: rows.length });
    login = await loginOperator();
    check('demo operator has verified token and terminal session', Boolean(login.access_token && login.terminal_session_id));
    const bearer = { Authorization: `Bearer ${login.access_token}` };
    const list = await request(executionBase, `/kiosk/terminals/${terminalCode}/work-orders?page=1&page_size=100`, { headers: bearer }, 'none');
    const verification = [];
    for (const row of rows) {
      const occurrences = list.filter((item) => item.wo_id === row.work_order_id);
      check(`${row.idempotency_key} appears as one grouped card`, occurrences.length === 1, { actual: occurrences.length });
      check(`${row.idempotency_key} grouped card has three manual jobs`, occurrences[0].job_counts.total === expectedManualOperations.length, { actual: occurrences[0].job_counts.total });
      const detail = await request(executionBase, `/kiosk/terminals/${terminalCode}/work-orders/${row.work_order_id}`, { headers: bearer }, 'none');
      const manualCodes = detail.job_cards.map((item) => item.operation_code);
      check(`${row.idempotency_key} has expected manual Job Cards`, JSON.stringify(manualCodes) === JSON.stringify(expectedManualOperations), { actual: manualCodes });
      check(`${row.idempotency_key} has no Print Station dependency`, detail.print_operations.length === 0, { actual: detail.print_operations });
      check(`${row.idempotency_key} has Work Center and Workstation context`, detail.job_cards.every((item) => item.resource.work_center?.code && item.resource.workstation?.id));
      check(`${row.idempotency_key} has deterministic predecessor sequences`, JSON.stringify(detail.job_cards.map((item) => item.predecessor_sequences)) === JSON.stringify([[], [10], [20]]));
      check(`${row.idempotency_key} first job is executable and successors blocked`, detail.job_cards[0].action_eligibility.can_start === true && detail.job_cards[1].predecessor_status === 'BLOCKED' && detail.job_cards[2].predecessor_status === 'BLOCKED');
      verification.push({ workflow: row, summary: occurrences[0], detail });
    }
    const reasons = await request(masterBase, '/reason-codes?limit=500', { headers: bearer }, 'none');
    check('released execution failure reason is available', reasons.some((item) => item.code === 'KIOSK-DEMO-EXECUTION-FAIL' && item.reason_type === 'ExecutionFailure' && item.lifecycle_status === 'Released'));
    check('released abort reason is available', reasons.some((item) => item.code === 'KIOSK-DEMO-ABORT' && item.reason_type === 'Abort' && item.lifecycle_status === 'Released'));
    const ids = rows.map((row) => row.work_order_id);
    const runtime = (await executionDb.query(`
      SELECT
        (SELECT COUNT(*)::int FROM execution_session s JOIN wo_operation o ON o.wo_operation_id=s.wo_operation_id WHERE o.wo_id=ANY($1::uuid[])) AS sessions,
        (SELECT COUNT(*)::int FROM wo_resource_allocation WHERE wo_id=ANY($1::uuid[]) AND status='Committed' AND validation_status IN ('Valid','ValidWithWarnings')) AS allocations,
        (SELECT COUNT(*)::int FROM wo_capacity_reservation WHERE wo_id=ANY($1::uuid[]) AND status='Committed') AS reservations,
        (SELECT COUNT(*)::int FROM (
          SELECT wo_operation_id
          FROM wo_capacity_reservation
          WHERE wo_id=ANY($1::uuid[]) AND status='Committed'
          GROUP BY wo_operation_id
          HAVING COUNT(*)=3 AND COUNT(DISTINCT resource_type)=3
            AND BOOL_AND(resource_type IN ('WorkCenter','Workstation','Equipment'))
        ) complete_reservation_sets) AS complete_reservation_sets,
        (SELECT COUNT(*)::int FROM (
          SELECT wo_operation_id,resource_type,resource_id
          FROM wo_capacity_reservation
          WHERE wo_id=ANY($1::uuid[]) AND status='Committed'
          GROUP BY wo_operation_id,resource_type,resource_id
          HAVING COUNT(*) > 1
        ) duplicate_reservations) AS duplicate_reservations,
        (SELECT COUNT(*)::int FROM wo_operation WHERE wo_id=ANY($1::uuid[])) AS operations
    `, [ids])).rows[0];
    check('prepared scenarios have no stale execution session', runtime.sessions === 0, { actual: runtime.sessions });
    check('every prepared operation has one committed allocation', runtime.allocations === runtime.operations, { allocations: runtime.allocations, operations: runtime.operations });
    check('every prepared operation has a complete committed resource reservation set', runtime.complete_reservation_sets === runtime.operations, { reservation_sets: runtime.complete_reservation_sets, reservations: runtime.reservations, operations: runtime.operations });
    check('prepared scenarios have no duplicate resource reservation', runtime.duplicate_reservations === 0, { actual: runtime.duplicate_reservations });
    const queue = (await gatewayDb.query(`
      SELECT COUNT(*)::int AS messages,COUNT(DISTINCT event_id)::int AS unique_events
      FROM outbound_message_queue WHERE payload::text LIKE ANY($1::text[])
    `, [ids.map((id) => `%${id}%`)])).rows[0];
    check('prepared Gateway queue has no duplicate event', queue.messages === queue.unique_events, queue);
    report.data = { work_orders: rows, runtime, queue, verified: verification.length };
  } finally {
    if (login?.access_token) {
      await request(gatewayBase, `/terminals/${terminalCode}/logout`, { method: 'POST', headers: { Authorization: `Bearer ${login.access_token}` }, body: '{}' }, 'none').catch(() => undefined);
    }
    await executionDb.end(); await masterDb.end(); await gatewayDb.end();
  }
}

async function cleanupPreparedScenarios() {
  safetyCheck(true);
  const executionDb = new Client({ connectionString: executionUrl });
  const gatewayDb = new Client({ connectionString: gatewayUrl });
  await executionDb.connect(); await gatewayDb.connect();
  try {
    const keys = Object.values(scenarios).map((item) => item.idempotencyKey);
    const workflows = (await executionDb.query(`SELECT workflow_id::text,work_order_id::text FROM wo_creation_workflow WHERE user_id=$1 AND idempotency_key=ANY($2::text[])`, [managerUserId, keys])).rows;
    const ids = workflows.map((row) => row.work_order_id).filter(Boolean);
    const patterns = ids.map((id) => `%${id}%`);
    const executionEventIds = ids.length
      ? (await executionDb.query(`SELECT id::text FROM outbox_events WHERE payload::text LIKE ANY($1::text[])`, [patterns])).rows.map((row) => row.id)
      : [];
    if (ids.length) {
      const cleanup = spawnSync(process.execPath, ['scripts/cleanup-mes-resource-planning-e2e.mjs', ...ids], { cwd: process.cwd(), encoding: 'utf8', env: process.env });
      if (cleanup.status !== 0) throw new Error(`KIOSK_DEMO_EXECUTION_CLEANUP_FAILED:${cleanup.stderr || cleanup.stdout}`);
    }
    await executionDb.query(`DELETE FROM wo_creation_workflow_event WHERE workflow_id IN (SELECT workflow_id FROM wo_creation_workflow WHERE user_id=$1 AND idempotency_key=ANY($2::text[]))`, [managerUserId, keys]);
    await executionDb.query(`DELETE FROM wo_creation_workflow WHERE user_id=$1 AND idempotency_key=ANY($2::text[])`, [managerUserId, keys]);
    if (ids.length) {
      await gatewayDb.query(`DELETE FROM consumed_execution_event WHERE event_id=ANY($1::text[]) OR event_id IN (SELECT event_id FROM outbound_message_queue WHERE payload::text LIKE ANY($2::text[]))`, [executionEventIds, patterns]);
      await gatewayDb.query(`DELETE FROM outbound_message_queue WHERE payload::text LIKE ANY($1::text[])`, [patterns]);
    }
    await gatewayDb.query(`UPDATE terminal_session SET status='CLOSED',logged_out_at=COALESCE(logged_out_at,NOW()) WHERE terminal_id=(SELECT terminal_id FROM terminal WHERE terminal_code=$1) AND status='ACTIVE'`, [terminalCode]);
    const leftovers = (await executionDb.query(`
      SELECT
        (SELECT COUNT(*)::int FROM wo_creation_workflow WHERE user_id=$1 AND idempotency_key=ANY($2::text[])) AS workflows,
        (SELECT COUNT(*)::int FROM wo_header WHERE wo_id=ANY($3::uuid[])) AS work_orders,
        (SELECT COUNT(*)::int FROM execution_session s JOIN wo_operation o ON o.wo_operation_id=s.wo_operation_id WHERE o.wo_id=ANY($3::uuid[])) AS sessions,
        (SELECT COUNT(*)::int FROM wo_resource_allocation WHERE wo_id=ANY($3::uuid[])) AS allocations,
        (SELECT COUNT(*)::int FROM wo_capacity_reservation WHERE wo_id=ANY($3::uuid[])) AS reservations,
        (SELECT COUNT(*)::int FROM outbox_events WHERE payload::text LIKE ANY($4::text[])) AS outbox_events
    `, [managerUserId, keys, ids, ids.map((id) => `%${id}%`)])).rows[0];
    const queueLeaks = ids.length ? Number((await gatewayDb.query(`SELECT COUNT(*)::int AS count FROM outbound_message_queue WHERE payload::text LIKE ANY($1::text[])`, [ids.map((id) => `%${id}%`)])).rows[0].count) : 0;
    check('cleanup leaves zero preparation workflows', leftovers.workflows === 0, leftovers);
    check('cleanup leaves zero Work Orders', leftovers.work_orders === 0, leftovers);
    check('cleanup leaves zero sessions', leftovers.sessions === 0, leftovers);
    check('cleanup leaves zero allocations', leftovers.allocations === 0, leftovers);
    check('cleanup leaves zero reservations', leftovers.reservations === 0, leftovers);
    check('cleanup leaves zero outbox events', leftovers.outbox_events === 0, leftovers);
    check('cleanup leaves zero Gateway queue records', queueLeaks === 0, { queue_leaks: queueLeaks });
    const consumedLeaks = executionEventIds.length ? Number((await gatewayDb.query(`SELECT COUNT(*)::int AS count FROM consumed_execution_event WHERE event_id=ANY($1::text[])`, [executionEventIds])).rows[0].count) : 0;
    check('cleanup leaves zero consumed Gateway test events', consumedLeaks === 0, { consumed_event_leaks: consumedLeaks });
    report.data = { removed_work_order_ids: ids, removed_event_ids: executionEventIds, leftovers, gateway_queue_leaks: queueLeaks, consumed_event_leaks: consumedLeaks };
  } finally {
    await executionDb.end(); await gatewayDb.end();
  }
}

async function writeReport() {
  await fs.mkdir(artifactDir, { recursive: true });
  report.success = report.checks.every((item) => item.passed !== false);
  report.completed_at = new Date().toISOString();
  await fs.writeFile(path.join(artifactDir, `kiosk-demo-${action}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

try {
  if (action === 'prepare-success') await prepareScenario('success');
  else if (action === 'prepare-failure') await prepareScenario('failure');
  else if (action === 'verify') await verifyPreparedScenarios();
  else if (action === 'cleanup') await cleanupPreparedScenarios();
  else throw new Error('Usage: kiosk-demo-phase07.mjs <prepare-success|prepare-failure|verify|cleanup>');
  await writeReport();
} catch (error) {
  report.error = error.message;
  report.success = false;
  await writeReport().catch(() => undefined);
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
