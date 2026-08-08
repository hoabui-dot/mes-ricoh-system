#!/usr/bin/env node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

const { Client } = pg;

const mode = process.argv[2] || '--verify';
const includePrint = process.argv.includes('--with-print') && !process.argv.includes('--without-print');
if (process.argv.includes('--with-print') && process.argv.includes('--without-print')) {
  throw new Error('SEED_PRINT_MODE_CONFLICT: choose only --with-print or --without-print');
}
const envName = String(process.env.MES_ENV || '').trim().toLowerCase();
const dateStamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
const artifactPath = path.resolve(process.env.MES_SEED_VERIFICATION_ARTIFACT || `artifacts/mes-seed-verification-${dateStamp}.json`);
const artifactDir = path.dirname(artifactPath);
const runArtifactDir = path.resolve(process.env.ARTIFACT_DIR || `artifacts/mes-reset-seed-verify/phase10-${dateStamp}`);
const masterUrl = process.env.MES_MASTER_DATA_DATABASE_URL || 'postgresql://mes_master_data_user:mes_master_data_pass@localhost:15434/mes_master_data_db';
const executionUrl = process.env.MES_EXECUTION_DATABASE_URL || 'postgresql://mes_execution_user:mes_execution_pass@localhost:15435/mes_execution_db';
const traceabilityUrl = process.env.MES_TRACEABILITY_DATABASE_URL || 'postgresql://traceability_user:traceability_pass@localhost:15436/mes_traceability_db';
const executionBase = (process.env.MES_EXECUTION_URL || 'http://127.0.0.1:13030/api/mes/execution').replace(/\/$/, '');
const userId = process.env.MES_SEED_USER_ID || '00000000-0000-0000-0000-000000000001';
const roleCode = process.env.MES_SEED_ROLE_CODE || 'PLANT_MANAGER';
const namespace = 'WST-SEED';

const master = new Client({ connectionString: masterUrl });
const execution = new Client({ connectionString: executionUrl });
const traceability = new Client({ connectionString: traceabilityUrl });

const json = (value) => JSON.stringify(value, null, 2);
const headers = { 'Content-Type': 'application/json', 'X-User-ID': userId, 'X-Role-Code': roleCode, 'X-Trace-ID': `phase10-${Date.now()}` };

function conn(url) {
  const parsed = new URL(url);
  return { host: parsed.hostname, port: parsed.port || '5432', database: parsed.pathname.slice(1), user: parsed.username, password: '[REDACTED]' };
}

function ensureSafety(mutating) {
  const reasons = [];
  const allowedEnv = new Set(['development', 'local', 'test', 'uat', 'staging']);
  const allowedHosts = new Set(['localhost', '127.0.0.1', '::1']);
  if (!allowedEnv.has(envName)) reasons.push(`MES_ENV must be one of ${[...allowedEnv].join(', ')}`);
  for (const [name, url] of [['master', masterUrl], ['execution', executionUrl], ['traceability', traceabilityUrl]]) {
    const parsed = new URL(url);
    if (!allowedHosts.has(parsed.hostname)) reasons.push(`${name} database host must be local/test: ${parsed.hostname}`);
  }
  if (mutating && process.env.ALLOW_DESTRUCTIVE_SEED !== 'true') reasons.push('ALLOW_DESTRUCTIVE_SEED must equal true');
  return {
    passed: reasons.length === 0,
    mode,
    environment: envName || null,
    reasons,
    host: os.hostname(),
    databases: { master: conn(masterUrl), execution: conn(executionUrl), traceability: conn(traceabilityUrl) },
  };
}

async function writeArtifact(report) {
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(artifactPath, json(report));
}

function run(command, args, label, extraEnv = {}) {
  const started = new Date().toISOString();
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
    maxBuffer: 20 * 1024 * 1024,
  });
  const item = { label, command: [command, ...args].join(' '), exit_code: result.status, started_at: started, ended_at: new Date().toISOString(), stdout: result.stdout, stderr: result.stderr };
  if (result.status !== 0) throw Object.assign(new Error(`${label} failed with exit ${result.status}: ${result.stderr || result.stdout}`), { commandResult: item });
  return item;
}

async function q(client, text, params = []) {
  return client.query(text, params);
}

