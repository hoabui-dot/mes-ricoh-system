#!/usr/bin/env node

/*
 * Phase 1 guarded API verification for the current MES Resource Planning
 * domain. Behavior assertions go through the HTTP APIs; direct database writes
 * are limited to local disposable fixture setup/restore for negative states.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const apiBase = (process.env.MES_EXECUTION_URL || 'http://100.68.50.41:18000/api/mes/execution').replace(/\/$/, '');
const masterBase = (process.env.MES_MASTER_DATA_URL || 'http://100.68.50.41:18000/api/mes/master-data').replace(/\/$/, '');
const executionUrl = process.env.MES_EXECUTION_DATABASE_URL || 'postgresql://mes_execution_user:mes_execution_pass@localhost:15435/mes_execution_db';
const masterUrl = process.env.MES_MASTER_DATA_DATABASE_URL || 'postgresql://mes_master_data_user:mes_master_data_pass@localhost:15434/mes_master_data_db';
const environment = String(process.env.MES_ENV || '').toLowerCase();
const allowMutation = process.env.ALLOW_RESOURCE_PLANNING_MUTATION === 'true';
const userId = process.env.MES_E2E_USER_ID || '00000000-0000-0000-0000-000000000001';
const targetDate = process.env.E2E_WO_TARGET_DATE || defaultPlanningDate();
const runId = `PHASE1-RP-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
const executionDb = new Client({ connectionString: executionUrl });
const masterDb = new Client({ connectionString: masterUrl });
const created = { workOrderIds: [], workflowIds: [] };
const restores = [];
const results = [];

async function writePhase1Artifact(summary) {
  const outputPath = process.env.MES_RESOURCE_PLANNING_PHASE1_OUTPUT;
  if (!outputPath) return;
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(summary, null, 2));
}

function defaultPlanningDate() {
  const date = new Date();
  const day = date.getUTCDay();
  if (day === 6) date.setUTCDate(date.getUTCDate() + 2);
  if (day === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function assertSafety() {
  if (!['development', 'local', 'test', 'staging'].includes(environment)) throw new Error('MES_ENV must be development, local, test, or staging.');
  if (!allowMutation) throw new Error('Set ALLOW_RESOURCE_PLANNING_MUTATION=true to run this disposable Phase 1 flow.');
  for (const url of [executionUrl, masterUrl]) {
    const host = new URL(url).hostname;
    if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error(`Database URL must use a local/test host: ${host}`);
  }
}

async function request(base, path, init = {}, allowed = []) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-User-ID': userId,
      'X-Role-Code': 'PLANT_MANAGER',
      'X-Trace-ID': runId,
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { message: text }; }
  if (!response.ok && !allowed.includes(response.status)) {
    throw new Error(`${init.method || 'GET'} ${path} -> ${response.status}: ${JSON.stringify(body)}`);
  }
  return { status: response.status, body: body?.data ?? body };
}

const execution = (path, init, allowed) => request(apiBase, path, init, allowed);
const master = (path, init, allowed) => request(masterBase, path, init, allowed);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function uuid() {
  return crypto.randomUUID();
}

function codesFrom(payload) {
  return JSON.stringify(payload);
}

function assertIncludesCode(payload, code) {
  if (!codesFrom(payload).includes(code)) throw new Error(`Expected ${code}, got ${JSON.stringify(payload)}`);
}

function assertIncludesAnyCode(payload, codes) {
  const serialized = codesFrom(payload);
  if (!codes.some((code) => serialized.includes(code))) throw new Error(`Expected one of ${codes.join(', ')}, got ${JSON.stringify(payload)}`);
}

function assertStatus(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected HTTP ${expected}, got ${actual}`);
}

async function scenario(name, fn) {
  const restoreMark = restores.length;
  try {
    await fn();
    await restoreTo(restoreMark);
    results.push({ name, status: 'passed' });
    console.log(`[phase1] PASS ${name}`);
  } catch (error) {
    await restoreTo(restoreMark);
    results.push({ name, status: 'failed', error: error.message });
    throw error;
  }
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
  await restoreTo(0);
}

async function restoreTo(mark) {
  while (restores.length) {
    if (restores.length <= mark) return;
    const restore = restores.pop();
    await restore();
  }
}

async function cleanupWorkOrders() {
  if (!created.workOrderIds.length) return;
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
    await q(`DELETE FROM wo_header WHERE wo_id=ANY($1::uuid[])`);
    await executionDb.query('COMMIT');
    const remaining = await executionDb.query(`SELECT COUNT(*)::int AS count FROM wo_header WHERE wo_id=ANY($1::uuid[])`, [ids]);
    if (Number(remaining.rows[0].count) !== 0) throw new Error(`Cleanup left ${remaining.rows[0].count} Work Order rows.`);
  } catch (error) {
    await executionDb.query('ROLLBACK');
    throw error;
  }
}

async function createWorkOrder(version, shift, quantity, suffix) {
  const started = await execution('/work-order-creation-workflows', {
    method: 'POST',
    headers: { 'Idempotency-Key': `${runId}-${suffix}` },
    body: JSON.stringify({ production_version_id: version.production_version_id, quantity, target_date: targetDate, shift_id: shift.master_id }),
  });
  created.workflowIds.push(started.body.workflow_id);
  for (let attempt = 0; attempt < 70; attempt += 1) {
    const snapshot = (await execution(`/work-order-creation-workflows/${started.body.workflow_id}`)).body;
    if (snapshot.status === 'succeeded') {
      created.workOrderIds.push(snapshot.work_order_id);
      return snapshot;
    }
    if (snapshot.status === 'failed') throw new Error(`WORK_ORDER_CREATE_FAILED: ${JSON.stringify(snapshot)}`);
    await sleep(200);
  }
  throw new Error(`WORK_ORDER_CREATE_TIMEOUT: ${started.body.workflow_id}`);
}

async function detail(wo) {
  return (await execution(`/work-orders/${wo.work_order_id}`)).body;
}

async function loadCandidates(wo, operation, shift, start) {
  return (await execution(`/work-orders/${wo.work_order_id}/operations/${operation.wo_operation_id}/resource-candidates?planned_start_at=${encodeURIComponent(start)}&shift_id=${encodeURIComponent(shift.master_id)}`)).body;
}

function readyCandidate(candidates, predicate = () => true) {
  return candidates.find((candidate) => predicate(candidate) && candidate.readiness !== 'Blocked' && !(candidate.blocking_errors || []).length && !(candidate.capacity_conflicts || []).length);
}

function payloadFor(candidate, shift, start, rowVersion) {
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

async function allocate(wo, operation, candidate, shift, start, key, allowed = []) {
  return execution(`/work-orders/${wo.work_order_id}/operations/${operation.wo_operation_id}/resource-allocation`, {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: JSON.stringify(payloadFor(candidate, shift, start, wo.row_version)),
  }, allowed);
}

async function reallocate(wo, operation, candidate, shift, start, key, reason, allowed = []) {
  const body = payloadFor(candidate, shift, start, wo.row_version);
  body.change_reason = reason;
  return execution(`/work-orders/${wo.work_order_id}/operations/${operation.wo_operation_id}/reallocate`, {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: JSON.stringify(body),
  }, allowed);
}

async function allocateAllOperations(wo, shift, startDate) {
  const woDetail = await detail(wo);
  let cursor = new Date(startDate);
  const committed = [];
  for (const operation of woDetail.operations) {
    const start = cursor.toISOString();
    const candidates = await loadCandidates(wo, operation, shift, start);
    const candidate = readyCandidate(candidates.candidates || []);
    if (!candidate) throw new Error(`No Ready candidate for ${operation.operation_code}: ${JSON.stringify(candidates)}`);
    const response = await allocate(wo, operation, candidate, shift, start, `${runId}-ALLOC-${operation.wo_operation_id}`);
    committed.push({ operation, candidate, allocation: response.body, start });
    const duration = Number(candidate.estimated_duration_min ?? candidate.calculation?.estimated_duration_min ?? 1);
    cursor = new Date(cursor.getTime() + Math.max(duration, 1) * 60_000);
  }
  return committed;
}

async function readyGroupCandidateAt(wo, operation, shift, starts, groupId) {
  let fallback = null;
  let fallbackStart = '';
  for (const start of starts) {
    const candidates = (await loadCandidates(wo, operation, shift, start)).candidates || [];
    const candidate = readyCandidate(candidates, (item) => item.machine_group?.id === groupId);
    if (candidate) return { start, candidate };
    if (!fallback) {
      fallback = readyCandidate(candidates);
      fallbackStart = start;
    }
  }
  if (fallback) return { start: fallbackStart, candidate: fallback };
  throw new Error(`No Ready candidate for machine group ${groupId} at ${starts.join(', ')}`);
}

async function baselineFixture(version, shift) {
  const workOrder = await createWorkOrder(version, shift, 2, 'BASELINE');
  const woDetail = await detail(workOrder);
  const operation = woDetail.operations[0];
  const start = `${targetDate}T08:00:00.000Z`;
  const firstReadiness = await loadCandidates(workOrder, operation, shift, start);
  const repairCandidate = (firstReadiness.candidates || []).find((item) => item.machine_group?.id && item.primary_machine?.unit_id && item.production_standard?.id);
  if (!repairCandidate) throw new Error(`No machine-group candidate with a production standard for Phase 1 fixture: ${JSON.stringify(firstReadiness)}`);
  await repairPlanningFixture(version, shift, operation, start, repairCandidate, firstReadiness);
  const candidates = await loadCandidates(workOrder, operation, shift, start);
  const candidate = readyCandidate(candidates.candidates || [], (item) => item.machine_group?.id === repairCandidate.machine_group.id && item.primary_machine?.unit_id);
  if (!candidate) throw new Error(`No Ready machine-group candidate for Phase 1 fixture: ${JSON.stringify(candidates)}`);
  return { workOrder, operation, start, candidate, workCenterId: candidates.operation?.work_center_id || operation.work_center_id };
}

async function repairPlanningFixture(version, shift, operation, start, candidate, readiness) {
  const workCenterId = readiness.operation?.work_center_id || operation.work_center_id;
  await snapshotUpdate(masterDb, 'md_workstation_machine_group', 'master_id', candidate.machine_group.id, {
    site_id: version.site_id,
    work_center_id: workCenterId,
    lifecycle_status: 'Released',
    effective_to: null,
  });
  await snapshotUpdate(masterDb, 'md_workstation', 'master_id', candidate.workstation.id, {
    site_id: version.site_id,
    work_center_id: workCenterId,
    lifecycle_status: 'Released',
    active_flag: true,
    effective_to: null,
  });
  await snapshotUpdate(masterDb, 'md_equipment', 'master_id', candidate.primary_machine.id, {
    site_id: version.site_id,
    work_center_id: workCenterId,
    lifecycle_status: 'Released',
    active_flag: true,
    execution_status: 'Available',
    planning_resource_flag: true,
    effective_to: null,
  });
  await snapshotUpdate(masterDb, 'md_machine_unit', 'machine_unit_id', candidate.primary_machine.unit_id, {
    active_flag: true,
    execution_status: 'Available',
    physical_identity_status: 'Identified',
    planning_resource_flag: true,
  });
  await ensureCalendar(version, shift, workCenterId, candidate, start);
  await ensureWorker(version, shift, workCenterId, readiness);
}

async function ensureCalendar(version, shift, workCenterId, candidate, start) {
  if (candidate.calendar?.id) {
    await snapshotUpdate(masterDb, 'md_resource_calendar', 'master_id', candidate.calendar.id, {
      site_id: version.site_id,
      work_center_id: workCenterId,
      equipment_id: candidate.primary_machine.id,
      resource_type: 'Equipment',
      resource_id: candidate.primary_machine.id,
      workstation_id: candidate.workstation.id,
      calendar_date: targetDate,
      shift_id: shift.master_id,
      availability_status: 'Available',
      available_minutes: 540,
      capacity_factor: 1,
      lifecycle_status: 'Released',
      effective_to: null,
    });
    return;
  }
  const calendarId = uuid();
  await masterDb.query(`
    INSERT INTO md_resource_calendar
      (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, work_center_id, equipment_id, available_from, available_to, capacity_percent, site_id, resource_type, resource_id, workstation_id, calendar_date, shift_id, availability_status, available_minutes, capacity_factor)
    VALUES
      ($1, $2, $3, 1, 'Released', NOW(), $4, $5, $6, $7, $8, 1, $9, 'Equipment', $6, $10, $11::date, $12, 'Available', 540, 1)`,
  [calendarId, `PHASE1-CAL-${runId}`, 'Phase 1 fixture calendar', userId, workCenterId, candidate.primary_machine.id, start, new Date(new Date(start).getTime() + 8 * 60 * 60 * 1000).toISOString(), version.site_id, candidate.workstation.id, targetDate, shift.master_id]);
  candidate.calendar = { id: calendarId };
  restores.push(async () => {
    await masterDb.query(`DELETE FROM md_resource_calendar WHERE master_id=$1`, [calendarId]);
  });
}

async function ensureWorker(version, shift, workCenterId, readiness) {
  const requirement = readiness.worker_readiness?.[0];
  if (!requirement?.skill_id) return;
  const employeeId = uuid();
  const scheduleId = uuid();
  await masterDb.query(`
    INSERT INTO md_employee
      (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, site_id, default_work_center_id, employee_status)
    VALUES ($1, $2, $3, 1, 'Released', NOW(), $4, $5, $6, 'Active')`,
  [employeeId, `PHASE1-EMP-${runId}`, 'Phase 1 fixture worker', userId, version.site_id, workCenterId]);
  await masterDb.query(`
    INSERT INTO md_employee_skill
      (employee_id, skill_id, effective_from, active_flag, level, qualification_status, created_by)
    VALUES ($1, $2, NOW(), TRUE, 'L5', 'Active', $3)`,
  [employeeId, requirement.skill_id, userId]);
  await masterDb.query(`
    INSERT INTO md_employee_shift_schedule
      (schedule_id, employee_id, shift_id, work_center_id, schedule_date, schedule_status, created_by)
    VALUES ($1, $2, $3, $4, $5::date, 'Scheduled', $6)`,
  [scheduleId, employeeId, shift.master_id, workCenterId, targetDate, userId]);
  restores.push(async () => {
    await masterDb.query(`DELETE FROM md_employee_shift_schedule WHERE schedule_id=$1`, [scheduleId]);
    await masterDb.query(`DELETE FROM md_employee_skill WHERE employee_id=$1`, [employeeId]);
    await masterDb.query(`DELETE FROM md_employee WHERE master_id=$1`, [employeeId]);
  });
}

async function ensureAlternateSiteContext(currentSiteId) {
  const existing = await masterDb.query(`
    SELECT s.master_id AS site_id, wc.master_id AS work_center_id
    FROM md_site s
    JOIN md_work_center wc ON wc.site_id=s.master_id AND wc.lifecycle_status <> 'Obsolete'
    WHERE s.master_id <> $1 AND s.lifecycle_status <> 'Obsolete'
    ORDER BY s.code, wc.code LIMIT 1`, [currentSiteId]);
  if (existing.rowCount === 1) return existing.rows[0];
  const siteId = uuid();
  const areaId = uuid();
  const workCenterId = uuid();
  const localized = JSON.stringify({ en: 'Phase 1 alternate site', vi: 'Dia diem Phase 1', ja: 'Phase 1 alternate site', ko: 'Phase 1 alternate site' });
  await masterDb.query(`
    INSERT INTO md_site
      (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, timezone)
    VALUES ($1, $2, $3::jsonb, 1, 'Released', NOW(), $4, 'Etc/UTC')`,
  [siteId, `PHASE1-SITE-${runId.slice(-5)}`, localized, userId]);
  await masterDb.query(`
    INSERT INTO md_production_area
      (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, site_id)
    VALUES ($1, $2, $3::jsonb, 1, 'Released', NOW(), $4, $5)`,
  [areaId, `PHASE1-AREA-${runId.slice(-5)}`, localized, userId, siteId]);
  await masterDb.query(`
    INSERT INTO md_work_center
      (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, site_id, area_id, active_flag, work_center_type)
    VALUES ($1, $2, $3::jsonb, 1, 'Released', NOW(), $4, $5, $6, TRUE, 'Production')`,
  [workCenterId, `PHASE1-WC-${runId.slice(-5)}`, localized, userId, siteId, areaId]);
  restores.push(async () => {
    await masterDb.query(`DELETE FROM md_site WHERE master_id=$1`, [siteId]);
  });
  restores.push(async () => {
    await masterDb.query(`DELETE FROM md_production_area WHERE master_id=$1`, [areaId]);
  });
  restores.push(async () => {
    await masterDb.query(`DELETE FROM md_work_center WHERE master_id=$1`, [workCenterId]);
  });
  return { site_id: siteId, work_center_id: workCenterId };
}

async function assertReadinessCode(fixture, shift, code) {
  const response = await loadCandidates(fixture.workOrder, fixture.operation, shift, fixture.start);
  assertIncludesCode(response, code);
}

async function main() {
  assertSafety();
  await executionDb.connect();
  await masterDb.connect();

  const versions = (await master(`/production-ready-versions?planned_date=${encodeURIComponent(targetDate)}&limit=500`)).body;
  const version = versions.find((row) => row.readiness_status === 'Ready' && row.production_version_code?.startsWith('PV-'));
  if (!version) throw new Error('No released Ready Production Version with PV- code was returned.');
  const shifts = (await master(`/shifts?site_id=${encodeURIComponent(version.site_id)}&limit=500`)).body;
  const shift = shifts.find((row) => row.site_id === version.site_id && row.lifecycle_status !== 'Inactive');
  if (!shift) throw new Error(`No active shift exists for site ${version.site_code}.`);
  console.log(`[phase1] run=${runId} pv=${version.production_version_code} shift=${shift.code}`);

  const fixture = await baselineFixture(version, shift);
  const groupId = fixture.candidate.machine_group.id;
  const primaryMachineId = fixture.candidate.primary_machine.id;
  const primaryUnitId = fixture.candidate.primary_machine.unit_id;
  const primaryAssignmentId = fixture.candidate.assignment.id;
  const calendarId = fixture.candidate.calendar.id;
  const standardId = fixture.candidate.production_standard.id;
  const requirement = await masterDb.query(`SELECT requirement_id, required_quantity FROM md_workstation_machine_requirement WHERE machine_group_id=$1 AND machine_id=$2 AND role='Primary' AND active_flag=TRUE ORDER BY sequence_no LIMIT 1`, [groupId, primaryMachineId]);
  if (requirement.rowCount !== 1) throw new Error('Primary Machine Requirement fixture not found.');
  const primaryRequirementId = requirement.rows[0].requirement_id;
  const otherWorkCenter = await masterDb.query(`SELECT master_id FROM md_work_center WHERE master_id <> $1 AND lifecycle_status <> 'Obsolete' ORDER BY code LIMIT 1`, [fixture.workCenterId]);
  if (otherWorkCenter.rowCount !== 1) throw new Error('Alternate Work Center fixture not found.');
  const otherSiteContext = await ensureAlternateSiteContext(version.site_id);

  await scenario('missing Primary Machine Requirement blocks readiness', async () => {
    await snapshotUpdate(masterDb, 'md_workstation_machine_requirement', 'requirement_id', primaryRequirementId, { active_flag: false });
    await assertReadinessCode(fixture, shift, 'WORKSTATION_MACHINE_REQUIREMENT_UNSATISFIED');
  });

  await scenario('insufficient physical Machine Units blocks readiness', async () => {
    await snapshotUpdate(masterDb, 'md_workstation_machine_requirement', 'requirement_id', primaryRequirementId, { required_quantity: Number(requirement.rows[0].required_quantity) + 1 });
    await assertReadinessCode(fixture, shift, 'WORKSTATION_PRIMARY_MACHINE_MISSING');
  });

  await scenario('expired Resource Assignment blocks readiness', async () => {
    await snapshotUpdate(masterDb, 'md_resource_assignment', 'master_id', primaryAssignmentId, { effective_to: `${targetDate}T00:00:00.000Z` });
    await assertReadinessCode(fixture, shift, 'MACHINE_GROUP_NO_PRIMARY');
  });

  await scenario('Workstation in another Work Center is not a candidate', async () => {
    await snapshotUpdate(masterDb, 'md_workstation_machine_group', 'master_id', groupId, { work_center_id: otherWorkCenter.rows[0].master_id });
    const response = await loadCandidates(fixture.workOrder, fixture.operation, shift, fixture.start);
    const sameGroup = (response.candidates || []).find((candidate) => candidate.machine_group?.id === groupId);
    if (sameGroup) throw new Error(`Group from another Work Center remained a candidate: ${JSON.stringify(sameGroup)}`);
  });

  await scenario('Machine Unit in another Site blocks readiness', async () => {
    await snapshotUpdate(masterDb, 'md_equipment', 'master_id', primaryMachineId, { site_id: otherSiteContext.site_id, work_center_id: otherSiteContext.work_center_id });
    await assertReadinessCode(fixture, shift, 'EQUIPMENT_ASSIGNMENT_INVALID');
  });

  await scenario('Machine Unit under maintenance blocks readiness', async () => {
    await snapshotUpdate(masterDb, 'md_equipment', 'master_id', primaryMachineId, { execution_status: 'Maintenance' });
    await assertReadinessCode(fixture, shift, 'EQUIPMENT_UNDER_MAINTENANCE');
  });

  await scenario('Machine Unit out of service blocks readiness', async () => {
    await snapshotUpdate(masterDb, 'md_equipment', 'master_id', primaryMachineId, { execution_status: 'OutOfService' });
    await assertReadinessCode(fixture, shift, 'EQUIPMENT_OUT_OF_SERVICE');
  });

  await scenario('Machine Unit not planning eligible blocks readiness', async () => {
    await snapshotUpdate(masterDb, 'md_machine_unit', 'machine_unit_id', primaryUnitId, { planning_resource_flag: false });
    await assertReadinessCode(fixture, shift, 'MACHINE_UNIT_UNAVAILABLE');
  });

  await scenario('unavailable Resource Calendar blocks readiness', async () => {
    await snapshotUpdate(masterDb, 'md_resource_calendar', 'master_id', calendarId, { availability_status: 'PlannedDown', available_minutes: 0 });
    await assertReadinessCode(fixture, shift, 'RESOURCE_PLANNED_DOWN');
  });

  await scenario('invalid Shift blocks readiness', async () => {
    const invalidShift = { ...shift, master_id: uuid() };
    await assertReadinessCode(fixture, invalidShift, 'SHIFT_SITE_INVALID');
  });

  await scenario('missing Production Standard blocks readiness', async () => {
    await snapshotUpdate(masterDb, 'md_production_standard', 'master_id', standardId, { lifecycle_status: 'Inactive' });
    await assertReadinessCode(fixture, shift, 'NO_EFFECTIVE_PRODUCTION_STANDARD');
  });

  await scenario('stale candidate is rejected at commit', async () => {
    await snapshotUpdate(masterDb, 'md_machine_unit', 'machine_unit_id', primaryUnitId, { execution_status: 'OutOfService' });
    const stale = await allocate(fixture.workOrder, fixture.operation, fixture.candidate, shift, fixture.start, `${runId}-STALE`, [409]);
    assertStatus(stale.status, 409, 'stale candidate');
    assertIncludesCode(stale.body, 'RESOURCE_CANDIDATE_STALE');
  });

  await scenario('simultaneous allocation conflict rejects second commit', async () => {
    const a = await createWorkOrder(version, shift, 2, 'CONFLICT-A');
    const b = await createWorkOrder(version, shift, 2, 'CONFLICT-B');
    const [detailA, detailB] = await Promise.all([detail(a), detail(b)]);
    const operationA = detailA.operations[0];
    const operationB = detailB.operations[0];
    const start = `${targetDate}T09:00:00.000Z`;
    const [candidatesA, candidatesB] = await Promise.all([loadCandidates(a, operationA, shift, start), loadCandidates(b, operationB, shift, start)]);
    const selectedA = readyCandidate(candidatesA.candidates || [], (candidate) => candidate.machine_group?.id === groupId);
    const selectedB = readyCandidate(candidatesB.candidates || [], (candidate) => candidate.machine_group?.id === groupId);
    if (!selectedA || !selectedB) throw new Error('Conflict fixture did not expose matching Ready candidates.');
    await allocate(a, operationA, selectedA, shift, start, `${runId}-CONFLICT-A`);
    const conflict = await allocate(b, operationB, selectedB, shift, start, `${runId}-CONFLICT-B`, [409]);
    assertStatus(conflict.status, 409, 'capacity conflict');
    assertIncludesCode(conflict.body, 'RESOURCE_CAPACITY_CONFLICT');
    await cleanupWorkOrders();
    created.workOrderIds = [];
    created.workflowIds = [];
  });

  await scenario('idempotent replay returns the same allocation response', async () => {
    const wo = await createWorkOrder(version, shift, 2, 'IDEMPOTENT');
    const op = (await detail(wo)).operations[0];
    const { start, candidate } = await readyGroupCandidateAt(wo, op, shift, [`${targetDate}T10:00:00.000Z`, `${targetDate}T12:00:00.000Z`, `${targetDate}T14:00:00.000Z`], groupId);
    const key = `${runId}-IDEMPOTENT`;
    const first = await allocate(wo, op, candidate, shift, start, key);
    const replay = await allocate(wo, op, candidate, shift, start, key);
    if (JSON.stringify(first.body) !== JSON.stringify(replay.body)) throw new Error('Idempotent replay response changed.');
    await cleanupWorkOrders();
    created.workOrderIds = [];
    created.workflowIds = [];
  });

  await scenario('reused idempotency key with different request fails', async () => {
    const wo = await createWorkOrder(version, shift, 2, 'IDEMPOTENCY-CONFLICT');
    const op = (await detail(wo)).operations[0];
    const { start, candidate } = await readyGroupCandidateAt(wo, op, shift, [`${targetDate}T11:00:00.000Z`, `${targetDate}T13:00:00.000Z`, `${targetDate}T15:00:00.000Z`], groupId);
    const key = `${runId}-IDEMPOTENCY-CONFLICT`;
    await allocate(wo, op, candidate, shift, start, key);
    const changedStart = `${targetDate}T11:30:00.000Z`;
    const conflict = await allocate(wo, op, candidate, shift, changedStart, key, [409]);
    assertStatus(conflict.status, 409, 'idempotency conflict');
    assertIncludesCode(conflict.body, 'IDEMPOTENCY_KEY_CONFLICT');
    await cleanupWorkOrders();
    created.workOrderIds = [];
    created.workflowIds = [];
  });

  await scenario('reallocation supersedes history and cancels old reservations', async () => {
    const wo = await createWorkOrder(version, shift, 2, 'REALLOCATE');
    const op = (await detail(wo)).operations[0];
    const { start, candidate } = await readyGroupCandidateAt(wo, op, shift, [`${targetDate}T12:00:00.000Z`, `${targetDate}T14:00:00.000Z`, `${targetDate}T15:30:00.000Z`], groupId);
    const original = await allocate(wo, op, candidate, shift, start, `${runId}-REALLOCATE-A`);
    const nextStart = `${targetDate}T12:30:00.000Z`;
    const replacement = await reallocate(wo, op, candidate, shift, nextStart, `${runId}-REALLOCATE-B`, 'Phase 1 reallocation verification.');
    const state = await executionDb.query(`SELECT status FROM wo_resource_allocation WHERE allocation_id IN ($1,$2) ORDER BY allocated_at`, [original.body.allocation_id, replacement.body.allocation_id]);
    const statuses = state.rows.map((row) => row.status);
    if (!statuses.includes('Superseded') || !statuses.includes('Committed')) throw new Error(`Unexpected reallocation states: ${JSON.stringify(statuses)}`);
    const oldReservations = await executionDb.query(`SELECT COUNT(*)::int AS count FROM wo_capacity_reservation WHERE allocation_id=$1 AND status IN ('Tentative','Committed')`, [original.body.allocation_id]);
    if (Number(oldReservations.rows[0].count) !== 0) throw new Error('Reallocation left active reservations for superseded allocation.');
    await cleanupWorkOrders();
    created.workOrderIds = [];
    created.workflowIds = [];
  });

  await scenario('allocation cancellation removes active reservations without deleting audit history', async () => {
    const wo = await createWorkOrder(version, shift, 2, 'CANCEL');
    const op = (await detail(wo)).operations[0];
    const { start, candidate } = await readyGroupCandidateAt(wo, op, shift, [`${targetDate}T13:00:00.000Z`, `${targetDate}T14:30:00.000Z`, `${targetDate}T16:00:00.000Z`], groupId);
    const committed = await allocate(wo, op, candidate, shift, start, `${runId}-CANCEL`);
    const cancelled = await execution(`/work-orders/${wo.work_order_id}/operations/${op.wo_operation_id}/resource-allocation`, { method: 'DELETE' });
    if (cancelled.body.status !== 'Cancelled') throw new Error(`Cancel API returned unexpected body: ${JSON.stringify(cancelled.body)}`);
    const activeReservations = await executionDb.query(`SELECT COUNT(*)::int AS count FROM wo_capacity_reservation WHERE allocation_id=$1 AND status IN ('Tentative','Committed')`, [committed.body.allocation_id]);
    if (Number(activeReservations.rows[0].count) !== 0) throw new Error('Cancellation left active reservations.');
    const audit = await executionDb.query(`SELECT COUNT(*)::int AS count FROM wo_resource_allocation_audit WHERE allocation_id=$1`, [committed.body.allocation_id]);
    if (Number(audit.rows[0].count) < 2) throw new Error('Cancellation did not preserve allocation audit history.');
  });

  await scenario('approval after resource state changed fails revalidation', async () => {
    const wo = await createWorkOrder(version, shift, 2, 'APPROVAL-STALE');
    const committed = await allocateAllOperations(wo, shift, `${targetDate}T14:00:00.000Z`);
    await snapshotUpdate(masterDb, 'md_machine_unit', 'machine_unit_id', committed[0].candidate.primary_machine.unit_id, { execution_status: 'OutOfService' });
    const approval = await execution(`/work-orders/${wo.work_order_id}/approve`, { method: 'POST', headers: { 'X-MES-Approval-Policy': 'Strict' }, body: JSON.stringify({ comment: 'Phase 1 stale approval verification.' }) }, [409]);
    assertStatus(approval.status, 409, 'approval stale resource');
    assertIncludesCode(approval.body, 'WO_RESOURCE_ALLOCATION_INVALID');
    await cleanupWorkOrders();
    created.workOrderIds = [];
    created.workflowIds = [];
  });

  await scenario('execution start without valid allocation is rejected', async () => {
    const wo = await createWorkOrder(version, shift, 2, 'EXECUTION-NO-ALLOCATION');
    await executionDb.query(`UPDATE wo_header SET status='Released' WHERE wo_id=$1`, [wo.work_order_id]);
    const response = await execution(`/work-orders/${wo.work_order_id}/start-execution`, { method: 'POST', body: '{}' }, [409]);
    assertStatus(response.status, 409, 'start without allocation');
    assertIncludesAnyCode(response.body, ['WO_RESOURCE_ALLOCATION_INVALID', 'WO_LINE_RESOURCE_HOLD']);
    await cleanupWorkOrders();
    created.workOrderIds = [];
    created.workflowIds = [];
  });

  await scenario('unauthorized role cannot commit allocation', async () => {
    const wo = await createWorkOrder(version, shift, 2, 'UNAUTHORIZED');
    const op = (await detail(wo)).operations[0];
    const { start, candidate } = await readyGroupCandidateAt(wo, op, shift, [`${targetDate}T15:00:00.000Z`, `${targetDate}T16:00:00.000Z`], groupId);
    const forbidden = await execution(`/work-orders/${wo.work_order_id}/operations/${op.wo_operation_id}/resource-allocation`, {
      method: 'POST',
      headers: { 'Idempotency-Key': `${runId}-UNAUTHORIZED`, 'X-Role-Code': 'VIEWER' },
      body: JSON.stringify(payloadFor(candidate, shift, start, wo.row_version)),
    }, [403]);
    assertStatus(forbidden.status, 403, 'unauthorized allocation');
    assertIncludesCode(forbidden.body, 'RESOURCE_ALLOCATION_FORBIDDEN');
  });

  const summary = { success: true, run_id: runId, declared: results.length, executed: results.length, passed: results.filter((item) => item.status === 'passed').length, failed: 0, skipped: 0, scenarios: results };
  await writePhase1Artifact(summary);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(`[phase1] FAILED: ${error.stack || error.message}`);
  process.exitCode = 1;
}).finally(async () => {
  try { await restoreFixtures(); } catch (error) { console.error(`[phase1] RESTORE_FAILED: ${error.message}`); process.exitCode = 1; }
  try { await cleanupWorkOrders(); } catch (error) { console.error(`[phase1] CLEANUP_FAILED: ${error.message}`); process.exitCode = 1; }
  try { await executionDb.end(); } catch {}
  try { await masterDb.end(); } catch {}
});
