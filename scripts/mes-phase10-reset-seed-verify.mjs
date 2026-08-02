#!/usr/bin/env node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

const { Client } = pg;

const mode = process.argv[2] || '--verify';
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
  const allowedEnv = new Set(['development', 'local', 'test', 'staging']);
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
    ebomIds: (await q(master, `SELECT master_id FROM md_ebom_header WHERE code LIKE '${namespace}-%'`)).rows.map((row) => row.master_id),
    pvIds: (await q(master, `SELECT master_id FROM md_production_version WHERE code LIKE '${namespace}-%'`)).rows.map((row) => row.master_id),
    lineIds: (await q(master, `SELECT master_id FROM md_production_line WHERE code LIKE '${namespace}-%'`)).rows.map((row) => row.master_id),
    wcIds: (await q(master, `SELECT master_id FROM md_work_center WHERE code LIKE '${namespace}-%'`)).rows.map((row) => row.master_id),
    workstationIds: (await q(master, `SELECT master_id FROM md_workstation WHERE code LIKE '${namespace}-%'`)).rows.map((row) => row.master_id),
    equipmentIds: (await q(master, `SELECT master_id FROM md_equipment WHERE code LIKE '${namespace}-%'`)).rows.map((row) => row.master_id),
  };
  const counts = {};
  await master.query('BEGIN');
  try {
    await master.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
    const stmts = [
      ['line_eligibility', `DELETE FROM md_production_version_line_eligibility WHERE production_version_id=ANY($1::uuid[]) OR production_line_id=ANY($2::uuid[])`, [owned.pvIds.length ? owned.pvIds : empty, owned.lineIds.length ? owned.lineIds : empty]],
      ['line_resource_scope', `DELETE FROM md_production_line_resource_scope WHERE production_line_id=ANY($1::uuid[]) OR work_center_id=ANY($2::uuid[])`, [owned.lineIds.length ? owned.lineIds : empty, owned.wcIds.length ? owned.wcIds : empty]],
      ['line_work_centers', `DELETE FROM md_production_line_work_center WHERE production_line_id=ANY($1::uuid[]) OR work_center_id=ANY($2::uuid[])`, [owned.lineIds.length ? owned.lineIds : empty, owned.wcIds.length ? owned.wcIds : empty]],
      ['operation_skill_requirements', `DELETE FROM md_operation_skill_requirement WHERE operation_id=ANY($1::uuid[])`, [owned.operationIds.length ? owned.operationIds : empty]],
      ['resource_capabilities', `DELETE FROM md_resource_capability WHERE code LIKE '${namespace}-%' OR operation_id=ANY($1::uuid[]) OR work_center_id=ANY($2::uuid[])`, [owned.operationIds.length ? owned.operationIds : empty, owned.wcIds.length ? owned.wcIds : empty]],
      ['resource_calendars', `DELETE FROM md_resource_calendar WHERE code LIKE '${namespace}-%' OR work_center_id=ANY($1::uuid[])`, [owned.wcIds.length ? owned.wcIds : empty]],
      ['production_standards', `DELETE FROM md_production_standard WHERE code LIKE '${namespace}-%' OR routing_operation_id IN (SELECT master_id FROM md_routing_operation WHERE routing_header_id=ANY($1::uuid[])) OR work_center_id=ANY($2::uuid[])`, [owned.routingIds.length ? owned.routingIds : empty, owned.wcIds.length ? owned.wcIds : empty]],
      ['resource_assignments', `DELETE FROM md_resource_assignment WHERE code LIKE '${namespace}-%' OR work_center_id=ANY($1::uuid[])`, [owned.wcIds.length ? owned.wcIds : empty]],
      ['production_versions_before_resources', `DELETE FROM md_production_version WHERE master_id=ANY($1::uuid[])`, [owned.pvIds.length ? owned.pvIds : empty]],
      ['routing_operations_before_resources', `DELETE FROM md_routing_operation WHERE routing_header_id=ANY($1::uuid[])`, [owned.routingIds.length ? owned.routingIds : empty]],
      ['machine_units', `DELETE FROM md_machine_unit WHERE machine_id=ANY($1::uuid[])`, [owned.equipmentIds.length ? owned.equipmentIds : empty]],
      ['equipment', `DELETE FROM md_equipment WHERE master_id=ANY($1::uuid[])`, [owned.equipmentIds.length ? owned.equipmentIds : empty]],
      ['workstations', `DELETE FROM md_workstation WHERE master_id=ANY($1::uuid[])`, [owned.workstationIds.length ? owned.workstationIds : empty]],
      ['production_versions', `DELETE FROM md_production_version WHERE master_id=ANY($1::uuid[])`, [owned.pvIds.length ? owned.pvIds : empty]],
      ['mbom_lines', `DELETE FROM md_mbom_line WHERE mbom_header_id=ANY($1::uuid[])`, [owned.mbomIds.length ? owned.mbomIds : empty]],
      ['ebom_lines', `DELETE FROM md_ebom_line WHERE ebom_header_id=ANY($1::uuid[])`, [owned.ebomIds.length ? owned.ebomIds : empty]],
      ['routing_operations', `DELETE FROM md_routing_operation WHERE routing_header_id=ANY($1::uuid[])`, [owned.routingIds.length ? owned.routingIds : empty]],
      ['ebom_headers', `DELETE FROM md_ebom_header WHERE master_id=ANY($1::uuid[])`, [owned.ebomIds.length ? owned.ebomIds : empty]],
      ['routing_headers', `DELETE FROM md_routing_header WHERE master_id=ANY($1::uuid[])`, [owned.routingIds.length ? owned.routingIds : empty]],
      ['mbom_headers', `DELETE FROM md_mbom_header WHERE master_id=ANY($1::uuid[])`, [owned.mbomIds.length ? owned.mbomIds : empty]],
      ['item_revisions', `DELETE FROM md_item_revision WHERE master_id=ANY($1::uuid[])`, [owned.revisionIds.length ? owned.revisionIds : empty]],
      ['items', `DELETE FROM md_item WHERE master_id=ANY($1::uuid[])`, [owned.itemIds.length ? owned.itemIds : empty]],
      ['operations', `DELETE FROM md_operation WHERE master_id=ANY($1::uuid[])`, [owned.operationIds.length ? owned.operationIds : empty]],
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
      ['line_eligibility', `DELETE FROM rm_production_version_line_eligibility WHERE production_version_id IN (SELECT master_id FROM rm_production_version WHERE code LIKE '${namespace}-%') OR production_line_id IN (SELECT master_id FROM rm_production_line WHERE code LIKE '${namespace}-%')`],
      ['line_work_centers', `DELETE FROM rm_production_line_work_center WHERE production_line_id IN (SELECT master_id FROM rm_production_line WHERE code LIKE '${namespace}-%') OR work_center_id IN (SELECT master_id FROM rm_work_center WHERE code LIKE '${namespace}-%')`],
      ['resource_calendars', `DELETE FROM rm_resource_calendar WHERE work_center_id IN (SELECT master_id FROM rm_work_center WHERE code LIKE '${namespace}-%')`],
      ['production_standards', `DELETE FROM rm_production_standard WHERE work_center_id IN (SELECT master_id FROM rm_work_center WHERE code LIKE '${namespace}-%') OR item_revision_id IN (SELECT master_id FROM rm_item_revision WHERE code LIKE '${namespace}-%')`],
      ['resource_capabilities', `DELETE FROM rm_resource_capability WHERE work_center_id IN (SELECT master_id FROM rm_work_center WHERE code LIKE '${namespace}-%')`],
      ['routing_operations', `DELETE FROM rm_routing_operation WHERE routing_header_id IN (SELECT master_id FROM rm_routing_header WHERE code LIKE '${namespace}-%')`],
      ['routing_headers', `DELETE FROM rm_routing_header WHERE code LIKE '${namespace}-%'`],
      ['mbom_lines', `DELETE FROM rm_mbom_line WHERE mbom_header_id IN (SELECT master_id FROM rm_mbom_header WHERE code LIKE '${namespace}-%')`],
      ['mbom_headers', `DELETE FROM rm_mbom_header WHERE code LIKE '${namespace}-%'`],
      ['production_versions', `DELETE FROM rm_production_version WHERE code LIKE '${namespace}-%'`],
      ['work_centers', `DELETE FROM rm_work_center WHERE code LIKE '${namespace}-%'`],
      ['item_revisions', `DELETE FROM rm_item_revision WHERE code LIKE '${namespace}-%'`],
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
    ebom: cryptoRandom(),
    ebomLine: cryptoRandom(),
    mbom: cryptoRandom(),
    mbomLine: cryptoRandom(),
    routing: cryptoRandom(),
    pv: cryptoRandom(),
    line1: cryptoRandom(),
    line2: cryptoRandom(),
  };
  const operations = [
    { key: 'BINDING', name: 'Binding', cycle: 90, seq: 10 },
    { key: 'TEST5IN1', name: 'Test 5 in 1', cycle: 120, seq: 20 },
    { key: 'AIRTEST', name: 'Air Test', cycle: 80, seq: 30 },
    { key: 'PACKING', name: 'Packing', cycle: 60, seq: 40 },
  ].map((op, index) => ({ ...op, operationId: cryptoRandom(), routingOperationId: cryptoRandom(), line1Wc: cryptoRandom(), line2Wc: cryptoRandom(), line1Ws: cryptoRandom(), line2Ws: cryptoRandom(), line1Eq: cryptoRandom(), line2Eq: cryptoRandom(), line1Unit: cryptoRandom(), line2Unit: cryptoRandom(), line1Assignment: cryptoRandom(), line2Assignment: cryptoRandom() }));

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
        VALUES ($1,$2,$3::jsonb,$3::jsonb,1,'Released',NOW(),$4,$4,$5,'QuantityOnly','GoodOnly',$6,$7,TRUE,$8,5,1,1,1,1)`,
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
    await q(master, `INSERT INTO md_ebom_header (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, item_revision_id)
      VALUES ($1,'${namespace}-EBOM-SEAL-ASM-01',$2::jsonb,1,'Released',NOW(),$3,$3,$4)`, [ids.ebom, i18n('Won Seal Tech Seal Assembly EBOM'), userId, ids.revision]);
    await q(master, `INSERT INTO md_ebom_line (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, ebom_header_id, seq, component_revision_id, quantity_per, uom_id)
      VALUES ($1,'${namespace}-EBOM-L01',$2::jsonb,1,'Released',NOW(),$3,$3,$4,10,$5,1,$6)`, [ids.ebomLine, i18n('Seal ring component'), userId, ids.ebom, ids.componentRevision, uom.master_id]);
    await q(master, `INSERT INTO md_routing_header (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, business_version, routing_type, item_revision_id)
      VALUES ($1,'${namespace}-ROUTING-SEAL-ASM-01',$2::jsonb,1,'Released',NOW(),$3,$3,'1','Standard',$4)`, [ids.routing, i18n('Won Seal Tech two-line seal routing'), userId, ids.revision]);
    for (const op of operations) {
      await q(master, `INSERT INTO md_routing_operation (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, routing_header_id, operation_id, work_center_id, workstation_id, seq, predecessor_seq, scheduling_mode, queue_time_min, move_time_min, planning_mode)
        VALUES ($1,$2,$3::jsonb,1,'Released',NOW(),$4,$4,$5,$6,$7,$8,$9,$10,'Finite',2,1,'ROUTING_OVERRIDE')`,
        [op.routingOperationId, `${namespace}-RO-${op.key}`, i18n(`Routing ${op.name}`), userId, ids.routing, op.operationId, op.line1Wc, op.line1Ws, op.seq, op.seq === 10 ? null : op.seq - 10]);
    }
    await q(master, `INSERT INTO md_mbom_header (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, site_id, item_revision_id, business_version, purpose, base_quantity, base_uom_id)
      VALUES ($1,'${namespace}-MBOM-SEAL-ASM-01',$2::jsonb,1,'Released',NOW(),$3,$3,$4,$5,'1','Standard',1,$6)`, [ids.mbom, i18n('Won Seal Tech Seal Assembly MBOM'), userId, site.master_id, ids.revision, uom.master_id]);
    await q(master, `INSERT INTO md_mbom_line (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, mbom_header_id, seq, component_revision_id, quantity_per, uom_id, scrap_rate, issue_operation_id, backflush_flag, phantom_flag)
      VALUES ($1,'${namespace}-MBOM-L01',$2::jsonb,1,'Released',NOW(),$3,$3,$4,10,$5,1,$6,0,$7,FALSE,FALSE)`, [ids.mbomLine, i18n('Seal ring component'), userId, ids.mbom, ids.componentRevision, uom.master_id, operations[0].operationId]);
    await q(master, `INSERT INTO md_production_version (master_id, code, name, name_i18n, version_no, lifecycle_status, effective_from, created_by, updated_by, item_revision_id, ebom_header_id, mbom_header_id, routing_header_id, site_id, min_lot_size, max_lot_size, is_default)
      VALUES ($1,'${namespace}-PV-SEAL-ASM-01','Won Seal Tech two-line seal production version',$2::jsonb,1,'Released',NOW(),$3,$3,$4,$5,$6,$7,$8,1,1000,TRUE)`,
      [ids.pv, i18n('Won Seal Tech two-line seal production version'), userId, ids.revision, ids.ebom, ids.mbom, ids.routing, site.master_id]);
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
  return { production_version_id: ids.pv, production_version_code: `${namespace}-PV-SEAL-ASM-01`, item_revision_id: ids.revision, site_id: site.master_id, shift_id: shift.master_id, target_date: targetDate, line_1_id: ids.line1, line_2_id: ids.line2, operation_count: operations.length };
}

async function rebuildExecutionProjection(seed) {
  const { ids, operations, site, area, uom, targetDate } = seed;
  await execution.query('BEGIN');
  try {
    await q(execution, `INSERT INTO rm_item_revision (master_id, code, name, revision_code, item_type, site_id, base_uom_id, lifecycle_status, updated_at)
      VALUES ($1,'${namespace}-FG-SEAL-ASM-01-A',$2::jsonb,'A','FG',$3,$4,'Released',NOW())`, [ids.revision, i18n('Won Seal Tech Seal Assembly A'), site.master_id, uom.master_id]);
    await q(execution, `INSERT INTO rm_mbom_header (master_id, code, name, site_id, base_quantity, base_uom_id, lifecycle_status, updated_at)
      VALUES ($1,'${namespace}-MBOM-SEAL-ASM-01',$2::jsonb,$3,1,$4,'Released',NOW())`, [ids.mbom, i18n('Won Seal Tech Seal Assembly MBOM'), site.master_id, uom.master_id]);
    await q(execution, `INSERT INTO rm_mbom_line (master_id, mbom_header_id, seq, component_revision_id, component_item_code, quantity_per, uom_id, scrap_rate, issue_operation_id, backflush_flag, phantom_flag)
      VALUES ($1,$2,10,$3,'${namespace}-COMP-SEAL-RING-01-A',1,$4,0,$5,FALSE,FALSE)`, [ids.mbomLine, ids.mbom, ids.componentRevision, uom.master_id, operations[0].operationId]);
    await q(execution, `INSERT INTO rm_routing_header (master_id, code, item_revision_id, site_id, lifecycle_status, updated_at)
      VALUES ($1,'${namespace}-ROUTING-SEAL-ASM-01',$2,$3,'Released',NOW())`, [ids.routing, ids.revision, site.master_id]);
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
      (SELECT COUNT(*)::int FROM md_production_version WHERE code LIKE '${namespace}-%') AS production_versions,
      (SELECT COUNT(*)::int FROM md_production_version_line_eligibility e JOIN md_production_version pv ON pv.master_id=e.production_version_id WHERE pv.code LIKE '${namespace}-%' AND e.active_flag=TRUE) AS line_eligibilities
  `)).rows[0];
  const orphanCounts = (await q(master, `
    SELECT
      (SELECT COUNT(*)::int FROM md_production_line_work_center lwc LEFT JOIN md_production_line pl ON pl.master_id=lwc.production_line_id LEFT JOIN md_work_center wc ON wc.master_id=lwc.work_center_id WHERE (pl.code LIKE '${namespace}-%' OR wc.code LIKE '${namespace}-%') AND (pl.master_id IS NULL OR wc.master_id IS NULL)) AS line_work_center_orphans,
      (SELECT COUNT(*)::int FROM md_resource_assignment ra LEFT JOIN md_work_center wc ON wc.master_id=ra.work_center_id LEFT JOIN md_workstation ws ON ws.master_id=ra.workstation_id WHERE ra.code LIKE '${namespace}-%' AND (wc.master_id IS NULL OR ws.master_id IS NULL)) AS assignment_orphans,
      (SELECT COUNT(*)::int FROM md_production_version_line_eligibility e LEFT JOIN md_production_version pv ON pv.master_id=e.production_version_id LEFT JOIN md_production_line pl ON pl.master_id=e.production_line_id WHERE (pv.code LIKE '${namespace}-%' OR pl.code LIKE '${namespace}-%') AND (pv.master_id IS NULL OR pl.master_id IS NULL)) AS eligibility_orphans
  `)).rows[0];
  const passed = Number(masterCounts.production_lines) === 2
    && Number(masterCounts.work_centers) === 8
    && Number(masterCounts.operations) === 4
    && Number(masterCounts.production_versions) === 1
    && Number(masterCounts.line_eligibilities) === 2
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
      report.seed = { ...existing, production_version_code: `${namespace}-PV-SEAL-ASM-01`, shift_id: shift.master_id, target_date: process.env.E2E_WO_TARGET_DATE || defaultPlanningDate(), operation_count: 4 };
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