function defaultPlanningDate() {
  const date = new Date();
  const day = date.getUTCDay();
  if (day === 6) date.setUTCDate(date.getUTCDate() + 2);
  if (day === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

async function connectAll() {
  await master.connect();
  await execution.connect();
  await traceability.connect();
}

async function cleanupOwnedSeed() {
  const empty = ['00000000-0000-0000-0000-000000000000'];
  const owned = {
    masterWorkOrderCodes: [],
    itemIds: (await q(master, `SELECT master_id FROM md_item WHERE code LIKE '${namespace}-%'`)).rows.map((row) => row.master_id),
    revisionIds: (await q(master, `SELECT master_id FROM md_item_revision WHERE code LIKE '${namespace}-%' OR revision_code LIKE '${namespace}-%'`)).rows.map((row) => row.master_id),
    operationIds: (await q(master, `SELECT master_id FROM md_operation WHERE code LIKE '${namespace}-%'`)).rows.map((row) => row.master_id),
    routingIds: (await q(master, `SELECT master_id FROM md_routing_header WHERE code LIKE '${namespace}-%'`)).rows.map((row) => row.master_id),
    mbomIds: (await q(master, `SELECT master_id FROM md_mbom_header WHERE code LIKE '${namespace}-%'`)).rows.map((row) => row.master_id),
    pvIds: (await q(master, `SELECT master_id FROM md_production_version WHERE code LIKE '${namespace}-%' OR code LIKE 'WST-UAT-%'`)).rows.map((row) => row.master_id),
    lineIds: (await q(master, `SELECT master_id FROM md_production_line WHERE code LIKE '${namespace}-%'`)).rows.map((row) => row.master_id),
    wcIds: (await q(master, `SELECT master_id FROM md_work_center WHERE code LIKE '${namespace}-%'`)).rows.map((row) => row.master_id),
    workstationIds: (await q(master, `SELECT master_id FROM md_workstation WHERE code LIKE '${namespace}-%'`)).rows.map((row) => row.master_id),
    equipmentIds: (await q(master, `SELECT master_id FROM md_equipment WHERE code LIKE '${namespace}-%'`)).rows.map((row) => row.master_id),
    employeeIds: (await q(master, `SELECT master_id FROM md_employee WHERE code LIKE '${namespace}-EMP-%'`)).rows.map((row) => row.master_id),
    skillIds: (await q(master, `SELECT master_id FROM md_skill WHERE code LIKE '${namespace}-SK-%'`)).rows.map((row) => row.master_id),
    shiftSetIds: (await q(master, `SELECT master_id FROM md_work_center_shift_set WHERE code LIKE '${namespace}-SHIFTSET-%'`)).rows.map((row) => row.master_id),
  };
  const counts = {};
  await master.query('BEGIN');
  try {
    await master.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
    const stmts = [
      ['line_eligibility', `DELETE FROM md_production_version_line_eligibility WHERE production_version_id=ANY($1::uuid[]) OR production_line_id=ANY($2::uuid[])`, [owned.pvIds.length ? owned.pvIds : empty, owned.lineIds.length ? owned.lineIds : empty]],
      ['line_resource_scope', `DELETE FROM md_production_line_resource_scope WHERE production_line_id=ANY($1::uuid[]) OR work_center_id=ANY($2::uuid[])`, [owned.lineIds.length ? owned.lineIds : empty, owned.wcIds.length ? owned.wcIds : empty]],
      ['line_work_centers', `DELETE FROM md_production_line_work_center WHERE production_line_id=ANY($1::uuid[]) OR work_center_id=ANY($2::uuid[])`, [owned.lineIds.length ? owned.lineIds : empty, owned.wcIds.length ? owned.wcIds : empty]],
      ['operation_skill_requirements', `DELETE FROM md_operation_skill_requirement WHERE routing_operation_id IN (SELECT master_id FROM md_routing_operation WHERE routing_header_id=ANY($1::uuid[]))`, [owned.routingIds.length ? owned.routingIds : empty]],
      ['employee_schedules', `DELETE FROM md_employee_shift_schedule WHERE employee_id=ANY($1::uuid[])`, [owned.employeeIds.length ? owned.employeeIds : empty]],
      ['employee_skills', `DELETE FROM md_employee_skill WHERE employee_id=ANY($1::uuid[]) OR skill_id=ANY($2::uuid[])`, [owned.employeeIds.length ? owned.employeeIds : empty, owned.skillIds.length ? owned.skillIds : empty]],
      ['employees', `DELETE FROM md_employee WHERE master_id=ANY($1::uuid[])`, [owned.employeeIds.length ? owned.employeeIds : empty]],
      ['skills', `DELETE FROM md_skill WHERE master_id=ANY($1::uuid[])`, [owned.skillIds.length ? owned.skillIds : empty]],
      ['work_center_shift_assignments', `DELETE FROM md_work_center_shift WHERE shift_set_id=ANY($1::uuid[])`, [owned.shiftSetIds.length ? owned.shiftSetIds : empty]],
      ['work_center_shift_sets', `DELETE FROM md_work_center_shift_set WHERE master_id=ANY($1::uuid[])`, [owned.shiftSetIds.length ? owned.shiftSetIds : empty]],
      ['resource_capabilities', `DELETE FROM md_resource_capability WHERE code LIKE '${namespace}-%' OR work_center_id=ANY($1::uuid[])`, [owned.wcIds.length ? owned.wcIds : empty]],
      ['resource_calendars', `DELETE FROM md_resource_calendar WHERE code LIKE '${namespace}-%' OR work_center_id=ANY($1::uuid[])`, [owned.wcIds.length ? owned.wcIds : empty]],
      ['production_standards', `DELETE FROM md_production_standard WHERE code LIKE '${namespace}-%' OR routing_operation_id IN (SELECT master_id FROM md_routing_operation WHERE routing_header_id=ANY($1::uuid[])) OR work_center_id=ANY($2::uuid[])`, [owned.routingIds.length ? owned.routingIds : empty, owned.wcIds.length ? owned.wcIds : empty]],
      ['resource_assignments', `DELETE FROM md_resource_assignment WHERE code LIKE '${namespace}-%' OR work_center_id=ANY($1::uuid[])`, [owned.wcIds.length ? owned.wcIds : empty]],
      ['production_versions_before_resources', `DELETE FROM md_production_version WHERE master_id=ANY($1::uuid[])`, [owned.pvIds.length ? owned.pvIds : empty]],
      ['routing_operations_before_resources', `DELETE FROM md_routing_operation WHERE routing_header_id=ANY($1::uuid[]) OR work_center_id=ANY($2::uuid[]) OR workstation_id=ANY($3::uuid[])`, [owned.routingIds.length ? owned.routingIds : empty, owned.wcIds.length ? owned.wcIds : empty, owned.workstationIds.length ? owned.workstationIds : empty]],
      ['machine_units', `DELETE FROM md_machine_unit WHERE machine_id=ANY($1::uuid[])`, [owned.equipmentIds.length ? owned.equipmentIds : empty]],
      ['equipment', `DELETE FROM md_equipment WHERE master_id=ANY($1::uuid[])`, [owned.equipmentIds.length ? owned.equipmentIds : empty]],
      ['workstation_print_station_bindings', `DELETE FROM md_workstation_print_station_binding WHERE workstation_id=ANY($1::uuid[])`, [owned.workstationIds.length ? owned.workstationIds : empty]],
      ['workstations', `DELETE FROM md_workstation WHERE master_id=ANY($1::uuid[])`, [owned.workstationIds.length ? owned.workstationIds : empty]],
      ['production_versions', `DELETE FROM md_production_version WHERE master_id=ANY($1::uuid[])`, [owned.pvIds.length ? owned.pvIds : empty]],
      ['mbom_lines', `DELETE FROM md_mbom_line WHERE mbom_header_id=ANY($1::uuid[])`, [owned.mbomIds.length ? owned.mbomIds : empty]],
      ['routing_operations', `DELETE FROM md_routing_operation WHERE routing_header_id=ANY($1::uuid[])`, [owned.routingIds.length ? owned.routingIds : empty]],
      ['routing_headers', `DELETE FROM md_routing_header WHERE master_id=ANY($1::uuid[])`, [owned.routingIds.length ? owned.routingIds : empty]],
      ['mbom_headers', `DELETE FROM md_mbom_header WHERE master_id=ANY($1::uuid[])`, [owned.mbomIds.length ? owned.mbomIds : empty]],
      ['item_revisions', `DELETE FROM md_item_revision WHERE master_id=ANY($1::uuid[])`, [owned.revisionIds.length ? owned.revisionIds : empty]],
      ['items', `DELETE FROM md_item WHERE master_id=ANY($1::uuid[])`, [owned.itemIds.length ? owned.itemIds : empty]],
      ['operations', `DELETE FROM md_operation op WHERE master_id=ANY($1::uuid[]) AND NOT EXISTS (SELECT 1 FROM md_routing_operation ro WHERE ro.operation_id=op.master_id)`, [owned.operationIds.length ? owned.operationIds : empty]],
      ['work_centers', `DELETE FROM md_work_center WHERE master_id=ANY($1::uuid[])`, [owned.wcIds.length ? owned.wcIds : empty]],
      ['production_lines', `DELETE FROM md_production_line WHERE master_id=ANY($1::uuid[])`, [owned.lineIds.length ? owned.lineIds : empty]],
      ['outbox_events', `DELETE FROM outbox_events WHERE payload::text LIKE $1`, [`%${namespace}%`]],
    ];
    for (const [name, text, params] of stmts) counts[`master_${name}`] = Number((await q(master, text, params)).rowCount || 0);
    await master.query('COMMIT');
  } catch (error) {
    await master.query('ROLLBACK');
    throw error;
  }

  await execution.query('BEGIN');
  try {
    const execStmts = [
      ['analytics_history_operation_confirmations', `DELETE FROM operation_confirmation c USING wo_operation o, wo_header h WHERE c.wo_operation_id=o.wo_operation_id AND o.wo_id=h.wo_id AND h.wo_code LIKE 'ANL-SEED-%'`],
      ['analytics_history_sessions', `DELETE FROM execution_session s USING wo_operation o, wo_header h WHERE s.wo_operation_id=o.wo_operation_id AND o.wo_id=h.wo_id AND h.wo_code LIKE 'ANL-SEED-%'`],
      ['analytics_history_operations', `DELETE FROM wo_operation o USING wo_header h WHERE o.wo_id=h.wo_id AND h.wo_code LIKE 'ANL-SEED-%'`],
      ['analytics_history_approval_logs', `DELETE FROM wo_approval_log l USING wo_header h WHERE l.wo_id=h.wo_id AND h.wo_code LIKE 'ANL-SEED-%'`],
      ['analytics_history_line_audit', `DELETE FROM wo_line_selection_audit l USING wo_header h WHERE l.wo_id=h.wo_id AND h.wo_code LIKE 'ANL-SEED-%'`],
      ['analytics_history_work_orders', `DELETE FROM wo_header WHERE wo_code LIKE 'ANL-SEED-%'`],
      ['line_eligibility', `DELETE FROM rm_production_version_line_eligibility WHERE production_version_id IN (SELECT master_id FROM rm_production_version WHERE code LIKE '${namespace}-%' OR code LIKE 'WST-UAT-%') OR production_line_id IN (SELECT master_id FROM rm_production_line WHERE code LIKE '${namespace}-%')`],
      ['line_work_centers', `DELETE FROM rm_production_line_work_center WHERE production_line_id IN (SELECT master_id FROM rm_production_line WHERE code LIKE '${namespace}-%') OR work_center_id IN (SELECT master_id FROM rm_work_center WHERE code LIKE '${namespace}-%')`],
      ['resource_calendars', `DELETE FROM rm_resource_calendar WHERE work_center_id IN (SELECT master_id FROM rm_work_center WHERE code LIKE '${namespace}-%')`],
      ['production_standards', `DELETE FROM rm_production_standard WHERE work_center_id IN (SELECT master_id FROM rm_work_center WHERE code LIKE '${namespace}-%') OR item_revision_id IN (SELECT master_id FROM rm_item_revision WHERE code LIKE '${namespace}-%')`],
      ['resource_capabilities', `DELETE FROM rm_resource_capability WHERE work_center_id IN (SELECT master_id FROM rm_work_center WHERE code LIKE '${namespace}-%')`],
      ['operation_skill_requirements', `DELETE FROM rm_operation_skill_requirement WHERE operation_id IN (SELECT operation_id FROM rm_routing_operation WHERE routing_header_id IN (SELECT master_id FROM rm_routing_header WHERE code LIKE '${namespace}-%'))`],
      ['routing_operations', `DELETE FROM rm_routing_operation WHERE routing_header_id IN (SELECT master_id FROM rm_routing_header WHERE code LIKE '${namespace}-%')`],
      ['routing_headers', `DELETE FROM rm_routing_header WHERE code LIKE '${namespace}-%'`],
      ['mbom_lines', `DELETE FROM rm_mbom_line WHERE mbom_header_id IN (SELECT master_id FROM rm_mbom_header WHERE code LIKE '${namespace}-%')`],
      ['mbom_headers', `DELETE FROM rm_mbom_header WHERE code LIKE '${namespace}-%'`],
      ['production_versions', `DELETE FROM rm_production_version WHERE code LIKE '${namespace}-%' OR code LIKE 'WST-UAT-%'`],
      ['production_lines', `DELETE FROM rm_production_line WHERE code LIKE '${namespace}-%'`],
      ['work_centers', `DELETE FROM rm_work_center WHERE code LIKE '${namespace}-%'`],
      ['item_revisions', `DELETE FROM rm_item_revision WHERE code LIKE '${namespace}-%'`],
      ['employee_schedules', `DELETE FROM rm_employee_shift_schedule WHERE employee_id IN (SELECT master_id FROM rm_employee WHERE code LIKE '${namespace}-EMP-%')`],
      ['employee_skills', `DELETE FROM rm_employee_skill WHERE employee_id IN (SELECT master_id FROM rm_employee WHERE code LIKE '${namespace}-EMP-%') OR skill_id IN (SELECT master_id FROM rm_skill WHERE code LIKE '${namespace}-SK-%')`],
      ['employees', `DELETE FROM rm_employee WHERE code LIKE '${namespace}-EMP-%'`],
      ['skills', `DELETE FROM rm_skill WHERE code LIKE '${namespace}-SK-%'`],
    ];
    for (const [name, text] of execStmts) counts[`execution_${name}`] = Number((await q(execution, text)).rowCount || 0);
    await execution.query('COMMIT');
  } catch (error) {
    await execution.query('ROLLBACK');
    throw error;
  }

  await traceability.query('BEGIN');
  try {
    counts.traceability_policies = Number((await q(traceability, `DELETE FROM md_traceability_policy WHERE operation_code LIKE '${namespace}-%'`)).rowCount || 0);
    counts.traceability_templates = Number((await q(traceability, `DELETE FROM md_label_template WHERE template_code LIKE '${namespace}-%'`)).rowCount || 0);
    counts.traceability_numbering = Number((await q(traceability, `DELETE FROM md_numbering_rule WHERE rule_code LIKE '${namespace}-%'`)).rowCount || 0);
    counts.traceability_qr_split = Number((await q(traceability, `DELETE FROM md_qr_split_rule WHERE rule_code LIKE '${namespace}-%'`)).rowCount || 0);
    await traceability.query('COMMIT');
  } catch (error) {
    await traceability.query('ROLLBACK');
    throw error;
  }
  return counts;
}

async function seedTwoLineWonSealTech(targetDate = defaultPlanningDate()) {
  const site = (await q(master, `SELECT master_id, code FROM md_site WHERE code=$1 AND lifecycle_status='Released'`, [process.env.E2E_SITE_CODE || 'SITE-KZ3'])).rows[0];
  if (!site) throw new Error('PHASE10_SITE_NOT_FOUND');
  const area = (await q(master, `SELECT master_id, code FROM md_production_area WHERE site_id=$1 AND lifecycle_status='Released' ORDER BY sequence_no, code LIMIT 1`, [site.master_id])).rows[0];
  const shift = (await q(master, `SELECT master_id, code FROM md_shift WHERE site_id=$1 AND lifecycle_status='Released' ORDER BY CASE WHEN code='SHIFT-A' THEN 0 ELSE 1 END, code LIMIT 1`, [site.master_id])).rows[0];
  const uom = (await q(master, `SELECT master_id, code FROM md_uom WHERE code='PCS' AND lifecycle_status='Released' LIMIT 1`)).rows[0];
  if (!area || !shift || !uom) throw new Error('PHASE10_BASE_MASTER_DATA_NOT_READY');

  const ids = {
    item: cryptoRandom(),
    revision: cryptoRandom(),
    componentItem: cryptoRandom(),
    componentRevision: cryptoRandom(),
    mbom: cryptoRandom(),
    mbomLine: cryptoRandom(),
    routing: cryptoRandom(),
    pv: cryptoRandom(),
    line1: cryptoRandom(),
    line2: cryptoRandom(),
    line1BindingAltWs: cryptoRandom(),
    line1BindingAltEq: cryptoRandom(),
    line1BindingAltUnit: cryptoRandom(),
    line1BindingAltAssignment: cryptoRandom(),
  };
  const operationCodes = [`${namespace}-OP-BINDING`, `${namespace}-OP-TEST5IN1`, `${namespace}-OP-AIRTEST`, ...(includePrint ? [`${namespace}-OP-PACKING`] : [])];
  const existingOperationRows = (await q(master, `SELECT master_id, code FROM md_operation WHERE code IN (${operationCodes.map((code) => `'${code}'`).join(',')})`)).rows;
  const existingOperationIds = new Map(existingOperationRows.map((row) => [row.code, row.master_id]));
  const operations = [
    { key: 'BINDING', name: 'Binding', cycle: 90, seq: 10 },
    { key: 'TEST5IN1', name: 'Test 5 in 1', cycle: 120, seq: 20 },
    { key: 'AIRTEST', name: 'Air Test', cycle: 80, seq: 30 },
    ...(includePrint ? [{ key: 'PACKING', name: 'Packing', cycle: 60, seq: 40 }] : []),
  ].map((op) => ({ ...op, operationId: existingOperationIds.get(`${namespace}-OP-${op.key}`) || cryptoRandom(), routingOperationId: cryptoRandom(), line1Wc: cryptoRandom(), line2Wc: cryptoRandom(), line1Ws: cryptoRandom(), line2Ws: cryptoRandom(), line1Eq: cryptoRandom(), line2Eq: cryptoRandom(), line1Unit: cryptoRandom(), line2Unit: cryptoRandom(), line1Assignment: cryptoRandom(), line2Assignment: cryptoRandom() }));

  await master.query('BEGIN');
  try {
    await master.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
    await q(master, `INSERT INTO md_item (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, item_group, item_type, base_uom_id)
      VALUES ($1,'${namespace}-FG-SEAL-ASM-01',$2::jsonb,1,'Released',NOW(),$3,$3,'WON_SEAL_TECH','FG',$4),
             ($5,'${namespace}-COMP-SEAL-RING-01',$6::jsonb,1,'Released',NOW(),$3,$3,'WON_SEAL_TECH','RM',$4)`,
      [ids.item, i18n('Won Seal Tech Seal Assembly'), userId, uom.master_id, ids.componentItem, i18n('Won Seal Tech Seal Ring Component')]);
    await q(master, `INSERT INTO md_item_revision (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, item_id, revision_code, site_id, is_default, item_group, base_uom_id, planning_strategy, procurement_type, tracking_level, default_scrap_rate)
      VALUES ($1,'${namespace}-FG-SEAL-ASM-01-A',$2::jsonb,1,'Released',NOW(),$3,$3,$4,'A',$5,TRUE,'WON_SEAL_TECH',$6,'MakeToOrder','InHouse','Lot',0),
             ($7,'${namespace}-COMP-SEAL-RING-01-A',$8::jsonb,1,'Released',NOW(),$3,$3,$9,'A',$5,TRUE,'WON_SEAL_TECH',$6,'MakeToStock','InHouse','Lot',0)`,
      [ids.revision, i18n('Won Seal Tech Seal Assembly A'), userId, ids.item, site.master_id, uom.master_id, ids.componentRevision, i18n('Won Seal Tech Seal Ring Component A'), ids.componentItem]);
    for (const op of operations) {
      await q(master, `INSERT INTO md_operation (master_id, code, name, description, version_no, lifecycle_status, effective_from, created_by, updated_by, operation_type, confirmation_mode, quantity_reporting, requires_material_scan, requires_output_label, is_schedulable, default_cycle_time_sec, default_setup_time_min, default_base_quantity, default_required_persons, default_efficiency_factor, default_yield)
        VALUES ($1,$2,$3::jsonb,$3::jsonb,1,'Released',NOW(),$4,$4,$5,'QuantityOnly','GoodOnly',$6,$7,TRUE,$8,5,1,1,1,1)
        ON CONFLICT (master_id) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, lifecycle_status='Released', effective_to=NULL, updated_by=EXCLUDED.updated_by, updated_at=NOW(), operation_type=EXCLUDED.operation_type, confirmation_mode=EXCLUDED.confirmation_mode, quantity_reporting=EXCLUDED.quantity_reporting, requires_material_scan=EXCLUDED.requires_material_scan, requires_output_label=EXCLUDED.requires_output_label, is_schedulable=TRUE, default_cycle_time_sec=EXCLUDED.default_cycle_time_sec, default_setup_time_min=EXCLUDED.default_setup_time_min, default_base_quantity=EXCLUDED.default_base_quantity, default_required_persons=EXCLUDED.default_required_persons, default_efficiency_factor=EXCLUDED.default_efficiency_factor, default_yield=EXCLUDED.default_yield`,
        [op.operationId, `${namespace}-OP-${op.key}`, i18n(op.name), userId, op.key === 'PACKING' ? 'Packing' : op.key.includes('TEST') ? 'Inspection' : 'Production', op.key === 'BINDING', op.key === 'PACKING', op.cycle]);
    }
    for (const op of operations) {
      for (const line of ['line1', 'line2']) {
        const wc = op[`${line}Wc`];
        const ws = op[`${line}Ws`];
        const eq = op[`${line}Eq`];
        const unit = op[`${line}Unit`];
        const suffix = `${line === 'line1' ? 'L1' : 'L2'}-${op.key}`;
        await q(master, `INSERT INTO md_work_center (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, site_id, area_id, work_center_type, active_flag, resource_type, capacity_model, finite_capacity_flag, max_concurrent_jobs)
          VALUES ($1,$2,$3::jsonb,1,'Released',NOW(),$4,$4,$5,$6,'Production',TRUE,'MachineGroup','TimeBased',TRUE,1)`,
          [wc, `${namespace}-WC-${suffix}`, i18n(`Won Seal Tech ${suffix}`), userId, site.master_id, area.master_id]);
        await q(master, `INSERT INTO md_workstation (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, site_id, work_center_id, workstation_type, active_flag, area_id, execution_mode, max_concurrent_jobs, machine_requirement_flag)
          VALUES ($1,$2,$3::jsonb,1,'Released',NOW(),$4,$4,$5,$6,'Kiosk',TRUE,$7,'Kiosk',1,FALSE)`,
          [ws, `${namespace}-WS-${suffix}`, i18n(`Won Seal Tech workstation ${suffix}`), userId, site.master_id, wc, area.master_id]);
        await q(master, `INSERT INTO md_equipment (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, site_id, work_center_id, equipment_type, active_flag, manufacturer, model, planning_resource_flag, execution_status, default_efficiency, quantity)
          VALUES ($1,$2,$3::jsonb,1,'Released',NOW(),$4,$4,$5,$6,$7,TRUE,'Won Seal Tech','${namespace}-MODEL',TRUE,'Available',1,1)`,
          [eq, `${namespace}-EQ-${suffix}`, i18n(`Won Seal Tech equipment ${suffix}`), userId, site.master_id, wc, op.key]);
        await q(master, `INSERT INTO md_machine_unit (machine_unit_id, machine_id, code, unit_sequence, serial_number, lifecycle_status, physical_identity_status, planning_resource_flag, execution_status, active_flag)
          VALUES ($1,$2,$3,1,$4,'Released','Identified',TRUE,'Available',TRUE)`,
          [unit, eq, `${namespace}-UNIT-${suffix}`, `${namespace}-SN-${suffix}`]);
        await q(master, `INSERT INTO md_resource_assignment (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, work_center_id, workstation_id, equipment_id, assignment_type, site_id, assignment_role, scheduling_flag, oee_aggregation_flag, machine_unit_id, requirement_type, sequence_no)
          VALUES ($1,$2,$3::jsonb,1,'Released',NOW(),$4,$4,$5,$6,$7,'MachineUnit',$8,'Primary',TRUE,FALSE,$9,'Required',1)`,
          [op[`${line}Assignment`], `${namespace}-RA-${suffix}`, i18n(`Won Seal Tech assignment ${suffix}`), userId, wc, ws, eq, site.master_id, unit]);
      }
    }
    const binding = operations[0];
    await q(master, `INSERT INTO md_workstation (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, site_id, work_center_id, workstation_type, active_flag, area_id, execution_mode, max_concurrent_jobs, machine_requirement_flag)
      VALUES ($1,'${namespace}-WS-L1-BINDING-ALT',$2::jsonb,1,'Released',NOW(),$3,$3,$4,$5,'Kiosk',TRUE,$6,'Kiosk',1,FALSE)`,
      [ids.line1BindingAltWs, i18n('Won Seal Tech workstation L1-BINDING alternative'), userId, site.master_id, binding.line1Wc, area.master_id]);
    await q(master, `INSERT INTO md_equipment (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, site_id, work_center_id, equipment_type, active_flag, manufacturer, model, planning_resource_flag, execution_status, default_efficiency, quantity)
      VALUES ($1,'${namespace}-EQ-L1-BINDING-ALT',$2::jsonb,1,'Released',NOW(),$3,$3,$4,$5,'BINDING',TRUE,'Won Seal Tech','${namespace}-MODEL',TRUE,'Available',1,1)`,
      [ids.line1BindingAltEq, i18n('Won Seal Tech equipment L1-BINDING alternative'), userId, site.master_id, binding.line1Wc]);
    await q(master, `INSERT INTO md_machine_unit (machine_unit_id, machine_id, code, unit_sequence, serial_number, lifecycle_status, physical_identity_status, planning_resource_flag, execution_status, active_flag)
      VALUES ($1,$2,'${namespace}-UNIT-L1-BINDING-ALT',1,'${namespace}-SN-L1-BINDING-ALT','Released','Identified',TRUE,'Available',TRUE)`, [ids.line1BindingAltUnit, ids.line1BindingAltEq]);
    await q(master, `INSERT INTO md_resource_assignment (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, work_center_id, workstation_id, equipment_id, assignment_type, site_id, assignment_role, scheduling_flag, oee_aggregation_flag, machine_unit_id, requirement_type, sequence_no)
      VALUES ($1,'${namespace}-RA-L1-BINDING-ALT',$2::jsonb,1,'Released',NOW(),$3,$3,$4,$5,$6,'MachineUnit',$7,'Alternate',TRUE,FALSE,$8,'Required',2)`,
      [ids.line1BindingAltAssignment, i18n('Won Seal Tech assignment L1-BINDING alternative'), userId, binding.line1Wc, ids.line1BindingAltWs, ids.line1BindingAltEq, site.master_id, ids.line1BindingAltUnit]);
    await q(master, `INSERT INTO md_routing_header (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, business_version, routing_type)
      VALUES ($1,'${namespace}-ROUTING-SEAL-ASM-01',$2::jsonb,1,'Released',NOW(),$3,$3,'1','Standard')`, [ids.routing, i18n('Won Seal Tech two-line seal routing'), userId]);
    for (const op of operations) {
      await q(master, `INSERT INTO md_routing_operation (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, routing_header_id, operation_id, work_center_id, workstation_id, seq, predecessor_seq, scheduling_mode, queue_time_min, move_time_min, planning_mode)
        VALUES ($1,$2,$3::jsonb,1,'Released',NOW(),$4,$4,$5,$6,$7,$8,$9,$10,'Finite',2,1,'ROUTING_OVERRIDE')`,
        [op.routingOperationId, `${namespace}-RO-${op.key}`, i18n(`Routing ${op.name}`), userId, ids.routing, op.operationId, op.line1Wc, op.line1Ws, op.seq, op.seq === 10 ? null : op.seq - 10]);
    }
    await q(master, `INSERT INTO md_mbom_header (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, item_revision_id, business_version, purpose, base_quantity, base_uom_id)
      VALUES ($1,'${namespace}-MBOM-SEAL-ASM-01',$2::jsonb,1,'Released',NOW(),$3,$3,$4,'1','Standard',1,$5)`, [ids.mbom, i18n('Won Seal Tech Seal Assembly MBOM'), userId, ids.revision, uom.master_id]);
    await q(master, `INSERT INTO md_mbom_line (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, mbom_header_id, seq, component_revision_id, quantity_per, uom_id, scrap_rate, issue_operation_id, backflush_flag, phantom_flag)
      VALUES ($1,'${namespace}-MBOM-L01',$2::jsonb,1,'Released',NOW(),$3,$3,$4,10,$5,1,$6,0,$7,FALSE,FALSE)`, [ids.mbomLine, i18n('Seal ring component'), userId, ids.mbom, ids.componentRevision, uom.master_id, operations[0].operationId]);
    await q(master, `INSERT INTO md_production_version (master_id, code, name, name_i18n, version_no, lifecycle_status, effective_from, created_by, updated_by, mbom_header_id, routing_header_id, site_id, min_lot_size, max_lot_size, is_default)
      VALUES ($1,'${namespace}-PV-SEAL-ASM-01','Won Seal Tech two-line seal production version',$2::jsonb,1,'Released',NOW(),$3,$3,$4,$5,$6,1,1000,TRUE)`,
      [ids.pv, i18n('Won Seal Tech two-line seal production version'), userId, ids.mbom, ids.routing, site.master_id]);
    await q(master, `INSERT INTO md_production_line (master_id, code, name, description, version_no, lifecycle_status, effective_from, created_by, updated_by, site_id, area_id, default_shift_id, line_type, active_flag)
      VALUES ($1,'${namespace}-LINE-1',$2::jsonb,$3::jsonb,1,'Released',NOW(),$4,$4,$5,$6,$7,'Production',TRUE),
             ($8,'${namespace}-LINE-2',$9::jsonb,$10::jsonb,1,'Released',NOW(),$4,$4,$5,$6,$7,'Production',TRUE)`,
      [ids.line1, i18n('Won Seal Tech Line 1'), i18n('Primary equivalent production line'), userId, site.master_id, area.master_id, shift.master_id, ids.line2, i18n('Won Seal Tech Line 2'), i18n('Backup equivalent production line')]);
    for (const [lineID, lineKey] of [[ids.line1, 'line1'], [ids.line2, 'line2']]) {
      for (const [index, op] of operations.entries()) {
        await q(master, `INSERT INTO md_production_line_work_center (production_line_id, work_center_id, sequence_no, mandatory_flag, effective_from, active_flag, created_by)
          VALUES ($1,$2,$3,TRUE,NOW(),TRUE,$4)`, [lineID, op[`${lineKey}Wc`], index + 1, userId]);
      }
    }
    await q(master, `INSERT INTO md_resource_capability (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, operation_id, work_center_id, equipment_id, capability_type, active_flag, cycle_time_sec, site_id, product_revision_id, eligibility, priority_no, speed_factor)
      VALUES ($1,'${namespace}-CAP-L1-BINDING-ALT',$2::jsonb,1,'Released',NOW(),$3,$3,$4,$5,$6,'Eligible',TRUE,$7,$8,$9,TRUE,2,1)`,
      [cryptoRandom(), i18n('Capability L1 Binding alternative'), userId, binding.operationId, binding.line1Wc, ids.line1BindingAltEq, binding.cycle, site.master_id, ids.revision]);
    await q(master, `INSERT INTO md_production_standard (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, item_revision_id, operation_id, work_center_id, equipment_id, labor_count, setup_time_min, cycle_time_sec, efficiency_factor, site_id, routing_operation_id, base_quantity, standard_yield, source_method, valid_from)
      VALUES ($1,'${namespace}-STD-L1-BINDING-ALT',$2::jsonb,1,'Released',NOW(),$3,$3,$4,$5,$6,$7,1,5,$8,1,$9,$10,1,1,'Seed',CURRENT_DATE)`,
      [cryptoRandom(), i18n('Standard L1 Binding alternative'), userId, ids.revision, binding.operationId, binding.line1Wc, ids.line1BindingAltEq, binding.cycle, site.master_id, binding.routingOperationId]);
    await q(master, `INSERT INTO md_resource_calendar (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, work_center_id, equipment_id, available_from, available_to, capacity_percent, site_id, resource_type, resource_id, workstation_id, calendar_date, shift_id, availability_status, available_minutes, capacity_factor)
      VALUES ($1,'${namespace}-CAL-L1-BINDING-ALT-${targetDate.replaceAll('-', '')}',$2::jsonb,1,'Released',NOW(),$3,$3,$4,$5,$6::date,$6::date + INTERVAL '2 days',1,$7,'Equipment',$5,$8,$6::date,$9,'Available',540,1)`,
      [cryptoRandom(), i18n('Calendar L1 Binding alternative'), userId, binding.line1Wc, ids.line1BindingAltEq, targetDate, site.master_id, ids.line1BindingAltWs, shift.master_id]);
    await q(master, `INSERT INTO md_production_line_resource_scope (production_line_id, resource_assignment_id, work_center_id, workstation_id, equipment_id, machine_unit_id, effective_from, active_flag, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,NOW(),TRUE,$7)`, [ids.line1, ids.line1BindingAltAssignment, binding.line1Wc, ids.line1BindingAltWs, ids.line1BindingAltEq, ids.line1BindingAltUnit, userId]);
    for (const op of operations) {
      for (const [lineKey, role] of [['line1', 'L1'], ['line2', 'L2']]) {
        const wc = op[`${lineKey}Wc`];
        const eq = op[`${lineKey}Eq`];
        const ra = op[`${lineKey}Assignment`];
        await q(master, `INSERT INTO md_resource_capability (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, operation_id, work_center_id, equipment_id, capability_type, active_flag, cycle_time_sec, site_id, product_revision_id, eligibility, priority_no, speed_factor)
          VALUES ($1,$2,$3::jsonb,1,'Released',NOW(),$4,$4,$5,$6,$7,'Eligible',TRUE,$8,$9,$10,TRUE,1,1)`,
          [cryptoRandom(), `${namespace}-CAP-${role}-${op.key}`, i18n(`Capability ${role} ${op.name}`), userId, op.operationId, wc, eq, op.cycle, site.master_id, ids.revision]);
        await q(master, `INSERT INTO md_production_standard (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, item_revision_id, operation_id, work_center_id, equipment_id, labor_count, setup_time_min, cycle_time_sec, efficiency_factor, site_id, routing_operation_id, base_quantity, standard_yield, source_method, valid_from)
          VALUES ($1,$2,$3::jsonb,1,'Released',NOW(),$4,$4,$5,$6,$7,$8,1,5,$9,1,$10,$11,1,1,'Seed',CURRENT_DATE)`,
          [cryptoRandom(), `${namespace}-STD-${role}-${op.key}`, i18n(`Standard ${role} ${op.name}`), userId, ids.revision, op.operationId, wc, eq, op.cycle, site.master_id, op.routingOperationId]);
        await q(master, `INSERT INTO md_resource_calendar (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, work_center_id, equipment_id, available_from, available_to, capacity_percent, site_id, resource_type, resource_id, workstation_id, calendar_date, shift_id, availability_status, available_minutes, capacity_factor)
          VALUES ($1,$2,$3::jsonb,1,'Released',NOW(),$4,$4,$5,$6,$7::date,$7::date + INTERVAL '2 days',1,$8,'Equipment',$6,$9,$7::date,$10,'Available',540,1)
          ON CONFLICT (resource_type, resource_id, calendar_date, shift_id) DO UPDATE SET lifecycle_status='Released', availability_status='Available', available_minutes=540, capacity_factor=1, effective_to=NULL`,
          [cryptoRandom(), `${namespace}-CAL-${role}-${op.key}-${targetDate.replaceAll('-', '')}`, i18n(`Calendar ${role} ${op.name}`), userId, wc, eq, targetDate, site.master_id, op[`${lineKey}Ws`], shift.master_id]);
        await q(master, `INSERT INTO md_production_line_resource_scope (production_line_id, resource_assignment_id, work_center_id, workstation_id, equipment_id, machine_unit_id, effective_from, active_flag, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,NOW(),TRUE,$7)`, [lineKey === 'line1' ? ids.line1 : ids.line2, ra, wc, op[`${lineKey}Ws`], eq, op[`${lineKey}Unit`], userId]);
      }
    }
    await q(master, `INSERT INTO md_production_version_line_eligibility (production_version_id, production_line_id, is_primary, priority_no, efficiency_factor, selection_mode, selection_policy, lifecycle_status, effective_from, active_flag, created_by)
      VALUES ($1,$2,TRUE,1,1,'AutoPrimaryThenBackup','PrimaryThenBackup','Released',NOW(),TRUE,$4),
             ($1,$3,FALSE,2,1,'AutoPrimaryThenBackup','PrimaryThenBackup','Released',NOW(),TRUE,$4)`, [ids.pv, ids.line1, ids.line2, userId]);
    await master.query('COMMIT');
  } catch (error) {
    await master.query('ROLLBACK');
    throw error;
  }

  await rebuildExecutionProjection({ ids, operations, site, area, shift, uom, targetDate });
  const scenarios = await seedUatProductionVersionScenarios({ ids, operations, site, targetDate });
  const labor = await seedTwoLineLabor({ ids, operations, site, shift, targetDate, scenarioRoutingIds: scenarios.routing_ids });
  const analyticsHistory = await seedAnalyticsHistory();
  return { production_version_id: scenarios.primary_ready.production_version_id, production_version_code: scenarios.primary_ready.code, item_revision_id: ids.revision, site_id: site.master_id, shift_id: shift.master_id, target_date: targetDate, line_1_id: ids.line1, line_2_id: ids.line2, operation_count: operations.length, print_mode: includePrint ? 'with-print' : 'without-print', scenarios, labor, analyticsHistory };
}

async function rebuildExecutionProjection(seed) {
  const { ids, operations, site, area, uom, targetDate } = seed;
  await execution.query('BEGIN');
  try {
    await q(execution, `INSERT INTO rm_item_revision (master_id, code, name, revision_code, item_type, site_id, base_uom_id, lifecycle_status, updated_at)
      VALUES ($1,'${namespace}-FG-SEAL-ASM-01-A',$2::jsonb,'A','FG',$3,$4,'Released',NOW())`, [ids.revision, i18n('Won Seal Tech Seal Assembly A'), site.master_id, uom.master_id]);
    await q(execution, `INSERT INTO rm_mbom_header (master_id, code, name, base_quantity, base_uom_id, lifecycle_status, updated_at)
      VALUES ($1,'${namespace}-MBOM-SEAL-ASM-01',$2::jsonb,1,$3,'Released',NOW())`, [ids.mbom, i18n('Won Seal Tech Seal Assembly MBOM'), uom.master_id]);
    await q(execution, `INSERT INTO rm_mbom_line (master_id, mbom_header_id, seq, component_revision_id, component_item_code, quantity_per, uom_id, scrap_rate, issue_operation_id, backflush_flag, phantom_flag)
      VALUES ($1,$2,10,$3,'${namespace}-COMP-SEAL-RING-01-A',1,$4,0,$5,FALSE,FALSE)`, [ids.mbomLine, ids.mbom, ids.componentRevision, uom.master_id, operations[0].operationId]);
    await q(execution, `INSERT INTO rm_routing_header (master_id, code, item_revision_id, site_id, lifecycle_status, updated_at)
      VALUES ($1,'${namespace}-ROUTING-SEAL-ASM-01',NULL,$2,'Released',NOW())`, [ids.routing, site.master_id]);
    for (const op of operations) {
      for (const [wc, code] of [[op.line1Wc, `L1-${op.key}`], [op.line2Wc, `L2-${op.key}`]]) {
        await q(execution, `INSERT INTO rm_work_center (master_id, code, name, site_id, area_id, active_flag, lifecycle_status)
          VALUES ($1,$2,$3::jsonb,$4,$5,TRUE,'Released')`, [wc, `${namespace}-WC-${code}`, i18n(`Won Seal Tech ${code}`), site.master_id, area.master_id]);
      }
      await q(execution, `INSERT INTO rm_routing_operation (master_id, routing_header_id, operation_id, operation_code, work_center_id, seq, predecessor_seq, planning_mode, resolved_source, resolved_base_quantity, resolved_setup_time_min, resolved_cycle_time_sec, resolved_required_workers, resolved_efficiency_factor, resolved_standard_yield, requires_output_label, workstation_id, queue_time_min, move_time_min)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'ROUTING_OVERRIDE','Seed',1,5,$8,1,1,1,$9,$10,2,1)`,
        [op.routingOperationId, ids.routing, op.operationId, `${namespace}-OP-${op.key}`, op.line1Wc, op.seq, op.seq === 10 ? null : op.seq - 10, op.cycle, op.key === 'PACKING', op.line1Ws]);
      for (const [wc, role] of [[op.line1Wc, 'L1'], [op.line2Wc, 'L2']]) {
        await q(execution, `INSERT INTO rm_resource_capability (master_id, operation_id, work_center_id, capability_type, active_flag, lifecycle_status)
          VALUES ($1,$2,$3,'Eligible',TRUE,'Released')`, [cryptoRandom(), op.operationId, wc]);
        await q(execution, `INSERT INTO rm_production_standard (master_id, item_revision_id, routing_operation_id, operation_id, work_center_id, setup_time_min, cycle_time_sec, efficiency_factor, lifecycle_status)
          VALUES ($1,$2,$3,$4,$5,5,$6,1,'Released')`, [cryptoRandom(), ids.revision, op.routingOperationId, op.operationId, wc, op.cycle]);
        await q(execution, `INSERT INTO rm_resource_calendar (master_id, work_center_id, available_from, available_to, capacity_percent, lifecycle_status)
          VALUES ($1,$2,$3::date,$3::date + INTERVAL '2 days',1,'Released')`, [cryptoRandom(), wc, targetDate]);
        void role;
      }
    }
    await q(execution, `INSERT INTO rm_production_version (master_id, code, name_i18n, item_revision_id, mbom_header_id, routing_header_id, site_id, lifecycle_status, is_default, min_lot_size, max_lot_size, updated_at)
      VALUES ($1,'${namespace}-PV-SEAL-ASM-01',$2::jsonb,$3,$4,$5,$6,'Released',TRUE,1,1000,NOW())`,
      [ids.pv, i18n('Won Seal Tech two-line seal production version'), ids.revision, ids.mbom, ids.routing, site.master_id]);
    await q(execution, `INSERT INTO rm_production_line (master_id, code, name, site_id, area_id, line_type, active_flag, lifecycle_status, updated_at)
      VALUES ($1,'${namespace}-LINE-1',$2::jsonb,$4,$5,'Production',TRUE,'Released',NOW()),
             ($3,'${namespace}-LINE-2',$6::jsonb,$4,$5,'Production',TRUE,'Released',NOW())`,
      [ids.line1, i18n('Won Seal Tech Line 1'), ids.line2, site.master_id, area.master_id, i18n('Won Seal Tech Line 2')]);
    for (const [lineID, lineKey] of [[ids.line1, 'line1'], [ids.line2, 'line2']]) {
      for (const op of operations) {
        await q(execution, `INSERT INTO rm_production_line_work_center (master_id, production_line_id, work_center_id, site_id, effective_from, active_flag, lifecycle_status, updated_at)
          VALUES ($1,$2,$3,$4,$5::date,TRUE,'Released',NOW())`, [cryptoRandom(), lineID, op[`${lineKey}Wc`], site.master_id, targetDate]);
      }
    }
    await q(execution, `INSERT INTO rm_production_version_line_eligibility (master_id, production_version_id, production_line_id, selection_role, priority, effective_from, active_flag, lifecycle_status, updated_at)
      VALUES ($1,$2,$3,'PRIMARY',1,$5::date,TRUE,'Released',NOW()),
             ($4,$2,$6,'BACKUP',2,$5::date,TRUE,'Released',NOW())`, [cryptoRandom(), ids.pv, ids.line1, cryptoRandom(), targetDate, ids.line2]);
    await execution.query('COMMIT');
  } catch (error) {
    await execution.query('ROLLBACK');
    throw error;
  }
}

async function seedAnalyticsHistory() {
  const context = (await q(execution, `
    SELECT pv.master_id AS production_version_id, pv.code AS production_version_code,
      pv.item_revision_id, pv.site_id, ir.code AS item_revision_code,
      ir.base_uom_id AS uom_id, ro.master_id AS routing_operation_id, ro.operation_id,
      ro.operation_code, ro.work_center_id, ro.seq, ro.resolved_cycle_time_sec,
      ro.resolved_required_workers, ro.requires_output_label
    FROM rm_production_version pv
    JOIN rm_item_revision ir ON ir.master_id=pv.item_revision_id
    JOIN rm_routing_operation ro ON ro.routing_header_id=pv.routing_header_id
    WHERE pv.code='PV-FG-WS-CM01-R1'
    ORDER BY ro.seq LIMIT 1
  `)).rows[0];
  const lines = (await q(execution, `SELECT master_id, code, name FROM rm_production_line WHERE code IN ('LINE-BASE-1','WST-SEED-LINE-1','WST-SEED-LINE-2') AND lifecycle_status='Released' ORDER BY code`)).rows;
  if (!context || lines.length < 2) throw new Error('ANALYTICS_HISTORY_BASE_CONTEXT_MISSING');
  await execution.query('BEGIN');
  let inserted = 0;
  try {
    // Preserve the historical event dates for the analytics fixture; the audit trigger stamps operational CRUD writes with NOW().
    await execution.query("SET LOCAL session_replication_role='replica'");
    const start = new Date('2026-04-01T00:00:00.000Z');
    const end = new Date('2026-08-01T00:00:00.000Z');
    for (let day = new Date(start); day < end; day.setUTCDate(day.getUTCDate() + 1)) {
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex];
        const suffix = `${day.toISOString().slice(0, 10).replaceAll('-', '')}-${lineIndex + 1}`;
        const woId = cryptoRandom(); const operationId = cryptoRandom(); const sessionId = cryptoRandom();
        const quantity = 80 + ((day.getUTCDate() + lineIndex * 13) % 70);
        const status = day.getUTCDate() % 17 === 0 ? 'ResourceHold' : day.getUTCDate() % 11 === 0 ? 'Paused' : day.getUTCDate() % 7 === 0 ? 'Released' : 'Completed';
        const isBackup = line.code === 'WST-SEED-LINE-2';
        const good = status === 'Completed' ? quantity - (day.getUTCDate() % 9) : 0;
        const scrap = status === 'Completed' ? quantity - good : 0;
        const startedAt = new Date(day); startedAt.setUTCHours(7 + lineIndex * 2, 0, 0, 0);
        const endedAt = new Date(startedAt.getTime() + 45 * 60 * 1000);
        await q(execution, `INSERT INTO wo_header (
          wo_id, wo_code, production_version_id, item_revision_id, item_code, item_name, quantity, uom_id,
          site_id, planned_start_at, planned_end_at, status, created_by, updated_by, created_at, updated_at,
          production_version_code, item_revision_code, planning_snapshot, selected_production_line_id,
          selected_production_line_code, selected_production_line_name_i18n, line_selection_mode,
          line_selection_status, line_selection_reason, fallback_reason, resource_hold_reason, evaluated_line_results
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13,$10,$11,$14,$5,'{}'::jsonb,$15,$16,$17::jsonb,'AUTO',$18,$19,$20,$21::jsonb,'[]'::jsonb)`, [
          woId, `ANL-SEED-${suffix}`, context.production_version_id, context.item_revision_id, context.item_revision_code,
          'Analytics Seed Production', quantity, context.uom_id, context.site_id, startedAt, endedAt, status, userId,
          context.production_version_code, line.master_id, line.code, line.name,
          isBackup ? 'BACKUP' : status === 'ResourceHold' ? 'RESOURCE_HOLD' : 'PRIMARY',
          isBackup ? 'PRIMARY_LINE_BLOCKED' : status === 'ResourceHold' ? 'RESOURCE_CAPACITY_CONFLICT' : 'PRIMARY_LINE_READY',
          isBackup ? 'PRIMARY_LINE_BLOCKED' : '', status === 'ResourceHold' ? JSON.stringify({ code: 'RESOURCE_CAPACITY_CONFLICT', source: 'analytics-seed' }) : '{}',
        ]);
        await q(execution, `INSERT INTO wo_operation (
          wo_operation_id, wo_id, sequence_no, operation_id, operation_code, work_center_id,
          planned_start_at, planned_end_at, status, operation_name, routing_operation_id,
          base_quantity, standard_yield, required_workers, standard_cycle_time_sec,
          planning_snapshot, production_line_id, production_line_code, production_line_name_i18n,
          expected_good_quantity, requires_output_label
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,1,1,$12,$13,'{}'::jsonb,$14,$15,$16::jsonb,$17,$18)`, [
          operationId, woId, context.seq, context.operation_id, context.operation_code, context.work_center_id,
          startedAt, endedAt, status === 'Completed' ? 'Completed' : status === 'ResourceHold' ? 'Pending' : 'Ready',
          JSON.stringify({ vi: context.operation_code, en: context.operation_code, ja: context.operation_code, ko: context.operation_code }), context.routing_operation_id,
          context.resolved_required_workers || 1, context.resolved_cycle_time_sec || 60, line.master_id, line.code, line.name, good, context.requires_output_label || false,
        ]);
        if (status === 'Completed') {
          await q(execution, `INSERT INTO execution_session (session_id, wo_operation_id, terminal_ref, operator_user_id, started_at, ended_at, status) VALUES ($1,$2,$3,$4,$5,$6,'COMPLETED')`, [sessionId, operationId, `ANL-KIOSK-${lineIndex + 1}`, userId, startedAt, endedAt]);
          await q(execution, `INSERT INTO operation_confirmation (confirmation_id, wo_operation_id, session_id, qty_good, qty_scrap, confirmed_at) VALUES ($1,$2,$3,$4,$5,$6)`, [cryptoRandom(), operationId, sessionId, good, scrap, endedAt]);
        }
        inserted += 1;
      }
    }
    await execution.query('COMMIT');
  } catch (error) {
    await execution.query('ROLLBACK');
    throw error;
  }
  return { from: '2026-04-01', to: '2026-07-31', work_orders: inserted, lines: lines.map((line) => line.code), source: 'execution-owned analytics history seed' };
}

