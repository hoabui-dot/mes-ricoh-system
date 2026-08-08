#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const artifactDir = path.resolve(process.env.MES_TWO_LINE_UAT_DIR || 'artifacts/mes-two-line-uat-phase8-gate');
const executionBase = (process.env.MES_EXECUTION_URL || 'http://localhost:13030/api/mes/execution').replace(/\/$/, '');
const executionDbUrl = process.env.MES_EXECUTION_DATABASE_URL || 'postgresql://mes_execution_user:mes_execution_pass@localhost:15435/mes_execution_db';
const masterDbUrl = process.env.MES_MASTER_DATA_DATABASE_URL || 'postgresql://mes_master_data_user:mes_master_data_pass@localhost:15434/mes_master_data_db';
const userId = process.env.MES_E2E_USER_ID || '00000000-0000-0000-0000-000000000001';
const fixtureEnvironment = {
  ...process.env,
  MES_ENV: process.env.MES_ENV || 'development',
  ALLOW_TWO_LINE_UAT_MUTATION: 'true',
  MES_EXECUTION_URL: executionBase,
  MES_MASTER_DATA_URL: process.env.MES_MASTER_DATA_URL || 'http://localhost:13020/api/mes/master-data',
  MES_EXECUTION_DATABASE_URL: executionDbUrl,
  MES_MASTER_DATA_DATABASE_URL: masterDbUrl,
  MES_TWO_LINE_UAT_DIR: artifactDir,
};
const headers = { 'Content-Type': 'application/json', 'X-User-ID': userId, 'X-Role-Code': 'PLANT_MANAGER', 'X-Trace-ID': 'MES-TWO-LINE-PHASE8' };
const masterDb = new Client({ connectionString: masterDbUrl });
const executionDb = new Client({ connectionString: executionDbUrl });
const results = [];
let prepared = false;
let degradedWorkstation;
let masterConnected = false;
let executionConnected = false;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runFixture(mode, required = true) {
  const result = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'mes-two-line-uat-fixtures.mjs'), mode], {
    cwd: repoRoot,
    env: fixtureEnvironment,
    encoding: 'utf8',
  });
  if (required && result.status !== 0) throw new Error(`Fixture ${mode} failed: ${result.stderr || result.stdout}`);
  return result.status === 0;
}

