#!/usr/bin/env node

/*
 * Destructive Work Order data reset. This script is intentionally cleanup-only;
 * the seed/verification phase is a separate command and must not be hidden in
 * a destructive reset.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import pg from 'pg';

const { Client } = pg;
const executionUrl = process.env.MES_EXECUTION_DATABASE_URL || 'postgresql://mes_execution_user:mes_execution_pass@localhost:15435/mes_execution_db';
const kioskUrl = process.env.MES_KIOSK_DATABASE_URL || 'postgresql://mes_kiosk_user:mes_kiosk_pass@localhost:15437/mes_kiosk_gateway_db';
const mode = process.argv.includes('--reset') ? 'reset' : 'dry-run';
const envName = String(process.env.MES_ENV || '').trim().toLowerCase();
const requiredConfirmation = 'YES_DELETE_MES_TEST_DATA';
const artifactDir = path.resolve(process.env.ARTIFACT_DIR || `artifacts/mes-reset-seed-verify/${new Date().toISOString().replaceAll(/[:.]/g, '-')}`);

const execution = new Client({ connectionString: executionUrl });
const kiosk = new Client({ connectionString: kioskUrl });
const executionURL = new URL(executionUrl);
const kioskURL = new URL(kioskUrl);
const allowedEnvironments = new Set(['development', 'local', 'test', 'staging']);
const allowedDatabaseNames = new Set(['mes_execution_db', 'mes_execution_test_db', 'mes_execution_staging_db']);
const allowedHosts = new Set(['localhost', '127.0.0.1', '::1', 'mes-execution-db']);

const count = (result) => Number(result.rowCount || 0);
const json = (value) => JSON.stringify(value, null, 2);
const writeJson = (name, value) => fs.writeFile(path.join(artifactDir, name), json(value));

function safeConnectionIdentity(url) {
  return { host: url.hostname, port: url.port || '5432', database: url.pathname.slice(1), user: url.username, password: '[REDACTED]' };
}

function gitContext() {
  try {
    return { branch: execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(), commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim() };
  } catch (error) {
    return { error: error.message };
  }
}

function safetyCheck() {
  const reasons = [];
  if (!allowedEnvironments.has(envName)) reasons.push(`MES_ENV must be one of: ${[...allowedEnvironments].join(', ')}`);
  if (!allowedHosts.has(executionURL.hostname) || !allowedHosts.has(kioskURL.hostname)) reasons.push('database host is not an approved local/test host');
  if (!allowedDatabaseNames.has(executionURL.pathname.slice(1))) reasons.push(`execution database is not allow-listed: ${executionURL.pathname.slice(1)}`);
  if (kioskURL.pathname.slice(1) !== 'mes_kiosk_gateway_db') reasons.push(`kiosk database is not allow-listed: ${kioskURL.pathname.slice(1)}`);
  if (mode === 'reset' && process.env.CONFIRM_DESTRUCTIVE_RESET !== requiredConfirmation) reasons.push(`CONFIRM_DESTRUCTIVE_RESET must equal ${requiredConfirmation}`);
  return { passed: reasons.length === 0, mode, environment: envName || null, reasons, execution: safeConnectionIdentity(executionURL), kiosk: safeConnectionIdentity(kioskURL), host: os.hostname(), git: gitContext() };
}

async function discoverSchema(client) {
  const tables = (await client.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY table_schema, table_name
  `)).rows;
  const foreignKeys = (await client.query(`
    SELECT tc.table_name AS child_table, ccu.table_name AS parent_table,
           kcu.column_name AS child_column, ccu.column_name AS parent_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    ORDER BY tc.table_name, ccu.table_name
  `)).rows;
  return { tables, foreignKeys, relevantTables: tables.filter((row) => /^(wo_|execution_|operation_|outbox|inbox|kiosk|rm_|resource_|capacity_|material_|inventory_)/i.test(row.table_name)) };
}

async function tableSet(client) {
  const result = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`);
  return new Set(result.rows.map((row) => row.table_name));
}

async function auditWorkOrders(client, tables) {
  if (!tables.has('wo_header')) return [];
  const query = `
    SELECT h.wo_id, h.wo_code, h.status, h.created_at, h.production_version_id,
      h.production_version_code, h.item_revision_code, h.mbom_code, h.routing_code,
      h.planning_snapshot,
      COALESCE(o.operation_count, 0)::int AS operation_count,
      COALESCE(m.material_count, 0)::int AS material_count,
      COALESCE(a.allocation_count, 0)::int AS allocation_count,
      COALESCE(p.print_job_count, 0)::int AS print_job_count,
      pv.lifecycle_status AS pv_status, rh.lifecycle_status AS routing_status,
      mb.lifecycle_status AS mbom_status, ir.lifecycle_status AS item_revision_status,
      CASE
        WHEN h.production_version_id IS NULL THEN 'MISSING_PRODUCTION_VERSION'
        WHEN COALESCE(h.production_version_code, '') = '' THEN 'MISSING_PRODUCTION_VERSION_SNAPSHOT'
        WHEN COALESCE(h.routing_code, '') = '' THEN 'MISSING_ROUTING_SNAPSHOT'
        WHEN h.planning_snapshot IS NULL OR h.planning_snapshot = '{}'::jsonb THEN 'MISSING_PLANNING_SNAPSHOT'
        WHEN COALESCE(o.operation_count, 0) = 0 THEN 'ZERO_OPERATIONS'
        WHEN pv.lifecycle_status <> 'Released' OR rh.lifecycle_status <> 'Released' OR mb.lifecycle_status <> 'Released' OR ir.lifecycle_status <> 'Released' THEN 'MASTER_DATA_REFERENCE_NOT_RELEASED'
        ELSE NULL
      END AS primary_reason
    FROM wo_header h
    LEFT JOIN (SELECT wo_id, COUNT(*) operation_count FROM wo_operation GROUP BY wo_id) o ON o.wo_id = h.wo_id
    LEFT JOIN (SELECT wo_id, COUNT(*) material_count FROM wo_material_requirement GROUP BY wo_id) m ON m.wo_id = h.wo_id
    LEFT JOIN (SELECT wo_id, COUNT(*) allocation_count FROM wo_resource_allocation GROUP BY wo_id) a ON a.wo_id = h.wo_id
    LEFT JOIN (SELECT wo_id, COUNT(*) print_job_count FROM wo_print_job GROUP BY wo_id) p ON p.wo_id = h.wo_id
    LEFT JOIN rm_production_version pv ON pv.master_id = h.production_version_id
    LEFT JOIN rm_routing_header rh ON rh.master_id = pv.routing_header_id
    LEFT JOIN rm_mbom_header mb ON mb.master_id = pv.mbom_header_id
    LEFT JOIN rm_item_revision ir ON ir.master_id = pv.item_revision_id
    ORDER BY h.created_at, h.wo_code`;
  const rows = (await client.query(query)).rows;
  return rows.map((row) => ({ ...row, classification: row.primary_reason ? 'INVALID' : 'VALID', reasons: row.primary_reason ? [row.primary_reason] : [] }));
}

async function orphanAudit(client, tables) {
  const checks = {
    operation_without_header: ['wo_operation', `SELECT COUNT(*)::int AS count FROM wo_operation o LEFT JOIN wo_header h ON h.wo_id=o.wo_id WHERE h.wo_id IS NULL`],
    material_without_header: ['wo_material_requirement', `SELECT COUNT(*)::int AS count FROM wo_material_requirement m LEFT JOIN wo_header h ON h.wo_id=m.wo_id WHERE h.wo_id IS NULL`],
    session_without_operation: ['execution_session', `SELECT COUNT(*)::int AS count FROM execution_session s LEFT JOIN wo_operation o ON o.wo_operation_id=s.wo_operation_id WHERE o.wo_operation_id IS NULL`],
    confirmation_without_operation: ['operation_confirmation', `SELECT COUNT(*)::int AS count FROM operation_confirmation c LEFT JOIN wo_operation o ON o.wo_operation_id=c.wo_operation_id WHERE o.wo_operation_id IS NULL`],
    print_job_without_header: ['wo_print_job', `SELECT COUNT(*)::int AS count FROM wo_print_job p LEFT JOIN wo_header h ON h.wo_id=p.wo_id WHERE h.wo_id IS NULL`],
    print_attempt_without_job: ['wo_print_job_attempt', `SELECT COUNT(*)::int AS count FROM wo_print_job_attempt a LEFT JOIN wo_print_job p ON p.print_job_id=a.print_job_id WHERE p.print_job_id IS NULL`],
    print_event_without_job: ['wo_print_job_event', `SELECT COUNT(*)::int AS count FROM wo_print_job_event e LEFT JOIN wo_print_job p ON p.print_job_id=e.print_job_id WHERE p.print_job_id IS NULL`],
    allocation_without_operation: ['wo_resource_allocation', `SELECT COUNT(*)::int AS count FROM wo_resource_allocation a LEFT JOIN wo_operation o ON o.wo_operation_id=a.wo_operation_id WHERE o.wo_operation_id IS NULL`],
    reservation_without_allocation: ['wo_capacity_reservation', `SELECT COUNT(*)::int AS count FROM wo_capacity_reservation r LEFT JOIN wo_resource_allocation a ON a.allocation_id=r.allocation_id WHERE a.allocation_id IS NULL`],
    workflow_without_work_order: ['wo_creation_workflow', `SELECT COUNT(*)::int AS count FROM wo_creation_workflow WHERE work_order_id IS NULL`],
  };
  const result = {};
  for (const [name, [table, query]] of Object.entries(checks)) result[name] = tables.has(table) ? Number((await client.query(query)).rows[0].count) : 0;
  return result;
}

async function deleteRows(client, tables, ids, codes) {
  const deleted = {};
  const idArray = ids.length ? ids : ['00000000-0000-0000-0000-000000000000'];
  const patterns = [...ids, ...codes].map((value) => `%${value}%`);
  const statements = [
    ['operation_confirmations', 'operation_confirmation', `DELETE FROM operation_confirmation c USING wo_operation o WHERE c.wo_operation_id=o.wo_operation_id AND o.wo_id=ANY($1::uuid[])`],
    // Confirmations reference execution_session.session_id, so they must be
    // removed before the sessions even when both belong to the same WO.
    ['execution_sessions', 'execution_session', `DELETE FROM execution_session s USING wo_operation o WHERE s.wo_operation_id=o.wo_operation_id AND o.wo_id=ANY($1::uuid[])`],
    ['material_consumption', 'material_consumption', `DELETE FROM material_consumption WHERE wo_id=ANY($1::uuid[]) OR wo_operation_id IN (SELECT wo_operation_id FROM wo_operation WHERE wo_id=ANY($1::uuid[]))`],
    ['print_events', 'wo_print_job_event', `DELETE FROM wo_print_job_event e USING wo_print_job p WHERE e.print_job_id=p.print_job_id AND p.wo_id=ANY($1::uuid[])`],
    ['print_attempts', 'wo_print_job_attempt', `DELETE FROM wo_print_job_attempt a USING wo_print_job p WHERE a.print_job_id=p.print_job_id AND p.wo_id=ANY($1::uuid[])`],
    ['capacity_reservations', 'wo_capacity_reservation', `DELETE FROM wo_capacity_reservation WHERE wo_id=ANY($1::uuid[]) OR allocation_id IN (SELECT allocation_id FROM wo_resource_allocation WHERE wo_id=ANY($1::uuid[]))`],
    ['resource_allocation_audit', 'wo_resource_allocation_audit', `DELETE FROM wo_resource_allocation_audit WHERE wo_id=ANY($1::uuid[]) OR allocation_id IN (SELECT allocation_id FROM wo_resource_allocation WHERE wo_id=ANY($1::uuid[]))`],
    ['allocation_idempotency', 'wo_resource_allocation_idempotency', `DELETE FROM wo_resource_allocation_idempotency WHERE allocation_id IN (SELECT allocation_id FROM wo_resource_allocation WHERE wo_id=ANY($1::uuid[]))`],
    ['print_jobs', 'wo_print_job', `DELETE FROM wo_print_job WHERE wo_id=ANY($1::uuid[])`],
    ['resource_allocations', 'wo_resource_allocation', `DELETE FROM wo_resource_allocation WHERE wo_id=ANY($1::uuid[])`],
    ['operation_labor_assignments', 'wo_operation_labor_assignment', `DELETE FROM wo_operation_labor_assignment WHERE wo_id=ANY($1::uuid[])`],
    ['materials', 'wo_material_requirement', `DELETE FROM wo_material_requirement WHERE wo_id=ANY($1::uuid[])`],
    ['operations', 'wo_operation', `DELETE FROM wo_operation WHERE wo_id=ANY($1::uuid[])`],
    ['approval_logs', 'wo_approval_log', `DELETE FROM wo_approval_log WHERE wo_id=ANY($1::uuid[])`],
    ['workflow_events', 'wo_creation_workflow_event', `DELETE FROM wo_creation_workflow_event e USING wo_creation_workflow w WHERE e.workflow_id=w.workflow_id AND (w.work_order_id=ANY($1::uuid[]) OR w.request_payload::text LIKE ANY($2::text[]))`],
    ['workflows', 'wo_creation_workflow', `DELETE FROM wo_creation_workflow WHERE work_order_id=ANY($1::uuid[]) OR request_payload::text LIKE ANY($2::text[])`],
    ['outbox_events', 'outbox_events', `DELETE FROM outbox_events WHERE payload::text LIKE ANY($1::text[])`],
    ['work_orders', 'wo_header', `DELETE FROM wo_header WHERE wo_id=ANY($1::uuid[])`],
  ];
  for (const [name, table, query] of statements) {
    if (!tables.has(table)) { deleted[name] = 0; continue; }
    const params = name === 'outbox_events' ? [patterns] : query.includes('$2') ? [idArray, patterns] : [idArray];
    deleted[name] = count(await client.query(query, params));
  }
  return deleted;
}

async function deleteOrphans(client, tables) {
  const statements = [
    ['orphan_confirmations', 'operation_confirmation', `DELETE FROM operation_confirmation c WHERE NOT EXISTS (SELECT 1 FROM wo_operation o WHERE o.wo_operation_id=c.wo_operation_id)`],
    ['orphan_execution_sessions', 'execution_session', `DELETE FROM execution_session s WHERE NOT EXISTS (SELECT 1 FROM wo_operation o WHERE o.wo_operation_id=s.wo_operation_id)`],
    ['orphan_material_consumption', 'material_consumption', `DELETE FROM material_consumption m WHERE NOT EXISTS (SELECT 1 FROM wo_header h WHERE h.wo_id=m.wo_id)`],
    ['orphan_print_attempts', 'wo_print_job_attempt', `DELETE FROM wo_print_job_attempt a WHERE NOT EXISTS (SELECT 1 FROM wo_print_job p WHERE p.print_job_id=a.print_job_id)`],
    ['orphan_print_events', 'wo_print_job_event', `DELETE FROM wo_print_job_event e WHERE NOT EXISTS (SELECT 1 FROM wo_print_job p WHERE p.print_job_id=e.print_job_id)`],
    ['orphan_print_jobs', 'wo_print_job', `DELETE FROM wo_print_job p WHERE NOT EXISTS (SELECT 1 FROM wo_header h WHERE h.wo_id=p.wo_id)`],
    ['orphan_allocations', 'wo_resource_allocation', `DELETE FROM wo_resource_allocation a WHERE NOT EXISTS (SELECT 1 FROM wo_operation o WHERE o.wo_operation_id=a.wo_operation_id)`],
    ['orphan_reservations', 'wo_capacity_reservation', `DELETE FROM wo_capacity_reservation r WHERE NOT EXISTS (SELECT 1 FROM wo_resource_allocation a WHERE a.allocation_id=r.allocation_id)`],
    ['orphan_workflow_events', 'wo_creation_workflow_event', `DELETE FROM wo_creation_workflow_event e WHERE EXISTS (SELECT 1 FROM wo_creation_workflow w WHERE w.workflow_id=e.workflow_id AND w.work_order_id IS NULL)`],
    ['orphan_workflows', 'wo_creation_workflow', `DELETE FROM wo_creation_workflow WHERE work_order_id IS NULL`],
  ];
  const deleted = {};
  for (const [name, table, query] of statements) deleted[name] = tables.has(table) ? count(await client.query(query)) : 0;
  return deleted;
}

async function main() {
  await fs.mkdir(artifactDir, { recursive: true });
  const safety = safetyCheck();
  await writeJson('environment.json', safety);
  if (!safety.passed) throw new Error(`ENVIRONMENT_SAFETY: ${safety.reasons.join('; ')}`);

  await execution.connect();
  await kiosk.connect();
  const schema = await discoverSchema(execution);
  const tables = new Set(schema.tables.map((row) => row.table_name));
  await writeJson('schema-discovery.json', schema);
  const auditRows = await auditWorkOrders(execution, tables);
  const orphansBefore = await orphanAudit(execution, tables);
  const ids = auditRows.map((row) => row.wo_id);
  const codes = auditRows.map((row) => row.wo_code);
  const plan = { mode, workOrders: auditRows.length, invalidWorkOrders: auditRows.filter((row) => row.classification !== 'VALID').length, workOrderIds: ids, childFirst: true, preservesMasterData: true, statementsScope: 'WO IDs, known test codes, and orphan predicates only' };
  await writeJson('pre-cleanup-audit.json', { workOrders: auditRows, orphans: orphansBefore });
  await fs.writeFile(path.join(artifactDir, 'pre-cleanup-audit.md'), `# Pre-cleanup audit\n\n- Work Orders: ${auditRows.length}\n- Invalid: ${plan.invalidWorkOrders}\n\n| WO | Status | Operations | Materials | Print jobs | Classification | Reason |\n|---|---|---:|---:|---:|---|---|\n${auditRows.map((row) => `| ${row.wo_code} (${row.wo_id}) | ${row.status} | ${row.operation_count} | ${row.material_count} | ${row.print_job_count} | ${row.classification} | ${row.reasons.join(', ') || '-'} |`).join('\n')}\n\n## Orphans\n\n\`\`\`json\n${json(orphansBefore)}\n\`\`\`\n`);
  await writeJson('deletion-plan.json', plan);
  if (mode === 'dry-run') {
    await writeJson('deleted-row-counts.json', { dryRun: true });
    await writeJson('database-integrity.json', { dryRun: true, orphansBefore });
    await writeJson('summary.json', { success: true, mode, artifactDir, safety, plan, orphansBefore });
    console.log(json({ success: true, mode, artifactDir, plan, orphansBefore }));
    return;
  }

  await execution.query('BEGIN');
  let deleted;
  try {
    deleted = await deleteRows(execution, tables, ids, codes);
    deleted = { ...deleted, ...(await deleteOrphans(execution, tables)) };
    await execution.query('COMMIT');
  } catch (error) {
    await execution.query('ROLLBACK');
    throw new Error(`CLEANUP_FOREIGN_KEY: ${error.message}`);
  }

  let kioskDeleted = 0;
  const kioskTables = await tableSet(kiosk);
  if (kioskTables.has('outbound_message_queue') && (ids.length || codes.length)) {
    await kiosk.query('BEGIN');
    try {
      const patterns = [...ids, ...codes].map((value) => `%${value}%`);
      kioskDeleted = count(await kiosk.query('DELETE FROM outbound_message_queue WHERE payload::text LIKE ANY($1::text[])', [patterns]));
      await kiosk.query('COMMIT');
    } catch (error) {
      await kiosk.query('ROLLBACK');
      throw new Error(`ORPHAN_DATA: kiosk cleanup failed: ${error.message}`);
    }
  }
  const after = await orphanAudit(execution, tables);
  const remaining = await auditWorkOrders(execution, tables);
  await writeJson('deleted-row-counts.json', { ...deleted, kiosk_outbound_messages: kioskDeleted });
  await writeJson('database-integrity.json', { orphansBefore, orphansAfter: after, remainingWorkOrders: remaining });
  await writeJson('summary.json', { success: true, mode, artifactDir, safety, deleted: { ...deleted, kiosk_outbound_messages: kioskDeleted }, orphansBefore, orphansAfter: after, remainingWorkOrders: remaining.length });
  console.log(json({ success: true, mode, artifactDir, deleted: { ...deleted, kiosk_outbound_messages: kioskDeleted }, orphansAfter: after, remainingWorkOrders: remaining.length }));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(async () => {
  try { await execution.end(); } catch {}
  try { await kiosk.end(); } catch {}
});
