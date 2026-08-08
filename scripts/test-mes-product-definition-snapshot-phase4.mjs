#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import pg from 'pg';

const { Client } = pg;
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const masterBase = (process.env.MES_MASTER_DATA_URL || 'http://100.68.50.41:18000/api/mes/master-data').replace(/\/$/, '');
const executionBase = (process.env.MES_EXECUTION_URL || 'http://100.68.50.41:18000/api/mes/execution').replace(/\/$/, '');
const masterUrl = process.env.MES_MASTER_DATA_DATABASE_URL || 'postgresql://mes_master_data_user:mes_master_data_pass@localhost:15434/mes_master_data_db';
const executionUrl = process.env.MES_EXECUTION_DATABASE_URL || 'postgresql://mes_execution_user:mes_execution_pass@localhost:15435/mes_execution_db';
const environment = String(process.env.MES_ENV || '').toLowerCase();
const allowMutation = process.env.ALLOW_PRODUCT_DEFINITION_MUTATION === 'true';
const userId = process.env.MES_E2E_USER_ID || '00000000-0000-0000-0000-000000000001';
const roleCode = 'PLANT_MANAGER';
const runId = `PHASE4-PD-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
const targetDate = process.env.E2E_WO_TARGET_DATE || defaultPlanningDate();
const artifactRoot = path.resolve(repoRoot, 'artifacts', 'mes-product-definition-snapshot', runId);
const resultArtifact = path.join(artifactRoot, 'phase4-product-definition-snapshot.json');
const markdownArtifact = path.join(artifactRoot, 'phase4-product-definition-snapshot.md');
const masterDb = new Client({ connectionString: masterUrl });
const executionDb = new Client({ connectionString: executionUrl });
const createdWorkOrderIds = [];
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
  if (!allowMutation) throw new Error('Set ALLOW_PRODUCT_DEFINITION_MUTATION=true for disposable Phase 4 semantic mutation checks.');
  for (const url of [masterUrl, executionUrl]) {
    const host = new URL(url).hostname;
    if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error(`Database URL must use a local/test host: ${host}`);
  }
}

async function record(name, fn) {
  const startedAt = new Date().toISOString();
  try {
    const data = await fn();
    steps.push({ name, status: 'passed', started_at: startedAt, finished_at: new Date().toISOString(), data });
    console.log(`[phase4] PASS ${name}`);
    return data;
  } catch (error) {
    steps.push({ name, status: 'failed', started_at: startedAt, finished_at: new Date().toISOString(), error: error.message });
    console.error(`[phase4] FAIL ${name}: ${error.message}`);
    throw error;
  }
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
  if (!response.ok && !allowed.includes(response.status)) throw new Error(`${init.method || 'GET'} ${requestPath} -> ${response.status}: ${JSON.stringify(body)}`);
  return { status: response.status, body: body?.data ?? body };
}

const master = (requestPath, init, allowed) => request(masterBase, requestPath, init, allowed);
const execution = (requestPath, init, allowed) => request(executionBase, requestPath, init, allowed);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function snapshotUpdate(client, table, idColumn, id, changes) {
  const columns = Object.keys(changes);
  if (!/^[a-z_]+$/.test(table) || !/^[a-z_]+$/.test(idColumn) || columns.some((column) => !/^[a-z_]+$/.test(column))) throw new Error(`Unsafe mutation target ${table}.${idColumn}`);
  await client.query(`ALTER TABLE ${table} DISABLE TRIGGER USER`);
  try {
    const before = await client.query(`SELECT ${columns.join(', ')} FROM ${table} WHERE ${idColumn}=$1`, [id]);
    if (before.rowCount !== 1) throw new Error(`Expected one ${table} row for ${id}`);
    const assignments = columns.map((column, index) => `${column}=$${index + 2}`).join(', ');
    await client.query(`UPDATE ${table} SET ${assignments} WHERE ${idColumn}=$1`, [id, ...columns.map((column) => changes[column])]);
    const old = before.rows[0];
    restores.push(async () => {
      await client.query(`ALTER TABLE ${table} DISABLE TRIGGER USER`);
      try {
        const restoreAssignments = columns.map((column, index) => `${column}=$${index + 2}`).join(', ');
        await client.query(`UPDATE ${table} SET ${restoreAssignments} WHERE ${idColumn}=$1`, [id, ...columns.map((column) => old[column])]);
      } finally {
        await client.query(`ALTER TABLE ${table} ENABLE TRIGGER USER`);
      }
    });
  } finally {
    await client.query(`ALTER TABLE ${table} ENABLE TRIGGER USER`);
  }
}

async function restoreFixtures() {
  while (restores.length) await restores.pop()();
}

async function cleanupWorkOrders(ids = createdWorkOrderIds) {
  if (!ids.length) return { workOrderIds: [], remainingWorkOrders: 0 };
  execFileSync(process.execPath, ['scripts/cleanup-mes-resource-planning-e2e.mjs', ...ids], { stdio: 'inherit', env: process.env, cwd: repoRoot });
  const remaining = await executionDb.query(`SELECT count(*)::int AS count FROM wo_header WHERE wo_id = ANY($1::uuid[])`, [ids]);
  return { workOrderIds: ids, remainingWorkOrders: remaining.rows[0].count };
}

async function readyContext() {
  const versions = (await master(`/production-ready-versions?planned_date=${encodeURIComponent(targetDate)}&limit=500`)).body;
  const version = versions
    .filter((row) => row.readiness_status === 'Ready' && (row.production_version_code?.startsWith('PV-') || row.production_version_code?.startsWith('WST-SEED-PV-')))
    .sort((a, b) => Number(b.production_version_code?.startsWith('WST-SEED-PV-')) - Number(a.production_version_code?.startsWith('WST-SEED-PV-')))[0];
  if (!version) throw new Error('READY_PRODUCTION_VERSION_NOT_FOUND');
  const shifts = (await master(`/shifts?site_id=${encodeURIComponent(version.site_id)}&limit=500`)).body;
  const shift = shifts.find((row) => row.site_id === version.site_id && row.lifecycle_status !== 'Inactive');
  if (!shift) throw new Error('READY_SHIFT_NOT_FOUND');
  const masterContext = await masterDb.query(`
    SELECT pv.master_id AS production_version_id, pv.code AS production_version_code, pv.item_revision_id, pv.mbom_header_id, pv.routing_header_id, pv.site_id,
           mb.code AS mbom_code, mb.item_revision_id AS mbom_item_revision_id, mb.business_version AS mbom_business_version,
           rh.code AS routing_code
    FROM md_production_version pv
    JOIN md_mbom_header mb ON mb.master_id=pv.mbom_header_id
    JOIN md_routing_header rh ON rh.master_id=pv.routing_header_id
    WHERE pv.master_id=$1`, [version.production_version_id]);
  if (masterContext.rowCount !== 1) throw new Error('MASTER_CONTEXT_NOT_FOUND');
  return { version, shift, master: masterContext.rows[0] };
}

async function createWorkOrder(version, shift, suffix) {
  const workflow = (await execution('/work-order-creation-workflows', {
    method: 'POST',
    headers: { 'Idempotency-Key': `${runId}-${suffix}` },
    body: JSON.stringify({ production_version_id: version.production_version_id, quantity: 2, target_date: targetDate, shift_id: shift.master_id }),
  })).body;
  for (let attempt = 0; attempt < 70; attempt += 1) {
    const snapshot = (await execution(`/work-order-creation-workflows/${workflow.workflow_id}`)).body;
    if (snapshot.status === 'succeeded') {
      createdWorkOrderIds.push(snapshot.work_order_id);
      return snapshot;
    }
    if (snapshot.status === 'failed') throw new Error(`WORK_ORDER_CREATE_FAILED: ${JSON.stringify(snapshot)}`);
    await sleep(200);
  }
  throw new Error(`WORK_ORDER_CREATE_TIMEOUT: ${workflow.workflow_id}`);
}

function failureCodes(validation) {
  return (validation.failures || []).map((failure) => failure.code).sort();
}

function expectIncludes(values, expected, label) {
  if (!values.includes(expected)) throw new Error(`${label}: expected ${expected}, got ${JSON.stringify(values)}`);
}

async function validationWithMutation(label, mutation, expectedCode, pvId) {
  await mutation();
  const validation = (await master(`/production-versions/${pvId}/validate`, { method: 'POST' }, [422])).body;
  expectIncludes(failureCodes(validation), expectedCode, label);
  await restoreFixtures();
  return { expectedCode, validationCodes: failureCodes(validation) };
}

async function createDisposableProductionVersion(context) {
  const pvId = randomUUID();
  const code = `PV-PHASE4-${Date.now()}`;
  const name = { vi: `PV Phase 4 ${runId}`, en: `PV Phase 4 ${runId}` };
  await masterDb.query(`
    INSERT INTO md_production_version (master_id, code, name, name_i18n, mbom_header_id, routing_header_id, site_id, lifecycle_status, effective_from, is_default, min_lot_size, max_lot_size)
    VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, 'Released', NOW() - INTERVAL '1 day', false, 1, 100)`,
    [pvId, code, name.vi, JSON.stringify(name), context.master.mbom_header_id, context.master.routing_header_id, context.master.site_id]);
  await executionDb.query(`
    INSERT INTO rm_production_version (master_id, code, name_i18n, item_revision_id, mbom_header_id, routing_header_id, site_id, lifecycle_status, is_default, min_lot_size, max_lot_size, updated_at)
    VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, 'Released', false, 1, 100, NOW())`,
    [pvId, code, JSON.stringify(name), context.master.item_revision_id, context.master.mbom_header_id, context.master.routing_header_id, context.master.site_id]);
  restores.push(async () => {
    await executionDb.query(`DELETE FROM rm_production_version WHERE master_id=$1`, [pvId]);
    await masterDb.query(`ALTER TABLE md_production_version DISABLE TRIGGER USER`);
    try { await masterDb.query(`DELETE FROM md_production_version WHERE master_id=$1`, [pvId]); }
    finally { await masterDb.query(`ALTER TABLE md_production_version ENABLE TRIGGER USER`); }
  });
  return { production_version_id: pvId, production_version_code: code, site_id: context.master.site_id };
}

async function main() {
  assertSafety();
  await fs.mkdir(artifactRoot, { recursive: true });
  await Promise.all([masterDb.connect(), executionDb.connect()]);
  const baselineWorkOrderCount = Number((await executionDb.query(`SELECT count(*)::int AS count FROM wo_header`)).rows[0].count);
  let finalStatus = 'failed';
  try {
    const context = await record('baseline ready production version and validation', async () => {
      const context = await readyContext();
      const validation = (await master(`/production-versions/${context.version.production_version_id}/validate`, { method: 'POST' })).body;
      if (!validation.valid) throw new Error(`BASELINE_PV_NOT_VALID: ${JSON.stringify(validation)}`);
      return { production_version: context.version.production_version_code, validation };
    });

    const fullContext = await readyContext();
    const baselineWO = await record('work order snapshots production version routing and mbom', async () => {
      const wo = await createWorkOrder(fullContext.version, fullContext.shift, 'BASELINE-WO');
      const detail = (await execution(`/work-orders/${wo.work_order_id}`)).body;
      const planning = detail.header?.planning_snapshot || detail.planning_snapshot;
      if (planning.production_version_id !== fullContext.version.production_version_id) throw new Error('WO_PV_SNAPSHOT_MISMATCH');
      if (planning.mbom_id !== fullContext.master.mbom_header_id) throw new Error('WO_MBOM_SNAPSHOT_MISMATCH');
      if (planning.routing_id !== fullContext.master.routing_header_id) throw new Error('WO_ROUTING_SNAPSHOT_MISMATCH');
      const routingCount = await executionDb.query(`SELECT count(*)::int AS count FROM rm_routing_operation WHERE routing_header_id=$1`, [fullContext.master.routing_header_id]);
      const mbomDemandCount = await executionDb.query(`SELECT count(*)::int AS count FROM rm_mbom_line WHERE mbom_header_id=$1 AND optional_flag=false`, [fullContext.master.mbom_header_id]);
      if (detail.operations.length !== routingCount.rows[0].count) throw new Error(`WO_OPERATION_COUNT_MISMATCH ${detail.operations.length} != ${routingCount.rows[0].count}`);
      if (detail.material_requirements.length !== mbomDemandCount.rows[0].count) throw new Error(`WO_MATERIAL_COUNT_MISMATCH ${detail.material_requirements.length} != ${mbomDemandCount.rows[0].count}`);
      if (detail.operations.some((operation) => operation.resource_allocation?.allocation_id)) throw new Error('WO_RESOURCE_ALLOCATION_NOT_SEPARATE_FROM_OPERATION_SNAPSHOT');
      return { work_order_id: wo.work_order_id, operation_count: detail.operations.length, material_count: detail.material_requirements.length, planning_snapshot: planning };
    });

    await record('mbom drives work order material requirements', async () => {
      const source = await executionDb.query(`SELECT count(*)::int AS count FROM wo_material_requirement WHERE wo_id=$1 AND mbom_line_id IS NOT NULL AND mbom_header_id=$2`, [baselineWO.work_order_id, fullContext.master.mbom_header_id]);
      if (source.rows[0].count < 1) throw new Error('WO_MATERIAL_REQUIREMENTS_NOT_TRACED_TO_MBOM');
      return { wo_material_rows_from_mbom: source.rows[0].count, material_source: 'MBOM' };
    });

    await record('snapshot immutability after master data changes', async () => {
      const before = (await execution(`/work-orders/${baselineWO.work_order_id}`)).body;
      const line = await masterDb.query(`SELECT master_id, quantity_per FROM md_mbom_line WHERE mbom_header_id=$1 AND effective_to IS NULL ORDER BY seq LIMIT 1`, [fullContext.master.mbom_header_id]);
      const operation = await masterDb.query(`SELECT master_id, seq FROM md_routing_operation WHERE routing_header_id=$1 AND effective_to IS NULL ORDER BY seq LIMIT 1`, [fullContext.master.routing_header_id]);
      await snapshotUpdate(masterDb, 'md_mbom_line', 'master_id', line.rows[0].master_id, { quantity_per: Number(line.rows[0].quantity_per) + 1 });
      await snapshotUpdate(masterDb, 'md_routing_operation', 'master_id', operation.rows[0].master_id, { seq: Number(operation.rows[0].seq) + 1000 });
      const after = (await execution(`/work-orders/${baselineWO.work_order_id}`)).body;
      if (JSON.stringify(before.operations) !== JSON.stringify(after.operations)) throw new Error('WO_OPERATION_SNAPSHOT_CHANGED_AFTER_MASTER_MUTATION');
      if (JSON.stringify(before.material_requirements) !== JSON.stringify(after.material_requirements)) throw new Error('WO_MATERIAL_SNAPSHOT_CHANGED_AFTER_MASTER_MUTATION');
      await restoreFixtures();
      return { work_order_id: baselineWO.work_order_id, unchanged: true };
    });

    await record('negative validation matrix', async () => {
      const otherRevision = await masterDb.query(`SELECT master_id FROM md_item_revision WHERE master_id<>$1 AND lifecycle_status='Released' LIMIT 1`, [fullContext.master.item_revision_id]);
      if (otherRevision.rowCount !== 1) throw new Error('SECOND_RELEASED_REVISION_REQUIRED');
      const checks = [];
      const revisionWindow = await masterDb.query(`SELECT effective_from + INTERVAL '1 second' AS expired_to FROM md_item_revision WHERE master_id=$1`, [fullContext.master.item_revision_id]);
      checks.push(await validationWithMutation('expired item revision', () => snapshotUpdate(masterDb, 'md_item_revision', 'master_id', fullContext.master.item_revision_id, { effective_to: revisionWindow.rows[0].expired_to }), 'ITEM_REVISION.NOT_RELEASED', fullContext.version.production_version_id));
      checks.push(await validationWithMutation('unreleased mbom', () => snapshotUpdate(masterDb, 'md_mbom_header', 'master_id', fullContext.master.mbom_header_id, { lifecycle_status: 'Draft' }), 'MBOM.NOT_RELEASED', fullContext.version.production_version_id));
      checks.push(await validationWithMutation('unreleased routing', () => snapshotUpdate(masterDb, 'md_routing_header', 'master_id', fullContext.master.routing_header_id, { lifecycle_status: 'Draft' }), 'ROUTING.NOT_ACTIVE', fullContext.version.production_version_id));
      checks.push(await validationWithMutation('mismatched production version item revision', () => snapshotUpdate(masterDb, 'md_production_version', 'master_id', fullContext.version.production_version_id, { item_revision_id: otherRevision.rows[0].master_id }), 'PRODUCTION_VERSION_MBOM_ITEM_REVISION_MISMATCH', fullContext.version.production_version_id));
      const line = await masterDb.query(`SELECT master_id FROM md_mbom_line WHERE mbom_header_id=$1 AND issue_operation_id IS NOT NULL LIMIT 1`, [fullContext.master.mbom_header_id]);
      const otherOperation = await masterDb.query(`SELECT master_id FROM md_operation WHERE master_id NOT IN (SELECT operation_id FROM md_routing_operation WHERE routing_header_id=$1) AND lifecycle_status='Released' LIMIT 1`, [fullContext.master.routing_header_id]);
      if (line.rowCount === 1 && otherOperation.rowCount === 1) {
        checks.push(await validationWithMutation('mbom issue operation outside routing', () => snapshotUpdate(masterDb, 'md_mbom_line', 'master_id', line.rows[0].master_id, { issue_operation_id: otherOperation.rows[0].master_id }), 'PRODUCTION_VERSION_ISSUE_OPERATION_NOT_IN_ROUTING', fullContext.version.production_version_id));
      }
      return { checks };
    });

    await record('new production version affects only new work orders', async () => {
      const clonedPV = await createDisposableProductionVersion(fullContext);
      const newWO = await createWorkOrder(clonedPV, fullContext.shift, 'CLONED-PV-WO');
      const oldDetail = (await execution(`/work-orders/${baselineWO.work_order_id}`)).body;
      const newDetail = (await execution(`/work-orders/${newWO.work_order_id}`)).body;
      if (oldDetail.header.production_version_id !== fullContext.version.production_version_id) throw new Error('EXISTING_WO_PV_CHANGED');
      if (newDetail.header.production_version_id !== clonedPV.production_version_id) throw new Error('NEW_WO_DID_NOT_USE_NEW_PV');
      return { existing_work_order_pv: oldDetail.header.production_version_id, new_work_order_pv: newDetail.header.production_version_id };
    });

    const cleanup = await record('exact cleanup verification', async () => {
      const cleanup = await cleanupWorkOrders();
      await restoreFixtures();
      const remaining = await executionDb.query(`SELECT count(*)::int AS count FROM wo_header`);
      if (Number(remaining.rows[0].count) !== baselineWorkOrderCount) throw new Error(`WO_COUNT_NOT_RESTORED: expected ${baselineWorkOrderCount}, got ${remaining.rows[0].count}`);
      return { ...cleanup, baseline_wo_header_count: baselineWorkOrderCount, wo_header_count: remaining.rows[0].count };
    });

    finalStatus = 'passed';
    const result = { run_id: runId, status: finalStatus, target_date: targetDate, steps, cleanup, artifact_root: artifactRoot };
    await fs.writeFile(resultArtifact, JSON.stringify(result, null, 2));
    await fs.writeFile(markdownArtifact, `# Phase 4 Product Definition Snapshot Verification\n\nStatus: PASS\nRun: ${runId}\n\n- Declared: ${steps.length}\n- Executed: ${steps.length}\n- Passed: ${steps.filter((step) => step.status === 'passed').length}\n- Failed: 0\n- Skipped: 0\n\nArtifact: ${resultArtifact}\n`);
    console.log(JSON.stringify(result));
  } finally {
    if (finalStatus !== 'passed') {
      await cleanupWorkOrders().catch(() => undefined);
      await restoreFixtures().catch(() => undefined);
      const result = { run_id: runId, status: finalStatus, target_date: targetDate, steps, artifact_root: artifactRoot };
      await fs.mkdir(artifactRoot, { recursive: true });
      await fs.writeFile(resultArtifact, JSON.stringify(result, null, 2)).catch(() => undefined);
    }
    await Promise.all([masterDb.end(), executionDb.end()]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
