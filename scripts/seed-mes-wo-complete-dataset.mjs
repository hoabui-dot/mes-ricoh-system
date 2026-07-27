#!/usr/bin/env node

/*
 * Seeds one complete, owned MES Work Order master-data scenario. The reset is
 * deliberately prefix-scoped so shared factory master data remains intact.
 * Transactional WO cleanup is handled by reset-mes-wo-test-data.mjs.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import pg from 'pg';

const { Client } = pg;
const masterUrl = process.env.MES_MASTER_DATA_DATABASE_URL || 'postgresql://mes_master_data_user:mes_master_data_pass@localhost:15434/mes_master_data_db';
const executionUrl = process.env.MES_EXECUTION_DATABASE_URL || 'postgresql://mes_execution_user:mes_execution_pass@localhost:15435/mes_execution_db';
const masterBase = (process.env.MES_MASTER_DATA_URL || 'http://localhost:13020/api/mes/master-data').replace(/\/$/, '');
const wmsInventoryUrl = process.env.WMS_INVENTORY_DATABASE_URL || process.env.WMS_INVENTORY_URL || 'postgresql://wms_inventory_owner:wms_inventory_owner_pass@localhost:15439/wms_inventory_db';
const userId = process.env.MES_SEED_USER_ID || '00000000-0000-0000-0000-000000000001';
const roleCode = process.env.MES_SEED_ROLE_CODE || 'PLANT_MANAGER';
const traceId = `seed-complete-mes-wo-${Date.now()}`;
const mode = process.argv.includes('--seed') ? 'seed' : 'dry-run';
const envName = String(process.env.MES_ENV || '').trim().toLowerCase();
const artifactDir = path.resolve(process.env.ARTIFACT_DIR || `artifacts/mes-reset-seed-verify/${new Date().toISOString().replaceAll(/[:.]/g, '-')}`);
const master = new Client({ connectionString: masterUrl });
const execution = new Client({ connectionString: executionUrl });
const names = {
  item: 'E2E-WO-FG-01',
  component: 'SFG-MET-CM01-R1',
  routing: 'E2E-WO-ROUTING-01',
  mbom: 'E2E-WO-MBOM-01',
  pvNameVi: 'Cấu hình E2E WO in nhãn',
  operationPrefix: 'E2E-WO-OP-',
};
const ownedOperationNames = ['Chuẩn bị', 'In nhãn vật lý', 'Xác nhận chất lượng'];
const headers = { 'Content-Type': 'application/json', 'X-User-ID': userId, 'X-Role-Code': roleCode, 'X-Trace-ID': traceId };
const json = (value) => JSON.stringify(value, null, 2);
const writeJson = (name, value) => fs.writeFile(path.join(artifactDir, name), json(value));

function safety() {
  const masterIdentity = new URL(masterUrl);
  const executionIdentity = new URL(executionUrl);
  const reasons = [];
  if (!['development', 'local', 'test', 'staging'].includes(envName)) reasons.push('MES_ENV must be development, local, test, or staging');
  if (!['localhost', '127.0.0.1', '::1'].includes(masterIdentity.hostname) || !['localhost', '127.0.0.1', '::1'].includes(executionIdentity.hostname)) reasons.push('seed database hosts must be local/test hosts');
  if (mode === 'seed' && process.env.CONFIRM_MASTER_DATA_RESET !== 'YES_RESET_E2E_MASTER_DATA') reasons.push('CONFIRM_MASTER_DATA_RESET must equal YES_RESET_E2E_MASTER_DATA');
  return { passed: reasons.length === 0, mode, environment: envName || null, reasons, master: { host: masterIdentity.hostname, port: masterIdentity.port, database: masterIdentity.pathname.slice(1), user: masterIdentity.username }, execution: { host: executionIdentity.hostname, port: executionIdentity.port, database: executionIdentity.pathname.slice(1), user: executionIdentity.username } };
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

async function getContext() {
  const [sites, workCenters, workstations, uoms, revisions] = await Promise.all([
    data('/sites?limit=500'), data('/work-centers?limit=500'), data('/workstations?limit=500'), data('/uoms?limit=500'), data('/item-revisions?limit=500'),
  ]);
  const site = sites.find((row) => row.code === (process.env.E2E_SITE_CODE || 'SITE-KZ3') && row.lifecycle_status === 'Released');
  if (!site) throw new Error('SEED_MASTER_DATA: released SITE-KZ3 is required');
  const workstation = workstations.find((row) => row.code === (process.env.E2E_WORKSTATION_CODE || 'WS-20260727-0006') && row.lifecycle_status === 'Released' && row.active_flag !== false);
  if (!workstation) throw new Error('SEED_MASTER_DATA: released physical-print workstation is required');
  const workCenter = workCenters.find((row) => row.master_id === workstation.work_center_id) || workCenters.find((row) => row.code === 'WC-MIXING');
  const pcs = uoms.find((row) => row.code === 'PCS' && row.lifecycle_status === 'Released');
  const component = revisions.find((row) => row.revision_code === names.component || row.code === names.component);
  if (!workCenter || !pcs || !component) throw new Error('SEED_MASTER_DATA: work center, PCS UOM, and released component revision are required');
  return { site, workstation, workCenter, pcs, component };
}

async function cleanupOwned() {
  const result = {};
  // In the development baseline all PV/MBOM/RT records are disposable test
  // configuration. FG/SFG/RM items are retained because WMS lots and shared
  // factory fixtures depend on their released revisions.
  const owned = {
    routeCodes: [], routeIds: [], mbomCodes: [], mbomIds: [], pvCodes: [], pvIds: [],
    itemCodes: [], itemIds: [], itemRevisionIds: [],
  };
  const routes = await master.query(`SELECT master_id, code FROM md_routing_header WHERE code LIKE 'RT-%'`);
  const mboms = await master.query(`SELECT master_id, code FROM md_mbom_header WHERE code LIKE 'MBOM-%' OR code LIKE 'E2E-WO-%'`);
  const pvs = await master.query(`SELECT master_id, code FROM md_production_version WHERE code LIKE 'PV-%'`);
  const items = await master.query(`SELECT master_id, code FROM md_item WHERE code LIKE 'DEMO-%' OR code LIKE 'ITEM-%' OR code LIKE 'E2E-WO-%'`);
  const revisions = await master.query(`SELECT r.master_id, r.code FROM md_item_revision r JOIN md_item i ON i.master_id=r.item_id WHERE i.code LIKE 'DEMO-%' OR i.code LIKE 'ITEM-%' OR i.code LIKE 'E2E-WO-%'`);
  owned.routeCodes = routes.rows.map((row) => row.code); owned.routeIds = routes.rows.map((row) => row.master_id);
  owned.mbomCodes = mboms.rows.map((row) => row.code); owned.mbomIds = mboms.rows.map((row) => row.master_id);
  owned.pvCodes = pvs.rows.map((row) => row.code); owned.pvIds = pvs.rows.map((row) => row.master_id);
  owned.itemCodes = items.rows.map((row) => row.code); owned.itemIds = items.rows.map((row) => row.master_id);
  owned.itemRevisionIds = revisions.rows.map((row) => row.master_id);
  await master.query('BEGIN');
  try {
    await master.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
    const operationIds = await master.query(`SELECT master_id FROM md_operation WHERE name->>'vi' = ANY($1::text[])`, [ownedOperationNames]);
    const opList = operationIds.rows.map((row) => row.master_id);
    const routeList = owned.routeIds;
    const mbomList = owned.mbomIds;
    const statements = [
      ['workstation_capabilities', `DELETE FROM md_workstation_operation_capability WHERE operation_id=ANY($1::uuid[])`, opList],
      ['resource_capabilities', `DELETE FROM md_resource_capability WHERE operation_id=ANY($1::uuid[])`, opList],
      ['operation_skills', `DELETE FROM md_operation_skill_requirement WHERE operation_id=ANY($1::uuid[])`, opList],
      ['production_standards', `DELETE FROM md_production_standard WHERE operation_id=ANY($1::uuid[]) OR routing_operation_id IN (SELECT master_id FROM md_routing_operation WHERE routing_header_id=ANY($1::uuid[]))`, routeList],
      ['mbom_lines', `DELETE FROM md_mbom_line WHERE mbom_header_id=ANY($1::uuid[])`, mbomList],
      ['routing_operations', `DELETE FROM md_routing_operation WHERE routing_header_id=ANY($1::uuid[])`, routeList],
      ['ebom_lines', `DELETE FROM md_ebom_line WHERE component_revision_id=ANY($1::uuid[]) OR ebom_header_id IN (SELECT master_id FROM md_ebom_header WHERE item_revision_id=ANY($1::uuid[]))`, owned.itemRevisionIds],
      ['ebom_headers', `DELETE FROM md_ebom_header WHERE item_revision_id=ANY($1::uuid[])`, owned.itemRevisionIds],
      ['component_substitutes', `DELETE FROM md_component_substitute WHERE substitute_revision_id=ANY($1::uuid[])`, owned.itemRevisionIds],
      ['revision_production_standards', `DELETE FROM md_production_standard WHERE item_revision_id=ANY($1::uuid[])`, owned.itemRevisionIds],
      ['item_revision_numbering', `DELETE FROM md_item_revision_numbering WHERE item_id=ANY($1::uuid[])`, owned.itemIds],
      ['production_versions', `DELETE FROM md_production_version WHERE master_id=ANY($1::uuid[])`, owned.pvIds],
      ['routing_headers', `DELETE FROM md_routing_header WHERE master_id=ANY($1::uuid[])`, owned.routeIds],
      ['mbom_headers', `DELETE FROM md_mbom_header WHERE master_id=ANY($1::uuid[])`, owned.mbomIds],
      ['item_revisions', `DELETE FROM md_item_revision WHERE master_id=ANY($1::uuid[])`, owned.itemRevisionIds],
      ['items', `DELETE FROM md_item WHERE master_id=ANY($1::uuid[])`, owned.itemIds],
      ['operations', `DELETE FROM md_operation WHERE name->>'vi' = ANY($1::text[])`, ownedOperationNames],
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

async function seedSupportingData() {
  runCommand('bash', ['scripts/seed-mes-labor-demo.sh'], 'Seeding employees, shifts, skills, and work calendars');
  runCommand('npx', ['tsx', 'scripts/seed-wms-demo.ts'], 'Seeding WMS locations, lots, inventory, inbound, and outbound demo data');
  return { labor: true, wms: true };
}

async function verifyWmsComponentStock(component, requiredQty = 2) {
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
        AND (l.expiry_date IS NULL OR l.expiry_date >= DATE '2026-08-01')
      ORDER BY l.expiry_date NULLS LAST, l.lot_code, b.location_id`, [component.master_id]);
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
  const item = await data('/items', { method: 'POST', body: JSON.stringify({ code: names.item, name: localized, item_type: 'FG', item_group: 'E2E', base_uom_id: context.pcs.master_id, site_id: context.site.master_id }) });
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
  const routingOperations = await data(`/routing-headers/${routing.master_id}/operations`, { method: 'PUT', body: JSON.stringify({ operations: operations.map((op, index) => ({ operation_id: op.master_id, work_center_id: context.workCenter.master_id, seq: (index + 1) * 10, predecessor_seq: index ? index * 10 : null, scheduling_mode: 'Finite', queue_time_min: 2, move_time_min: 1, overlap_allowed: false, transfer_batch_qty: 1, milestone_flag: index === 2, planning_mode: 'ROUTING_OVERRIDE', required_workers: 1, setup_time_min: 5, cycle_time_sec: operationSpecs[index].cycle, efficiency_factor: 1, base_quantity: 1, standard_yield: 1 })) }) });
  for (const routingOperation of routingOperations) await data(`/routing-operations/${routingOperation.master_id}/release`, { method: 'POST', body: '{}' });
  const releasedRouting = await data(`/routing-headers/${routing.master_id}/release`, { method: 'POST', body: '{}' });
  const mbom = await data('/mbom-headers', { method: 'POST', body: JSON.stringify({ code: names.mbom, name: { vi: 'MBOM E2E WO in nhãn', en: 'E2E WO Label MBOM', ja: 'E2E WO ラベルMBOM', ko: 'E2E WO MBOM' }, site_id: context.site.master_id, base_quantity: 1, base_uom_id: context.pcs.master_id, purpose: 'Standard', business_version: '1' }) });
  await data('/mbom-lines', { method: 'POST', body: JSON.stringify({ code: 'E2E-WO-MBOM-L01', name: 'E2E metal component', mbom_header_id: mbom.master_id, seq: 10, component_revision_id: component.master_id, quantity_per: 1, uom_id: context.pcs.master_id, scrap_rate: 0, issue_operation_id: operations[0].master_id, backflush_flag: false, phantom_flag: false }) });
  await data(`/mbom-headers/${mbom.master_id}/release`, { method: 'POST', body: '{}' });
  const pv = await data('/production-versions', { method: 'POST', body: JSON.stringify({ name_i18n: { vi: names.pvNameVi, en: 'E2E WO Label Production Version', ja: 'E2E WO ラベル生産バージョン', ko: 'E2E WO 라벨 생산 버전' }, item_revision_id: revision.master_id, mbom_header_id: mbom.master_id, routing_header_id: routing.master_id, min_lot_size: 1, max_lot_size: 100, is_default: false }) });
  const validation = await data(`/production-versions/${pv.master_id}/validate`, { method: 'POST', body: '{}' });
  if (!validation.valid) throw new Error(`PRODUCTION_VERSION_READINESS: ${JSON.stringify(validation.failures || validation)}`);
  const releasedPV = await data(`/production-versions/${pv.master_id}/release`, { method: 'POST', body: '{}' });
  // Some legacy release handlers return the pre-transition DTO. The database
  // transition and readiness endpoint are authoritative, so keep the manifest
  // truthful instead of recording a stale Draft status.
  const releasedItem = { ...item, lifecycle_status: 'Released', revision: { ...revision, lifecycle_status: 'Released' } };
  const releasedRevision = { ...revision, lifecycle_status: 'Released' };
  const releasedMbom = { ...mbom, lifecycle_status: 'Released' };
  const releasedRoutingManifest = { ...releasedRouting, lifecycle_status: 'Released' };
  const releasedProductionVersion = { ...releasedPV, lifecycle_status: 'Released' };
  return { item: releasedItem, revision: releasedRevision, component, operations, routing: releasedRoutingManifest, mbom: releasedMbom, production_version: releasedProductionVersion, workstation: context.workstation, work_center: context.workCenter, site: context.site, uom: context.pcs };
}

async function rebuildOwnedReadModel(manifest) {
  const revision = (await master.query(`SELECT r.*, i.code AS item_code FROM md_item_revision r JOIN md_item i ON i.master_id=r.item_id WHERE r.master_id=$1`, [manifest.revision.master_id])).rows[0];
  const mbom = (await master.query(`SELECT * FROM md_mbom_header WHERE master_id=$1`, [manifest.mbom.master_id])).rows[0];
  const mbomLines = (await master.query(`SELECT l.*, i.code AS component_item_code FROM md_mbom_line l JOIN md_item_revision r ON r.master_id=l.component_revision_id JOIN md_item i ON i.master_id=r.item_id WHERE l.mbom_header_id=$1 AND l.effective_to IS NULL`, [manifest.mbom.master_id])).rows;
  const routing = (await master.query(`SELECT * FROM md_routing_header WHERE master_id=$1`, [manifest.routing.master_id])).rows[0];
  const routingOps = (await master.query(`
    SELECT ro.*, op.code AS operation_code, op.requires_output_label,
      wc.site_id,
      COALESCE(ps.base_quantity, op.default_base_quantity) AS resolved_base_quantity,
      COALESCE(ps.setup_time_min, op.default_setup_time_min) AS resolved_setup_time_min,
      COALESCE(ps.cycle_time_sec, op.default_cycle_time_sec) AS resolved_cycle_time_sec,
      COALESCE(ps.labor_count, op.default_required_persons) AS resolved_required_workers,
      COALESCE(ps.efficiency_factor, op.default_efficiency_factor) AS resolved_efficiency_factor,
      COALESCE(ps.standard_yield, op.default_yield) AS resolved_standard_yield
    FROM md_routing_operation ro JOIN md_operation op ON op.master_id=ro.operation_id JOIN md_work_center wc ON wc.master_id=ro.work_center_id
    LEFT JOIN LATERAL (SELECT * FROM md_production_standard p WHERE p.routing_operation_id=ro.master_id AND p.effective_to IS NULL ORDER BY p.valid_from DESC NULLS LAST LIMIT 1) ps ON TRUE
    WHERE ro.routing_header_id=$1 AND ro.lifecycle_status='Released' AND ro.effective_to IS NULL ORDER BY ro.seq`, [manifest.routing.master_id])).rows;
  const pv = (await master.query(`SELECT * FROM md_production_version WHERE master_id=$1`, [manifest.production_version.master_id])).rows[0];
  await execution.query('BEGIN');
  try {
    await execution.query(`INSERT INTO rm_item_revision (master_id, code, name, revision_code, item_type, site_id, base_uom_id, lifecycle_status, updated_at) VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,NOW()) ON CONFLICT (master_id) DO UPDATE SET code=EXCLUDED.code,name=EXCLUDED.name,revision_code=EXCLUDED.revision_code,item_type=EXCLUDED.item_type,site_id=EXCLUDED.site_id,base_uom_id=EXCLUDED.base_uom_id,lifecycle_status=EXCLUDED.lifecycle_status,updated_at=NOW()`, [revision.master_id, revision.code, JSON.stringify(revision.name), revision.revision_code, 'FG', revision.site_id, revision.base_uom_id, revision.lifecycle_status]);
    await execution.query(`INSERT INTO rm_mbom_header (master_id, code, name, site_id, base_quantity, base_uom_id, lifecycle_status, updated_at) VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,NOW()) ON CONFLICT (master_id) DO UPDATE SET code=EXCLUDED.code,name=EXCLUDED.name,site_id=EXCLUDED.site_id,base_quantity=EXCLUDED.base_quantity,base_uom_id=EXCLUDED.base_uom_id,lifecycle_status=EXCLUDED.lifecycle_status,updated_at=NOW()`, [mbom.master_id, mbom.code, JSON.stringify(mbom.name), mbom.site_id, mbom.base_quantity, mbom.base_uom_id, mbom.lifecycle_status]);
    await execution.query(`DELETE FROM rm_mbom_line WHERE mbom_header_id=$1`, [mbom.master_id]);
    for (const line of mbomLines) await execution.query(`INSERT INTO rm_mbom_line (master_id,mbom_header_id,parent_line_id,seq,component_revision_id,component_item_code,quantity_per,uom_id,scrap_rate,issue_operation_id,backflush_flag,phantom_flag) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [line.master_id, line.mbom_header_id, line.parent_line_id, line.seq, line.component_revision_id, line.component_item_code, line.quantity_per, line.uom_id, line.scrap_rate, line.issue_operation_id, line.backflush_flag, line.phantom_flag]);
    await execution.query(`INSERT INTO rm_routing_header (master_id,code,item_revision_id,site_id,lifecycle_status,updated_at) VALUES ($1,$2,NULL,$3,$4,NOW()) ON CONFLICT (master_id) DO UPDATE SET code=EXCLUDED.code,site_id=EXCLUDED.site_id,lifecycle_status=EXCLUDED.lifecycle_status,updated_at=NOW()`, [routing.master_id, routing.code, contextSiteId(manifest), routing.lifecycle_status]);
    await execution.query(`DELETE FROM rm_routing_operation WHERE routing_header_id=$1`, [routing.master_id]);
    for (const op of routingOps) await execution.query(`INSERT INTO rm_routing_operation (master_id,routing_header_id,operation_id,operation_code,work_center_id,seq,predecessor_seq,planning_mode,resolved_source,resolved_base_quantity,resolved_setup_time_min,resolved_cycle_time_sec,resolved_required_workers,resolved_efficiency_factor,resolved_standard_yield,requires_output_label,workstation_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ROUTING_OVERRIDE',$9,$10,$11,$12,$13,$14,$15,$16)`, [op.master_id, op.routing_header_id, op.operation_id, op.operation_code, op.work_center_id, op.seq, op.predecessor_seq, op.planning_mode, op.resolved_base_quantity, op.resolved_setup_time_min, op.resolved_cycle_time_sec, op.resolved_required_workers, op.resolved_efficiency_factor, op.resolved_standard_yield, op.requires_output_label, manifest.workstation.master_id]);
    await execution.query(`INSERT INTO rm_production_version (master_id,code,name_i18n,item_revision_id,mbom_header_id,routing_header_id,site_id,lifecycle_status,is_default,min_lot_size,max_lot_size,updated_at) VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11,NOW()) ON CONFLICT (master_id) DO UPDATE SET code=EXCLUDED.code,name_i18n=EXCLUDED.name_i18n,item_revision_id=EXCLUDED.item_revision_id,mbom_header_id=EXCLUDED.mbom_header_id,routing_header_id=EXCLUDED.routing_header_id,site_id=EXCLUDED.site_id,lifecycle_status=EXCLUDED.lifecycle_status,min_lot_size=EXCLUDED.min_lot_size,max_lot_size=EXCLUDED.max_lot_size,updated_at=NOW()`, [pv.master_id, pv.code, JSON.stringify(pv.name_i18n), pv.item_revision_id, pv.mbom_header_id, pv.routing_header_id, pv.site_id, pv.lifecycle_status, pv.is_default, pv.min_lot_size, pv.max_lot_size]);
    await execution.query('COMMIT');
  } catch (error) { await execution.query('ROLLBACK'); throw new Error(`ROUTING_READ_MODEL: ${error.message}`); }
}

function contextSiteId(manifest) { return manifest.site.master_id; }

async function preflight(manifest) {
  const ready = await data('/production-ready-versions?limit=500&planned_date=2026-08-01');
  const candidate = ready.find((row) => row.production_version_code === manifest.production_version.code || row.production_version_id === manifest.production_version.master_id);
  const printReadiness = await data(`/workstations/${manifest.workstation.master_id}/print-station-readiness`);
  return { productionVersionReady: Boolean(candidate?.ready), candidate, printReadiness, expectedOperationCount: 3, operationCodes: manifest.operations.map((row) => row.code), mbomLineCount: 1 };
}

async function main() {
  await fs.mkdir(artifactDir, { recursive: true });
  const guard = safety(); await writeJson('environment.json', guard);
  if (!guard.passed) throw new Error(`ENVIRONMENT_SAFETY: ${guard.reasons.join('; ')}`);
  await master.connect(); await execution.connect();
  const context = await getContext();
  const plan = { ownedCodes: names, reused: { site: context.site.code, work_center: context.workCenter.code, workstation: context.workstation.code, component_revision: context.component.code, uom: context.pcs.code }, mode };
  await writeJson('seed-plan.json', plan);
  if (mode === 'dry-run') { console.log(json({ success: true, mode, artifactDir, plan })); return; }
  const workOrderCleanup = await cleanupWorkOrderSnapshots();
  const cleanup = await cleanupOwned();
  const manifest = await createScenario(context);
  const supportingSeeds = await seedSupportingData();
  await rebuildOwnedReadModel(manifest);
  const readiness = await preflight(manifest);
  if (!readiness.productionVersionReady) throw new Error(`PRODUCTION_VERSION_READINESS: ${JSON.stringify(readiness)}`);
  const wmsReadiness = await verifyWmsComponentStock(context.component, 2);
  if (!wmsReadiness.passed) throw new Error(`WMS_COMPONENT_STOCK_READINESS: ${JSON.stringify(wmsReadiness)}`);
  await writeJson('seed-manifest.json', manifest);
  await writeJson('master-data-readiness.json', readiness);
  await writeJson('wms-readiness.json', wmsReadiness);
  await writeJson('labor-wms-seed.json', supportingSeeds);
  await writeJson('summary.json', { success: true, mode, artifactDir, cleanup, workOrderCleanup, supportingSeeds, readiness, wmsReadiness, manifest });
  console.log(json({ success: true, mode, artifactDir, cleanup, workOrderCleanup, supportingSeeds, productionVersion: manifest.production_version.code, readiness, wmsReadiness }));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(async () => { try { await master.end(); } catch {} try { await execution.end(); } catch {} });
