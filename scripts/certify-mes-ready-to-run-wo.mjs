#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const environment = String(process.env.MES_ENV || '').toLowerCase();
const executionUrl = process.env.MES_EXECUTION_DATABASE_URL || 'postgresql://mes_execution_user:mes_execution_pass@localhost:15435/mes_execution_db';
const masterUrl = process.env.MES_MASTER_DATA_DATABASE_URL || 'postgresql://mes_master_data_user:mes_master_data_pass@localhost:15434/mes_master_data_db';
const apiBase = (process.env.MES_EXECUTION_URL || 'http://localhost:18000/api/mes/execution').replace(/\/$/, '');
const masterBase = (process.env.MES_MASTER_DATA_URL || 'http://localhost:18000/api/mes/master-data').replace(/\/$/, '');
const userId = process.env.MES_E2E_USER_ID || '00000000-0000-0000-0000-000000000001';
const roleCode = process.env.MES_CERTIFICATION_ROLE || 'PLANT_MANAGER';
const targetDate = process.env.E2E_WO_TARGET_DATE || nextWeekday();
const runId = `WO-CERT-001-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
const artifactDir = path.resolve(repoRoot, 'artifacts', 'mes-console-final-certification', runId);
const resultPath = path.join(artifactDir, 'certification-result.json');
const executionDb = new Client({ connectionString: executionUrl });
const masterDb = new Client({ connectionString: masterUrl });
const created = { workflowId: null, workOrderId: null };
const steps = [];

function nextWeekday() {
  const date = new Date();
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function safetyCheck() {
  if (!['development', 'local', 'test', 'staging'].includes(environment)) throw new Error('MES_ENV must be development, local, test, or staging.');
  if (process.env.ALLOW_MES_FULL_RESET !== 'true' || process.env.CONFIRM_MES_FULL_RESET !== 'YES_RESET_ALL_MES_DATA') {
    throw new Error('Certification requires ALLOW_MES_FULL_RESET=true and CONFIRM_MES_FULL_RESET=YES_RESET_ALL_MES_DATA.');
  }
  for (const url of [executionUrl, masterUrl]) {
    const host = new URL(url).hostname;
    if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error(`Database URL must use a local/test host: ${host}`);
  }
}

function runResetAndSeed() {
  const result = spawnSync('npm', ['run', 'reset:seed:verify:mes:canonical'], {
    cwd: repoRoot,
    env: { ...process.env, MES_ENV: environment, ALLOW_DESTRUCTIVE_SEED: 'true', ALLOW_MES_FULL_RESET: 'true', CONFIRM_MES_FULL_RESET: 'YES_RESET_ALL_MES_DATA' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) throw new Error(`RESET_SEED_VERIFY_FAILED: ${result.stderr || result.stdout}`);
  return { exit_code: result.status, output_tail: result.stdout.slice(-4000) };
}

async function request(base, requestPath, init = {}) {
  const response = await fetch(`${base}${requestPath}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-User-ID': userId, 'X-Role-Code': roleCode, 'X-Trace-ID': runId, ...(init.headers || {}) },
    cache: 'no-store',
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { message: text }; }
  if (!response.ok) throw new Error(`${init.method || 'GET'} ${requestPath} -> ${response.status}: ${JSON.stringify(body)}`);
  return body?.data ?? body;
}

const execution = (p, i) => request(apiBase, p, i);
const master = (p, i) => request(masterBase, p, i);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function step(name, fn) {
  const startedAt = new Date().toISOString();
  try {
    const data = await fn();
    steps.push({ name, status: 'passed', started_at: startedAt, finished_at: new Date().toISOString(), data });
    console.log(`[certification] PASS ${name}`);
    return data;
  } catch (error) {
    steps.push({ name, status: 'failed', started_at: startedAt, finished_at: new Date().toISOString(), error: error.message });
    throw error;
  }
}

