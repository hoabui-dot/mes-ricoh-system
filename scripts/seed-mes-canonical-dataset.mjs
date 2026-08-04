#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

const { Pool } = pg;

const envName = String(process.env.MES_ENV || '').trim().toLowerCase();
const runId = process.env.MES_CANONICAL_RUN_ID || new Date().toISOString().replaceAll(/[:.]/g, '-');
const artifactDir = path.resolve(process.env.ARTIFACT_DIR || `artifacts/mes-canonical-reset/${runId}`);
const masterUrl = process.env.MES_MASTER_DATA_DATABASE_URL || 'postgresql://mes_master_data_user:mes_master_data_pass@localhost:15434/mes_master_data_db';
const executionUrl = process.env.MES_EXECUTION_DATABASE_URL || 'postgresql://mes_execution_user:mes_execution_pass@localhost:15435/mes_execution_db';
const traceabilityUrl = process.env.MES_TRACEABILITY_DATABASE_URL || 'postgresql://traceability_user:traceability_pass@localhost:15436/mes_traceability_db';
const kioskGatewayUrl = process.env.MES_KIOSK_GATEWAY_DATABASE_URL || 'postgresql://mes_kiosk_user:mes_kiosk_pass@localhost:15437/mes_kiosk_gateway_db';

function defaultPlanningDate() {
  const date = new Date();
  const day = date.getUTCDay();
  if (day === 6) date.setUTCDate(date.getUTCDate() + 2);
  if (day === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function resolveTargetDate() {
  const value = process.env.MES_CANONICAL_TARGET_DATE || process.env.E2E_WO_TARGET_DATE || defaultPlanningDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error('MES_CANONICAL_TARGET_DATE/E2E_WO_TARGET_DATE must use YYYY-MM-DD');
  }
  return value;
}

const targetDate = resolveTargetDate();

const json = (value) => JSON.stringify(value, null, 2);

function safetyCheck() {
  const reasons = [];
  if (!['development', 'test', 'uat', 'local'].includes(envName)) reasons.push('MES_ENV must be development, test, uat, or local');
  if (process.env.ALLOW_DESTRUCTIVE_SEED !== 'true') reasons.push('ALLOW_DESTRUCTIVE_SEED must equal true');
  for (const [name, rawUrl] of [['master', masterUrl], ['execution', executionUrl], ['traceability', traceabilityUrl], ['kiosk gateway', kioskGatewayUrl]]) {
    const url = new URL(rawUrl);
    if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) reasons.push(`${name} database host must be local/test: ${url.hostname}`);
    if (/prod|production|live/i.test(url.pathname)) reasons.push(`${name} database name is production-like`);
  }
  return { passed: reasons.length === 0, reasons, environment: envName || null };
}

async function seedKioskDemoTerminalContext() {
  const master = new pg.Client({ connectionString: masterUrl });
  const gateway = new pg.Client({ connectionString: kioskGatewayUrl });
  await master.connect(); await gateway.connect();
  try {
    const context = (await master.query(`
      SELECT s.master_id AS site_id, wc.master_id AS work_center_id
      FROM md_site s
      JOIN md_work_center wc ON wc.site_id=s.master_id
      WHERE s.code='SITE-KZ3' AND wc.code='WST-SEED-WC-L1-BINDING'
        AND s.lifecycle_status='Released' AND wc.lifecycle_status='Released'
      LIMIT 1
    `)).rows[0];
    if (!context) throw new Error('CANONICAL_KIOSK_TERMINAL_CONTEXT_MISSING');
    await gateway.query(`
      INSERT INTO terminal(terminal_id,terminal_code,site_id,work_center_id,status)
      VALUES('a1000000-0000-0000-0000-000000000007','KIOSK-DEMO-01',$1,$2,'OFFLINE')
      ON CONFLICT(terminal_code) DO UPDATE
      SET site_id=EXCLUDED.site_id,work_center_id=EXCLUDED.work_center_id,
          status=CASE WHEN terminal.status='DISABLED' THEN terminal.status ELSE 'OFFLINE' END,
          updated_at=NOW()
    `, [context.site_id, context.work_center_id]);
    return { terminal_code: 'KIOSK-DEMO-01', site_id: context.site_id, work_center_id: context.work_center_id };
  } finally {
    await master.end(); await gateway.end();
  }
}

function run(command, args, label, extraEnv = {}) {
  const started = new Date().toISOString();
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
    maxBuffer: 50 * 1024 * 1024,
  });
  const item = { label, command: [command, ...args].join(' '), exit_code: result.status, started_at: started, ended_at: new Date().toISOString(), stdout: result.stdout, stderr: result.stderr };
  if (result.status !== 0) throw Object.assign(new Error(`${label} failed with exit ${result.status}`), { commandResult: item });
  return item;
}

async function writeArtifact(name, value) {
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(path.join(artifactDir, name), json(value));
}

