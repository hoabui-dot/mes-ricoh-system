#!/usr/bin/env node

/*
 * Seeds one complete, owned MES Work Order master-data scenario. The reset is
 * deliberately prefix-scoped so shared factory master data remains intact.
 * Transactional WO cleanup is handled by reset-mes-wo-test-data.mjs.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import pg from 'pg';

const { Client } = pg;
const masterUrl = process.env.MES_MASTER_DATA_DATABASE_URL || 'postgresql://mes_master_data_user:mes_master_data_pass@localhost:15434/mes_master_data_db';
const executionUrl = process.env.MES_EXECUTION_DATABASE_URL || 'postgresql://mes_execution_user:mes_execution_pass@localhost:15435/mes_execution_db';
const traceabilityUrl = process.env.MES_TRACEABILITY_DATABASE_URL || 'postgresql://traceability_user:traceability_pass@localhost:15436/mes_traceability_db';
const masterBase = (process.env.MES_MASTER_DATA_URL || 'http://localhost:13020/api/mes/master-data').replace(/\/$/, '');
const executionBase = (process.env.MES_EXECUTION_URL || 'http://localhost:13030/api/mes/execution').replace(/\/$/, '');
const wmsInventoryUrl = process.env.WMS_INVENTORY_DATABASE_URL || process.env.WMS_INVENTORY_URL || 'postgresql://wms_inventory_owner:wms_inventory_owner_pass@localhost:15439/wms_inventory_db';
const userId = process.env.MES_SEED_USER_ID || '00000000-0000-0000-0000-000000000001';
const roleCode = process.env.MES_SEED_ROLE_CODE || 'PLANT_MANAGER';
const traceId = `seed-complete-mes-wo-${Date.now()}`;
const mode = process.argv.includes('--seed') ? 'seed' : 'dry-run';
const envName = String(process.env.MES_ENV || '').trim().toLowerCase();
const artifactDir = path.resolve(process.env.ARTIFACT_DIR || `artifacts/mes-reset-seed-verify/${new Date().toISOString().replaceAll(/[:.]/g, '-')}`);
const master = new Client({ connectionString: masterUrl });
const execution = new Client({ connectionString: executionUrl });
const traceability = new Client({ connectionString: traceabilityUrl });
const names = {
  item: 'E2E-WO-FG-01',
  component: 'SFG-MET-CM01-R1',
  routing: 'E2E-WO-ROUTING-01',
  mbom: 'E2E-WO-MBOM-01',
  pvNameVi: 'Cấu hình E2E WO in nhãn',
  operationPrefix: 'E2E-WO-OP-',
};

function defaultPlanningDate() {
  const date = new Date();
  const day = date.getUTCDay();
  if (day === 6) date.setUTCDate(date.getUTCDate() + 2);
  if (day === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
const ownedOperationNames = ['Chuẩn bị', 'In nhãn vật lý', 'Xác nhận chất lượng'];
const headers = { 'Content-Type': 'application/json', 'X-User-ID': userId, 'X-Role-Code': roleCode, 'X-Trace-ID': traceId };
const json = (value) => JSON.stringify(value, null, 2);
const writeJson = (name, value) => fs.writeFile(path.join(artifactDir, name), json(value));

function safety() {
  const masterIdentity = new URL(masterUrl);
  const executionIdentity = new URL(executionUrl);
  const traceabilityIdentity = new URL(traceabilityUrl);
  const reasons = [];
  if (!['development', 'local', 'test', 'staging'].includes(envName)) reasons.push('MES_ENV must be development, local, test, or staging');
  if (!['localhost', '127.0.0.1', '::1'].includes(masterIdentity.hostname) || !['localhost', '127.0.0.1', '::1'].includes(executionIdentity.hostname)) reasons.push('seed database hosts must be local/test hosts');
  if (!['localhost', '127.0.0.1', '::1'].includes(traceabilityIdentity.hostname)) reasons.push('traceability database host must be local/test host');
  if (mode === 'seed' && process.env.CONFIRM_MASTER_DATA_RESET !== 'YES_RESET_E2E_MASTER_DATA') reasons.push('CONFIRM_MASTER_DATA_RESET must equal YES_RESET_E2E_MASTER_DATA');
  return { passed: reasons.length === 0, mode, environment: envName || null, reasons, master: { host: masterIdentity.hostname, port: masterIdentity.port, database: masterIdentity.pathname.slice(1), user: masterIdentity.username }, execution: { host: executionIdentity.hostname, port: executionIdentity.port, database: executionIdentity.pathname.slice(1), user: executionIdentity.username }, traceability: { host: traceabilityIdentity.hostname, port: traceabilityIdentity.port, database: traceabilityIdentity.pathname.slice(1), user: traceabilityIdentity.username } };
}

async function api(pathname, options = {}, allowed = []) {
  const response = await fetch(`${masterBase}${pathname}`, { ...options, headers: { ...headers, ...(options.headers || {}) }, cache: 'no-store' });
  const text = await response.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!response.ok && !allowed.includes(response.status)) throw new Error(`${pathname} HTTP ${response.status}: ${typeof body === 'string' ? body : body.error || body.message || JSON.stringify(body)}`);
  return { status: response.status, body };
}

async function data(pathname, options = {}) {
  const result = await api(pathname, options);
  return result.body?.data ?? result.body;
}

async function executionApi(pathname, options = {}, allowed = []) {
  const response = await fetch(`${executionBase}${pathname}`, { ...options, headers: { ...headers, ...(options.headers || {}) }, cache: 'no-store' });
  const text = await response.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!response.ok && !allowed.includes(response.status)) throw new Error(`${pathname} HTTP ${response.status}: ${typeof body === 'string' ? body : body.error || body.message || JSON.stringify(body)}`);
  return { status: response.status, body };
}

async function getContext() {
  const [sites, workCenters, workstations, uoms, revisions, materialGroups, productionLines] = await Promise.all([
    data('/sites?limit=500'), data('/work-centers?limit=500'), data('/workstations?limit=500'), data('/uoms?limit=500'), data('/item-revisions?limit=500'), data('/material-groups?limit=500'), data('/production-lines?limit=500'),
  ]);
  const site = sites.find((row) => row.code === (process.env.E2E_SITE_CODE || 'SITE-KZ3') && row.lifecycle_status === 'Released');
  if (!site) throw new Error('SEED_MASTER_DATA: released SITE-KZ3 is required');
  const workstation = workstations.find((row) => row.code === (process.env.E2E_WORKSTATION_CODE || 'WS-20260727-0006') && row.lifecycle_status === 'Released' && row.active_flag !== false);
  if (!workstation) throw new Error('SEED_MASTER_DATA: released physical-print workstation is required');
  const workCenter = workCenters.find((row) => row.master_id === workstation.work_center_id) || workCenters.find((row) => row.code === 'WC-MIXING');
  const pcs = uoms.find((row) => row.code === 'PCS' && row.lifecycle_status === 'Released');
  const materialGroup = materialGroups.find((row) => row.code === 'FG_RUBBER_METAL' && row.lifecycle_status === 'Released')
    || materialGroups.find((row) => row.lifecycle_status === 'Released');
  const coveredLines = (await master.query(`
    SELECT pl.master_id, pl.code, pl.name, pl.site_id, pl.lifecycle_status, pl.active_flag
    FROM md_production_line pl
    JOIN md_production_line_work_center lwc ON lwc.production_line_id = pl.master_id
    WHERE lwc.work_center_id = $1
      AND lwc.active_flag = TRUE
      AND (lwc.effective_to IS NULL OR lwc.effective_to > NOW())
      AND pl.lifecycle_status = 'Released'
      AND pl.active_flag = TRUE
    ORDER BY pl.code`, [workCenter.master_id])).rows;
  const productionLine = coveredLines.find((row) => row.code === 'LINE-BASE-1')
    || coveredLines.find((row) => productionLines.some((candidate) => candidate.master_id === row.master_id && Number(candidate.active_eligibility_count || 0) > 0))
    || coveredLines[0];
  const componentCandidate = revisions.find((row) => row.revision_code === names.component || row.code === names.component);
  const component = componentCandidate && (await master.query(`SELECT r.*, i.code AS item_code, i.lifecycle_status AS item_lifecycle_status FROM md_item_revision r JOIN md_item i ON i.master_id=r.item_id WHERE r.master_id=$1 AND r.lifecycle_status='Released' AND i.lifecycle_status='Released' AND r.effective_from <= NOW() AND (r.effective_to IS NULL OR r.effective_to > NOW())`, [componentCandidate.master_id])).rows[0];
  if (!workCenter || !pcs || !materialGroup || !productionLine || !component) throw new Error('SEED_MASTER_DATA: active released work center, PCS UOM, material group, production line, and effective released component revision are required');
  return { site, workstation, workCenter, pcs, materialGroup, productionLine, component };
}

async function cleanupOwned() {
  const result = {};
  // Only the E2E fixture identified below is disposable. Shared factory
  // master data, users, roles, migrations, and historical records remain.
  const owned = {
    routeCodes: [], routeIds: [], mbomCodes: [], mbomIds: [], pvCodes: [], pvIds: [],
    itemCodes: [], itemIds: [], itemRevisionIds: [], operationIds: [],
  };
  // Only the explicitly owned E2E fixture is disposable. Shared Released
  // master data and unrelated historical/demo records are never targeted.
  const routes = await master.query(`SELECT master_id, code FROM md_routing_header WHERE code LIKE 'E2E-WO-%'`);
  const mboms = await master.query(`SELECT master_id, code FROM md_mbom_header WHERE code LIKE 'E2E-WO-%'`);
  const items = await master.query(`SELECT master_id, code FROM md_item WHERE code = $1`, [names.item]);
  const revisions = await master.query(`SELECT r.master_id, r.code FROM md_item_revision r JOIN md_item i ON i.master_id=r.item_id WHERE i.code = $1`, [names.item]);
  const pvs = await master.query(`SELECT pv.master_id, pv.code
    FROM md_production_version pv
    LEFT JOIN md_item_revision r ON r.master_id=pv.item_revision_id
    LEFT JOIN md_item i ON i.master_id=r.item_id
    WHERE i.code = $1
       OR pv.mbom_header_id = ANY($2::uuid[])
       OR pv.routing_header_id = ANY($3::uuid[])`, [names.item, mboms.rows.map((row) => row.master_id), routes.rows.map((row) => row.master_id)]);
  const operations = await master.query(`SELECT master_id FROM md_operation WHERE code LIKE $1`, [`${names.operationPrefix}%`]);
  owned.routeCodes = routes.rows.map((row) => row.code); owned.routeIds = routes.rows.map((row) => row.master_id);
  owned.mbomCodes = mboms.rows.map((row) => row.code); owned.mbomIds = mboms.rows.map((row) => row.master_id);
  owned.pvCodes = pvs.rows.map((row) => row.code); owned.pvIds = pvs.rows.map((row) => row.master_id);
  owned.itemCodes = items.rows.map((row) => row.code); owned.itemIds = items.rows.map((row) => row.master_id);
  owned.itemRevisionIds = revisions.rows.map((row) => row.master_id);
  owned.operationIds = operations.rows.map((row) => row.master_id);
  await master.query('BEGIN');
  try {
    await master.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
    const opList = owned.operationIds;
    const routeList = owned.routeIds;
    const mbomList = owned.mbomIds;
    const statements = [
      ['workstation_capabilities', `DELETE FROM md_workstation_operation_capability WHERE operation_id=ANY($1::uuid[])`, opList],
      ['resource_capabilities', `DELETE FROM md_resource_capability WHERE operation_id=ANY($1::uuid[])`, opList],
      ['operation_skills', `DELETE FROM md_operation_skill_requirement WHERE operation_id=ANY($1::uuid[])`, opList],
      ['production_standards', `DELETE FROM md_production_standard WHERE operation_id=ANY($1::uuid[]) OR routing_operation_id IN (SELECT master_id FROM md_routing_operation WHERE routing_header_id=ANY($1::uuid[]))`, routeList],
      ['production_version_line_eligibility', `DELETE FROM md_production_version_line_eligibility WHERE production_version_id=ANY($1::uuid[])`, owned.pvIds],
      ['production_versions', `DELETE FROM md_production_version WHERE master_id=ANY($1::uuid[])`, owned.pvIds],
      ['mbom_lines', `DELETE FROM md_mbom_line WHERE mbom_header_id=ANY($1::uuid[])`, mbomList],
      ['routing_operations', `DELETE FROM md_routing_operation WHERE routing_header_id=ANY($1::uuid[])`, routeList],
      ['component_substitutes', `DELETE FROM md_component_substitute WHERE mbom_line_id IN (SELECT master_id FROM md_mbom_line WHERE mbom_header_id=ANY($1::uuid[]))`, mbomList],
      ['revision_production_standards', `DELETE FROM md_production_standard WHERE item_revision_id=ANY($1::uuid[])`, owned.itemRevisionIds],
      ['item_revision_numbering', `DELETE FROM md_item_revision_numbering WHERE item_id=ANY($1::uuid[])`, owned.itemIds],
      ['routing_headers', `DELETE FROM md_routing_header WHERE master_id=ANY($1::uuid[])`, owned.routeIds],
      ['mbom_headers', `DELETE FROM md_mbom_header WHERE master_id=ANY($1::uuid[])`, owned.mbomIds],
      ['item_revisions', `DELETE FROM md_item_revision WHERE master_id=ANY($1::uuid[])`, owned.itemRevisionIds],
      ['items', `DELETE FROM md_item WHERE master_id=ANY($1::uuid[])`, owned.itemIds],
      ['operations', `DELETE FROM md_operation WHERE master_id=ANY($1::uuid[]) AND NOT EXISTS (SELECT 1 FROM md_routing_operation WHERE operation_id=md_operation.master_id)`, opList],
      ['outbox_events', `DELETE FROM outbox_events WHERE payload::text LIKE ANY($1::text[])`, [`%${names.item}%`, `%${names.routing}%`, `%${names.mbom}%`, `%${names.pvNameVi}%`]],
    ];
    for (const [name, query, value] of statements) {
      const params = value === null ? [] : Array.isArray(value) ? [value] : [value];
      result[name] = Number((await master.query(query, params)).rowCount || 0);
    }
    await master.query('COMMIT');
  } catch (error) {
    await master.query('ROLLBACK');
    throw new Error(`SEED_MASTER_DATA_CLEANUP: ${error.message}`);
  }
  await execution.query('BEGIN');
  try {
    for (const [name, query] of [
      ['routing_operations', `DELETE FROM rm_routing_operation WHERE routing_header_id=ANY($1::uuid[])`],
      ['routing_headers', `DELETE FROM rm_routing_header WHERE master_id=ANY($1::uuid[])`],
      ['production_versions', `DELETE FROM rm_production_version WHERE master_id=ANY($1::uuid[])`],
      ['mbom_lines', `DELETE FROM rm_mbom_line WHERE mbom_header_id=ANY($1::uuid[])`],
      ['mbom_headers', `DELETE FROM rm_mbom_header WHERE master_id=ANY($1::uuid[])`],
      ['item_revisions', `DELETE FROM rm_item_revision WHERE master_id=ANY($1::uuid[])`],
    ]) {
      const values = name === 'routing_operations' || name === 'routing_headers' ? owned.routeIds : name === 'production_versions' ? owned.pvIds : name === 'mbom_lines' || name === 'mbom_headers' ? owned.mbomIds : owned.itemRevisionIds;
      const params = [values.length ? values : ['00000000-0000-0000-0000-000000000000']];
      try { result[`execution_${name}`] = Number((await execution.query(query, params)).rowCount || 0); } catch (error) { result[`execution_${name}`] = `ERROR: ${error.message}`; }
    }
    // Older runs predate the manifest cleanup and their master rows are gone,
    // so their UUIDs cannot be discovered from MES master data anymore. Clean
    // those deterministic development projection keys by business code too.
    for (const [name, query] of [
      ['legacy_routing_operations', `DELETE FROM rm_routing_operation WHERE routing_header_id IN (SELECT master_id FROM rm_routing_header WHERE code LIKE 'RT-20260727-%')`],
      ['legacy_routing_headers', `DELETE FROM rm_routing_header WHERE code LIKE 'RT-20260727-%'`],
      ['legacy_production_versions', `DELETE FROM rm_production_version WHERE code LIKE 'PV-20260727-%' OR code LIKE 'PV-E2E-%' OR code LIKE 'PV-FG-WS-%'`],
      ['legacy_mbom_lines', `DELETE FROM rm_mbom_line WHERE mbom_header_id IN (SELECT master_id FROM rm_mbom_header WHERE code='E2E-WO-MBOM-01')`],
      ['legacy_mbom_headers', `DELETE FROM rm_mbom_header WHERE code='E2E-WO-MBOM-01'`],
      ['legacy_item_revisions', `DELETE FROM rm_item_revision WHERE code LIKE 'E2E-WO-%' OR revision_code LIKE 'E2E-WO-%'`],
    ]) {
      result[`execution_${name}`] = Number((await execution.query(query)).rowCount || 0);
    }
    await execution.query('COMMIT');
  } catch (error) { await execution.query('ROLLBACK'); throw new Error(`SEED_EXECUTION_PROJECTION_CLEANUP: ${error.message}`); }
  return result;
}

function runCommand(command, args, label, extraEnv = {}) {
  console.log(`[Seed] ${label}`);
  execFileSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
}

async function cleanupWorkOrderSnapshots() {
  // The reusable reset script owns the dependency graph for WO snapshots,
  // execution sessions, print history, allocations, and event artifacts.
  // Run it before master-data cleanup so no snapshot can keep a master row
  // referenced and no legacy WO can consume the newly seeded fixture.
  runCommand(
    process.execPath,
    ['scripts/reset-mes-wo-test-data.mjs', '--reset'],
    'Cleaning Work Order headers, snapshots, execution, print, and event artifacts',
    { CONFIRM_DESTRUCTIVE_RESET: 'YES_DELETE_MES_TEST_DATA' },
  );
  return { delegatedTo: 'scripts/reset-mes-wo-test-data.mjs', completed: true };
}

async function cleanupTraceabilityOwned() {
  const result = {};
  await traceability.query('BEGIN');
  try {
    const policies = await traceability.query(`SELECT policy_id, item_revision_id FROM md_traceability_policy WHERE operation_code LIKE 'E2E-WO-OP-%'`);
    const revisionIds = policies.rows.map((row) => row.item_revision_id);
    result.policies = Number((await traceability.query(`DELETE FROM md_traceability_policy WHERE operation_code LIKE 'E2E-WO-OP-%' OR label_template_id IN (SELECT template_id FROM md_label_template WHERE template_code LIKE 'E2E-WO-%') OR numbering_rule_id IN (SELECT rule_id FROM md_numbering_rule WHERE rule_code LIKE 'E2E-WO-%') OR qr_split_rule_id IN (SELECT split_rule_id FROM md_qr_split_rule WHERE rule_code LIKE 'E2E-WO-%')`)).rowCount || 0);
    result.labels = Number((await traceability.query(`DELETE FROM label_instance WHERE item_revision_id=ANY($1::uuid[]) OR created_by_operation LIKE 'E2E-WO-OP-%'`, [revisionIds.length ? revisionIds : ['00000000-0000-0000-0000-000000000000']])).rowCount || 0);
    result.templates = Number((await traceability.query(`DELETE FROM md_label_template WHERE template_code LIKE 'E2E-WO-%'`)).rowCount || 0);
    result.numberingRules = Number((await traceability.query(`DELETE FROM md_numbering_rule WHERE rule_code LIKE 'E2E-WO-%'`)).rowCount || 0);
    result.qrSplitRules = Number((await traceability.query(`DELETE FROM md_qr_split_rule WHERE rule_code LIKE 'E2E-WO-%'`)).rowCount || 0);
    await traceability.query('COMMIT');
  } catch (error) {
    await traceability.query('ROLLBACK');
    throw new Error(`SEED_TRACEABILITY_CLEANUP: ${error.message}`);
  }
  return result;
}

async function seedTraceability(manifest) {
  const templateId = crypto.randomUUID();
  const numberingRuleId = crypto.randomUUID();
  const splitRuleId = crypto.randomUUID();
  const result = { templateCode: 'E2E-WO-LABEL-TEMPLATE-01', policyCount: 0 };
  await traceability.query('BEGIN');
  try {
    await traceability.query(`INSERT INTO md_label_template (template_id,template_code,template_name,static_text,layout_json) VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb)`, [templateId, result.templateCode, JSON.stringify({ vi: 'Nhãn thành phẩm E2E WO', en: 'E2E WO finished-goods label', ja: 'E2E WO完成品ラベル', ko: 'E2E WO 완제품 라벨' }), JSON.stringify({ vi: 'S-Factory', en: 'S-Factory', ja: 'S-Factory', ko: 'S-Factory' }), JSON.stringify({ width: 100, height: 50, fields: ['wo_code', 'item_code', 'quantity', 'printer_code'] })]);
    await traceability.query(`INSERT INTO md_numbering_rule (rule_id,rule_code,prefix,date_format,sequence_length,reset_frequency,site_id) VALUES ($1,'E2E-WO-LABEL-NUMBER','E2E','YYYYMMDD',5,'DAILY',$2)`, [numberingRuleId, manifest.site.master_id]);
    await traceability.query(`INSERT INTO md_qr_split_rule (split_rule_id,rule_code,split_algorithm,default_yield_ratio,target_uom_id,site_id) VALUES ($1,'E2E-WO-LABEL-SPLIT','FIXED_COUNT',1,$2,$3)`, [splitRuleId, manifest.uom.master_id, manifest.site.master_id]);
    for (const operation of manifest.operations) {
      await traceability.query(`INSERT INTO md_traceability_policy (policy_id,item_revision_id,operation_code,tracking_type,numbering_rule_id,qr_split_rule_id,label_template_id,site_id) VALUES (gen_random_uuid(),$1,$2,'LOT',$3,$4,$5,$6)`, [manifest.revision.master_id, operation.code, numberingRuleId, splitRuleId, templateId, manifest.site.master_id]);
      result.policyCount += 1;
    }
    await traceability.query('COMMIT');
  } catch (error) {
    await traceability.query('ROLLBACK');
    throw new Error(`SEED_TRACEABILITY: ${error.message}`);
  }
  return result;
}

async function ensurePrintStation(context) {
  if (process.env.ALLOW_PRINT_STATION_OFFLINE === 'true') {
    return { skipped: true, reason: 'PRINT_STATION_OFFLINE_ALLOWED_FOR_MES_WMS_MATERIAL_FLOW', runtimeMustBeVerified: false };
  }
  const stationCode = process.env.E2E_PRINT_STATION_CODE || 'PRINT-STATION-01';
  const stations = await data('/print-stations?limit=500');
  let station = stations.find((row) => row.code === stationCode);
  const payload = {
    code: stationCode,
    name: { vi: 'Trạm in nhãn E2E WO', en: 'E2E WO Label Print Station', ja: 'E2E WOラベル印刷ステーション', ko: 'E2E WO 라벨 프린트 스테이션' },
    description: { vi: 'Trạm in vật lý dùng cho demo Work Order E2E.', en: 'Physical print station for the E2E Work Order demo.', ja: 'E2E Work Orderデモ用の物理印刷ステーション。', ko: 'E2E Work Order 데모용 물리 프린트 스테이션.' },
    site_id: context.site.master_id,
    gateway_base_url: process.env.PRINT_STATION_GATEWAY_URL || 'http://100.68.50.41:5001',
    deployment_mode: 'PHYSICAL',
    capabilities: ['PRINT'],
  };
  if (!station) station = await data('/print-stations', { method: 'POST', body: JSON.stringify(payload) });
  else {
    if (station.site_id !== context.site.master_id) throw new Error(`SEED_PRINT_STATION: ${stationCode} belongs to another Site`);
    station = await data(`/print-stations/${station.master_id}`, { method: 'PATCH', body: JSON.stringify({ name: payload.name, description: payload.description, gateway_base_url: payload.gateway_base_url, capabilities: payload.capabilities }) });
  }
  const bindings = await data(`/workstations/${context.workstation.master_id}/print-station-bindings`);
  const activePrimary = bindings.find((row) => row.is_active && row.role === 'PRIMARY' && (!row.effective_to || new Date(row.effective_to) > new Date()));
  if (activePrimary && activePrimary.print_station_id !== station.master_id) throw new Error('SEED_PRINT_STATION: workstation already has another active PRIMARY binding');
  if (!activePrimary) await data(`/workstations/${context.workstation.master_id}/print-station-bindings`, { method: 'POST', body: JSON.stringify({ print_station_id: station.master_id, role: 'PRIMARY', allocated_printer_quantity: 1 }) });
  return { ...station, binding: { workstation_id: context.workstation.master_id, role: 'PRIMARY', allocated_printer_quantity: 1 }, runtimeMustBeVerified: true };
}

async function seedSupportingData(context) {
  runCommand('bash', ['scripts/seed-mes-labor-demo.sh'], 'Seeding employees, shifts, skills, and work calendars');
  runCommand('npm', ['--prefix', '../ricoh-wms', 'run', 'seed:demo'], 'Seeding WMS data through the separate ricoh-wms repository', {
    WMS_DEMO_COMPONENT_ITEM_REVISION_ID: context.component.master_id,
    WMS_DEMO_WORK_CENTER_ID: context.workCenter.master_id,
  });
  return { labor: true, wms: true };
}

async function ensureDemoMachineGroup(context) {
  // Resource candidates are production-planning inputs. Only a Released group
  // may be proposed; a Draft group must never leak into the WO flow.
  const requestedCode = process.env.E2E_MACHINE_GROUP_CODE || 'MG-20260727-0004';
  const result = await master.query(`
    SELECT mg.master_id, mg.code, mg.name, mg.lifecycle_status,
           COUNT(ra.master_id) FILTER (WHERE ra.effective_to IS NULL)::int AS active_member_count,
           COUNT(ra.master_id) FILTER (WHERE ra.effective_to IS NULL AND ra.assignment_role = 'Primary')::int AS primary_count
    FROM md_workstation_machine_group mg
    LEFT JOIN md_resource_assignment ra ON ra.machine_group_id = mg.master_id
    WHERE mg.code = $1 AND mg.site_id = $2 AND mg.work_center_id = $3 AND mg.workstation_id = $4
    GROUP BY mg.master_id`, [requestedCode, context.site.master_id, context.workCenter.master_id, context.workstation.master_id]);
  const group = result.rows[0];
  if (!group) throw new Error(`SEED_PLANNING: machine group ${requestedCode} is required for the deterministic demo workstation`);
  if (Number(group.active_member_count) < 1 || Number(group.primary_count) !== 1) throw new Error(`SEED_PLANNING: machine group ${requestedCode} must have exactly one active primary member`);
  const primary = (await master.query(`
    SELECT ra.master_id AS assignment_id, ra.equipment_id, ra.machine_unit_id
    FROM md_resource_assignment ra
    WHERE ra.machine_group_id=$1 AND ra.assignment_role='Primary' AND ra.effective_to IS NULL
    ORDER BY ra.sequence_no LIMIT 1`, [group.master_id])).rows[0];
  if (!primary?.equipment_id || !primary?.machine_unit_id) throw new Error(`SEED_PLANNING: machine group ${requestedCode} primary member must have equipment and machine unit`);
  await master.query(`
    UPDATE md_equipment
    SET site_id=$1, work_center_id=$2, lifecycle_status='Released', active_flag=TRUE,
        execution_status='Available', planning_resource_flag=TRUE, effective_to=NULL,
        updated_by=$3, updated_at=NOW()
    WHERE master_id=$4`, [context.site.master_id, context.workCenter.master_id, userId, primary.equipment_id]);
  await master.query(`
    UPDATE md_machine_unit
    SET active_flag=TRUE, execution_status='Available', physical_identity_status='Identified',
        planning_resource_flag=TRUE, updated_at=NOW()
    WHERE machine_unit_id=$1`, [primary.machine_unit_id]);
  await master.query(`
    UPDATE md_resource_assignment
    SET site_id=$1, work_center_id=$2, workstation_id=$3, lifecycle_status='Released',
        scheduling_flag=TRUE, effective_to=NULL, updated_by=$4, updated_at=NOW()
    WHERE master_id=$5`, [context.site.master_id, context.workCenter.master_id, context.workstation.master_id, userId, primary.assignment_id]);
  if (group.lifecycle_status !== 'Released') {
    await master.query(`UPDATE md_workstation_machine_group SET name=$1::jsonb, lifecycle_status='Released', updated_by=$2, updated_at=NOW(), effective_to=NULL WHERE master_id=$3`, [JSON.stringify({ vi: 'Nhóm máy demo in nhãn', en: 'E2E label printing machine group', ja: 'E2Eラベル印刷マシングループ', ko: 'E2E 라벨 인쇄 머신 그룹' }), userId, group.master_id]);
  } else {
    await master.query(`UPDATE md_workstation_machine_group SET name=$1::jsonb, updated_by=$2, updated_at=NOW() WHERE master_id=$3`, [JSON.stringify({ vi: 'Nhóm máy demo in nhãn', en: 'E2E label printing machine group', ja: 'E2Eラベル印刷マシングループ', ko: 'E2E 라벨 인쇄 머신 그룹' }), userId, group.master_id]);
  }
  return { id: group.master_id, code: group.code, previous_status: group.lifecycle_status, lifecycle_status: 'Released', active_member_count: Number(group.active_member_count), primary_count: Number(group.primary_count) };
}

async function seedPlanningMatrix(manifest, context, targetDate) {
  const result = { capabilities: 0, standards: 0, calendars: 0, worker_requirements: 0 };
  const shifts = (await master.query(`SELECT master_id, code FROM md_shift WHERE site_id=$1 AND lifecycle_status='Released' ORDER BY code`, [context.site.master_id])).rows;
  const shift = shifts.find((row) => row.code === 'SHIFT-A');
  if (!shift) throw new Error('SEED_PLANNING: released SHIFT-A is required');
  manifest.shift = { master_id: shift.master_id, code: 'SHIFT-A' };
  const assignment = (await master.query(`SELECT equipment_id FROM md_resource_assignment WHERE site_id=$1 AND work_center_id=$2 AND workstation_id=$3 AND scheduling_flag=TRUE AND effective_to IS NULL ORDER BY equipment_id NULLS LAST LIMIT 1`, [context.site.master_id, context.workCenter.master_id, context.workstation.master_id])).rows[0];
  const resourceType = assignment?.equipment_id ? 'Equipment' : 'Workstation';
  const resourceId = assignment?.equipment_id || context.workstation.master_id;
  const skill = (await master.query(`SELECT master_id FROM md_skill WHERE code='SK-EMP-VULCAN-OPERATOR' AND scope='Employee' AND lifecycle_status='Released' LIMIT 1`)).rows[0];
  const routingOperations = (await master.query(`SELECT master_id, operation_id, seq FROM md_routing_operation WHERE routing_header_id=$1 AND effective_to IS NULL ORDER BY seq`, [manifest.routing.master_id])).rows;

  // Resource planning is evaluated against the selected shift, not merely the
  // work center or machine group. Seed every released site shift for the demo
  // date so the UI can safely choose any valid shift without a false blocker.
  for (const siteShift of shifts) {
    await master.query(`INSERT INTO md_resource_calendar (code,name,version_no,lifecycle_status,effective_from,created_by,work_center_id,equipment_id,available_from,available_to,capacity_percent,site_id,resource_type,resource_id,workstation_id,calendar_date,shift_id,availability_status,available_minutes,capacity_factor) VALUES ($1,$2,1,'Released',NOW(),$3,$4,$5,NOW(),NOW()+INTERVAL '1 day',1,$6,$7,$8,$9,$10::date,$11,'Available',540,1) ON CONFLICT (resource_type,resource_id,calendar_date,shift_id) DO UPDATE SET lifecycle_status='Released',effective_to=NULL,available_from=NOW(),available_to=NOW()+INTERVAL '1 day',availability_status='Available',available_minutes=540,capacity_factor=1,work_center_id=EXCLUDED.work_center_id,workstation_id=EXCLUDED.workstation_id,equipment_id=EXCLUDED.equipment_id`, [`E2E-WO-CAL-${targetDate.replaceAll('-', '')}-${siteShift.code}`, `E2E WO calendar ${siteShift.code} ${targetDate}`, userId, context.workCenter.master_id, assignment?.equipment_id || null, context.site.master_id, resourceType, resourceId, context.workstation.master_id, targetDate, siteShift.master_id]);
    result.calendars += 1;
  }

  for (const [index, operation] of routingOperations.entries()) {
    const codeSuffix = String(index + 1).padStart(2, '0');
    const setupTime = 5;
    const cycleTime = [120, 30, 60][index] || 60;
    await master.query(`INSERT INTO md_resource_capability (code,name,version_no,lifecycle_status,effective_from,created_by,operation_id,work_center_id,equipment_id,capability_type,active_flag,cycle_time_sec,site_id,product_revision_id,eligibility,priority_no,speed_factor) VALUES ($1,$2,1,'Released',NOW(),$3,$4,$5,$6,'Eligible',TRUE,$7,$8,$9,TRUE,1,1) ON CONFLICT (code,version_no) DO UPDATE SET lifecycle_status='Released',effective_to=NULL,operation_id=EXCLUDED.operation_id,work_center_id=EXCLUDED.work_center_id,equipment_id=EXCLUDED.equipment_id,cycle_time_sec=EXCLUDED.cycle_time_sec,site_id=EXCLUDED.site_id,product_revision_id=EXCLUDED.product_revision_id,active_flag=TRUE`, [`E2E-WO-CAP-${codeSuffix}`, `E2E WO capability ${codeSuffix}`, userId, operation.operation_id, context.workCenter.master_id, assignment?.equipment_id || null, cycleTime, context.site.master_id, manifest.revision.master_id]);
    result.capabilities += 1;
    await master.query(`INSERT INTO md_production_standard (code,name,version_no,lifecycle_status,effective_from,created_by,item_revision_id,operation_id,work_center_id,equipment_id,labor_count,skill_id,minimum_level,setup_time_min,cycle_time_sec,efficiency_factor,site_id,routing_operation_id,base_quantity,standard_yield,source_method,valid_from) VALUES ($1,$2,1,'Released',NOW(),$3,$4,$5,$6,$7,1,$8,'L1',$9,$10,$11,$12,$13,$14,$15,'E2E',CURRENT_DATE) ON CONFLICT (code,version_no) DO UPDATE SET lifecycle_status='Released',effective_to=NULL,item_revision_id=EXCLUDED.item_revision_id,operation_id=EXCLUDED.operation_id,work_center_id=EXCLUDED.work_center_id,equipment_id=EXCLUDED.equipment_id,skill_id=EXCLUDED.skill_id,setup_time_min=EXCLUDED.setup_time_min,cycle_time_sec=EXCLUDED.cycle_time_sec,efficiency_factor=EXCLUDED.efficiency_factor,site_id=EXCLUDED.site_id,routing_operation_id=EXCLUDED.routing_operation_id,base_quantity=EXCLUDED.base_quantity,standard_yield=EXCLUDED.standard_yield,valid_from=CURRENT_DATE`, [`E2E-WO-STD-${codeSuffix}`, `E2E WO production standard ${codeSuffix}`, userId, manifest.revision.master_id, operation.operation_id, context.workCenter.master_id, assignment?.equipment_id || null, skill?.master_id || null, setupTime, cycleTime, 1, context.site.master_id, operation.master_id, 1, 1]);
    result.standards += 1;
    if (skill) {
      await master.query(`INSERT INTO md_operation_skill_requirement (code,name,version_no,lifecycle_status,effective_from,created_by,operation_id,skill_id,site_id,routing_operation_id,minimum_level,required_persons,mandatory_flag,active_flag) VALUES ($1,$2,1,'Released',NOW(),$3,$4,$5,$6,$7,'L1',1,TRUE,TRUE) ON CONFLICT (code,version_no) DO UPDATE SET lifecycle_status='Released',effective_to=NULL,operation_id=EXCLUDED.operation_id,skill_id=EXCLUDED.skill_id,site_id=EXCLUDED.site_id,routing_operation_id=EXCLUDED.routing_operation_id,active_flag=TRUE`, [`E2E-WO-REQ-${codeSuffix}`, `E2E WO worker requirement ${codeSuffix}`, userId, operation.operation_id, skill.master_id, context.site.master_id, operation.master_id]);
      result.worker_requirements += 1;
    }
  }
  return result;
}

async function verifyWmsComponentStock(component, requiredQty = 2, targetDate) {
  const wms = new Client({ connectionString: wmsInventoryUrl });
  await wms.connect();
  try {
    const result = await wms.query(`
      SELECT l.lot_code, l.item_revision_id, l.expiry_date, l.status,
             b.location_id, b.on_hand_qty
      FROM inv_balance b
      JOIN inv_lot l ON l.lot_id=b.lot_id
      WHERE l.item_revision_id=$1
        AND l.status='Active'
        AND (l.expiry_date IS NULL OR l.expiry_date >= $2::date)
      ORDER BY l.expiry_date NULLS LAST, l.lot_code, b.location_id`, [component.master_id, targetDate]);
    const balances = result.rows;
    const availableQty = balances.reduce((sum, row) => sum + Number(row.on_hand_qty || 0), 0);
    return { mode: 'live', component_revision: component, required_quantity: requiredQty, available_quantity: availableQty, balances, passed: availableQty >= requiredQty };
  } finally {
    await wms.end();
  }
}

async function createScenario(context) {
  const localized = { vi: 'Sản phẩm E2E WO in nhãn', en: 'E2E WO Label Product', ja: 'E2E WO ラベル製品', ko: 'E2E WO 라벨 제품' };
  const component = context.component;
  const item = await data('/items', { method: 'POST', body: JSON.stringify({ code: names.item, name: localized, item_type: 'FG', item_group: 'E2E', material_group_id: context.materialGroup.master_id, base_uom_id: context.pcs.master_id, site_id: context.site.master_id }) });
  const revision = item.revision;
  await data(`/items/${item.master_id}/release`, { method: 'POST', body: '{}' });
  await data(`/item-revisions/${revision.master_id}/release`, { method: 'POST', body: '{}' });
  const operationSpecs = [
    { code: `${names.operationPrefix}10`, name: { vi: 'Chuẩn bị', en: 'Preparation', ja: '準備', ko: '준비' }, requires_output_label: false, requires_material_scan: true, confirmation_mode: 'QuantityOnly', operation_type: 'Production', cycle: 120 },
    { code: `${names.operationPrefix}20`, name: { vi: 'In nhãn vật lý', en: 'Physical Label Printing', ja: '物理ラベル印刷', ko: '실물 라벨 인쇄' }, requires_output_label: true, requires_material_scan: false, confirmation_mode: 'QuantityOnly', operation_type: 'Packing', cycle: 30 },
    { code: `${names.operationPrefix}30`, name: { vi: 'Xác nhận chất lượng', en: 'Quality Confirmation', ja: '品質確認', ko: '품질 확인' }, requires_output_label: false, requires_material_scan: false, confirmation_mode: 'QuantityOnly', operation_type: 'Inspection', cycle: 60 },
  ];
  const operations = [];
  for (const spec of operationSpecs) {
    const op = await data('/operations', { method: 'POST', body: JSON.stringify({ code: spec.code, name: spec.name, description: spec.name, operation_type: spec.operation_type, confirmation_mode: spec.confirmation_mode, quantity_reporting: 'GoodOnly', requires_material_scan: spec.requires_material_scan, requires_output_label: spec.requires_output_label, is_schedulable: true, default_cycle_time_sec: spec.cycle, default_setup_time_min: 5, default_base_quantity: 1, default_required_persons: 1, default_efficiency_factor: 1, default_yield: 1 }) });
    const released = await data(`/operations/${op.master_id}/release`, { method: 'POST', body: '{}' });
    operations.push(released);
    await api(`/workstations/${context.workstation.master_id}/operation-capabilities`, { method: 'POST', body: JSON.stringify({ operation_id: op.master_id, cycle_time_sec: spec.cycle, setup_time_min: 5, base_quantity: 1, efficiency_factor: 1, scheduling_mode: 'Finite' }) }, [409]);
  }
  const routing = await data('/routing-headers', { method: 'POST', body: JSON.stringify({ name: { vi: 'Routing E2E WO in nhãn', en: 'E2E WO Label Routing', ja: 'E2E WO ラベルルーティング', ko: 'E2E WO 라우팅' }, description: { vi: 'Routing hoàn chỉnh cho kiểm thử Work Order.', en: 'Complete routing for Work Order testing.', ja: '製造指図テスト用の完全なルーティング。', ko: '작업지시 테스트용 완전한 라우팅.' }, routing_type: 'Standard', business_version: '1' }) });
  const routingOperations = await data(`/routing-headers/${routing.master_id}/operations`, { method: 'PUT', body: JSON.stringify({ operations: operations.map((op, index) => ({ operation_id: op.master_id, work_center_id: context.workCenter.master_id, workstation_id: context.workstation.master_id, seq: (index + 1) * 10, predecessor_seq: index ? index * 10 : null, scheduling_mode: 'Finite', queue_time_min: 2, move_time_min: 1, overlap_allowed: false, transfer_batch_qty: 1, milestone_flag: index === 2, planning_mode: 'ROUTING_OVERRIDE', required_workers: 1, setup_time_min: 5, cycle_time_sec: operationSpecs[index].cycle, efficiency_factor: 1, base_quantity: 1, standard_yield: 1, ...(operationSpecs[index].requires_output_label ? { units_per_label: 1, label_quantity_method: 'CEIL_BY_UNITS_PER_LABEL', copies_per_label: 1 } : {}) })) }) });
  for (const routingOperation of routingOperations) await data(`/routing-operations/${routingOperation.master_id}/release`, { method: 'POST', body: '{}' });
  const releasedRouting = await data(`/routing-headers/${routing.master_id}/release`, { method: 'POST', body: '{}' });
  const mbom = await data('/mbom-headers', { method: 'POST', body: JSON.stringify({ code: names.mbom, name: { vi: 'MBOM E2E WO in nhãn', en: 'E2E WO Label MBOM', ja: 'E2E WO ラベルMBOM', ko: 'E2E WO MBOM' }, item_revision_id: revision.master_id, base_quantity: 1, base_uom_id: context.pcs.master_id, purpose: 'Standard', business_version: '1' }) });
  await data('/mbom-lines', { method: 'POST', body: JSON.stringify({ code: 'E2E-WO-MBOM-L01', name: 'E2E metal component', mbom_header_id: mbom.master_id, seq: 10, component_revision_id: component.master_id, quantity_per: 1, uom_id: context.pcs.master_id, scrap_rate: 0, issue_operation_id: operations[0].master_id, backflush_flag: false, phantom_flag: false }) });
  await data(`/mbom-headers/${mbom.master_id}/release`, { method: 'POST', body: '{}' });
  const pv = await data('/production-versions', { method: 'POST', body: JSON.stringify({ name_i18n: { vi: names.pvNameVi, en: 'E2E WO Label Production Version', ja: 'E2E WO ラベル生産バージョン', ko: 'E2E WO 라벨 생산 버전' }, mbom_header_id: mbom.master_id, routing_header_id: routing.master_id, min_lot_size: 1, max_lot_size: 100, is_default: false }) });
  const releasedItem = { ...item, lifecycle_status: 'Released', revision: { ...revision, lifecycle_status: 'Released' } };
  const releasedRevision = { ...revision, lifecycle_status: 'Released' };
  const releasedMbom = { ...mbom, lifecycle_status: 'Released' };
  const releasedRoutingManifest = { ...releasedRouting, lifecycle_status: 'Released' };
  return { item: releasedItem, revision: releasedRevision, component, operations, routing: releasedRoutingManifest, mbom: releasedMbom, production_version: { ...pv, lifecycle_status: 'Draft' }, production_line: context.productionLine, workstation: context.workstation, work_center: context.workCenter, site: context.site, uom: context.pcs };
}

async function releaseScenarioProductionVersion(manifest, targetDate) {
  const productionVersionID = manifest.production_version.master_id;
  await api(`/production-versions/${productionVersionID}/line-eligibility`, {
    method: 'PUT',
    body: JSON.stringify({ lines: [{ production_line_id: manifest.production_line.master_id, is_primary: true, priority_no: 1, selection_mode: 'AutoPrimaryThenBackup', selection_policy: 'PrimaryThenBackup', effective_from: `${targetDate}T00:00:00.000Z` }] }),
  });
  const validation = await data(`/production-versions/${productionVersionID}/validate`, { method: 'POST', body: '{}' });
  if (!validation.valid) throw new Error(`PRODUCTION_VERSION_READINESS: ${JSON.stringify(validation.failures || validation)}`);
  const released = await data(`/production-versions/${productionVersionID}/release`, { method: 'POST', body: '{}' });
  manifest.production_version = { ...manifest.production_version, ...released, lifecycle_status: 'Released' };
  return manifest.production_version;
}

async function rebuildOwnedReadModel(manifest, targetDate) {
  const revision = (await master.query(`SELECT r.*, i.code AS item_code FROM md_item_revision r JOIN md_item i ON i.master_id=r.item_id WHERE r.master_id=$1`, [manifest.revision.master_id])).rows[0];
  const mbom = (await master.query(`SELECT * FROM md_mbom_header WHERE master_id=$1`, [manifest.mbom.master_id])).rows[0];
  const mbomLines = (await master.query(`SELECT l.*, i.code AS component_item_code FROM md_mbom_line l JOIN md_item_revision r ON r.master_id=l.component_revision_id JOIN md_item i ON i.master_id=r.item_id WHERE l.mbom_header_id=$1 AND l.effective_to IS NULL`, [manifest.mbom.master_id])).rows;
  const routing = (await master.query(`SELECT * FROM md_routing_header WHERE master_id=$1`, [manifest.routing.master_id])).rows[0];
  const routingOps = (await master.query(`
    SELECT ro.*, op.code AS operation_code, op.requires_output_label,
      wc.site_id,
      COALESCE(ps.base_quantity, op.default_base_quantity) AS resolved_base_quantity,
      COALESCE(ps.setup_time_min, op.default_setup_time_min, 0) AS resolved_setup_time_min,
      COALESCE(ps.cycle_time_sec, op.default_cycle_time_sec, 1) AS resolved_cycle_time_sec,
      COALESCE(ps.labor_count, op.default_required_persons) AS resolved_required_workers,
      COALESCE(ps.efficiency_factor, op.default_efficiency_factor) AS resolved_efficiency_factor,
      COALESCE(ps.standard_yield, op.default_yield) AS resolved_standard_yield
    FROM md_routing_operation ro JOIN md_operation op ON op.master_id=ro.operation_id JOIN md_work_center wc ON wc.master_id=ro.work_center_id
    LEFT JOIN LATERAL (SELECT * FROM md_production_standard p WHERE p.routing_operation_id=ro.master_id AND p.effective_to IS NULL ORDER BY p.valid_from DESC NULLS LAST LIMIT 1) ps ON TRUE
    WHERE ro.routing_header_id=$1 AND ro.lifecycle_status='Released' AND ro.effective_to IS NULL ORDER BY ro.seq`, [manifest.routing.master_id])).rows;
  const pv = (await master.query(`SELECT * FROM md_production_version WHERE master_id=$1`, [manifest.production_version.master_id])).rows[0];
  const calendars = (await master.query(`SELECT master_id, work_center_id, equipment_id, available_from, available_to, capacity_percent, lifecycle_status FROM md_resource_calendar WHERE site_id=$1 AND calendar_date=$2::date AND lifecycle_status='Released'`, [manifest.site.master_id, targetDate])).rows;
  const employees = (await master.query(`SELECT master_id, code, name, site_id, default_work_center_id, employee_status, lifecycle_status FROM md_employee WHERE site_id=$1 AND code LIKE 'EMP-%'`, [manifest.site.master_id])).rows;
  const employeeSkills = (await master.query(`SELECT es.employee_id, es.skill_id, es.level FROM md_employee_skill es JOIN md_employee e ON e.master_id=es.employee_id WHERE e.site_id=$1 AND es.active_flag=TRUE AND es.effective_to IS NULL`, [manifest.site.master_id])).rows;
  const employeeSchedules = (await master.query(`SELECT s.schedule_id, s.employee_id, s.shift_id, s.work_center_id, s.schedule_date, s.schedule_status FROM md_employee_shift_schedule s JOIN md_employee e ON e.master_id=s.employee_id WHERE e.site_id=$1 AND s.schedule_date=$2::date`, [manifest.site.master_id, targetDate])).rows;
  const skills = (await master.query(`SELECT DISTINCT s.master_id, s.code, s.name, s.lifecycle_status FROM md_skill s JOIN md_employee_skill es ON es.skill_id=s.master_id JOIN md_employee e ON e.master_id=es.employee_id WHERE e.site_id=$1`, [manifest.site.master_id])).rows;
  const operationRequirements = (await master.query(`SELECT r.master_id, r.operation_id, r.skill_id, r.minimum_level, r.required_persons, r.mandatory_flag FROM md_operation_skill_requirement r WHERE r.routing_operation_id IN (SELECT master_id FROM md_routing_operation WHERE routing_header_id=$1) AND r.active_flag=TRUE AND r.effective_to IS NULL`, [manifest.routing.master_id])).rows;
  const lineEligibilities = (await master.query(`SELECT eligibility_id, production_version_id, production_line_id, is_primary, priority_no, effective_from, effective_to, active_flag, lifecycle_status FROM md_production_version_line_eligibility WHERE production_version_id=$1 AND active_flag=TRUE AND effective_to IS NULL`, [manifest.production_version.master_id])).rows;
  const resourceCapabilities = (await master.query(`SELECT master_id, operation_id, work_center_id, equipment_id, capability_type, active_flag, lifecycle_status FROM md_resource_capability WHERE operation_id = ANY($1::uuid[]) AND active_flag=TRUE AND effective_to IS NULL`, [routingOps.map((op) => op.operation_id)])).rows;
  const productionStandards = (await master.query(`SELECT master_id, item_revision_id, operation_id, work_center_id, equipment_id, setup_time_min, cycle_time_sec, efficiency_factor, lifecycle_status FROM md_production_standard WHERE routing_operation_id = ANY($1::uuid[]) AND effective_to IS NULL`, [routingOps.map((op) => op.master_id)])).rows;
  await execution.query('BEGIN');
  try {
    await execution.query(`INSERT INTO rm_item_revision (master_id, code, name, revision_code, item_type, site_id, base_uom_id, lifecycle_status, updated_at) VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,NOW()) ON CONFLICT (master_id) DO UPDATE SET code=EXCLUDED.code,name=EXCLUDED.name,revision_code=EXCLUDED.revision_code,item_type=EXCLUDED.item_type,site_id=EXCLUDED.site_id,base_uom_id=EXCLUDED.base_uom_id,lifecycle_status=EXCLUDED.lifecycle_status,updated_at=NOW()`, [revision.master_id, revision.code, JSON.stringify(revision.name), revision.revision_code, 'FG', revision.site_id, revision.base_uom_id, revision.lifecycle_status]);
    await execution.query(`INSERT INTO rm_mbom_header (master_id, code, name, base_quantity, base_uom_id, lifecycle_status, updated_at) VALUES ($1,$2,$3::jsonb,$4,$5,$6,NOW()) ON CONFLICT (master_id) DO UPDATE SET code=EXCLUDED.code,name=EXCLUDED.name,base_quantity=EXCLUDED.base_quantity,base_uom_id=EXCLUDED.base_uom_id,lifecycle_status=EXCLUDED.lifecycle_status,updated_at=NOW()`, [mbom.master_id, mbom.code, JSON.stringify(mbom.name), mbom.base_quantity, mbom.base_uom_id, mbom.lifecycle_status]);
    await execution.query(`DELETE FROM rm_mbom_line WHERE mbom_header_id=$1`, [mbom.master_id]);
    for (const line of mbomLines) await execution.query(`INSERT INTO rm_mbom_line (master_id,mbom_header_id,parent_line_id,seq,component_revision_id,component_item_code,quantity_per,uom_id,scrap_rate,issue_operation_id,backflush_flag,phantom_flag) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [line.master_id, line.mbom_header_id, line.parent_line_id, line.seq, line.component_revision_id, line.component_item_code, line.quantity_per, line.uom_id, line.scrap_rate, line.issue_operation_id, line.backflush_flag, line.phantom_flag]);
    await execution.query(`INSERT INTO rm_routing_header (master_id,code,item_revision_id,site_id,lifecycle_status,updated_at) VALUES ($1,$2,NULL,$3,$4,NOW()) ON CONFLICT (master_id) DO UPDATE SET code=EXCLUDED.code,site_id=EXCLUDED.site_id,lifecycle_status=EXCLUDED.lifecycle_status,updated_at=NOW()`, [routing.master_id, routing.code, contextSiteId(manifest), routing.lifecycle_status]);
    await execution.query(`DELETE FROM rm_routing_operation WHERE routing_header_id=$1`, [routing.master_id]);
    for (const op of routingOps) await execution.query(`INSERT INTO rm_routing_operation (master_id,routing_header_id,operation_id,operation_code,work_center_id,seq,predecessor_seq,planning_mode,resolved_source,resolved_base_quantity,resolved_setup_time_min,resolved_cycle_time_sec,resolved_required_workers,resolved_efficiency_factor,resolved_standard_yield,requires_output_label,workstation_id,queue_time_min,move_time_min,units_per_label,label_quantity_method,copies_per_label) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ROUTING_OVERRIDE',$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`, [op.master_id, op.routing_header_id, op.operation_id, op.operation_code, op.work_center_id, op.seq, op.predecessor_seq, op.planning_mode, op.resolved_base_quantity, op.resolved_setup_time_min, op.resolved_cycle_time_sec, op.resolved_required_workers, op.resolved_efficiency_factor, op.resolved_standard_yield, op.requires_output_label, manifest.workstation.master_id, op.queue_time_min, op.move_time_min, op.units_per_label || null, op.label_quantity_method || 'CEIL_BY_UNITS_PER_LABEL', op.copies_per_label || 1]);
    await execution.query(`DELETE FROM rm_resource_calendar WHERE work_center_id=$1`, [manifest.work_center.master_id]);
    for (const calendar of calendars) await execution.query(`INSERT INTO rm_resource_calendar (master_id,work_center_id,equipment_id,available_from,available_to,capacity_percent,lifecycle_status) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (master_id) DO UPDATE SET work_center_id=EXCLUDED.work_center_id,equipment_id=EXCLUDED.equipment_id,available_from=EXCLUDED.available_from,available_to=EXCLUDED.available_to,capacity_percent=EXCLUDED.capacity_percent,lifecycle_status=EXCLUDED.lifecycle_status`, [calendar.master_id, calendar.work_center_id || manifest.work_center.master_id, calendar.equipment_id, calendar.available_from, calendar.available_to, calendar.capacity_percent, calendar.lifecycle_status]);
    for (const skill of skills) await execution.query(`INSERT INTO rm_skill (master_id,code,name,lifecycle_status) VALUES ($1,$2,$3::jsonb,$4) ON CONFLICT (master_id) DO UPDATE SET code=EXCLUDED.code,name=EXCLUDED.name,lifecycle_status=EXCLUDED.lifecycle_status`, [skill.master_id, skill.code, JSON.stringify(skill.name && typeof skill.name === 'object' ? skill.name : { vi: skill.name, en: skill.name }), skill.lifecycle_status]);
    for (const employee of employees) await execution.query(`INSERT INTO rm_employee (master_id,code,name,site_id,default_work_center_id,employee_status,lifecycle_status) VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7) ON CONFLICT (master_id) DO UPDATE SET code=EXCLUDED.code,name=EXCLUDED.name,site_id=EXCLUDED.site_id,default_work_center_id=EXCLUDED.default_work_center_id,employee_status=EXCLUDED.employee_status,lifecycle_status=EXCLUDED.lifecycle_status`, [employee.master_id, employee.code, JSON.stringify({ vi: employee.name, en: employee.name }), employee.site_id, employee.default_work_center_id, employee.employee_status, employee.lifecycle_status]);
    for (const employeeSkill of employeeSkills) await execution.query(`INSERT INTO rm_employee_skill (employee_id,skill_id,level) VALUES ($1,$2,$3) ON CONFLICT (employee_id,skill_id) DO UPDATE SET level=EXCLUDED.level`, [employeeSkill.employee_id, employeeSkill.skill_id, employeeSkill.level]);
    for (const schedule of employeeSchedules) await execution.query(`INSERT INTO rm_employee_shift_schedule (schedule_id,employee_id,shift_id,work_center_id,schedule_date,schedule_status) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (schedule_id) DO UPDATE SET shift_id=EXCLUDED.shift_id,work_center_id=EXCLUDED.work_center_id,schedule_date=EXCLUDED.schedule_date,schedule_status=EXCLUDED.schedule_status`, [schedule.schedule_id, schedule.employee_id, schedule.shift_id, schedule.work_center_id, schedule.schedule_date, schedule.schedule_status]);
    for (const requirement of operationRequirements) await execution.query(`INSERT INTO rm_operation_skill_requirement (master_id,operation_id,skill_id,minimum_level,required_persons,mandatory_flag) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (master_id) DO UPDATE SET operation_id=EXCLUDED.operation_id,skill_id=EXCLUDED.skill_id,minimum_level=EXCLUDED.minimum_level,required_persons=EXCLUDED.required_persons,mandatory_flag=EXCLUDED.mandatory_flag`, [requirement.master_id, requirement.operation_id, requirement.skill_id, requirement.minimum_level, requirement.required_persons, requirement.mandatory_flag]);
    for (const capability of resourceCapabilities) await execution.query(`INSERT INTO rm_resource_capability (master_id,operation_id,work_center_id,equipment_id,capability_type,active_flag,lifecycle_status) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (master_id) DO UPDATE SET operation_id=EXCLUDED.operation_id,work_center_id=EXCLUDED.work_center_id,equipment_id=EXCLUDED.equipment_id,capability_type=EXCLUDED.capability_type,active_flag=EXCLUDED.active_flag,lifecycle_status=EXCLUDED.lifecycle_status`, [capability.master_id, capability.operation_id, capability.work_center_id, capability.equipment_id, capability.capability_type, capability.active_flag, capability.lifecycle_status]);
    for (const standard of productionStandards) await execution.query(`INSERT INTO rm_production_standard (master_id,item_revision_id,operation_id,work_center_id,equipment_id,setup_time_min,cycle_time_sec,efficiency_factor,lifecycle_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (master_id) DO UPDATE SET item_revision_id=EXCLUDED.item_revision_id,operation_id=EXCLUDED.operation_id,work_center_id=EXCLUDED.work_center_id,equipment_id=EXCLUDED.equipment_id,setup_time_min=EXCLUDED.setup_time_min,cycle_time_sec=EXCLUDED.cycle_time_sec,efficiency_factor=EXCLUDED.efficiency_factor,lifecycle_status=EXCLUDED.lifecycle_status`, [standard.master_id, standard.item_revision_id, standard.operation_id, standard.work_center_id, standard.equipment_id, standard.setup_time_min, standard.cycle_time_sec, standard.efficiency_factor, standard.lifecycle_status]);
    await execution.query(`INSERT INTO rm_production_version (master_id,code,name_i18n,item_revision_id,mbom_header_id,routing_header_id,site_id,lifecycle_status,is_default,min_lot_size,max_lot_size,updated_at) VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11,NOW()) ON CONFLICT (master_id) DO UPDATE SET code=EXCLUDED.code,name_i18n=EXCLUDED.name_i18n,item_revision_id=EXCLUDED.item_revision_id,mbom_header_id=EXCLUDED.mbom_header_id,routing_header_id=EXCLUDED.routing_header_id,site_id=EXCLUDED.site_id,lifecycle_status=EXCLUDED.lifecycle_status,min_lot_size=EXCLUDED.min_lot_size,max_lot_size=EXCLUDED.max_lot_size,updated_at=NOW()`, [pv.master_id, pv.code, JSON.stringify(pv.name_i18n), pv.item_revision_id, pv.mbom_header_id, pv.routing_header_id, pv.site_id, pv.lifecycle_status, pv.is_default, pv.min_lot_size, pv.max_lot_size]);
    await execution.query(`DELETE FROM rm_production_version_line_eligibility WHERE production_version_id=$1`, [pv.master_id]);
    for (const eligibility of lineEligibilities) await execution.query(`INSERT INTO rm_production_version_line_eligibility (master_id,production_version_id,production_line_id,selection_role,priority,effective_from,effective_to,active_flag,lifecycle_status,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())`, [eligibility.eligibility_id, eligibility.production_version_id, eligibility.production_line_id, eligibility.is_primary ? 'PRIMARY' : 'BACKUP', eligibility.priority_no, eligibility.effective_from, eligibility.effective_to, eligibility.active_flag, eligibility.lifecycle_status]);
    await execution.query('COMMIT');
  } catch (error) { await execution.query('ROLLBACK'); throw new Error(`ROUTING_READ_MODEL: ${error.message}`); }
}

function contextSiteId(manifest) { return manifest.site.master_id; }

async function preflight(manifest, targetDate) {
  const ready = await data(`/production-ready-versions?limit=500&planned_date=${encodeURIComponent(targetDate)}`);
  const candidate = ready.find((row) => row.production_version_code === manifest.production_version.code || row.production_version_id === manifest.production_version.master_id);
  const printReadiness = await data(`/workstations/${manifest.workstation.master_id}/print-station-readiness`);
  return { productionVersionReady: Boolean(candidate?.ready), candidate, printReadiness, expectedOperationCount: 3, operationCodes: manifest.operations.map((row) => row.code), mbomLineCount: 1 };
}

async function verifySeededMasterData(manifest) {
  const result = await master.query(`
    SELECT pv.master_id AS production_version_id, pv.code AS production_version_code,
           pv.lifecycle_status AS production_version_status, pv.item_revision_id,
           pv.mbom_header_id, pv.routing_header_id,
           ir.lifecycle_status AS revision_status, i.lifecycle_status AS item_status,
           mb.lifecycle_status AS mbom_status, mb.item_revision_id AS mbom_revision_id,
           rh.lifecycle_status AS routing_status,
           COUNT(DISTINCT ro.master_id)::int AS routing_operation_count,
           COUNT(DISTINCT ml.master_id)::int AS mbom_line_count
    FROM md_production_version pv
    JOIN md_item_revision ir ON ir.master_id = pv.item_revision_id
    JOIN md_item i ON i.master_id = ir.item_id
    JOIN md_mbom_header mb ON mb.master_id = pv.mbom_header_id
    JOIN md_routing_header rh ON rh.master_id = pv.routing_header_id
    LEFT JOIN md_routing_operation ro ON ro.routing_header_id = rh.master_id AND ro.effective_to IS NULL AND ro.lifecycle_status = 'Released'
    LEFT JOIN md_mbom_line ml ON ml.mbom_header_id = mb.master_id AND ml.effective_to IS NULL AND ml.lifecycle_status = 'Released'
    WHERE pv.master_id = $1
    GROUP BY pv.master_id, ir.master_id, i.master_id, mb.master_id, rh.master_id
  `, [manifest.production_version.master_id]);
  const row = result.rows[0];
  const issues = [];
  if (!row) issues.push('PRODUCTION_VERSION_NOT_FOUND');
  else {
    if (row.production_version_status !== 'Released') issues.push('PRODUCTION_VERSION_NOT_RELEASED');
    if (row.item_status !== 'Released' || row.revision_status !== 'Released') issues.push('OUTPUT_ITEM_OR_REVISION_NOT_RELEASED');
    if (row.mbom_status !== 'Released' || String(row.mbom_revision_id) !== String(row.item_revision_id)) issues.push('MBOM_OWNERSHIP_OR_LIFECYCLE_INVALID');
    if (row.routing_status !== 'Released') issues.push('ROUTING_LIFECYCLE_INVALID');
    if (Number(row.routing_operation_count) !== manifest.operations.length) issues.push('ROUTING_OPERATION_COUNT_INVALID');
    if (Number(row.mbom_line_count) !== 1) issues.push('STRUCTURE_LINE_COUNT_INVALID');
  }
  const issueMapping = await master.query(`
    SELECT ml.code AS mbom_line_code, ml.issue_operation_id, COUNT(ro.master_id)::int AS matching_routing_operations
    FROM md_mbom_line ml
    JOIN md_routing_header rh ON rh.master_id=$2
    LEFT JOIN md_routing_operation ro ON ro.routing_header_id=rh.master_id AND ro.operation_id=ml.issue_operation_id AND ro.effective_to IS NULL AND ro.lifecycle_status='Released'
    WHERE ml.mbom_header_id=$1 AND ml.effective_to IS NULL AND ml.lifecycle_status='Released'
    GROUP BY ml.code, ml.issue_operation_id`, [manifest.mbom.master_id, manifest.routing.master_id]);
  for (const mapping of issueMapping.rows) if (Number(mapping.matching_routing_operations) !== 1) issues.push(`ISSUE_OPERATION_MAPPING_INVALID:${mapping.mbom_line_code}`);
  if (issues.length) throw new Error(`SEEDED_MASTER_DATA_INVALID: ${JSON.stringify({ issues, row, issueMapping: issueMapping.rows })}`);
  return { passed: true, row, issue_mapping: issueMapping.rows };
}

async function createDemoWorkOrder(manifest, targetDate) {
  const idempotencyKey = `seed-demo-wo-${manifest.production_version.master_id}-${Date.now()}`;
  const start = new Date(`${targetDate}T08:00:00.000Z`);
  const started = await executionApi('/work-order-creation-workflows', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ production_version_id: manifest.production_version.master_id, item_revision_id: manifest.revision.master_id, item_code: manifest.item.code, item_name: manifest.item.name, uom_id: manifest.uom.master_id, site_id: manifest.site.master_id, quantity: 2, target_date: targetDate, shift_id: manifest.shift.master_id }),
  });
  const workflowID = started.body.workflow_id;
  if (!workflowID) throw new Error(`SEED_DEMO_WO: workflow did not return workflow_id: ${JSON.stringify(started.body)}`);
  let snapshot;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    snapshot = (await executionApi(`/work-order-creation-workflows/${workflowID}`)).body;
    if (snapshot.status === 'succeeded' || snapshot.status === 'failed') break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (snapshot.status !== 'succeeded' || !snapshot.work_order_id) throw new Error(`SEED_DEMO_WO: workflow did not succeed: ${JSON.stringify(snapshot)}`);
  const wo = (await executionApi(`/work-orders/${snapshot.work_order_id}`)).body;
  const compute = (await executionApi(`/work-orders/${snapshot.work_order_id}/compute-check`, { method: 'POST', body: '{}' })).body;
  const candidates = [];
  for (const operation of wo.operations || []) candidates.push({ operation_id: operation.wo_operation_id, response: (await executionApi(`/work-orders/${snapshot.work_order_id}/operations/${operation.wo_operation_id}/resource-candidates?shift_id=${encodeURIComponent(manifest.shift.master_id)}`)).body });
  return { workflow_id: workflowID, work_order_id: snapshot.work_order_id, work_order_code: snapshot.work_order_code, status: wo.header?.status || wo.status, operation_count: wo.operations?.length || 0, material_count: wo.material_requirements?.length || 0, compute_check: { total_estimated_minutes: compute.total_estimated_minutes, labor_assignment_count: compute.labor_assignments?.length || 0 }, candidates: candidates.map((entry) => ({ operation_id: entry.operation_id, status: entry.response.status, candidate_count: entry.response.candidates?.length || 0, blocking_errors: entry.response.blocking_errors || [] })) };
}

async function verifyPlanningSnapshots(workOrderId) {
  const result = await execution.query(`
    SELECT sequence_no, operation_code, standard_setup_time_min,
           standard_cycle_time_sec, standard_efficiency_factor,
           base_quantity, standard_yield, planning_snapshot
    FROM wo_operation
    WHERE wo_id=$1
    ORDER BY sequence_no
  `, [workOrderId]);
  const invalid = [];
  for (const row of result.rows) {
    const values = {
      setup_time_min: Number(row.standard_setup_time_min),
      cycle_time_sec: Number(row.standard_cycle_time_sec),
      efficiency_factor: Number(row.standard_efficiency_factor),
      base_quantity: Number(row.base_quantity),
      standard_yield: Number(row.standard_yield),
    };
    let snapshot = row.planning_snapshot;
    if (typeof snapshot === 'string') {
      try { snapshot = JSON.parse(snapshot); } catch { snapshot = null; }
    }
    const valid = Number.isFinite(values.setup_time_min) && values.setup_time_min >= 0
      && Number.isFinite(values.cycle_time_sec) && values.cycle_time_sec > 0
      && Number.isFinite(values.efficiency_factor) && values.efficiency_factor > 0
      && Number.isFinite(values.base_quantity) && values.base_quantity > 0
      && Number.isFinite(values.standard_yield) && values.standard_yield > 0 && values.standard_yield <= 1
      && snapshot && typeof snapshot === 'object';
    if (!valid) invalid.push({ sequence_no: row.sequence_no, operation_code: row.operation_code, values, planning_snapshot: snapshot });
  }
  if (result.rowCount === 0 || invalid.length > 0) {
    throw new Error(`SEED_PLANNING_SNAPSHOT_INVALID: ${JSON.stringify({ operation_count: result.rowCount, invalid })}`);
  }
  return { operation_count: result.rowCount, invalid_count: 0, validated: result.rows.map((row) => ({ sequence_no: row.sequence_no, operation_code: row.operation_code })) };
}

async function main() {
  await fs.mkdir(artifactDir, { recursive: true });
  const guard = safety(); await writeJson('environment.json', guard);
  if (!guard.passed) throw new Error(`ENVIRONMENT_SAFETY: ${guard.reasons.join('; ')}`);
  await master.connect(); await execution.connect(); await traceability.connect();
  const context = await getContext();
  const targetDate = process.env.E2E_WO_TARGET_DATE || defaultPlanningDate();
  const plan = { ownedCodes: names, reused: { site: context.site.code, work_center: context.workCenter.code, workstation: context.workstation.code, component_revision: context.component.code, uom: context.pcs.code }, mode };
  await writeJson('seed-plan.json', plan);
  if (mode === 'dry-run') { console.log(json({ success: true, mode, artifactDir, plan })); return; }
  const workOrderCleanup = await cleanupWorkOrderSnapshots();
  const cleanup = await cleanupOwned();
  const traceabilityCleanup = await cleanupTraceabilityOwned();
  const manifest = await createScenario(context);
  manifest.print_station = await ensurePrintStation(context);
  const traceabilitySeed = await seedTraceability(manifest);
  const supportingSeeds = await seedSupportingData(context);
  const machineGroup = await ensureDemoMachineGroup(context);
  const planningMatrix = await seedPlanningMatrix(manifest, context, targetDate);
  await releaseScenarioProductionVersion(manifest, targetDate);
  await rebuildOwnedReadModel(manifest, targetDate);
  const readiness = await preflight(manifest, targetDate);
  const masterDataVerification = await verifySeededMasterData(manifest);
  if (!readiness.productionVersionReady) throw new Error(`PRODUCTION_VERSION_READINESS: ${JSON.stringify(readiness)}`);
  const printReady = readiness.printReadiness && readiness.printReadiness.is_active !== false && readiness.printReadiness.runtime_status === 'ONLINE' && readiness.printReadiness.kafka_status === 'CONNECTED' && Number(readiness.printReadiness.ready_printer_count || 0) > 0;
  if (!printReady && process.env.ALLOW_PRINT_STATION_OFFLINE !== 'true') throw new Error(`PRINT_STATION_READINESS: ${JSON.stringify(readiness.printReadiness)}`);
  const wmsReadiness = await verifyWmsComponentStock(context.component, 2, targetDate);
  if (!wmsReadiness.passed) throw new Error(`WMS_COMPONENT_STOCK_READINESS: ${JSON.stringify(wmsReadiness)}`);
  await writeJson('seed-manifest.json', manifest);
  await writeJson('master-data-readiness.json', { readiness, masterDataVerification });
  await writeJson('wms-readiness.json', wmsReadiness);
  await writeJson('labor-wms-seed.json', supportingSeeds);
  await writeJson('planning-matrix-seed.json', { target_date: targetDate, machine_group: machineGroup, ...planningMatrix });
  const demoWorkOrder = await createDemoWorkOrder(manifest, targetDate);
  const planningSnapshots = await verifyPlanningSnapshots(demoWorkOrder.work_order_id);
  await writeJson('traceability-seed.json', traceabilitySeed);
  await writeJson('demo-work-order.json', { target_date: targetDate, ...demoWorkOrder });
  await writeJson('planning-snapshot-verification.json', planningSnapshots);
  await writeJson('summary.json', { success: true, mode, artifactDir, cleanup, workOrderCleanup, traceabilityCleanup, traceabilitySeed, supportingSeeds, machineGroup, planningMatrix, readiness, masterDataVerification, wmsReadiness, demoWorkOrder, planningSnapshots, manifest });
  console.log(json({ success: true, mode, artifactDir, cleanup, workOrderCleanup, traceabilityCleanup, traceabilitySeed, supportingSeeds, machineGroup, planningMatrix, productionVersion: manifest.production_version.code, readiness, masterDataVerification, wmsReadiness, demoWorkOrder, planningSnapshots }));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(async () => { try { await master.end(); } catch {} try { await execution.end(); } catch {} try { await traceability.end(); } catch {} });
