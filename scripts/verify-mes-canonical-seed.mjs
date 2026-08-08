#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const runId = process.env.MES_CANONICAL_RUN_ID || new Date().toISOString().replaceAll(/[:.]/g, '-');
const artifactDir = path.resolve(process.env.ARTIFACT_DIR || `artifacts/mes-canonical-reset/${runId}`);
const masterUrl = process.env.MES_MASTER_DATA_DATABASE_URL || 'postgresql://mes_master_data_user:mes_master_data_pass@localhost:15434/mes_master_data_db';
const executionUrl = process.env.MES_EXECUTION_DATABASE_URL || 'postgresql://mes_execution_user:mes_execution_pass@localhost:15435/mes_execution_db';
const traceabilityUrl = process.env.MES_TRACEABILITY_DATABASE_URL || 'postgresql://traceability_user:traceability_pass@localhost:15436/mes_traceability_db';
const kioskGatewayUrl = process.env.MES_KIOSK_GATEWAY_DATABASE_URL || 'postgresql://mes_kiosk_user:mes_kiosk_pass@localhost:15437/mes_kiosk_gateway_db';
const namespace = 'WST-SEED';
const workerSkillCodes = "'SK-EMP-MIX-MASTER','SK-EMP-VULCAN-OPERATOR','SK-EMP-INSPECTION'";
const json = (value) => JSON.stringify(value, null, 2);

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

async function writeArtifact(name, value) {
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(path.join(artifactDir, name), json(value));
}

async function query(client, text, params = []) {
  return client.query(text, params);
}