async function request(urlPath, init = {}, allowed = []) {
  const response = await fetch(`${executionBase}${urlPath}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { message: text }; }
  if (!response.ok && !allowed.includes(response.status)) throw new Error(`${init.method || 'GET'} ${urlPath} -> ${response.status}: ${text}`);
  return { status: response.status, body: body?.data ?? body };
}

async function scenario(name, action) {
  await action();
  results.push({ name, status: 'passed' });
  console.log(`[phase8] PASS ${name}`);
}

function candidateInput(operation, proposal, rowVersion) {
  const candidate = proposal.recommended_candidate;
  return {
    workstation_id: candidate.workstation?.id,
    equipment_id: candidate.primary_machine?.id || candidate.equipment?.id,
    machine_group_id: candidate.machine_group?.id,
    shift_id: proposal.requested_window.shift_id,
    planned_start_at: proposal.requested_window.start_at,
    candidate_reference: `${candidate.assignment?.id || ''}:${candidate.machine_group?.id || ''}:${candidate.capability?.id || ''}`,
    row_version: rowVersion,
    change_reason: `Phase 8 ${operation.operation_code}`,
  };
}

try {
  runFixture('prepare');
  prepared = true;
  await masterDb.connect();
  masterConnected = true;
  await executionDb.connect();
  executionConnected = true;
  const manifest = JSON.parse(fs.readFileSync(path.join(artifactDir, 'uat-fixture-manifest.json'), 'utf8'));
  const primaryFixture = manifest.fixtures.find((fixture) => fixture.scenario === 'primary-ready');
  const backupFixture = manifest.fixtures.find((fixture) => fixture.scenario === 'backup-fallback');
  assert(primaryFixture && backupFixture, 'Primary and Backup canonical fixtures are required.');

  const primaryDetail = (await request(`/work-orders/${primaryFixture.work_order_id}`)).body;
  const backupDetail = (await request(`/work-orders/${backupFixture.work_order_id}`)).body;
  const primaryProposal = (await request(`/work-orders/${primaryFixture.work_order_id}/resource-allocation-proposals`)).body;
  const backupProposal = (await request(`/work-orders/${backupFixture.work_order_id}/resource-allocation-proposals`)).body;
  const primaryLineId = primaryDetail.header.selected_production_line_id;
  const backupLineId = backupDetail.header.selected_production_line_id;

  await scenario('selected Backup returns only Backup candidates', async () => {
    assert(backupProposal.complete === true, 'Backup proposal is incomplete.');
    assert(backupProposal.operations.every((operation) => operation.production_line?.id === backupLineId), 'Proposal operation escaped Backup line.');
    const primaryWorkstations = new Set(primaryProposal.operations.map((operation) => operation.recommended_candidate?.workstation?.id).filter(Boolean));
    for (const operation of backupProposal.operations) {
      for (const candidate of operation.alternatives || []) assert(!primaryWorkstations.has(candidate.workstation?.id), `Primary candidate leaked into ${operation.operation_code}.`);
    }
  });

  await scenario('committing a Primary candidate to selected Backup is rejected', async () => {
    const operation = backupProposal.operations[0];
    const wrong = candidateInput(operation, { ...operation, recommended_candidate: primaryProposal.operations[0].recommended_candidate }, backupDetail.header.row_version);
    const response = await request(`/work-orders/${backupFixture.work_order_id}/operations/${operation.operation_id}/resource-allocation`, { method: 'POST', body: JSON.stringify(wrong), headers: { 'Idempotency-Key': `phase8-wrong-line-${backupFixture.work_order_id}` } }, [409]);
    assert(response.status === 409 && JSON.stringify(response.body).includes('RESOURCE_CANDIDATE_STALE'), `Wrong-line commit was not rejected: ${JSON.stringify(response)}`);
  });

  await scenario('exact allocation and reallocation stay on selected Backup', async () => {
    for (const operation of backupProposal.operations) {
      const input = candidateInput(operation, operation, backupDetail.header.row_version);
      const committed = await request(`/work-orders/${backupFixture.work_order_id}/operations/${operation.operation_id}/resource-allocation`, { method: 'POST', body: JSON.stringify(input), headers: { 'Idempotency-Key': `phase8-commit-${operation.operation_id}` } });
      assert(committed.body.planned_production_line_id === backupLineId, `${operation.operation_code} committed outside Backup.`);
    }
    const revalidated = await request(`/work-orders/${backupFixture.work_order_id}/resource-allocations/revalidate`, { method: 'POST', body: '{}' });
    assert(revalidated.body.valid === true, `Fresh Backup allocations did not revalidate: ${JSON.stringify(revalidated.body)}`);
    const candidates = await request(`/work-orders/${backupFixture.work_order_id}/operations/${backupProposal.operations[0].operation_id}/resource-candidates`);
    assert(candidates.body.operation?.production_line_id === backupLineId, 'Reallocation candidates lost selected-line scope.');
  });

  await scenario('pre-start replan reruns exact selection and post-start replan is rejected', async () => {
    const replanned = await request(`/work-orders/${primaryFixture.work_order_id}/line-replan`, { method: 'POST', body: JSON.stringify({ reason: 'Phase 8 exact pre-start replan', row_version: primaryDetail.header.row_version }) });
    assert(replanned.body.selected_production_line_id === primaryLineId, 'Pre-start replan did not rerun deterministic exact selection.');
    await executionDb.query(`UPDATE wo_header SET status='InProgress' WHERE wo_id=$1`, [primaryFixture.work_order_id]);
    const blocked = await request(`/work-orders/${primaryFixture.work_order_id}/line-replan`, { method: 'POST', body: JSON.stringify({ reason: 'Forbidden post-start switch' }) }, [409]);
    assert(blocked.status === 409 && JSON.stringify(blocked.body).includes('WO_LINE_REPLAN_AFTER_START_REQUIRES_EXECUTION_SEGMENT'), `Post-start replan was not rejected: ${JSON.stringify(blocked.body)}`);
  });

  await scenario('resource degradation blocks revalidation, approval, and execution start', async () => {
    degradedWorkstation = backupProposal.operations[0].recommended_candidate.workstation.id;
    const before = await masterDb.query(`SELECT active_flag FROM md_workstation WHERE master_id=$1`, [degradedWorkstation]);
    assert(before.rowCount === 1 && before.rows[0].active_flag === true, 'Selected Workstation was not active before degradation.');
    await masterDb.query(`UPDATE md_workstation SET active_flag=false WHERE master_id=$1`, [degradedWorkstation]);
    const revalidated = await request(`/work-orders/${backupFixture.work_order_id}/resource-allocations/revalidate`, { method: 'POST', body: '{}' });
    assert(revalidated.body.valid === false, 'Degraded Workstation passed revalidation.');
    const approval = await request(`/work-orders/${backupFixture.work_order_id}/approve`, { method: 'POST', body: JSON.stringify({ comment: 'Must remain blocked' }), headers: { 'X-MES-Approval-Policy': 'Strict' } }, [409]);
    assert(approval.status === 409 && approval.body.error === 'WO_RESOURCE_ALLOCATION_INVALID', `Approval bypassed stale resources: ${JSON.stringify(approval.body)}`);
    const start = await request(`/work-orders/${backupFixture.work_order_id}/start-execution`, { method: 'POST', body: '{}' }, [409]);
    assert(start.status === 409 && start.body.error === 'WO_RESOURCE_ALLOCATION_INVALID', `Execution start bypassed stale resources: ${JSON.stringify(start.body)}`);
  });

  console.log(JSON.stringify({ success: true, phase: 8, gate: 'PASS', declared: results.length, passed: results.length, failed: 0, skipped: 0, artifact_dir: artifactDir }, null, 2));
} finally {
  if (degradedWorkstation && masterConnected) await masterDb.query(`UPDATE md_workstation SET active_flag=true WHERE master_id=$1`, [degradedWorkstation]).catch(() => {});
  if (masterConnected) await masterDb.end().catch(() => {});
  if (executionConnected) await executionDb.end().catch(() => {});
  if (prepared) runFixture('cleanup', false);
}