async function seedBaseMasterData(report) {
  report.command_results.push(run('npm', ['--prefix', 'services/mes-master-data-service', 'run', 'build'], 'Build MES Master Data service before importing seed'));
  const moduleUrl = path.resolve('services/mes-master-data-service/dist/infrastructure/db/seed.js');
  const { seedMasterData } = await import(`file://${moduleUrl}`);
  const pool = new Pool({ connectionString: masterUrl });
  try {
    await seedMasterData(pool);
  } finally {
    await pool.end();
  }
  return { status: 'applied', source: 'services/mes-master-data-service/src/infrastructure/db/seed.ts' };
}

async function rebuildBaseExecutionProjection() {
  const master = new pg.Client({ connectionString: masterUrl });
  const execution = new pg.Client({ connectionString: executionUrl });
  await master.connect();
  await execution.connect();
  try {
    const pv = (await master.query(`SELECT * FROM md_production_version WHERE code='PV-FG-WS-CM01-R1' LIMIT 1`)).rows[0];
    if (!pv) throw new Error('Base execution projection missing PV-FG-WS-CM01-R1 master data');
    const revision = (await master.query(`
      SELECT r.*, i.code AS item_code, i.item_type
      FROM md_item_revision r JOIN md_item i ON i.master_id=r.item_id
      WHERE r.master_id=$1
    `, [pv.item_revision_id])).rows[0];
    const mbom = (await master.query(`SELECT * FROM md_mbom_header WHERE master_id=$1`, [pv.mbom_header_id])).rows[0];
    const mbomLines = (await master.query(`
      SELECT l.*, i.code AS component_item_code
      FROM md_mbom_line l
      JOIN md_item_revision r ON r.master_id=l.component_revision_id
      JOIN md_item i ON i.master_id=r.item_id
      WHERE l.mbom_header_id=$1 AND l.lifecycle_status='Released' AND l.effective_to IS NULL
      ORDER BY l.seq
    `, [pv.mbom_header_id])).rows;
    const routing = (await master.query(`SELECT * FROM md_routing_header WHERE master_id=$1`, [pv.routing_header_id])).rows[0];
    const routingOps = (await master.query(`
      SELECT ro.*, op.code AS operation_code, op.requires_output_label,
        COALESCE(ps.base_quantity, op.default_base_quantity, 1) AS resolved_base_quantity,
        COALESCE(ps.setup_time_min, op.default_setup_time_min, 0) AS resolved_setup_time_min,
        COALESCE(ps.cycle_time_sec, op.default_cycle_time_sec, 1) AS resolved_cycle_time_sec,
        COALESCE(ps.labor_count, op.default_required_persons, 1) AS resolved_required_workers,
        COALESCE(ps.efficiency_factor, op.default_efficiency_factor, 1) AS resolved_efficiency_factor,
        COALESCE(ps.standard_yield, op.default_yield, 1) AS resolved_standard_yield
      FROM md_routing_operation ro
      JOIN md_operation op ON op.master_id=ro.operation_id
      LEFT JOIN LATERAL (
        SELECT *
        FROM md_production_standard ps
        WHERE ps.routing_operation_id=ro.master_id AND ps.lifecycle_status='Released' AND ps.effective_to IS NULL
        ORDER BY ps.valid_from DESC NULLS LAST
        LIMIT 1
      ) ps ON TRUE
      WHERE ro.routing_header_id=$1 AND ro.lifecycle_status='Released' AND ro.effective_to IS NULL
      ORDER BY ro.seq
    `, [pv.routing_header_id])).rows;
    const workCenters = (await master.query(`
      SELECT DISTINCT wc.master_id, wc.code, wc.name, wc.site_id, wc.area_id, wc.active_flag, wc.lifecycle_status
      FROM md_work_center wc JOIN md_routing_operation ro ON ro.work_center_id=wc.master_id
      WHERE ro.routing_header_id=$1
    `, [pv.routing_header_id])).rows;
    const baseLine = (await master.query(`SELECT * FROM md_production_line WHERE code='LINE-BASE-1' LIMIT 1`)).rows[0];
    const baseLineWorkCenters = baseLine ? (await master.query(`
      SELECT lwc.*, wc.site_id
      FROM md_production_line_work_center lwc JOIN md_work_center wc ON wc.master_id=lwc.work_center_id
      WHERE lwc.production_line_id=$1 AND lwc.active_flag=TRUE
      ORDER BY lwc.sequence_no
    `, [baseLine.master_id])).rows : [];
    const calendars = (await master.query(`
      SELECT master_id, work_center_id, equipment_id, available_from, available_to, capacity_percent, lifecycle_status
      FROM md_resource_calendar
      WHERE site_id=$1 AND lifecycle_status='Released' AND effective_to IS NULL
    `, [pv.site_id])).rows;
    const capabilities = (await master.query(`
      SELECT master_id, operation_id, work_center_id, equipment_id, capability_type, active_flag, lifecycle_status
      FROM md_resource_capability
      WHERE site_id=$1 AND product_revision_id=$2 AND lifecycle_status='Released' AND active_flag=TRUE AND effective_to IS NULL
    `, [pv.site_id, pv.item_revision_id])).rows;
    const standards = (await master.query(`
      SELECT master_id, item_revision_id, operation_id, work_center_id, equipment_id, setup_time_min, cycle_time_sec, efficiency_factor, lifecycle_status, routing_operation_id, base_quantity, standard_yield, labor_count
      FROM md_production_standard
      WHERE site_id=$1 AND item_revision_id=$2 AND lifecycle_status='Released' AND effective_to IS NULL
    `, [pv.site_id, pv.item_revision_id])).rows;
    const operationRequirements = (await master.query(`
      SELECT master_id, operation_id, skill_id, minimum_level, required_persons, mandatory_flag
      FROM md_operation_skill_requirement
      WHERE routing_operation_id IN (SELECT master_id FROM md_routing_operation WHERE routing_header_id=$1) AND lifecycle_status='Released' AND active_flag=TRUE AND effective_to IS NULL
    `, [pv.routing_header_id])).rows;
    const skills = (await master.query(`
      SELECT DISTINCT s.master_id, s.code, s.name, s.lifecycle_status
      FROM md_skill s JOIN md_operation_skill_requirement r ON r.skill_id=s.master_id
      WHERE r.routing_operation_id IN (SELECT master_id FROM md_routing_operation WHERE routing_header_id=$1)
    `, [pv.routing_header_id])).rows;
    const workCenterIds = workCenters.map((workCenter) => workCenter.master_id);
    const skillIds = skills.map((skill) => skill.master_id);
    const employees = (await master.query(`
      SELECT DISTINCT e.master_id, e.code, e.name, e.site_id, e.default_work_center_id, e.employee_status, e.lifecycle_status
      FROM md_employee e
      LEFT JOIN md_employee_skill es ON es.employee_id=e.master_id AND es.active_flag=TRUE AND es.effective_to IS NULL
      WHERE e.site_id=$1
        AND e.lifecycle_status='Released'
        AND e.employee_status='Active'
        AND (
          e.default_work_center_id = ANY($2::uuid[])
          OR es.skill_id = ANY($3::uuid[])
        )
      ORDER BY e.code
    `, [pv.site_id, workCenterIds, skillIds])).rows;
    const employeeIds = employees.map((employee) => employee.master_id);
    const employeeSkills = (await master.query(`
      SELECT es.employee_id, es.skill_id, es.level
      FROM md_employee_skill es
      WHERE es.employee_id = ANY($1::uuid[])
        AND es.skill_id = ANY($2::uuid[])
        AND es.active_flag=TRUE
        AND es.effective_to IS NULL
        AND es.qualification_status='Active'
      ORDER BY es.employee_id, es.skill_id
    `, [employeeIds, skillIds])).rows;
    const employeeSchedules = (await master.query(`
      SELECT schedule_id, employee_id, shift_id, work_center_id, schedule_date, schedule_status
      FROM md_employee_shift_schedule
      WHERE employee_id = ANY($1::uuid[])
        AND schedule_date=$2::date
      ORDER BY employee_id, schedule_date
    `, [employeeIds, targetDate])).rows;

    await execution.query('BEGIN');
    await execution.query(`INSERT INTO rm_item_revision (master_id, code, name, revision_code, item_type, site_id, base_uom_id, lifecycle_status, updated_at) VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,NOW()) ON CONFLICT (master_id) DO UPDATE SET code=EXCLUDED.code,name=EXCLUDED.name,revision_code=EXCLUDED.revision_code,item_type=EXCLUDED.item_type,site_id=EXCLUDED.site_id,base_uom_id=EXCLUDED.base_uom_id,lifecycle_status=EXCLUDED.lifecycle_status,updated_at=NOW()`, [revision.master_id, revision.code, JSON.stringify(revision.name), revision.revision_code, revision.item_type || 'FG', revision.site_id, revision.base_uom_id, revision.lifecycle_status]);
    await execution.query(`INSERT INTO rm_mbom_header (master_id, code, name, site_id, base_quantity, base_uom_id, lifecycle_status, updated_at) VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,NOW()) ON CONFLICT (master_id) DO UPDATE SET code=EXCLUDED.code,name=EXCLUDED.name,site_id=EXCLUDED.site_id,base_quantity=EXCLUDED.base_quantity,base_uom_id=EXCLUDED.base_uom_id,lifecycle_status=EXCLUDED.lifecycle_status,updated_at=NOW()`, [mbom.master_id, mbom.code, JSON.stringify(mbom.name), mbom.site_id, mbom.base_quantity, mbom.base_uom_id, mbom.lifecycle_status]);
    await execution.query(`DELETE FROM rm_mbom_line WHERE mbom_header_id=$1`, [mbom.master_id]);
    for (const line of mbomLines) {
      await execution.query(`INSERT INTO rm_mbom_line (master_id, mbom_header_id, parent_line_id, seq, component_revision_id, component_item_code, quantity_per, uom_id, scrap_rate, issue_operation_id, backflush_flag, phantom_flag) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [line.master_id, line.mbom_header_id, line.parent_line_id, line.seq, line.component_revision_id, line.component_item_code, line.quantity_per, line.uom_id, line.scrap_rate, line.issue_operation_id, line.backflush_flag, line.phantom_flag]);
    }
    await execution.query(`INSERT INTO rm_routing_header (master_id, code, item_revision_id, site_id, lifecycle_status, updated_at) VALUES ($1,$2,$3,$4,$5,NOW()) ON CONFLICT (master_id) DO UPDATE SET code=EXCLUDED.code,item_revision_id=EXCLUDED.item_revision_id,site_id=EXCLUDED.site_id,lifecycle_status=EXCLUDED.lifecycle_status,updated_at=NOW()`, [routing.master_id, routing.code, routing.item_revision_id, routing.item_revision_id ? pv.site_id : null, routing.lifecycle_status]);
    await execution.query(`DELETE FROM rm_routing_operation WHERE routing_header_id=$1`, [routing.master_id]);
    for (const op of routingOps) {
      await execution.query(`INSERT INTO rm_routing_operation (master_id, routing_header_id, operation_id, operation_code, work_center_id, seq, predecessor_seq, planning_mode, resolved_source, resolved_base_quantity, resolved_setup_time_min, resolved_cycle_time_sec, resolved_required_workers, resolved_efficiency_factor, resolved_standard_yield, requires_output_label, workstation_id, queue_time_min, move_time_min, units_per_label, label_quantity_method, copies_per_label) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'CanonicalSeed',$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`, [op.master_id, op.routing_header_id, op.operation_id, op.operation_code, op.work_center_id, op.seq, op.predecessor_seq, op.planning_mode || 'Finite', op.resolved_base_quantity, op.resolved_setup_time_min, op.resolved_cycle_time_sec, op.resolved_required_workers, op.resolved_efficiency_factor, op.resolved_standard_yield, op.requires_output_label, op.workstation_id, op.queue_time_min || 0, op.move_time_min || 0, op.units_per_label || null, op.label_quantity_method || 'CEIL_BY_UNITS_PER_LABEL', op.copies_per_label || 1]);
    }
    for (const wc of workCenters) {
      await execution.query(`INSERT INTO rm_work_center (master_id, code, name, site_id, area_id, active_flag, lifecycle_status) VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7) ON CONFLICT (master_id) DO UPDATE SET code=EXCLUDED.code,name=EXCLUDED.name,site_id=EXCLUDED.site_id,area_id=EXCLUDED.area_id,active_flag=EXCLUDED.active_flag,lifecycle_status=EXCLUDED.lifecycle_status`, [wc.master_id, wc.code, JSON.stringify(wc.name), wc.site_id, wc.area_id, wc.active_flag, wc.lifecycle_status]);
    }
    if (baseLine) {
      await execution.query(`INSERT INTO rm_production_line (master_id, code, name, site_id, area_id, line_type, active_flag, lifecycle_status, updated_at) VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,NOW()) ON CONFLICT (master_id) DO UPDATE SET code=EXCLUDED.code,name=EXCLUDED.name,site_id=EXCLUDED.site_id,area_id=EXCLUDED.area_id,line_type=EXCLUDED.line_type,active_flag=EXCLUDED.active_flag,lifecycle_status=EXCLUDED.lifecycle_status,updated_at=NOW()`, [baseLine.master_id, baseLine.code, JSON.stringify(baseLine.name), baseLine.site_id, baseLine.area_id, baseLine.line_type, baseLine.active_flag, baseLine.lifecycle_status]);
      await execution.query(`DELETE FROM rm_production_line_work_center WHERE production_line_id=$1`, [baseLine.master_id]);
      for (const lineWorkCenter of baseLineWorkCenters) {
        await execution.query(`INSERT INTO rm_production_line_work_center (master_id, production_line_id, work_center_id, site_id, effective_from, effective_to, active_flag, lifecycle_status, updated_at) VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,'Released',NOW())`, [lineWorkCenter.production_line_id, lineWorkCenter.work_center_id, lineWorkCenter.site_id, lineWorkCenter.effective_from, lineWorkCenter.effective_to, lineWorkCenter.active_flag]);
      }
    }
    for (const capability of capabilities) {
      await execution.query(`INSERT INTO rm_resource_capability (master_id, operation_id, work_center_id, equipment_id, capability_type, active_flag, lifecycle_status) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (master_id) DO UPDATE SET operation_id=EXCLUDED.operation_id,work_center_id=EXCLUDED.work_center_id,equipment_id=EXCLUDED.equipment_id,capability_type=EXCLUDED.capability_type,active_flag=EXCLUDED.active_flag,lifecycle_status=EXCLUDED.lifecycle_status`, [capability.master_id, capability.operation_id, capability.work_center_id, capability.equipment_id, capability.capability_type, capability.active_flag, capability.lifecycle_status]);
    }
    for (const standard of standards) {
      await execution.query(`INSERT INTO rm_production_standard (master_id, item_revision_id, operation_id, work_center_id, equipment_id, setup_time_min, cycle_time_sec, efficiency_factor, lifecycle_status, routing_operation_id, base_quantity, standard_yield, labor_count) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (master_id) DO UPDATE SET item_revision_id=EXCLUDED.item_revision_id,operation_id=EXCLUDED.operation_id,work_center_id=EXCLUDED.work_center_id,equipment_id=EXCLUDED.equipment_id,setup_time_min=EXCLUDED.setup_time_min,cycle_time_sec=EXCLUDED.cycle_time_sec,efficiency_factor=EXCLUDED.efficiency_factor,lifecycle_status=EXCLUDED.lifecycle_status,routing_operation_id=EXCLUDED.routing_operation_id,base_quantity=EXCLUDED.base_quantity,standard_yield=EXCLUDED.standard_yield,labor_count=EXCLUDED.labor_count`, [standard.master_id, standard.item_revision_id, standard.operation_id, standard.work_center_id, standard.equipment_id, standard.setup_time_min, standard.cycle_time_sec, standard.efficiency_factor, standard.lifecycle_status, standard.routing_operation_id, standard.base_quantity, standard.standard_yield, standard.labor_count]);
    }
    for (const calendar of calendars) {
      await execution.query(`INSERT INTO rm_resource_calendar (master_id, work_center_id, equipment_id, available_from, available_to, capacity_percent, lifecycle_status) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (master_id) DO UPDATE SET work_center_id=EXCLUDED.work_center_id,equipment_id=EXCLUDED.equipment_id,available_from=EXCLUDED.available_from,available_to=EXCLUDED.available_to,capacity_percent=EXCLUDED.capacity_percent,lifecycle_status=EXCLUDED.lifecycle_status`, [calendar.master_id, calendar.work_center_id, calendar.equipment_id, calendar.available_from, calendar.available_to, calendar.capacity_percent, calendar.lifecycle_status]);
    }
    for (const skill of skills) {
      await execution.query(`INSERT INTO rm_skill (master_id, code, name, lifecycle_status) VALUES ($1,$2,$3::jsonb,$4) ON CONFLICT (master_id) DO UPDATE SET code=EXCLUDED.code,name=EXCLUDED.name,lifecycle_status=EXCLUDED.lifecycle_status`, [skill.master_id, skill.code, JSON.stringify(skill.name), skill.lifecycle_status]);
    }
    for (const employee of employees) {
      await execution.query(`INSERT INTO rm_employee (master_id, code, name, site_id, default_work_center_id, employee_status, lifecycle_status) VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7) ON CONFLICT (master_id) DO UPDATE SET code=EXCLUDED.code,name=EXCLUDED.name,site_id=EXCLUDED.site_id,default_work_center_id=EXCLUDED.default_work_center_id,employee_status=EXCLUDED.employee_status,lifecycle_status=EXCLUDED.lifecycle_status`, [employee.master_id, employee.code, JSON.stringify({ vi: employee.name, en: employee.name }), employee.site_id, employee.default_work_center_id, employee.employee_status, employee.lifecycle_status]);
    }
    for (const employeeSkill of employeeSkills) {
      await execution.query(`INSERT INTO rm_employee_skill (employee_id, skill_id, level) VALUES ($1,$2,$3) ON CONFLICT (employee_id, skill_id) DO UPDATE SET level=EXCLUDED.level`, [employeeSkill.employee_id, employeeSkill.skill_id, employeeSkill.level]);
    }
    for (const schedule of employeeSchedules) {
      await execution.query(`INSERT INTO rm_employee_shift_schedule (schedule_id, employee_id, shift_id, work_center_id, schedule_date, schedule_status) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (schedule_id) DO UPDATE SET employee_id=EXCLUDED.employee_id,shift_id=EXCLUDED.shift_id,work_center_id=EXCLUDED.work_center_id,schedule_date=EXCLUDED.schedule_date,schedule_status=EXCLUDED.schedule_status`, [schedule.schedule_id, schedule.employee_id, schedule.shift_id, schedule.work_center_id, schedule.schedule_date, schedule.schedule_status]);
    }
    for (const requirement of operationRequirements) {
      await execution.query(`INSERT INTO rm_operation_skill_requirement (master_id, operation_id, skill_id, minimum_level, required_persons, mandatory_flag) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (master_id) DO UPDATE SET operation_id=EXCLUDED.operation_id,skill_id=EXCLUDED.skill_id,minimum_level=EXCLUDED.minimum_level,required_persons=EXCLUDED.required_persons,mandatory_flag=EXCLUDED.mandatory_flag`, [requirement.master_id, requirement.operation_id, requirement.skill_id, requirement.minimum_level, requirement.required_persons, requirement.mandatory_flag]);
    }
    await execution.query(`INSERT INTO rm_production_version (master_id, code, name_i18n, item_revision_id, mbom_header_id, routing_header_id, site_id, lifecycle_status, is_default, min_lot_size, max_lot_size, updated_at) VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11,NOW()) ON CONFLICT (master_id) DO UPDATE SET code=EXCLUDED.code,name_i18n=EXCLUDED.name_i18n,item_revision_id=EXCLUDED.item_revision_id,mbom_header_id=EXCLUDED.mbom_header_id,routing_header_id=EXCLUDED.routing_header_id,site_id=EXCLUDED.site_id,lifecycle_status=EXCLUDED.lifecycle_status,is_default=EXCLUDED.is_default,min_lot_size=EXCLUDED.min_lot_size,max_lot_size=EXCLUDED.max_lot_size,updated_at=NOW()`, [pv.master_id, pv.code, JSON.stringify(pv.name_i18n || { vi: pv.name, en: pv.name }), pv.item_revision_id, pv.mbom_header_id, pv.routing_header_id, pv.site_id, pv.lifecycle_status, pv.is_default, pv.min_lot_size, pv.max_lot_size]);
    if (baseLine) {
      await execution.query(`DELETE FROM rm_production_version_line_eligibility WHERE production_version_id=$1`, [pv.master_id]);
      await execution.query(`INSERT INTO rm_production_version_line_eligibility (master_id, production_version_id, production_line_id, selection_role, priority, effective_from, active_flag, lifecycle_status, updated_at) VALUES (gen_random_uuid(),$1,$2,'PRIMARY',1,NOW(),TRUE,'Released',NOW())`, [pv.master_id, baseLine.master_id]);
    }
    await execution.query('COMMIT');
    return { status: 'rebuilt', production_version_code: pv.code, routing_operations: routingOps.length, mbom_lines: mbomLines.length, work_centers: workCenters.length, production_lines: baseLine ? 1 : 0, line_work_centers: baseLineWorkCenters.length, capabilities: capabilities.length, calendars: calendars.length, skills: skills.length, employees: employees.length, employee_skills: employeeSkills.length, employee_schedules: employeeSchedules.length, operation_skill_requirements: operationRequirements.length };
  } catch (error) {
    await execution.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await master.end();
    await execution.end();
  }
}

async function seedTraceabilityCanonicalDataset() {
  const master = new pg.Client({ connectionString: masterUrl });
  const traceability = new pg.Client({ connectionString: traceabilityUrl });
  await master.connect();
  await traceability.connect();
  try {
    const refs = (await master.query(`
      SELECT
        (SELECT master_id FROM md_item_revision WHERE code='WST-SEED-FG-SEAL-ASM-01-A' LIMIT 1) AS item_revision_id,
        (SELECT master_id FROM md_site WHERE code='SITE-KZ3' LIMIT 1) AS site_id,
        (SELECT master_id FROM md_uom WHERE code='PCS' LIMIT 1) AS uom_id
    `)).rows[0];
    if (!refs.item_revision_id || !refs.site_id || !refs.uom_id) {
      throw new Error('Canonical traceability seed is missing master-data references');
    }

    const ids = {
      template: '00000000-0000-4000-8000-000000000101',
      numbering: '00000000-0000-4000-8000-000000000102',
      split: '00000000-0000-4000-8000-000000000103',
      policyBinding: '00000000-0000-4000-8000-000000000104',
      policyTest5In1: '00000000-0000-4000-8000-000000000105',
      policyAirtest: '00000000-0000-4000-8000-000000000106',
      policyPacking: '00000000-0000-4000-8000-000000000107',
    };
    const labelName = { vi: 'Nhãn WST Canonical', en: 'WST Canonical Label', ja: 'WST 標準ラベル', ko: 'WST 표준 라벨' };
    const staticText = { vi: 'MES Canonical Seed', en: 'MES Canonical Seed', ja: 'MES Canonical Seed', ko: 'MES Canonical Seed' };

    await traceability.query('BEGIN');
    await traceability.query(`
      INSERT INTO md_label_template (template_id, template_code, template_name, static_text, layout_json)
      VALUES ($1, 'WST-SEED-LBL-SEAL', $2::jsonb, $3::jsonb, $4::jsonb)
      ON CONFLICT (template_code) DO UPDATE SET template_name=EXCLUDED.template_name, static_text=EXCLUDED.static_text, layout_json=EXCLUDED.layout_json, updated_at=NOW()
    `, [ids.template, JSON.stringify(labelName), JSON.stringify(staticText), JSON.stringify({ format: 'QR_TEXT', fields: ['label_code', 'item_revision_code', 'operation_code'] })]);
    await traceability.query(`
      INSERT INTO md_numbering_rule (rule_id, rule_code, prefix, date_format, sequence_length, reset_frequency, site_id)
      VALUES ($1, 'WST-SEED-NUM-SEAL', 'WST', 'YYYYMMDD', 5, 'DAILY', $2)
      ON CONFLICT (rule_code) DO UPDATE SET prefix=EXCLUDED.prefix, date_format=EXCLUDED.date_format, sequence_length=EXCLUDED.sequence_length, reset_frequency=EXCLUDED.reset_frequency, site_id=EXCLUDED.site_id, updated_at=NOW()
    `, [ids.numbering, refs.site_id]);
    await traceability.query(`
      INSERT INTO md_qr_split_rule (split_rule_id, rule_code, split_algorithm, default_yield_ratio, target_uom_id, site_id)
      VALUES ($1, 'WST-SEED-SPLIT-SEAL', 'FIXED_COUNT', 1.0000, $2, $3)
      ON CONFLICT (rule_code) DO UPDATE SET split_algorithm=EXCLUDED.split_algorithm, default_yield_ratio=EXCLUDED.default_yield_ratio, target_uom_id=EXCLUDED.target_uom_id, site_id=EXCLUDED.site_id, updated_at=NOW()
    `, [ids.split, refs.uom_id, refs.site_id]);
    for (const [policyId, operationCode, trackingType] of [
      [ids.policyBinding, 'WST-SEED-OP-BINDING', 'MOTHER_CHILD_QR'],
      [ids.policyTest5In1, 'WST-SEED-OP-TEST5IN1', 'LOT'],
      [ids.policyAirtest, 'WST-SEED-OP-AIRTEST', 'LOT'],
      [ids.policyPacking, 'WST-SEED-OP-PACKING', 'SERIAL'],
    ]) {
      await traceability.query(`
        INSERT INTO md_traceability_policy (policy_id, item_revision_id, operation_code, tracking_type, numbering_rule_id, qr_split_rule_id, label_template_id, site_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (item_revision_id, operation_code) DO UPDATE SET tracking_type=EXCLUDED.tracking_type, numbering_rule_id=EXCLUDED.numbering_rule_id, qr_split_rule_id=EXCLUDED.qr_split_rule_id, label_template_id=EXCLUDED.label_template_id, site_id=EXCLUDED.site_id, updated_at=NOW()
      `, [policyId, refs.item_revision_id, operationCode, trackingType, ids.numbering, ids.split, ids.template, refs.site_id]);
    }
    await traceability.query('COMMIT');
    return { status: 'applied', template_code: 'WST-SEED-LBL-SEAL', numbering_rule_code: 'WST-SEED-NUM-SEAL', split_rule_code: 'WST-SEED-SPLIT-SEAL', policy_count: 4 };
  } catch (error) {
    await traceability.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await master.end();
    await traceability.end();
  }
}

async function seedCanonicalPrintStationBindings() {
  const master = new pg.Client({ connectionString: masterUrl });
  await master.connect();
  try {
    const station = (await master.query(`SELECT master_id, code FROM md_print_station WHERE is_active=TRUE ORDER BY code LIMIT 1`)).rows[0];
    if (!station) throw new Error('CANONICAL_PRINT_STATION_MISSING');
    const workstations = (await master.query(`SELECT master_id, code FROM md_workstation WHERE code IN ('WST-SEED-WS-L1-PACKING','WST-SEED-WS-L2-PACKING') ORDER BY code`)).rows;
    if (workstations.length !== 2) throw new Error(`CANONICAL_PACKING_WORKSTATIONS_MISSING: ${workstations.length}/2`);
    await master.query('BEGIN');
    await master.query(`UPDATE md_print_station SET status='ONLINE', is_active=TRUE, configured_allocation_limit=10, updated_at=NOW() WHERE master_id=$1`, [station.master_id]);
    await master.query(`INSERT INTO md_print_station_runtime_projection (print_station_id, station_code, adapter_id, runtime_status, kafka_status, printer_count, online_printer_count, error_printer_count, last_heartbeat_at, last_status_change_at, ready_printer_count, active_for_work_printer_count, registered_printer_count, busy_printer_count, offline_printer_count)
      VALUES ($1,$2,'PRINT-ADAPTER-01','ONLINE','CONNECTED',1,1,0,NOW(),NOW(),1,1,1,0,0)
      ON CONFLICT (print_station_id) DO UPDATE SET runtime_status='ONLINE', kafka_status='CONNECTED', printer_count=1, online_printer_count=1, error_printer_count=0, ready_printer_count=1, active_for_work_printer_count=1, registered_printer_count=1, busy_printer_count=0, offline_printer_count=0, last_heartbeat_at=NOW(), last_status_change_at=NOW()`, [station.master_id, station.code]);
    for (const workstation of workstations) {
      await master.query(`INSERT INTO md_workstation_print_station_binding (binding_id, workstation_id, print_station_id, role, effective_from, is_active, created_by, allocated_printer_quantity)
        SELECT gen_random_uuid(),$1,$2,'PRIMARY',NOW(),TRUE,$3,1
        WHERE NOT EXISTS (SELECT 1 FROM md_workstation_print_station_binding WHERE workstation_id=$1 AND role='PRIMARY' AND is_active=TRUE AND effective_to IS NULL)`, [workstation.master_id, station.master_id, '00000000-0000-0000-0000-000000000001']);
    }
    await master.query('COMMIT');
    return { station_code: station.code, packing_workstation_codes: workstations.map((row) => row.code), binding_count: workstations.length, runtime_status: 'ONLINE', kafka_status: 'CONNECTED' };
  } catch (error) {
    await master.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await master.end();
  }
}

async function countCanonicalRows() {
  const master = new pg.Client({ connectionString: masterUrl });
  const execution = new pg.Client({ connectionString: executionUrl });
  const traceability = new pg.Client({ connectionString: traceabilityUrl });
  await master.connect(); await execution.connect(); await traceability.connect();
  try {
    const m = (await master.query(`
      SELECT
        (SELECT COUNT(*)::int FROM md_site) AS sites,
        (SELECT COUNT(*)::int FROM md_uom) AS uoms,
        (SELECT COUNT(*)::int FROM md_shift) AS shifts,
        (SELECT COUNT(*)::int FROM md_production_line WHERE code LIKE 'WST-SEED-%') AS canonical_lines,
        (SELECT COUNT(*)::int FROM md_work_center WHERE code LIKE 'WST-SEED-%') AS canonical_work_centers,
        (SELECT COUNT(*)::int FROM md_production_version WHERE code='WST-SEED-PV-SEAL-ASM-01') AS canonical_production_versions
    `)).rows[0];
    const e = (await execution.query(`
      SELECT
        (SELECT COUNT(*)::int FROM wo_header) AS work_orders,
        (SELECT COUNT(*)::int FROM rm_production_version WHERE code='WST-SEED-PV-SEAL-ASM-01') AS canonical_rm_production_versions,
        (SELECT COUNT(*)::int FROM rm_production_line WHERE code LIKE 'WST-SEED-%') AS canonical_rm_lines
    `)).rows[0];
    const t = (await traceability.query(`
      SELECT
        (SELECT COUNT(*)::int FROM md_traceability_policy WHERE operation_code LIKE 'WST-SEED-%') AS canonical_policies,
        (SELECT COUNT(*)::int FROM md_label_template WHERE template_code LIKE 'WST-SEED-%') AS canonical_templates
    `)).rows[0];
    return { master: m, execution: e, traceability: t };
  } finally {
    await master.end(); await execution.end(); await traceability.end();
  }
}

async function main() {
  const safety = safetyCheck();
  const report = { success: false, generated_at: new Date().toISOString(), target_date: targetDate, safety, command_results: [] };
  await writeArtifact('seed-result.json', report);
  if (!safety.passed) throw new Error(`MES_CANONICAL_SEED_SAFETY: ${safety.reasons.join('; ')}`);

  try {
    report.base_seed = await seedBaseMasterData(report);
    report.base_execution_projection = await rebuildBaseExecutionProjection();
    report.command_results.push(run(process.execPath, ['scripts/mes-phase10-reset-seed-verify.mjs', '--seed'], 'Apply canonical two-line MES dataset', {
      MES_ENV: envName,
      ALLOW_DESTRUCTIVE_SEED: 'true',
      MES_MASTER_DATA_DATABASE_URL: masterUrl,
      MES_EXECUTION_DATABASE_URL: executionUrl,
      MES_TRACEABILITY_DATABASE_URL: traceabilityUrl,
      MES_CANONICAL_TARGET_DATE: targetDate,
      E2E_WO_TARGET_DATE: targetDate,
      ARTIFACT_DIR: artifactDir,
      MES_SEED_VERIFICATION_ARTIFACT: path.join(artifactDir, 'phase10-seed-result.json'),
    }));
    report.print_station_seed = await seedCanonicalPrintStationBindings();
    report.kiosk_demo_terminal = await seedKioskDemoTerminalContext();
    report.traceability_seed = await seedTraceabilityCanonicalDataset();
    report.counts = await countCanonicalRows();
    report.success = true;
    report.completed_at = new Date().toISOString();
    await writeArtifact('seed-result.json', report);
    console.log(json(report));
  } catch (error) {
    report.error = error.message;
    if (error.commandResult) report.command_results.push(error.commandResult);
    report.completed_at = new Date().toISOString();
    await writeArtifact('seed-result.json', report);
    throw error;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