async function main() {
  const master = new pg.Client({ connectionString: masterUrl });
  const execution = new pg.Client({ connectionString: executionUrl });
  const traceability = new pg.Client({ connectionString: traceabilityUrl });
  const gateway = new pg.Client({ connectionString: kioskGatewayUrl });
  await master.connect(); await execution.connect(); await traceability.connect(); await gateway.connect();
  const checks = [];
  const report = { success: false, generated_at: new Date().toISOString(), target_date: targetDate, read_only: true, checks };
  try {
    const masterCounts = (await query(master, `
      SELECT
        (SELECT COUNT(*)::int FROM md_site WHERE code='SITE-KZ3' AND lifecycle_status='Released') AS site_kz3,
        (SELECT COUNT(*)::int FROM md_production_area WHERE lifecycle_status='Released') AS released_areas,
        (SELECT COUNT(*)::int FROM md_uom WHERE code='PCS' AND lifecycle_status='Released') AS pcs_uom,
        (SELECT COUNT(*)::int FROM md_shift WHERE code='SHIFT-A' AND lifecycle_status='Released') AS shift_a,
        (SELECT COUNT(*)::int FROM md_reason_code WHERE code='KIOSK-DEMO-EXECUTION-FAIL' AND reason_type='ExecutionFailure' AND lifecycle_status='Released') AS kiosk_execution_failure_reasons,
        (SELECT COUNT(*)::int FROM md_reason_code WHERE code='KIOSK-DEMO-ABORT' AND reason_type='Abort' AND lifecycle_status='Released') AS kiosk_abort_reasons,
        (SELECT COUNT(*)::int FROM md_production_line WHERE code LIKE '${namespace}-%' AND lifecycle_status='Released') AS canonical_lines,
        (SELECT COUNT(*)::int FROM md_work_center WHERE code LIKE '${namespace}-%' AND lifecycle_status='Released') AS canonical_work_centers,
        (SELECT COUNT(*)::int FROM md_workstation WHERE code LIKE '${namespace}-%' AND lifecycle_status='Released') AS canonical_workstations,
        (SELECT COUNT(*)::int FROM md_equipment WHERE code LIKE '${namespace}-%' AND lifecycle_status='Released') AS canonical_equipment,
        (SELECT COUNT(*)::int FROM md_machine_unit WHERE code LIKE '${namespace}-%' AND physical_identity_status='Identified') AS canonical_machine_units,
        (SELECT COUNT(*)::int FROM md_resource_assignment WHERE code LIKE '${namespace}-%' AND lifecycle_status='Released') AS canonical_assignments,
        (SELECT COUNT(*)::int FROM md_resource_capability WHERE code LIKE '${namespace}-%' AND lifecycle_status='Released') AS canonical_capabilities,
        (SELECT COUNT(*)::int FROM md_resource_calendar WHERE code LIKE '${namespace}-%' AND lifecycle_status='Released' AND availability_status='Available' AND calendar_date=$1::date) AS canonical_calendars,
        (SELECT COUNT(*)::int FROM md_resource_calendar WHERE code NOT LIKE '${namespace}-%' AND lifecycle_status='Released' AND availability_status='Available' AND calendar_date=$1::date) AS base_calendars,
        (SELECT COUNT(*)::int FROM md_operation WHERE code LIKE '${namespace}-%' AND lifecycle_status='Released') AS canonical_operations,
        (SELECT COUNT(*)::int FROM md_routing_operation WHERE code LIKE '${namespace}-%' AND lifecycle_status='Released') AS canonical_routing_operations,
        (SELECT COUNT(*)::int FROM md_production_version WHERE code='${namespace}-PV-SEAL-ASM-01' AND lifecycle_status='Released') AS canonical_production_version,
        (SELECT COUNT(*)::int FROM md_production_version WHERE code LIKE 'WST-UAT-PV-%' AND lifecycle_status='Released') AS uat_production_versions,
        (SELECT COUNT(*)::int FROM md_production_version_line_eligibility e JOIN md_production_version pv ON pv.master_id=e.production_version_id WHERE pv.code LIKE 'WST-UAT-PV-%' AND e.active_flag=TRUE) AS uat_line_eligibilities,
        (SELECT COUNT(*)::int FROM md_production_version_line_eligibility e JOIN md_production_version pv ON pv.master_id=e.production_version_id WHERE pv.code='${namespace}-PV-SEAL-ASM-01' AND e.active_flag=TRUE) AS canonical_line_eligibilities,
        (SELECT COUNT(*)::int FROM md_production_version_line_eligibility e JOIN md_production_version pv ON pv.master_id=e.production_version_id WHERE pv.code='${namespace}-PV-SEAL-ASM-01' AND e.is_primary=TRUE AND e.active_flag=TRUE) AS canonical_primary_lines,
        (SELECT COUNT(*)::int FROM md_skill WHERE code IN (${workerSkillCodes}) AND scope='Employee' AND lifecycle_status='Released') AS worker_skills,
        (SELECT COUNT(*)::int FROM md_employee WHERE code IN ('EMP-MIX-001','EMP-VULCAN-001','EMP-VULCAN-002','EMP-QC-001') AND lifecycle_status='Released' AND employee_status='Active') AS workers,
        (SELECT COUNT(*)::int FROM md_employee_skill es JOIN md_employee e ON e.master_id=es.employee_id JOIN md_skill s ON s.master_id=es.skill_id WHERE e.code IN ('EMP-MIX-001','EMP-VULCAN-001','EMP-VULCAN-002','EMP-QC-001') AND s.scope='Employee' AND es.active_flag=TRUE AND es.effective_to IS NULL AND es.qualification_status='Active') AS worker_skill_assignments,
        (SELECT COUNT(*)::int FROM md_employee_shift_schedule sch JOIN md_employee e ON e.master_id=sch.employee_id WHERE e.code IN ('EMP-MIX-001','EMP-VULCAN-001','EMP-VULCAN-002','EMP-QC-001') AND sch.schedule_date=$1::date AND sch.schedule_status='Scheduled') AS worker_shift_schedules,
        (SELECT COUNT(*)::int FROM md_operation_skill_requirement r JOIN md_routing_operation ro ON ro.master_id=r.routing_operation_id JOIN md_routing_header rh ON rh.master_id=ro.routing_header_id JOIN md_production_version pv ON pv.routing_header_id=rh.master_id JOIN md_skill s ON s.master_id=r.skill_id WHERE pv.code='PV-FG-WS-CM01-R1' AND s.scope='Employee' AND r.lifecycle_status='Released' AND r.active_flag=TRUE AND r.effective_to IS NULL) AS base_operation_skill_requirements
    `, [targetDate])).rows[0];
    const integrity = (await query(master, `
      SELECT
        (SELECT COUNT(*)::int FROM md_production_line_work_center lwc LEFT JOIN md_production_line pl ON pl.master_id=lwc.production_line_id LEFT JOIN md_work_center wc ON wc.master_id=lwc.work_center_id WHERE (pl.code LIKE '${namespace}-%' OR wc.code LIKE '${namespace}-%') AND (pl.master_id IS NULL OR wc.master_id IS NULL)) AS line_work_center_orphans,
        (SELECT COUNT(*)::int FROM md_resource_assignment ra LEFT JOIN md_work_center wc ON wc.master_id=ra.work_center_id LEFT JOIN md_workstation ws ON ws.master_id=ra.workstation_id LEFT JOIN md_equipment eq ON eq.master_id=ra.equipment_id WHERE ra.code LIKE '${namespace}-%' AND (wc.master_id IS NULL OR ws.master_id IS NULL OR eq.master_id IS NULL)) AS assignment_orphans,
        (SELECT COUNT(*)::int FROM md_production_version pv LEFT JOIN md_item_revision ir ON ir.master_id=pv.item_revision_id LEFT JOIN md_mbom_header mb ON mb.master_id=pv.mbom_header_id LEFT JOIN md_routing_header rh ON rh.master_id=pv.routing_header_id WHERE pv.code='${namespace}-PV-SEAL-ASM-01' AND (ir.master_id IS NULL OR mb.master_id IS NULL OR rh.master_id IS NULL)) AS pv_orphans,
        (SELECT COUNT(*)::int FROM md_resource_assignment a JOIN md_resource_assignment b ON a.master_id < b.master_id AND a.equipment_id=b.equipment_id AND a.lifecycle_status='Released' AND b.lifecycle_status='Released' AND a.effective_from < COALESCE(b.effective_to, 'infinity') AND b.effective_from < COALESCE(a.effective_to, 'infinity') WHERE a.code LIKE '${namespace}-%' AND b.code LIKE '${namespace}-%') AS overlapping_assignments
    `)).rows[0];
    const executionCounts = (await query(execution, `
      SELECT
        (SELECT COUNT(*)::int FROM wo_header) AS work_orders,
        (SELECT COUNT(*)::int FROM rm_production_version WHERE code='${namespace}-PV-SEAL-ASM-01' AND lifecycle_status='Released') AS rm_production_version,
        (SELECT COUNT(*)::int FROM rm_production_version WHERE code LIKE 'WST-UAT-PV-%' AND lifecycle_status='Released') AS rm_uat_production_versions,
        (SELECT COUNT(*)::int FROM rm_production_version_line_eligibility e JOIN rm_production_version pv ON pv.master_id=e.production_version_id WHERE pv.code LIKE 'WST-UAT-PV-%' AND e.active_flag=TRUE) AS rm_uat_line_eligibilities,
        (SELECT COUNT(*)::int FROM rm_production_line WHERE code LIKE '${namespace}-%' AND lifecycle_status='Released') AS rm_lines,
        (SELECT COUNT(*)::int FROM rm_production_version_line_eligibility e JOIN rm_production_version pv ON pv.master_id=e.production_version_id WHERE pv.code='${namespace}-PV-SEAL-ASM-01' AND e.active_flag=TRUE) AS rm_line_eligibilities,
        (SELECT COUNT(*)::int FROM rm_resource_calendar WHERE available_from::date <= $1::date AND available_to::date >= $1::date) AS rm_target_calendars,
        (SELECT COUNT(*)::int FROM rm_skill WHERE code IN (${workerSkillCodes}) AND lifecycle_status='Released') AS rm_worker_skills,
        (SELECT COUNT(*)::int FROM rm_employee WHERE code IN ('EMP-MIX-001','EMP-VULCAN-001','EMP-VULCAN-002','EMP-QC-001') AND lifecycle_status='Released' AND employee_status='Active') AS rm_workers,
        (SELECT COUNT(*)::int FROM rm_employee_skill es JOIN rm_employee e ON e.master_id=es.employee_id WHERE e.code IN ('EMP-MIX-001','EMP-VULCAN-001','EMP-VULCAN-002','EMP-QC-001')) AS rm_worker_skill_assignments,
        (SELECT COUNT(*)::int FROM rm_employee_shift_schedule sch JOIN rm_employee e ON e.master_id=sch.employee_id WHERE e.code IN ('EMP-MIX-001','EMP-VULCAN-001','EMP-VULCAN-002','EMP-QC-001') AND sch.schedule_date=$1::date AND sch.schedule_status='Scheduled') AS rm_worker_shift_schedules,
        (SELECT COUNT(*)::int FROM rm_operation_skill_requirement r JOIN rm_routing_operation ro ON ro.operation_id=r.operation_id JOIN rm_routing_header rh ON rh.master_id=ro.routing_header_id JOIN rm_production_version pv ON pv.routing_header_id=rh.master_id WHERE pv.code='PV-FG-WS-CM01-R1') AS rm_base_operation_skill_requirements,
        (
          SELECT COUNT(*)::int
          FROM rm_operation_skill_requirement r
          JOIN rm_routing_operation ro ON ro.operation_id=r.operation_id
          JOIN rm_routing_header rh ON rh.master_id=ro.routing_header_id
          JOIN rm_production_version pv ON pv.routing_header_id=rh.master_id
          WHERE pv.code='PV-FG-WS-CM01-R1'
            AND r.mandatory_flag=TRUE
            AND (
              SELECT COUNT(*)::int
              FROM rm_employee e
              JOIN rm_employee_skill es ON es.employee_id=e.master_id AND es.skill_id=r.skill_id
              JOIN rm_employee_shift_schedule sch ON sch.employee_id=e.master_id
              WHERE e.employee_status='Active'
                AND sch.schedule_date=$1::date
                AND sch.schedule_status='Scheduled'
            ) < r.required_persons
        ) AS rm_labor_candidate_gaps
    `, [targetDate])).rows[0];
    const traceabilityCounts = (await query(traceability, `
      SELECT
        (SELECT COUNT(*)::int FROM md_label_template WHERE template_code LIKE '${namespace}-%') AS templates,
        (SELECT COUNT(*)::int FROM md_numbering_rule WHERE rule_code LIKE '${namespace}-%') AS numbering_rules,
        (SELECT COUNT(*)::int FROM md_qr_split_rule WHERE rule_code LIKE '${namespace}-%') AS split_rules,
        (SELECT COUNT(*)::int FROM md_traceability_policy WHERE operation_code LIKE '${namespace}-%') AS policies,
        (SELECT COUNT(*)::int FROM label_instance) AS labels
    `)).rows[0];
    const canonicalTerminalContext = (await query(master, `
      SELECT s.master_id::text AS site_id,wc.master_id::text AS work_center_id
      FROM md_site s JOIN md_work_center wc ON wc.site_id=s.master_id
      WHERE s.code='SITE-KZ3' AND wc.code='WST-SEED-WC-L1-BINDING'
      LIMIT 1
    `)).rows[0];
    const gatewayCounts = (await query(gateway, `
      SELECT
        COUNT(*) FILTER (WHERE terminal_code='KIOSK-DEMO-01' AND site_id=$1 AND work_center_id=$2)::int AS canonical_demo_terminals,
        (SELECT COUNT(*)::int FROM terminal_session WHERE status='ACTIVE') AS active_terminal_sessions
      FROM terminal
    `, [canonicalTerminalContext?.site_id, canonicalTerminalContext?.work_center_id])).rows[0];

    const expect = (name, actual, predicate, details = {}) => {
      const passed = predicate(Number(actual));
      checks.push({ name, passed, actual: Number(actual), ...details });
      if (!passed) report.success = false;
    };
    report.success = true;
    expect('released SITE-KZ3 exists', masterCounts.site_kz3, (v) => v === 1);
    expect('released areas exist', masterCounts.released_areas, (v) => v >= 1);
    expect('PCS UOM exists', masterCounts.pcs_uom, (v) => v === 1);
    expect('SHIFT-A exists', masterCounts.shift_a, (v) => v === 1);
    expect('Kiosk execution failure reason exists', masterCounts.kiosk_execution_failure_reasons, (v) => v === 1);
    expect('Kiosk abort reason exists', masterCounts.kiosk_abort_reasons, (v) => v === 1);
    expect('canonical two production lines', masterCounts.canonical_lines, (v) => v === 2);
    expect('canonical eight work centers', masterCounts.canonical_work_centers, (v) => v === 8);
    expect('canonical nine workstations including Primary alternative', masterCounts.canonical_workstations, (v) => v === 9);
    expect('canonical nine equipment definitions including Primary alternative', masterCounts.canonical_equipment, (v) => v === 9);
    expect('canonical nine identified machine units including Primary alternative', masterCounts.canonical_machine_units, (v) => v === 9);
    expect('canonical nine assignments including Primary alternative', masterCounts.canonical_assignments, (v) => v === 9);
    expect('canonical thirteen capabilities', masterCounts.canonical_capabilities, (v) => v === 13);
    expect('canonical calendars ready on target date', masterCounts.canonical_calendars, (v) => v === 9);
    expect('base calendars ready on target date', masterCounts.base_calendars, (v) => v >= 8);
    expect('canonical six operations', masterCounts.canonical_operations, (v) => v === 6);
    expect('canonical twelve routing operations', masterCounts.canonical_routing_operations, (v) => v === 12);
    expect('canonical production version', masterCounts.canonical_production_version, (v) => v === 1);
    expect('three UAT production versions', masterCounts.uat_production_versions, (v) => v === 3);
    expect('six UAT line eligibilities', masterCounts.uat_line_eligibilities, (v) => v === 6);
    expect('canonical line eligibility count', masterCounts.canonical_line_eligibilities, (v) => v === 2);
    expect('exactly one primary line', masterCounts.canonical_primary_lines, (v) => v === 1);
    expect('base worker skills exist', masterCounts.worker_skills, (v) => v === 3);
    expect('base active workers exist', masterCounts.workers, (v) => v === 4);
    expect('base worker skill assignments exist', masterCounts.worker_skill_assignments, (v) => v === 4);
    expect('base worker shift schedules exist on target date', masterCounts.worker_shift_schedules, (v) => v === 4);
    expect('base operation skill requirements exist', masterCounts.base_operation_skill_requirements, (v) => v === 3);
    for (const [name, value] of Object.entries(integrity)) expect(`integrity ${name}`, value, (v) => v === 0);
    expect('execution has no work orders after seed', executionCounts.work_orders, (v) => v === 0);
    expect('execution read model has canonical PV', executionCounts.rm_production_version, (v) => v === 1);
    expect('execution read model has three UAT PVs', executionCounts.rm_uat_production_versions, (v) => v === 3);
    expect('execution read model has six UAT line eligibilities', executionCounts.rm_uat_line_eligibilities, (v) => v === 6);
    expect('execution read model has two lines', executionCounts.rm_lines, (v) => v === 2);
    expect('execution read model has two line eligibilities', executionCounts.rm_line_eligibilities, (v) => v === 2);
    expect('execution read model calendars cover target date', executionCounts.rm_target_calendars, (v) => v >= 16);
    expect('execution read model has worker skills', executionCounts.rm_worker_skills, (v) => v === 3);
    expect('execution read model has workers', executionCounts.rm_workers, (v) => v === 4);
    expect('execution read model has worker skill assignments', executionCounts.rm_worker_skill_assignments, (v) => v === 4);
    expect('execution read model has worker shift schedules on target date', executionCounts.rm_worker_shift_schedules, (v) => v === 4);
    expect('execution read model has base operation skill requirements', executionCounts.rm_base_operation_skill_requirements, (v) => v === 3);
    expect('execution labor readiness has no worker candidate gaps', executionCounts.rm_labor_candidate_gaps, (v) => v === 0);
    expect('traceability has one canonical template', traceabilityCounts.templates, (v) => v === 1);
    expect('traceability has one numbering rule', traceabilityCounts.numbering_rules, (v) => v === 1);
    expect('traceability has one split rule', traceabilityCounts.split_rules, (v) => v === 1);
    expect('traceability has four policies', traceabilityCounts.policies, (v) => v === 4);
    expect('KIOSK-DEMO-01 canonical terminal context', gatewayCounts.canonical_demo_terminals, (v) => v === 1);
    expect('canonical seed has no active terminal sessions', gatewayCounts.active_terminal_sessions, (v) => v === 0);

    report.counts = { master: masterCounts, execution: executionCounts, traceability: traceabilityCounts, gateway: gatewayCounts, integrity };
    report.completed_at = new Date().toISOString();
    await writeArtifact('verification-result.json', report);
    console.log(json(report));
    if (!report.success) process.exitCode = 1;
  } catch (error) {
    report.error = error.message;
    report.completed_at = new Date().toISOString();
    await writeArtifact('verification-result.json', report);
    throw error;
  } finally {
    await master.end(); await execution.end(); await traceability.end(); await gateway.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