async function createWorkOrder(version, shift) {
  const workflow = await execution('/work-order-creation-workflows', {
    method: 'POST',
    headers: { 'Idempotency-Key': `${runId}-CREATE` },
    body: JSON.stringify({ production_version_id: version.production_version_id, quantity: 2, target_date: targetDate, shift_id: shift.master_id }),
  });
  created.workflowId = workflow.workflow_id;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const snapshot = await execution(`/work-order-creation-workflows/${created.workflowId}`);
    if (snapshot.status === 'succeeded') { created.workOrderId = snapshot.work_order_id; return snapshot; }
    if (snapshot.status === 'failed') throw new Error(`WORK_ORDER_CREATE_FAILED: ${JSON.stringify(snapshot)}`);
    await sleep(200);
  }
  throw new Error(`WORK_ORDER_CREATE_TIMEOUT: ${created.workflowId}`);
}

function readyCandidate(candidates) {
  return (candidates || []).find((candidate) => candidate.readiness !== 'Blocked' && !(candidate.blocking_errors || []).length && !(candidate.capacity_conflicts || []).length);
}

async function cleanup() {
  if (!created.workOrderId) return { work_orders_removed: 0, remaining_work_orders: 0 };
  const result = spawnSync(process.execPath, ['scripts/cleanup-mes-resource-planning-e2e.mjs', created.workOrderId], { cwd: repoRoot, env: process.env, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`CERTIFICATION_CLEANUP_FAILED: ${result.stderr || result.stdout}`);
  const remaining = await executionDb.query('SELECT COUNT(*)::int AS count FROM wo_header WHERE wo_id=$1', [created.workOrderId]);
  if (Number(remaining.rows[0].count) !== 0) throw new Error('CERTIFICATION_CLEANUP_LEFT_WORK_ORDER');
  return { work_orders_removed: 1, remaining_work_orders: 0, cleanup_output: result.stdout.trim() };
}

async function main() {
  safetyCheck();
  await fs.mkdir(artifactDir, { recursive: true });
  const result = { status: 'STARTED', certification_id: 'WO-CERT-001', run_id: runId, target_date: targetDate, steps };
  try {
    await step('reset, canonical seed, and canonical verification', runResetAndSeed);
    await executionDb.connect();
    await masterDb.connect();
    const version = await step('select released effective canonical Production Version', async () => {
      const versions = await master(`/production-ready-versions?planned_date=${encodeURIComponent(targetDate)}&limit=500`);
      const selected = versions.find((row) => row.readiness_status === 'Ready' && row.production_version_code === (process.env.CERTIFICATION_PRODUCTION_VERSION_CODE || 'WST-SEED-PV-SEAL-ASM-01'));
      if (!selected) throw new Error(`CERTIFICATION_VERSION_NOT_READY: ${JSON.stringify(versions)}`);
      return { code: selected.production_version_code, production_version_id: selected.production_version_id, site_id: selected.site_id };
    });
    const shift = await step('select active site-scoped shift', async () => {
      const shifts = await master(`/shifts?site_id=${encodeURIComponent(version.site_id)}&limit=500`);
      const selected = shifts.find((row) => row.code === 'SHIFT-A' && row.lifecycle_status !== 'Inactive');
      if (!selected) throw new Error(`CERTIFICATION_SHIFT_MISSING: ${JSON.stringify(shifts)}`);
      return selected;
    });
    const workflow = await step('create Work Order through supported workflow', () => createWorkOrder(version, shift));
    let detail = await execution(`/work-orders/${created.workOrderId}`);
    const header = detail.header || detail;
    await step('verify automatic Primary READY line selection', async () => {
      // Current backend semantics encode the automatic outcome as PRIMARY;
      // AUTO is reserved for an unresolved Resource Hold.
      if (header.line_selection_mode !== 'PRIMARY' || header.line_selection_reason !== 'PRIMARY_LINE_READY') throw new Error(`EXPECTED_AUTOMATIC_PRIMARY_SELECTION: ${JSON.stringify(header)}`);
      if (header.line_selection_status !== 'READY' || !header.selected_production_line_id) throw new Error(`EXPECTED_PRIMARY_READY: ${JSON.stringify(header)}`);
      if (header.fallback_reason) throw new Error(`UNEXPECTED_FALLBACK_REASON: ${header.fallback_reason}`);
      return { selected_line_id: header.selected_production_line_id, selected_line_code: header.selected_production_line_code, status: header.line_selection_status, mode: header.line_selection_mode, automatic_semantics: 'PRIMARY means automatic primary selection in current backend contract' };
    });
    await step('verify candidates and commit exact resources for every operation', async () => {
      let cursor = new Date(`${targetDate}T08:00:00.000Z`);
      const committed = [];
      for (const operation of detail.operations || []) {
        const candidates = await execution(`/work-orders/${created.workOrderId}/operations/${operation.wo_operation_id}/resource-candidates?planned_start_at=${encodeURIComponent(cursor.toISOString())}&shift_id=${encodeURIComponent(shift.master_id)}`);
        const candidate = readyCandidate(candidates.candidates);
        if (!candidate) throw new Error(`NO_READY_CANDIDATE:${operation.operation_code}:${JSON.stringify(candidates)}`);
        if (candidate.production_line?.id && candidate.production_line.id !== header.selected_production_line_id) throw new Error(`MIXED_LINE_CANDIDATE:${operation.operation_code}`);
        const allocation = await execution(`/work-orders/${created.workOrderId}/operations/${operation.wo_operation_id}/resource-allocation`, {
          method: 'POST',
          headers: { 'Idempotency-Key': `${runId}-ALLOC-${operation.wo_operation_id}` },
          body: JSON.stringify({ workstation_id: candidate.workstation?.id, equipment_id: candidate.primary_machine?.id || candidate.equipment?.id, machine_group_id: candidate.machine_group?.id, shift_id: shift.master_id, planned_start_at: cursor.toISOString(), candidate_reference: `${candidate.assignment?.id || ''}:${candidate.machine_group?.id || ''}:${candidate.capability?.id || ''}`, row_version: header.row_version }),
        });
        committed.push({ operation_code: operation.operation_code, allocation_id: allocation.allocation_id });
        cursor = new Date(cursor.getTime() + Math.max(Number(candidate.estimated_duration_min || candidate.calculation?.estimated_duration_min || 1), 1) * 60_000);
      }
      return { mandatory_operations: detail.operations.length, committed_count: committed.length, committed };
    });
    await step('revalidate all allocations', async () => {
      const revalidation = await execution(`/work-orders/${created.workOrderId}/resource-allocations/revalidate`, { method: 'POST', body: '{}' });
      if (revalidation.valid !== true) throw new Error(`REVALIDATION_FAILED:${JSON.stringify(revalidation)}`);
      return revalidation;
    });
    await step('approve Work Order with strict allocation gate', async () => {
      const approval = await execution(`/work-orders/${created.workOrderId}/approve`, { method: 'POST', headers: { 'X-MES-Approval-Policy': 'Strict' }, body: JSON.stringify({ comment: 'WO-CERT-001 ready-to-run certification.' }) });
      if (approval.status !== 'Released') throw new Error(`APPROVAL_FAILED:${JSON.stringify(approval)}`);
      return approval;
    });
    await step('start Work Order execution', async () => {
      const started = await execution(`/work-orders/${created.workOrderId}/start-execution`, { method: 'POST', body: '{}' });
      if (started.status !== 'InProgress') throw new Error(`START_EXECUTION_FAILED:${JSON.stringify(started)}`);
      return started;
    });
    detail = await execution(`/work-orders/${created.workOrderId}`);
    const cleanupResult = await step('exactly clean certification Work Order', cleanup);
    result.status = 'CERTIFIED_MES_CONSOLE_AND_READY_TO_RUN_WO';
    result.work_order = { workflow_id: workflow.workflow_id, work_order_id: created.workOrderId, work_order_code: workflow.work_order_code };
    result.final_state = { status: detail.header?.status || detail.status, approval_state: detail.header?.approval_state || detail.approval_state };
    result.cleanup = cleanupResult;
    result.completed_at = new Date().toISOString();
    await fs.writeFile(resultPath, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    result.status = 'NOT_CERTIFIED';
    result.error = error.message;
    try { result.cleanup = await cleanup(); } catch (cleanupError) { result.cleanup_error = cleanupError.message; }
    result.completed_at = new Date().toISOString();
    await fs.writeFile(resultPath, JSON.stringify(result, null, 2));
    console.error(JSON.stringify(result, null, 2));
    process.exitCode = 1;
  } finally {
    await executionDb.end().catch(() => {});
    await masterDb.end().catch(() => {});
  }
}

main();