async function seedUatProductionVersionScenarios({ ids, operations, site, targetDate }) {
  let stage = 'master scenario data';
  const scenarioIds = {
    pv1: cryptoRandom(), pv2: cryptoRandom(), pv3: cryptoRandom(),
    routing2: cryptoRandom(), routing3: cryptoRandom(),
    ...(includePrint ? { backupOperation: cryptoRandom(), holdOperation: cryptoRandom() } : {}),
  };
  const route2Operations = operations.slice(0, 3).map((op) => ({ ...op, scenarioRoutingOperationId: cryptoRandom() }));
  const route3Operations = operations.slice(0, 3).map((op) => ({ ...op, scenarioRoutingOperationId: cryptoRandom() }));
  const backupFinalRoutingOperation = includePrint ? cryptoRandom() : null;
  const holdFinalRoutingOperation = includePrint ? cryptoRandom() : null;
  const packing = includePrint ? operations[3] : null;
  const versions = [
    { id: scenarioIds.pv1, code: 'WST-UAT-PV-01-PRIMARY-READY', name: '[UAT-PRIMARY-READY] Primary line ready', routing: ids.routing },
    { id: scenarioIds.pv2, code: 'WST-UAT-PV-02-BACKUP-FALLBACK', name: '[UAT-BACKUP-FALLBACK] Primary blocked, Backup ready', routing: scenarioIds.routing2 },
    { id: scenarioIds.pv3, code: 'WST-UAT-PV-03-BOTH-LINES-HOLD', name: '[UAT-BOTH-LINES-HOLD] Primary and Backup blocked', routing: scenarioIds.routing3 },
  ];

  await master.query('BEGIN');
  try {
    await master.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
    if (includePrint) {
      for (const [operationId, code, name] of [
        [scenarioIds.backupOperation, `${namespace}-UAT-OP-BACKUP-PACKING`, 'Backup-only final packing'],
        [scenarioIds.holdOperation, `${namespace}-UAT-OP-HOLD-PACKING`, 'Hold final packing'],
      ]) {
        await q(master, `INSERT INTO md_operation (master_id, code, name, description, version_no, lifecycle_status, effective_from, created_by, updated_by, operation_type, confirmation_mode, quantity_reporting, requires_material_scan, requires_output_label, is_schedulable, default_cycle_time_sec, default_setup_time_min, default_base_quantity, default_required_persons, default_efficiency_factor, default_yield)
          VALUES ($1,$2,$3::jsonb,$3::jsonb,1,'Released',NOW(),$4,$4,'Packing','QuantityOnly','GoodOnly',FALSE,TRUE,TRUE,60,5,1,1,1,1)`, [operationId, code, i18n(name), userId]);
      }
    }
    for (const [routingId, code, name] of [
      [scenarioIds.routing2, `${namespace}-UAT-ROUTING-BACKUP-FALLBACK`, 'UAT backup fallback routing'],
      [scenarioIds.routing3, `${namespace}-UAT-ROUTING-BOTH-HOLD`, 'UAT both lines hold routing'],
    ]) {
      await q(master, `INSERT INTO md_routing_header (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, business_version, routing_type)
        VALUES ($1,$2,$3::jsonb,1,'Released',NOW(),$4,$4,'1','Standard')`, [routingId, code, i18n(name), userId]);
    }
    for (const [routingId, routeOperations, suffix] of [
      [scenarioIds.routing2, route2Operations, 'BACKUP'],
      [scenarioIds.routing3, route3Operations, 'HOLD'],
    ]) {
      for (const op of routeOperations) {
        const routingLine = suffix === 'BACKUP' ? 'line2' : 'line1';
        await q(master, `INSERT INTO md_routing_operation (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, routing_header_id, operation_id, work_center_id, workstation_id, seq, predecessor_seq, scheduling_mode, queue_time_min, move_time_min, planning_mode)
          VALUES ($1,$2,$3::jsonb,1,'Released',NOW(),$4,$4,$5,$6,$7,$8,$9,$10,'Finite',2,1,'ROUTING_OVERRIDE')`, [op.scenarioRoutingOperationId, `${namespace}-UAT-RO-${suffix}-${op.key}`, i18n(`UAT ${suffix} ${op.name}`), userId, routingId, op.operationId, op[`${routingLine}Wc`], op[`${routingLine}Ws`], op.seq, op.seq === 10 ? null : op.seq - 10]);
      }
      if (includePrint) {
        const finalLine = suffix === 'BACKUP' ? 'line2' : 'line1';
        const finalOperationId = suffix === 'BACKUP' ? scenarioIds.backupOperation : scenarioIds.holdOperation;
        const finalRoutingOperationId = suffix === 'BACKUP' ? backupFinalRoutingOperation : holdFinalRoutingOperation;
        await q(master, `INSERT INTO md_routing_operation (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, routing_header_id, operation_id, work_center_id, workstation_id, seq, predecessor_seq, scheduling_mode, queue_time_min, move_time_min, planning_mode)
          VALUES ($1,$2,$3::jsonb,1,'Released',NOW(),$4,$4,$5,$6,$7,$8,40,30,'Finite',2,1,'ROUTING_OVERRIDE')`, [finalRoutingOperationId, `${namespace}-UAT-RO-${suffix}-PACKING`, i18n(`UAT ${suffix} final packing`), userId, routingId, finalOperationId, packing[`${finalLine}Wc`], packing[`${finalLine}Ws`]]);
      }
    }
    if (includePrint) {
      await q(master, `INSERT INTO md_resource_capability (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, operation_id, work_center_id, equipment_id, capability_type, active_flag, cycle_time_sec, site_id, product_revision_id, eligibility, priority_no, speed_factor)
        VALUES ($1,$2,$3::jsonb,1,'Released',NOW(),$4,$4,$5,$6,$7,'Eligible',TRUE,60,$8,$9,TRUE,1,1)`, [cryptoRandom(), `${namespace}-UAT-CAP-L2-BACKUP-PACKING`, i18n('BKP CAP'), userId, scenarioIds.backupOperation, packing.line2Wc, packing.line2Eq, site.master_id, ids.revision]);
      for (const [operationId, lineKey, suffix] of [
        [scenarioIds.backupOperation, 'line1', 'L1-BACKUP-BLOCKED'],
        [scenarioIds.holdOperation, 'line1', 'L1-HOLD-BLOCKED'],
        [scenarioIds.holdOperation, 'line2', 'L2-HOLD-BLOCKED'],
      ]) {
        await q(master, `INSERT INTO md_resource_capability (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, operation_id, work_center_id, equipment_id, capability_type, active_flag, cycle_time_sec, site_id, product_revision_id, eligibility, priority_no, speed_factor)
          VALUES ($1,$2,$3::jsonb,1,'Released',NOW(),$4,$4,$5,$6,$7,'Eligible',TRUE,60,$8,$9,TRUE,1,1)`, [cryptoRandom(), `${namespace}-UAT-CAP-${suffix}`, i18n(suffix), userId, operationId, packing[`${lineKey}Wc`], packing[`${lineKey}Eq`], site.master_id, ids.revision]);
      }
    }
    for (const op of route2Operations) {
      for (const [lineKey, role] of [['line1', 'L1'], ['line2', 'L2']]) {
        await q(master, `INSERT INTO md_production_standard (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, item_revision_id, operation_id, work_center_id, equipment_id, labor_count, setup_time_min, cycle_time_sec, efficiency_factor, site_id, routing_operation_id, base_quantity, standard_yield, source_method, valid_from)
          VALUES ($1,$2,$3::jsonb,1,'Released',NOW(),$4,$4,$5,$6,$7,$8,1,5,$9,1,$10,$11,1,1,'Seed',CURRENT_DATE)`, [cryptoRandom(), `${namespace}-UAT-STD-${role}-${op.key}`, i18n(`UAT ${role} ${op.key}`), userId, ids.revision, op.operationId, op[`${lineKey}Wc`], op[`${lineKey}Eq`], op.cycle, site.master_id, op.scenarioRoutingOperationId]);
      }
    }
    if (includePrint) {
      await q(master, `INSERT INTO md_production_standard (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, item_revision_id, operation_id, work_center_id, equipment_id, labor_count, setup_time_min, cycle_time_sec, efficiency_factor, site_id, routing_operation_id, base_quantity, standard_yield, source_method, valid_from)
        VALUES ($1,$2,$3::jsonb,1,'Released',NOW(),$4,$4,$5,$6,$7,$8,1,5,60,1,$9,$10,1,1,'Seed',CURRENT_DATE)`, [cryptoRandom(), `${namespace}-UAT-STD-L2-BACKUP-PACKING`, i18n('BKP STD'), userId, ids.revision, scenarioIds.backupOperation, packing.line2Wc, packing.line2Eq, site.master_id, backupFinalRoutingOperation]);
    }
    for (const version of versions) {
      await q(master, `INSERT INTO md_production_version (master_id, code, name, name_i18n, version_no, lifecycle_status, effective_from, created_by, updated_by, mbom_header_id, routing_header_id, site_id, min_lot_size, max_lot_size, is_default)
        VALUES ($1,$2,$3,$4::jsonb,1,'Released',NOW(),$5,$5,$6,$7,$8,1,1000,FALSE)`, [version.id, version.code, version.name, i18n(version.name), userId, ids.mbom, version.routing, site.master_id]);
      await q(master, `INSERT INTO md_production_version_line_eligibility (production_version_id, production_line_id, is_primary, priority_no, efficiency_factor, selection_mode, selection_policy, lifecycle_status, effective_from, active_flag, created_by)
        VALUES ($1,$2,TRUE,1,1,'AutoPrimaryThenBackup','PrimaryThenBackup','Released',NOW(),TRUE,$4), ($1,$3,FALSE,2,1,'AutoPrimaryThenBackup','PrimaryThenBackup','Released',NOW(),TRUE,$4)`, [version.id, ids.line1, ids.line2, userId]);
    }
    await master.query('COMMIT');
  } catch (error) {
    await master.query('ROLLBACK');
    throw new Error(`UAT_SCENARIO_${stage}: ${error.message}`);
  }

  stage = 'execution scenario projection';
  await execution.query('BEGIN');
  try {
    for (const [routingId, code] of [[scenarioIds.routing2, `${namespace}-UAT-ROUTING-BACKUP-FALLBACK`], [scenarioIds.routing3, `${namespace}-UAT-ROUTING-BOTH-HOLD`]]) {
      await q(execution, `INSERT INTO rm_routing_header (master_id, code, item_revision_id, site_id, lifecycle_status, updated_at) VALUES ($1,$2,NULL,$3,'Released',NOW())`, [routingId, code, site.master_id]);
    }
    for (const [routingId, routeOperations] of [
      [scenarioIds.routing2, route2Operations],
      [scenarioIds.routing3, route3Operations],
    ]) {
      for (const op of routeOperations) {
        const routingLine = routingId === scenarioIds.routing2 ? 'line2' : 'line1';
        await q(execution, `INSERT INTO rm_routing_operation (master_id, routing_header_id, operation_id, operation_code, work_center_id, seq, predecessor_seq, planning_mode, resolved_source, resolved_base_quantity, resolved_setup_time_min, resolved_cycle_time_sec, resolved_required_workers, resolved_efficiency_factor, resolved_standard_yield, requires_output_label, workstation_id, queue_time_min, move_time_min)
          VALUES ($1,$2,$3,$4,$5,$6,$7,'ROUTING_OVERRIDE','Seed',1,5,$8,1,1,1,FALSE,$9,2,1)`, [op.scenarioRoutingOperationId, routingId, op.operationId, `${namespace}-OP-${op.key}`, op[`${routingLine}Wc`], op.seq, op.seq === 10 ? null : op.seq - 10, op.cycle, op[`${routingLine}Ws`]]);
      }
    }
    if (includePrint) {
      for (const [routingId, finalOperationId, finalRoutingOperationId, finalCode] of [
        [scenarioIds.routing2, scenarioIds.backupOperation, backupFinalRoutingOperation, `${namespace}-UAT-OP-BACKUP-PACKING`],
        [scenarioIds.routing3, scenarioIds.holdOperation, holdFinalRoutingOperation, `${namespace}-UAT-OP-HOLD-PACKING`],
      ]) {
        const finalLine = routingId === scenarioIds.routing2 ? 'line2' : 'line1';
        await q(execution, `INSERT INTO rm_routing_operation (master_id, routing_header_id, operation_id, operation_code, work_center_id, seq, predecessor_seq, planning_mode, resolved_source, resolved_base_quantity, resolved_setup_time_min, resolved_cycle_time_sec, resolved_required_workers, resolved_efficiency_factor, resolved_standard_yield, requires_output_label, workstation_id, queue_time_min, move_time_min)
          VALUES ($1,$2,$3,$4,$5,40,30,'ROUTING_OVERRIDE','Seed',1,5,60,1,1,1,TRUE,$6,2,1)`, [finalRoutingOperationId, routingId, finalOperationId, finalCode, packing[`${finalLine}Wc`], packing[`${finalLine}Ws`]]);
      }
      await q(execution, `INSERT INTO rm_resource_capability (master_id, operation_id, work_center_id, equipment_id, capability_type, active_flag, lifecycle_status) VALUES ($1,$2,$3,$4,'Eligible',TRUE,'Released')`, [cryptoRandom(), scenarioIds.backupOperation, packing.line2Wc, packing.line2Eq]);
      for (const [operationId, lineKey] of [[scenarioIds.backupOperation, 'line1'], [scenarioIds.holdOperation, 'line1'], [scenarioIds.holdOperation, 'line2']]) {
        await q(execution, `INSERT INTO rm_resource_capability (master_id, operation_id, work_center_id, equipment_id, capability_type, active_flag, lifecycle_status) VALUES ($1,$2,$3,$4,'Eligible',TRUE,'Released')`, [cryptoRandom(), operationId, packing[`${lineKey}Wc`], packing[`${lineKey}Eq`]]);
      }
    }
    for (const op of route2Operations) {
      for (const lineKey of ['line1', 'line2']) {
        await q(execution, `INSERT INTO rm_production_standard (master_id, item_revision_id, routing_operation_id, operation_id, work_center_id, equipment_id, setup_time_min, cycle_time_sec, efficiency_factor, lifecycle_status) VALUES ($1,$2,$3,$4,$5,$6,5,$7,1,'Released')`, [cryptoRandom(), ids.revision, op.scenarioRoutingOperationId, op.operationId, op[`${lineKey}Wc`], op[`${lineKey}Eq`], op.cycle]);
      }
    }
      if (includePrint) {
        await q(execution, `INSERT INTO rm_production_standard (master_id, item_revision_id, routing_operation_id, operation_id, work_center_id, equipment_id, setup_time_min, cycle_time_sec, efficiency_factor, lifecycle_status) VALUES ($1,$2,$3,$4,$5,$6,5,60,1,'Released')`, [cryptoRandom(), ids.revision, backupFinalRoutingOperation, scenarioIds.backupOperation, packing.line2Wc, packing.line2Eq]);
      }
    for (const version of versions) {
      await q(execution, `INSERT INTO rm_production_version (master_id, code, name_i18n, item_revision_id, mbom_header_id, routing_header_id, site_id, lifecycle_status, is_default, min_lot_size, max_lot_size, updated_at) VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,'Released',FALSE,1,1000,NOW())`, [version.id, version.code, i18n(version.name), ids.revision, ids.mbom, version.routing, site.master_id]);
      await q(execution, `INSERT INTO rm_production_version_line_eligibility (master_id, production_version_id, production_line_id, selection_role, priority, effective_from, active_flag, lifecycle_status, updated_at) VALUES ($1,$2,$3,'PRIMARY',1,$5::date,TRUE,'Released',NOW()), ($4,$2,$6,'BACKUP',2,$5::date,TRUE,'Released',NOW())`, [cryptoRandom(), version.id, ids.line1, cryptoRandom(), targetDate, ids.line2]);
    }
    await execution.query('COMMIT');
  } catch (error) {
    await execution.query('ROLLBACK');
    throw new Error(`UAT_SCENARIO_${stage}: ${error.message}`);
  }

  return {
    primary_ready: { production_version_id: scenarioIds.pv1, code: versions[0].code, expected_line: `${namespace}-LINE-1`, expected_status: 'READY' },
    backup_fallback: { production_version_id: scenarioIds.pv2, code: versions[1].code, expected_line: `${namespace}-LINE-2`, expected_status: 'READY' },
    both_lines_hold: { production_version_id: scenarioIds.pv3, code: versions[2].code, expected_line: null, expected_status: 'RESOURCE_HOLD' },
    routing_ids: [scenarioIds.routing2, scenarioIds.routing3],
  };
}

async function seedTwoLineLabor({ ids, operations, site, shift, targetDate, scenarioRoutingIds }) {
  const skillId = cryptoRandom();
  const skillCode = `${namespace}-SK-PRODUCTION-OPERATOR`;
  const employeeRows = operations.flatMap((operation, index) => [
    { id: cryptoRandom(), code: `${namespace}-EMP-L1-${String(index + 1).padStart(2, '0')}`, name: `WST Seed Primary Operator ${index + 1}`, workCenterId: operation.line1Wc },
    { id: cryptoRandom(), code: `${namespace}-EMP-L2-${String(index + 1).padStart(2, '0')}`, name: `WST Seed Backup Operator ${index + 1}`, workCenterId: operation.line2Wc },
  ]);
  const routingIds = [ids.routing, ...scenarioRoutingIds];

  await master.query('BEGIN');
  try {
    await master.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
    await q(master, `INSERT INTO md_skill (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, skill_group, minimum_level, scope, legacy_flag)
      VALUES ($1,$2,$3::jsonb,1,'Released',NOW(),$4,$4,'${namespace}', 'L1','Employee',FALSE)
      ON CONFLICT (code, version_no) DO UPDATE SET name=EXCLUDED.name, lifecycle_status='Released', effective_to=NULL, updated_by=EXCLUDED.updated_by`,
      [skillId, skillCode, i18n('WST Seed Production Operator'), userId]);
    const workCenterIds = [...new Set(operations.flatMap((operation) => [operation.line1Wc, operation.line2Wc]))];
    for (const workCenterId of workCenterIds) {
      const shiftSetCode = `${namespace}-SHIFTSET-${workCenterId}`;
      await q(master, `INSERT INTO md_work_center_shift_set (master_id, code, name, work_center_id, lifecycle_status, effective_from, created_by, updated_by)
        VALUES ($1,$2,$3, $4,'Released',NOW(),$5,$5)
        ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, work_center_id=EXCLUDED.work_center_id, lifecycle_status='Released', effective_to=NULL, updated_by=EXCLUDED.updated_by`,
        [cryptoRandom(), shiftSetCode, `WST Seed Shift Set ${workCenterId}`, workCenterId, userId]);
      const shiftSet = (await q(master, `SELECT master_id FROM md_work_center_shift_set WHERE code=$1`, [shiftSetCode])).rows[0];
      await q(master, `DELETE FROM md_work_center_shift WHERE shift_set_id=$1`, [shiftSet.master_id]);
      await q(master, `INSERT INTO md_work_center_shift (work_center_id, shift_id, shift_set_id, active_flag, effective_from, created_by, updated_by)
        VALUES ($1,$2,$3,TRUE,NOW(),$4,$4)`, [workCenterId, shift.master_id, shiftSet.master_id, userId]);
    }
    for (const employee of employeeRows) {
      await q(master, `INSERT INTO md_employee (master_id, code, name, version_no, lifecycle_status, effective_from, site_id, default_work_center_id, employee_status, hired_date, created_by, updated_by)
        VALUES ($1,$2,$3,1,'Released',NOW(),$4,$5,'Active',CURRENT_DATE,$6,$6)
        ON CONFLICT (code, version_no) DO UPDATE SET name=EXCLUDED.name, lifecycle_status='Released', effective_to=NULL, site_id=EXCLUDED.site_id, default_work_center_id=EXCLUDED.default_work_center_id, employee_status='Active', updated_by=EXCLUDED.updated_by`,
        [employee.id, employee.code, employee.name, site.master_id, employee.workCenterId, userId]);
      const current = (await q(master, `SELECT master_id FROM md_employee WHERE code=$1 AND version_no=1`, [employee.code])).rows[0];
      await q(master, `DELETE FROM md_employee_skill WHERE employee_id=$1 AND skill_id=$2`, [current.master_id, skillId]);
      await q(master, `INSERT INTO md_employee_skill (employee_id, skill_id, level, created_by, effective_from, active_flag, qualification_status)
        VALUES ($1,$2,'L2',$3,NOW(),TRUE,'Active')`, [current.master_id, skillId, userId]);
      await q(master, `DELETE FROM md_employee_shift_schedule WHERE employee_id=$1 AND schedule_date=$2::date`, [current.master_id, targetDate]);
      await q(master, `INSERT INTO md_employee_shift_schedule (schedule_id, employee_id, shift_id, work_center_id, schedule_date, schedule_status, created_by)
        VALUES ($1,$2,$3,$4,$5::date,'Scheduled',$6)`, [cryptoRandom(), current.master_id, shift.master_id, employee.workCenterId, targetDate, userId]);
    }
    for (const routingId of routingIds) {
      const routingOperations = (await q(master, `SELECT master_id, operation_id, code FROM md_routing_operation WHERE routing_header_id=$1 AND lifecycle_status='Released'`, [routingId])).rows;
      for (const routingOperation of routingOperations) {
        await q(master, `INSERT INTO md_operation_skill_requirement (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, operation_id, skill_id, site_id, routing_operation_id, minimum_level, required_persons, mandatory_flag, active_flag)
          VALUES ($1,$2,$3,1,'Released',NOW(),$4,$4,$5,$6,$7,$8,'L1',1,TRUE,TRUE)`,
          [cryptoRandom(), `${namespace}-REQ-${routingOperation.code}`, `WST Seed labor requirement ${routingOperation.code}`, userId, routingOperation.operation_id, skillId, site.master_id, routingOperation.master_id]);
      }
    }
    await master.query('COMMIT');
  } catch (error) {
    await master.query('ROLLBACK');
    throw new Error(`TWO_LINE_LABOR_MASTER: ${error.message}`);
  }

  await execution.query('BEGIN');
  try {
    await q(execution, `INSERT INTO rm_skill (master_id, code, name, lifecycle_status) VALUES ($1,$2,$3::jsonb,'Released') ON CONFLICT (master_id) DO UPDATE SET code=EXCLUDED.code,name=EXCLUDED.name,lifecycle_status='Released'`, [skillId, skillCode, i18n('WST Seed Production Operator')]);
    for (const employee of employeeRows) {
      const current = (await q(master, `SELECT master_id FROM md_employee WHERE code=$1 AND version_no=1`, [employee.code])).rows[0];
      await q(execution, `INSERT INTO rm_employee (master_id, code, name, site_id, default_work_center_id, employee_status, lifecycle_status) VALUES ($1,$2,$3::jsonb,$4,$5,'Active','Released') ON CONFLICT (master_id) DO UPDATE SET code=EXCLUDED.code,name=EXCLUDED.name,site_id=EXCLUDED.site_id,default_work_center_id=EXCLUDED.default_work_center_id,employee_status='Active',lifecycle_status='Released'`, [current.master_id, employee.code, i18n(employee.name), site.master_id, employee.workCenterId]);
      await q(execution, `DELETE FROM rm_employee_skill WHERE employee_id=$1`, [current.master_id]);
      await q(execution, `INSERT INTO rm_employee_skill (employee_id, skill_id, level) VALUES ($1,$2,'L2')`, [current.master_id, skillId]);
      await q(execution, `DELETE FROM rm_employee_shift_schedule WHERE employee_id=$1 AND schedule_date=$2::date`, [current.master_id, targetDate]);
      await q(execution, `INSERT INTO rm_employee_shift_schedule (schedule_id, employee_id, shift_id, work_center_id, schedule_date, schedule_status) VALUES ($1,$2,$3,$4,$5::date,'Scheduled')`, [cryptoRandom(), current.master_id, shift.master_id, employee.workCenterId, targetDate]);
    }
    for (const routingId of routingIds) {
      const routingOperations = (await q(master, `SELECT master_id, operation_id FROM md_routing_operation WHERE routing_header_id=$1 AND lifecycle_status='Released'`, [routingId])).rows;
      for (const routingOperation of routingOperations) {
        await q(execution, `INSERT INTO rm_operation_skill_requirement (master_id, operation_id, skill_id, minimum_level, required_persons, mandatory_flag) VALUES ($1,$2,$3,'L1',1,TRUE) ON CONFLICT (master_id) DO UPDATE SET operation_id=EXCLUDED.operation_id,skill_id=EXCLUDED.skill_id,minimum_level='L1',required_persons=1,mandatory_flag=TRUE`, [cryptoRandom(), routingOperation.operation_id, skillId]);
      }
    }
    await execution.query('COMMIT');
  } catch (error) {
    await execution.query('ROLLBACK');
    throw new Error(`TWO_LINE_LABOR_EXECUTION: ${error.message}`);
  }
  return { skill_code: skillCode, employees: employeeRows.length, schedules: employeeRows.length, routing_operation_requirements: routingIds.length * operations.length };
}

async function api(pathname, options = {}, allowed = []) {
  const response = await fetch(`${executionBase}${pathname}`, { ...options, headers: { ...headers, ...(options.headers || {}) }, cache: 'no-store' });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { message: text }; }
  if (!response.ok && !allowed.includes(response.status)) throw new Error(`${pathname} HTTP ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function verifySeedFlow(seed) {
  const start = `${seed.target_date}T08:00:00.000Z`;
  const created = await api('/work-order-creation-workflows', {
    method: 'POST',
    headers: { 'Idempotency-Key': `phase10-${seed.production_version_id}-${Date.now()}` },
    body: JSON.stringify({ production_version_id: seed.production_version_id, item_revision_id: seed.item_revision_id, site_id: seed.site_id, uom_id: (await q(master, `SELECT master_id FROM md_uom WHERE code='PCS' LIMIT 1`)).rows[0].master_id, quantity: 2, target_date: seed.target_date, shift_id: seed.shift_id }),
  });
  let workflow = created;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    workflow = await api(`/work-order-creation-workflows/${created.workflow_id}`);
    if (workflow.status === 'succeeded' || workflow.status === 'failed') break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (workflow.status !== 'succeeded') throw new Error(`PHASE10_WORKFLOW_FAILED: ${JSON.stringify(workflow)}`);
  let detail = await api(`/work-orders/${workflow.work_order_id}`);
  let header = detail.header || detail;
  if (!header.selected_production_line_id || header.line_selection_status !== 'READY') {
    await api(`/work-orders/${workflow.work_order_id}/line-replan`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Phase 10 seed verification line selection.', row_version: header.row_version }),
    });
    detail = await api(`/work-orders/${workflow.work_order_id}`);
    header = detail.header || detail;
  }
  if (header.line_selection_status !== 'READY' || header.selected_production_line_id !== seed.line_1_id) throw new Error(`PHASE10_LINE_SELECTION_INVALID: ${JSON.stringify(header)}`);
  await api(`/work-orders/${workflow.work_order_id}/compute-check`, { method: 'POST', body: '{}' }, [409]);
  const committed = [];
  let cursor = new Date(start);
  for (const operation of detail.operations || []) {
    const candidates = await api(`/work-orders/${workflow.work_order_id}/operations/${operation.wo_operation_id}/resource-candidates?planned_start_at=${encodeURIComponent(cursor.toISOString())}&shift_id=${encodeURIComponent(seed.shift_id)}`);
    const ready = (candidates.candidates || []).find((candidate) => candidate.readiness !== 'Blocked' && !(candidate.blocking_errors || []).length && !(candidate.capacity_conflicts || []).length);
    if (!ready) throw new Error(`PHASE10_NO_READY_CANDIDATE: ${operation.operation_code}: ${JSON.stringify(candidates)}`);
    const allocation = await api(`/work-orders/${workflow.work_order_id}/operations/${operation.wo_operation_id}/resource-allocation`, {
      method: 'POST',
      headers: { 'Idempotency-Key': `phase10-alloc-${operation.wo_operation_id}` },
      body: JSON.stringify({
        workstation_id: ready.workstation?.id,
        equipment_id: ready.primary_machine?.id || ready.equipment?.id,
        machine_group_id: ready.machine_group?.id,
        shift_id: seed.shift_id,
        planned_start_at: cursor.toISOString(),
        candidate_reference: `${ready.assignment?.id || ''}:${ready.machine_group?.id || ''}:${ready.capability?.id || ''}`,
        row_version: header.row_version,
      }),
    });
    committed.push({ operation_code: operation.operation_code, allocation_id: allocation.allocation_id });
    const minutes = Number(ready.estimated_duration_min || ready.calculation?.estimated_duration_min || 1);
    cursor = new Date(cursor.getTime() + Math.max(minutes, 1) * 60_000);
  }
  const revalidation = await api(`/work-orders/${workflow.work_order_id}/resource-allocations/revalidate`, { method: 'POST', body: '{}' });
  if (revalidation.valid !== true) throw new Error(`PHASE10_REVALIDATION_FAILED: ${JSON.stringify(revalidation)}`);
  const approval = await api(`/work-orders/${workflow.work_order_id}/approve`, { method: 'POST', headers: { 'X-MES-Approval-Policy': 'Strict' }, body: JSON.stringify({ comment: 'Phase 10 seed verification.' }) });
  if (approval.status !== 'Released') throw new Error(`PHASE10_APPROVAL_FAILED: ${JSON.stringify(approval)}`);
  return { workflow_id: workflow.workflow_id, work_order_id: workflow.work_order_id, work_order_code: workflow.work_order_code, selected_production_line_id: header.selected_production_line_id, selected_production_line_code: header.selected_production_line_code, operation_count: detail.operations?.length || 0, committed_count: committed.length, revalidation, approval_status: approval.status };
}

async function cleanupVerificationWorkOrders(workOrderIds, workflowIds = []) {
  const ids = workOrderIds.filter(Boolean);
  const workflows = workflowIds.filter(Boolean);
  const empty = ['00000000-0000-0000-0000-000000000000'];
  const counts = {};
  await execution.query('BEGIN');
  try {
    const params = [ids.length ? ids : empty];
    const statements = [
      ['operation_confirmations', `DELETE FROM operation_confirmation c USING wo_operation o WHERE c.wo_operation_id=o.wo_operation_id AND o.wo_id=ANY($1::uuid[])`],
      ['execution_sessions', `DELETE FROM execution_session s USING wo_operation o WHERE s.wo_operation_id=o.wo_operation_id AND o.wo_id=ANY($1::uuid[])`],
      ['material_consumption', `DELETE FROM material_consumption WHERE wo_id=ANY($1::uuid[]) OR wo_operation_id IN (SELECT wo_operation_id FROM wo_operation WHERE wo_id=ANY($1::uuid[]))`],
      ['print_events', `DELETE FROM wo_print_job_event e USING wo_print_job p WHERE e.print_job_id=p.print_job_id AND p.wo_id=ANY($1::uuid[])`],
      ['print_attempts', `DELETE FROM wo_print_job_attempt a USING wo_print_job p WHERE a.print_job_id=p.print_job_id AND p.wo_id=ANY($1::uuid[])`],
      ['capacity_reservations', `DELETE FROM wo_capacity_reservation WHERE wo_id=ANY($1::uuid[])`],
      ['resource_allocation_audit', `DELETE FROM wo_resource_allocation_audit WHERE wo_id=ANY($1::uuid[])`],
      ['allocation_idempotency', `DELETE FROM wo_resource_allocation_idempotency WHERE allocation_id IN (SELECT allocation_id FROM wo_resource_allocation WHERE wo_id=ANY($1::uuid[]))`],
      ['print_jobs', `DELETE FROM wo_print_job WHERE wo_id=ANY($1::uuid[])`],
      ['resource_allocations', `DELETE FROM wo_resource_allocation WHERE wo_id=ANY($1::uuid[])`],
      ['operation_labor_assignments', `DELETE FROM wo_operation_labor_assignment WHERE wo_id=ANY($1::uuid[])`],
      ['materials', `DELETE FROM wo_material_requirement WHERE wo_id=ANY($1::uuid[])`],
      ['operations', `DELETE FROM wo_operation WHERE wo_id=ANY($1::uuid[])`],
      ['approval_logs', `DELETE FROM wo_approval_log WHERE wo_id=ANY($1::uuid[])`],
      ['line_audit', `DELETE FROM wo_line_selection_audit WHERE wo_id=ANY($1::uuid[])`],
      ['outbox_events', `DELETE FROM outbox_events WHERE payload::text LIKE ANY($1::text[])`],
      ['work_orders', `DELETE FROM wo_header WHERE wo_id=ANY($1::uuid[])`],
    ];
    for (const [name, text] of statements) {
      const statementParams = name === 'outbox_events' ? [ids.map((id) => `%${id}%`)] : params;
      counts[name] = Number((await q(execution, text, statementParams)).rowCount || 0);
    }
    if (workflows.length) {
      counts.workflow_events = Number((await q(execution, `DELETE FROM wo_creation_workflow_event WHERE workflow_id=ANY($1::uuid[])`, [workflows])).rowCount || 0);
      counts.workflows = Number((await q(execution, `DELETE FROM wo_creation_workflow WHERE workflow_id=ANY($1::uuid[])`, [workflows])).rowCount || 0);
    }
    const remaining = await q(execution, `SELECT COUNT(*)::int AS count FROM wo_header WHERE wo_id=ANY($1::uuid[])`, [ids.length ? ids : empty]);
    counts.remaining_work_orders = Number(remaining.rows[0].count || 0);
    await execution.query('COMMIT');
  } catch (error) {
    await execution.query('ROLLBACK');
    throw error;
  }
  if (counts.remaining_work_orders !== 0) throw new Error(`PHASE10_VERIFICATION_CLEANUP_FAILED: ${JSON.stringify(counts)}`);
  return counts;
}

async function verifyCounts() {
  const masterCounts = (await q(master, `
    SELECT
      (SELECT COUNT(*)::int FROM md_production_line WHERE code LIKE '${namespace}-%') AS production_lines,
      (SELECT COUNT(*)::int FROM md_work_center WHERE code LIKE '${namespace}-%') AS work_centers,
      (SELECT COUNT(*)::int FROM md_workstation WHERE code LIKE '${namespace}-%') AS workstations,
      (SELECT COUNT(*)::int FROM md_equipment WHERE code LIKE '${namespace}-%') AS equipment,
      (SELECT COUNT(*)::int FROM md_machine_unit WHERE code LIKE '${namespace}-%') AS machine_units,
      (SELECT COUNT(*)::int FROM md_resource_assignment WHERE code LIKE '${namespace}-%') AS assignments,
      (SELECT COUNT(*)::int FROM md_resource_capability WHERE code LIKE '${namespace}-%') AS capabilities,
      (SELECT COUNT(*)::int FROM md_resource_calendar WHERE code LIKE '${namespace}-%') AS calendars,
      (SELECT COUNT(*)::int FROM md_operation WHERE code LIKE '${namespace}-%') AS operations,
      (SELECT COUNT(*)::int FROM md_skill WHERE code LIKE '${namespace}-SK-%' AND lifecycle_status='Released') AS labor_skills,
      (SELECT COUNT(*)::int FROM md_employee WHERE code LIKE '${namespace}-EMP-%' AND lifecycle_status='Released' AND employee_status='Active') AS labor_employees,
      (SELECT COUNT(*)::int FROM md_employee_shift_schedule s JOIN md_employee e ON e.master_id=s.employee_id WHERE e.code LIKE '${namespace}-EMP-%' AND s.schedule_status='Scheduled') AS labor_schedules,
      (SELECT COUNT(*)::int FROM md_operation_skill_requirement r WHERE r.code LIKE '${namespace}-REQ-%' AND r.lifecycle_status='Released' AND r.active_flag=TRUE) AS labor_requirements,
      (SELECT COUNT(*)::int FROM md_production_version WHERE code LIKE '${namespace}-%' OR code LIKE 'WST-UAT-%') AS production_versions,
      (SELECT COUNT(*)::int FROM md_production_version_line_eligibility e JOIN md_production_version pv ON pv.master_id=e.production_version_id WHERE (pv.code LIKE '${namespace}-%' OR pv.code LIKE 'WST-UAT-%') AND e.active_flag=TRUE) AS line_eligibilities
  `)).rows[0];
  const orphanCounts = (await q(master, `
    SELECT
      (SELECT COUNT(*)::int FROM md_production_line_work_center lwc LEFT JOIN md_production_line pl ON pl.master_id=lwc.production_line_id LEFT JOIN md_work_center wc ON wc.master_id=lwc.work_center_id WHERE (pl.code LIKE '${namespace}-%' OR wc.code LIKE '${namespace}-%') AND (pl.master_id IS NULL OR wc.master_id IS NULL)) AS line_work_center_orphans,
      (SELECT COUNT(*)::int FROM md_resource_assignment ra LEFT JOIN md_work_center wc ON wc.master_id=ra.work_center_id LEFT JOIN md_workstation ws ON ws.master_id=ra.workstation_id WHERE ra.code LIKE '${namespace}-%' AND (wc.master_id IS NULL OR ws.master_id IS NULL)) AS assignment_orphans,
      (SELECT COUNT(*)::int FROM md_production_version_line_eligibility e LEFT JOIN md_production_version pv ON pv.master_id=e.production_version_id LEFT JOIN md_production_line pl ON pl.master_id=e.production_line_id WHERE (pv.code LIKE '${namespace}-%' OR pl.code LIKE '${namespace}-%') AND (pv.master_id IS NULL OR pl.master_id IS NULL)) AS eligibility_orphans
  `)).rows[0];
  const passed = Number(masterCounts.production_lines) === 2
      && Number(masterCounts.work_centers) === (includePrint ? 8 : 6)
      && Number(masterCounts.operations) === (includePrint ? 6 : 3)
    && Number(masterCounts.labor_skills) === 1
    && Number(masterCounts.labor_employees) === (includePrint ? 8 : 6)
    && Number(masterCounts.labor_schedules) === (includePrint ? 8 : 6)
    && Number(masterCounts.labor_requirements) === (includePrint ? 12 : 9)
    && Number(masterCounts.production_versions) === 4
    && Number(masterCounts.line_eligibilities) === 8
    && Object.values(orphanCounts).every((count) => Number(count) === 0);
  if (!passed) throw new Error(`PHASE10_SEED_COUNTS_INVALID: ${JSON.stringify({ masterCounts, orphanCounts })}`);
  return { masterCounts, orphanCounts };
}

function i18n(en) {
  return JSON.stringify({ vi: en, en, ja: en, ko: en });
}

function cryptoRandom() {
  return crypto.randomUUID();
}

async function main() {
  const mutating = ['--reset-seed', '--seed', '--two-line-flow'].includes(mode);
  const safety = ensureSafety(mutating);
  const report = { status: 'STARTED', generated_at: new Date().toISOString(), mode, safety, artifact_path: artifactPath, command_results: [] };
  await writeArtifact(report);
  if (!safety.passed) throw new Error(`ENVIRONMENT_SAFETY: ${safety.reasons.join('; ')}`);

  await connectAll();
  try {
    if (mode === '--reset-seed' || mode === '--seed') {
      if (mode === '--reset-seed') {
        report.command_results.push(run(process.execPath, ['scripts/reset-mes-wo-test-data.mjs', '--reset'], 'MES execution Work Order cleanup', { MES_ENV: envName, ARTIFACT_DIR: runArtifactDir, MES_EXECUTION_DATABASE_URL: executionUrl, CONFIRM_DESTRUCTIVE_RESET: 'YES_DELETE_MES_TEST_DATA' }));
        report.command_results.push(run(process.execPath, ['scripts/reset-won-seal-tech-machines.mjs', '--reset'], 'Won Seal Tech machine reset', { NODE_ENV: 'development', ALLOW_DESTRUCTIVE_SEED: 'true', MES_MASTER_DATA_DATABASE_URL: masterUrl }));
      }
      const cleanup = await cleanupOwnedSeed();
      report.cleanup = cleanup;
      if (process.env.PHASE10_INCLUDE_LEGACY_E2E_SEED === 'true') {
        report.command_results.push(run(process.execPath, ['scripts/seed-mes-wo-complete-dataset.mjs', '--seed'], 'Existing MES complete Work Order dataset seed', { MES_ENV: envName, ARTIFACT_DIR: runArtifactDir, MES_MASTER_DATA_DATABASE_URL: masterUrl, MES_EXECUTION_DATABASE_URL: executionUrl, MES_TRACEABILITY_DATABASE_URL: traceabilityUrl, CONFIRM_MASTER_DATA_RESET: 'YES_RESET_E2E_MASTER_DATA', CONFIRM_DESTRUCTIVE_RESET: 'YES_DELETE_MES_TEST_DATA', ALLOW_PRINT_STATION_OFFLINE: process.env.ALLOW_PRINT_STATION_OFFLINE || 'true' }));
      } else {
        report.legacy_e2e_seed = { skipped: true, reason: 'Phase 10 default seed is MES-owned only; legacy E2E seed delegates to WMS and requires a separate WMS seed contract.' };
      }
      report.seed = await seedTwoLineWonSealTech(process.env.E2E_WO_TARGET_DATE || defaultPlanningDate());
    } else {
      const existing = (await q(master, `SELECT pv.master_id AS production_version_id, pv.item_revision_id, pv.site_id, e1.production_line_id AS line_1_id, e2.production_line_id AS line_2_id
        FROM md_production_version pv
        JOIN md_production_version_line_eligibility e1 ON e1.production_version_id=pv.master_id AND e1.is_primary=TRUE AND e1.active_flag=TRUE
        JOIN md_production_version_line_eligibility e2 ON e2.production_version_id=pv.master_id AND e2.is_primary=FALSE AND e2.active_flag=TRUE
        WHERE pv.code='${namespace}-PV-SEAL-ASM-01' LIMIT 1`)).rows[0];
      if (!existing) throw new Error('PHASE10_SEED_NOT_FOUND: run npm run reset:seed:mes first');
      const shift = (await q(master, `SELECT master_id FROM md_shift WHERE site_id=$1 AND lifecycle_status='Released' ORDER BY CASE WHEN code='SHIFT-A' THEN 0 ELSE 1 END, code LIMIT 1`, [existing.site_id])).rows[0];
      report.seed = { ...existing, production_version_code: `${namespace}-PV-SEAL-ASM-01`, shift_id: shift.master_id, target_date: process.env.E2E_WO_TARGET_DATE || defaultPlanningDate(), operation_count: includePrint ? 4 : 3, print_mode: includePrint ? 'with-print' : 'without-print' };
    }
    const counts = await verifyCounts();
    report.counts = counts;
    if (mode !== '--seed') {
      report.flow = await verifySeedFlow(report.seed);
      report.flow_cleanup = await cleanupVerificationWorkOrders([report.flow.work_order_id], [report.flow.workflow_id]);
    }
    if (mode === '--two-line-flow') {
      report.command_results.push(run('npm', ['run', 'test:mes:two-line-full-regression:phase9'], 'Two-line full regression', { MES_ENV: envName, MES_EXECUTION_URL: executionBase, MES_EXECUTION_DATABASE_URL: executionUrl, ALLOW_TWO_LINE_RESOURCE_PLANNING_MUTATION: 'true' }));
    }
    report.status = 'PASS';
    report.completed_at = new Date().toISOString();
    await writeArtifact(report);
    console.log(json(report));
  } catch (error) {
    report.status = 'FAIL';
    report.error = error.message;
    if (error.commandResult) report.command_results.push(error.commandResult);
    report.completed_at = new Date().toISOString();
    await writeArtifact(report);
    throw error;
  } finally {
    await master.end().catch(() => {});
    await execution.end().catch(() => {});
    await traceability.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
