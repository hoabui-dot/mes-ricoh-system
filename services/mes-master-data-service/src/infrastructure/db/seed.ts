import { Pool } from 'pg';
import { normalizeSeedValues } from './seed-i18n.js';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
const ADMIN_USER_ID = '00000000-0000-0000-0000-0000000000ad';

async function upsertMaster(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  table: string,
  values: Record<string, unknown>,
): Promise<string> {
  const record = normalizeSeedValues(table, values);
  const columns = Object.keys(record);
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  const sql = `
    INSERT INTO ${table} (${columns.join(', ')})
    VALUES (${placeholders.join(', ')})
    ON CONFLICT (code, version_no) DO NOTHING
    RETURNING master_id
  `;
  const { rows } = await client.query(sql, columns.map((column) => record[column]));
  const insertedId = rows[0]?.['master_id'];
  if (typeof insertedId === 'string') return insertedId;

  const existing = await client.query(`SELECT master_id FROM ${table} WHERE code = $1 AND version_no = $2`, [
    record['code'],
    record['version_no'] ?? 1,
  ]);
  const id = existing.rows[0]?.['master_id'];
  if (typeof id !== 'string') throw new Error(`Seed failed for ${table}.${String(record['code'])}`);
  return id;
}

export async function seedMasterData(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [SYSTEM_USER_ID]);

    const now = new Date('2026-07-21T00:00:00.000Z');
    const future = new Date('2027-12-31T23:59:59.000Z');
    const common = {
      version_no: 1,
      lifecycle_status: 'Released',
      effective_from: now,
      created_by: SYSTEM_USER_ID,
      approved_by: SYSTEM_USER_ID,
      approved_at: now,
    };

    const siteId = await upsertMaster(client, 'md_site', {
      ...common,
      code: 'SITE-KZ3',
      name: 'S-Factory - Kizuna 3',
      timezone: 'Asia/Ho_Chi_Minh',
      address: 'Kizuna 3, Long An',
    });
    const areaRubberId = await upsertMaster(client, 'md_production_area', {
      ...common,
      code: 'AREA-RUBBER',
      name: 'Rubber Processing Area',
      site_id: siteId,
      area_type: 'Production',
    });
    const areaMoldingId = await upsertMaster(client, 'md_production_area', {
      ...common,
      code: 'AREA-MOLDING',
      name: 'Vulcanization Molding Area',
      site_id: siteId,
      area_type: 'Production',
    });

    const pcsId = await upsertMaster(client, 'md_uom', { ...common, code: 'PCS', name: 'Pieces', uom_class: 'Quantity', decimal_precision: 0 });
    const kgId = await upsertMaster(client, 'md_uom', { ...common, code: 'KG', name: 'Kilogram', uom_class: 'Weight', decimal_precision: 3 });
    const m2Id = await upsertMaster(client, 'md_uom', { ...common, code: 'M2', name: 'Square Meter', uom_class: 'Area', decimal_precision: 3 });
    await upsertMaster(client, 'md_uom_conversion', { ...common, code: 'PCS-PCS', name: 'PCS to PCS', from_uom_id: pcsId, to_uom_id: pcsId, factor: '1' });
    const shiftAId = await upsertMaster(client, 'md_shift', { ...common, code: 'SHIFT-A', name: 'Day Shift', site_id: siteId, start_time: '08:00', end_time: '17:00' });
    await upsertMaster(client, 'md_reason_code', { ...common, code: 'QC-BOND-FAIL', name: 'Bonding Failure', reason_type: 'Quality', requires_comment: true });

    const fgItemId = await upsertMaster(client, 'md_item', { ...common, code: 'FG-WS-CM01', name: 'Cao su chân máy ô tô', item_group: 'FG_RUBBER_METAL', item_type: 'FG', base_uom_id: pcsId });
    const metItemId = await upsertMaster(client, 'md_item', { ...common, code: 'SFG-MET-CM01', name: 'Lõi thép đã xử lý keo dính', item_group: 'SFG_TREATED_METAL', item_type: 'SFG', base_uom_id: pcsId });
    const rubItemId = await upsertMaster(client, 'md_item', { ...common, code: 'SFG-RUB-CM01', name: 'Phôi cao su định lượng', item_group: 'SFG_COMPOUND', item_type: 'SFG', base_uom_id: pcsId });
    const rollItemId = await upsertMaster(client, 'md_item', { ...common, code: 'SFG-ROLL-EPDM', name: 'Tấm cao su mẹ EPDM dạng cuộn', item_group: 'SFG_COMPOUND', item_type: 'SFG', base_uom_id: m2Id });
    const steelItemId = await upsertMaster(client, 'md_item', { ...common, code: 'RM-STL-05', name: 'Thép tấm định hình thô', item_group: 'RM_METAL_BASE', item_type: 'RM', base_uom_id: pcsId });
    const bondItemId = await upsertMaster(client, 'md_item', { ...common, code: 'RM-CHEM-BOND', name: 'Keo lưu hóa đặc chủng', item_group: 'RM_CHEMICALS', item_type: 'RM', base_uom_id: kgId });

    const revisionDefaults = { planning_strategy: 'MakeToStock', tracking_level: 'None', default_scrap_rate: 0 };
    const fgRevId = await upsertMaster(client, 'md_item_revision', { ...common, ...revisionDefaults, code: 'FG-WS-CM01-R1', name: 'FG-WS-CM01 Revision 1', item_id: fgItemId, item_group: 'FG_RUBBER_METAL', base_uom_id: pcsId, procurement_type: 'Make', revision_code: 'R1', site_id: siteId, is_default: true });
    const metRevId = await upsertMaster(client, 'md_item_revision', { ...common, ...revisionDefaults, code: 'SFG-MET-CM01-R1', name: 'Treated metal revision 1', item_id: metItemId, item_group: 'SFG_TREATED_METAL', base_uom_id: pcsId, procurement_type: 'Make', revision_code: 'R1', site_id: siteId, is_default: true });
    const rubRevId = await upsertMaster(client, 'md_item_revision', { ...common, ...revisionDefaults, code: 'SFG-RUB-CM01-R1', name: 'Rubber child blank revision 1', item_id: rubItemId, item_group: 'SFG_COMPOUND', base_uom_id: pcsId, procurement_type: 'Make', revision_code: 'R1', site_id: siteId, is_default: true });
    const rollRevId = await upsertMaster(client, 'md_item_revision', { ...common, ...revisionDefaults, code: 'SFG-ROLL-EPDM-R1', name: 'EPDM parent roll revision 1', item_id: rollItemId, item_group: 'SFG_COMPOUND', base_uom_id: m2Id, procurement_type: 'Make', revision_code: 'R1', site_id: siteId, is_default: true });
    const steelRevId = await upsertMaster(client, 'md_item_revision', { ...common, ...revisionDefaults, code: 'RM-STL-05-R1', name: 'Steel raw material revision 1', item_id: steelItemId, item_group: 'RM_METAL_BASE', base_uom_id: pcsId, procurement_type: 'Buy', revision_code: 'R1', site_id: siteId, is_default: true });
    const bondRevId = await upsertMaster(client, 'md_item_revision', { ...common, ...revisionDefaults, code: 'RM-CHEM-BOND-R1', name: 'Bonding chemical revision 1', item_id: bondItemId, item_group: 'RM_CHEMICALS', base_uom_id: kgId, procurement_type: 'Buy', revision_code: 'R1', site_id: siteId, is_default: true });

    const opMixId = await upsertMaster(client, 'md_operation', { ...common, code: 'OP-MIX', name: 'Luyện cán cao su', operation_type: 'Production', confirmation_mode: 'StartFinish', requires_material_scan: true, requires_output_label: true, is_schedulable: true });
    const opPrepId = await upsertMaster(client, 'md_operation', { ...common, code: 'OP-PREP', name: 'Xử lý lõi kim loại', operation_type: 'Production', confirmation_mode: 'QuantityOnly', requires_material_scan: true, requires_output_label: false, is_schedulable: true });
    const opCutId = await upsertMaster(client, 'md_operation', { ...common, code: 'OP-CUT', name: 'Cắt tách phôi tấm mẹ-con', operation_type: 'Production', confirmation_mode: 'StartFinish', requires_material_scan: true, requires_output_label: true, is_schedulable: true });
    const opMoldId = await upsertMaster(client, 'md_operation', { ...common, code: 'OP-MOLD', name: 'Ép dính và Lưu hóa', operation_type: 'Production', confirmation_mode: 'StartFinish', requires_material_scan: true, requires_output_label: true, is_schedulable: true });
    const opTrimId = await upsertMaster(client, 'md_operation', { ...common, code: 'OP-TRIM', name: 'Cắt bavia / Định hình', operation_type: 'Production', confirmation_mode: 'QuantityOnly', requires_material_scan: false, requires_output_label: false, is_schedulable: true });
    const opQcId = await upsertMaster(client, 'md_operation', { ...common, code: 'OP-QC', name: 'Kiểm tra chất lượng', operation_type: 'Inspection', confirmation_mode: 'StartFinish', requires_material_scan: false, requires_output_label: true, is_schedulable: true });

    const wcMixId = await upsertMaster(client, 'md_work_center', { ...common, code: 'WC-MIXING', name: 'Banbury Mixing Work Center', site_id: siteId, area_id: areaRubberId, work_center_type: 'Production', active_flag: true });
    const wcCutId = await upsertMaster(client, 'md_work_center', { ...common, code: 'WC-CUTTING', name: 'Rubber Cutting Work Center', site_id: siteId, area_id: areaRubberId, work_center_type: 'Production', active_flag: true });
    const wcMoldId = await upsertMaster(client, 'md_work_center', { ...common, code: 'WC-VULCAN-MOLD', name: 'Cụm máy ép thủy lực gia nhiệt', site_id: siteId, area_id: areaMoldingId, work_center_type: 'Production', active_flag: true });
    const wcQcId = await upsertMaster(client, 'md_work_center', { ...common, code: 'WC-QC', name: 'Quality Inspection', site_id: siteId, area_id: areaMoldingId, work_center_type: 'Inspection', active_flag: true });

    const wsMoldId = await upsertMaster(client, 'md_workstation', { ...common, code: 'WS-MOLD-KIOSK01', name: 'Molding Kiosk 01', site_id: siteId, area_id: areaMoldingId, work_center_id: wcMoldId, workstation_type: 'Kiosk', execution_mode: 'Kiosk', active_flag: true });
    const eqHyd01Id = await upsertMaster(client, 'md_equipment', { ...common, code: 'EQ-MOLD-HYD01', name: 'Máy ép 500 tấn', site_id: siteId, work_center_id: wcMoldId, equipment_type: 'HydraulicPress', active_flag: true });
    const eqHyd02Id = await upsertMaster(client, 'md_equipment', { ...common, code: 'EQ-MOLD-HYD02', name: 'Máy ép 300 tấn', site_id: siteId, work_center_id: wcMoldId, equipment_type: 'HydraulicPress', active_flag: true });

    const skillGroupResult = await client.query(`
      INSERT INTO md_skill_group (code, name, description, scope, legacy_flag, lifecycle_status, created_by)
      VALUES
        ('SKG-WC-PROCESS', jsonb_build_object('vi','Năng lực công đoạn Work Center','en','Work Center Process Capabilities','ja','ワークセンター工程能力','ko','Work Center 공정 역량'), jsonb_build_object('vi','Kỹ năng dùng cho năng lực công đoạn sản xuất.','en','Skills used for production process capability.','ja','生産工程能力に使用するスキル。','ko','생산 공정 역량에 사용하는 기술입니다.'), 'WorkCenter', FALSE, 'Released', $1),
        ('SKG-WC-QUALITY', jsonb_build_object('vi','Năng lực kiểm tra Work Center','en','Work Center Inspection Capabilities','ja','ワークセンター検査能力','ko','Work Center 검사 역량'), jsonb_build_object('vi','Kỹ năng dùng cho kiểm tra chất lượng.','en','Skills used for quality inspection capability.','ja','品質検査能力に使用するスキル。','ko','품질 검사 역량에 사용하는 기술입니다.'), 'WorkCenter', FALSE, 'Released', $1)
      ON CONFLICT (code) DO UPDATE SET legacy_flag = FALSE, scope = EXCLUDED.scope
      RETURNING skill_group_id, code
    `, [ADMIN_USER_ID]);
    const skillGroups = new Map(skillGroupResult.rows.map((row: { code: string; skill_group_id: string }) => [row.code, row.skill_group_id]));
    const skillMixId = await upsertMaster(client, 'md_skill', { ...common, code: 'SK-WC-MIX-MASTER', name: 'Kỹ thuật luyện cán cao cấp', skill_group: 'Production', skill_group_id: skillGroups.get('SKG-WC-PROCESS'), scope: 'WorkCenter', legacy_flag: false, minimum_level: 'L3' });
    const skillVulcanId = await upsertMaster(client, 'md_skill', { ...common, code: 'SK-WC-VULCAN-OPERATOR', name: 'Vận hành máy ép lưu hóa áp lực cao', skill_group: 'Production', skill_group_id: skillGroups.get('SKG-WC-PROCESS'), scope: 'WorkCenter', legacy_flag: false, minimum_level: 'L2' });
    const skillInspectionId = await upsertMaster(client, 'md_skill', { ...common, code: 'SK-WC-INSPECTION', name: 'Kỹ thuật viên QC', skill_group: 'Quality', skill_group_id: skillGroups.get('SKG-WC-QUALITY'), scope: 'WorkCenter', legacy_flag: false, minimum_level: 'L2' });

    const mbomId = await upsertMaster(client, 'md_mbom_header', { ...common, code: 'MBOM-FG-WS-CM01-R1', name: 'MBOM Cao su chân máy ô tô', item_revision_id: fgRevId, site_id: siteId, base_quantity: '100.000000', base_uom_id: pcsId });
    await upsertMaster(client, 'md_mbom_line', { ...common, code: 'MBOM-FG-WS-CM01-R1-L10', name: 'Treated metal core', mbom_header_id: mbomId, seq: 10, component_revision_id: metRevId, quantity_per: '100.000000', uom_id: pcsId, scrap_rate: '0.0100', issue_operation_id: opMoldId, backflush_flag: true, phantom_flag: false });
    await upsertMaster(client, 'md_mbom_line', { ...common, code: 'MBOM-FG-WS-CM01-R1-L20', name: 'Rubber child blank', mbom_header_id: mbomId, seq: 20, component_revision_id: rubRevId, quantity_per: '102.000000', uom_id: pcsId, scrap_rate: '0.0200', issue_operation_id: opMoldId, backflush_flag: true, phantom_flag: false });
    await upsertMaster(client, 'md_mbom_line', { ...common, code: 'MBOM-FG-WS-CM01-R1-L30', name: 'Raw steel blank', mbom_header_id: mbomId, seq: 30, component_revision_id: steelRevId, quantity_per: '101.000000', uom_id: pcsId, scrap_rate: '0.0050', issue_operation_id: opPrepId, backflush_flag: false, phantom_flag: false });
    await upsertMaster(client, 'md_mbom_line', { ...common, code: 'MBOM-FG-WS-CM01-R1-L40', name: 'Bonding chemical', mbom_header_id: mbomId, seq: 40, component_revision_id: bondRevId, quantity_per: '1.500000', uom_id: kgId, scrap_rate: '0.0500', issue_operation_id: opPrepId, backflush_flag: true, phantom_flag: false });
    await upsertMaster(client, 'md_mbom_line', { ...common, code: 'MBOM-FG-WS-CM01-R1-L50', name: 'EPDM parent roll phantom', mbom_header_id: mbomId, seq: 50, component_revision_id: rollRevId, quantity_per: '15.500000', uom_id: m2Id, scrap_rate: '0.0300', issue_operation_id: opCutId, backflush_flag: true, phantom_flag: true });

    const childMbomId = await upsertMaster(client, 'md_mbom_header', { ...common, code: 'MBOM-SFG-ROLL-EPDM-R1', name: 'Child MBOM for EPDM phantom roll', item_revision_id: rollRevId, site_id: siteId, base_quantity: '1.000000', base_uom_id: m2Id });
    await upsertMaster(client, 'md_mbom_line', { ...common, code: 'MBOM-SFG-ROLL-EPDM-R1-L10', name: 'Synthetic rubber base', mbom_header_id: childMbomId, seq: 10, component_revision_id: rollRevId, quantity_per: '1.000000', uom_id: m2Id, scrap_rate: '0.0000', issue_operation_id: opMixId, backflush_flag: true, phantom_flag: false });

    const routingId = await upsertMaster(client, 'md_routing_header', { ...common, code: 'RT-FG-WS-CM01-R1', name: 'Routing Cao su chân máy ô tô', item_revision_id: fgRevId, site_id: siteId });
    const roMixId = await upsertMaster(client, 'md_routing_operation', { ...common, code: 'RT-FG-WS-CM01-R1-010', name: 'Mixing', routing_header_id: routingId, operation_id: opMixId, work_center_id: wcMixId, seq: 10 });
    const roPrepId = await upsertMaster(client, 'md_routing_operation', { ...common, code: 'RT-FG-WS-CM01-R1-020', name: 'Metal Prep', routing_header_id: routingId, operation_id: opPrepId, work_center_id: wcMoldId, seq: 20, predecessor_seq: 10 });
    const roCutId = await upsertMaster(client, 'md_routing_operation', { ...common, code: 'RT-FG-WS-CM01-R1-030', name: 'Cutting', routing_header_id: routingId, operation_id: opCutId, work_center_id: wcCutId, seq: 30, predecessor_seq: 20 });
    const roMoldId = await upsertMaster(client, 'md_routing_operation', { ...common, code: 'RT-FG-WS-CM01-R1-040', name: 'Molding', routing_header_id: routingId, operation_id: opMoldId, work_center_id: wcMoldId, seq: 40, predecessor_seq: 30 });
    const roTrimId = await upsertMaster(client, 'md_routing_operation', { ...common, code: 'RT-FG-WS-CM01-R1-050', name: 'Trimming', routing_header_id: routingId, operation_id: opTrimId, work_center_id: wcMoldId, seq: 50, predecessor_seq: 40 });
    const roQcId = await upsertMaster(client, 'md_routing_operation', { ...common, code: 'RT-FG-WS-CM01-R1-060', name: 'QC', routing_header_id: routingId, operation_id: opQcId, work_center_id: wcQcId, seq: 60, predecessor_seq: 50 });

    const standardDefaults = { site_id: siteId, base_quantity: '1.000000', standard_yield: '1.0000', source_method: 'Engineering', valid_from: now };
    await upsertMaster(client, 'md_production_standard', { ...common, ...standardDefaults, code: 'STD-FG-WS-CM01-MOLD-HYD01', name: 'Mold standard HYD01', item_revision_id: fgRevId, routing_operation_id: roMoldId, operation_id: opMoldId, work_center_id: wcMoldId, equipment_id: eqHyd01Id, labor_count: 1, skill_id: skillVulcanId, minimum_level: 'L2', setup_time_min: '15.000', cycle_time_sec: '45.000', efficiency_factor: '0.9200' });
    await upsertMaster(client, 'md_production_standard', { ...common, ...standardDefaults, code: 'STD-FG-WS-CM01-MOLD-HYD02', name: 'Mold standard HYD02', item_revision_id: fgRevId, routing_operation_id: roMoldId, operation_id: opMoldId, work_center_id: wcMoldId, equipment_id: eqHyd02Id, labor_count: 1, skill_id: skillVulcanId, minimum_level: 'L2', setup_time_min: '12.000', cycle_time_sec: '60.000', efficiency_factor: '0.8800' });
    await upsertMaster(client, 'md_production_standard', { ...common, ...standardDefaults, code: 'STD-FG-WS-CM01-MIX', name: 'Mixing standard', item_revision_id: fgRevId, routing_operation_id: roMixId, operation_id: opMixId, work_center_id: wcMixId, labor_count: 1, skill_id: skillMixId, minimum_level: 'L3', setup_time_min: '20.000', cycle_time_sec: '120.000', efficiency_factor: '0.9000' });
    await upsertMaster(client, 'md_production_standard', { ...common, ...standardDefaults, code: 'STD-FG-WS-CM01-PREP', name: 'Metal prep standard', item_revision_id: fgRevId, routing_operation_id: roPrepId, operation_id: opPrepId, work_center_id: wcMoldId, labor_count: 1, skill_id: skillVulcanId, minimum_level: 'L1', setup_time_min: '10.000', cycle_time_sec: '30.000', efficiency_factor: '0.9000' });
    await upsertMaster(client, 'md_production_standard', { ...common, ...standardDefaults, code: 'STD-FG-WS-CM01-CUT', name: 'Cutting standard', item_revision_id: fgRevId, routing_operation_id: roCutId, operation_id: opCutId, work_center_id: wcCutId, labor_count: 1, skill_id: skillVulcanId, minimum_level: 'L1', setup_time_min: '8.000', cycle_time_sec: '20.000', efficiency_factor: '0.9000' });
    await upsertMaster(client, 'md_production_standard', { ...common, ...standardDefaults, code: 'STD-FG-WS-CM01-TRIM', name: 'Trimming standard', item_revision_id: fgRevId, routing_operation_id: roTrimId, operation_id: opTrimId, work_center_id: wcMoldId, labor_count: 1, skill_id: skillVulcanId, minimum_level: 'L1', setup_time_min: '5.000', cycle_time_sec: '15.000', efficiency_factor: '0.9000' });
    await upsertMaster(client, 'md_production_standard', { ...common, ...standardDefaults, code: 'STD-FG-WS-CM01-QC', name: 'QC standard', item_revision_id: fgRevId, routing_operation_id: roQcId, operation_id: opQcId, work_center_id: wcQcId, labor_count: 1, skill_id: skillInspectionId, minimum_level: 'L2', setup_time_min: '5.000', cycle_time_sec: '25.000', efficiency_factor: '0.9000' });
    await upsertMaster(client, 'md_work_instruction', { ...common, code: 'WI-OP-MOLD-CURING', name: 'Curing temperature instruction', operation_id: opMoldId, instruction_text: 'Maintain curing range 150°C - 180°C before confirmation.' });
    await upsertMaster(client, 'md_resource_assignment', { ...common, code: 'ASSIGN-MOLD-KIOSK01', name: 'Molding kiosk assignment', site_id: siteId, work_center_id: wcMoldId, workstation_id: wsMoldId, equipment_id: eqHyd01Id, assignment_type: 'Primary', assignment_role: 'Primary', scheduling_flag: true, oee_aggregation_flag: true });

    for (const [operationId, wcId, code] of [
      [opMixId, wcMixId, 'CAP-MIX'],
      [opPrepId, wcMoldId, 'CAP-PREP'],
      [opCutId, wcCutId, 'CAP-CUT'],
      [opMoldId, wcMoldId, 'CAP-MOLD'],
      [opTrimId, wcMoldId, 'CAP-TRIM'],
      [opQcId, wcQcId, 'CAP-QC'],
    ] as const) {
      await upsertMaster(client, 'md_resource_capability', { ...common, code, name: `${code} capability`, site_id: siteId, product_revision_id: fgRevId, operation_id: operationId, work_center_id: wcId, capability_type: 'Eligible', cycle_time_sec: '60', eligibility: true, priority_no: 1, speed_factor: '1.0000', active_flag: true });
    }
    await upsertMaster(client, 'md_resource_calendar', { ...common, code: 'CAL-WC-VULCAN-MOLD-2026', name: 'Molding availability 2026', site_id: siteId, resource_type: 'Equipment', resource_id: eqHyd01Id, workstation_id: wsMoldId, shift_id: shiftAId, calendar_date: now.toISOString().slice(0, 10), work_center_id: wcMoldId, equipment_id: eqHyd01Id, available_from: now, available_to: future, available_minutes: 540, capacity_factor: '1.0000', capacity_percent: '1.0000' });
    await upsertMaster(client, 'md_operation_skill_requirement', { ...common, code: 'REQ-OP-MIX-SKILL', name: 'Mix skill requirement', site_id: siteId, routing_operation_id: roMixId, operation_id: opMixId, skill_id: skillMixId, minimum_level: 'L3', required_persons: 1, mandatory_flag: true, active_flag: true });
    await upsertMaster(client, 'md_operation_skill_requirement', { ...common, code: 'REQ-OP-MOLD-SKILL', name: 'Mold skill requirement', site_id: siteId, routing_operation_id: roMoldId, operation_id: opMoldId, skill_id: skillVulcanId, minimum_level: 'L2', required_persons: 2, mandatory_flag: true, active_flag: true });
    await upsertMaster(client, 'md_operation_skill_requirement', { ...common, code: 'REQ-OP-QC-SKILL', name: 'QC skill requirement', site_id: siteId, routing_operation_id: roQcId, operation_id: opQcId, skill_id: skillInspectionId, minimum_level: 'L2', required_persons: 1, mandatory_flag: true, active_flag: true });
    await upsertMaster(client, 'md_role_permission', { ...common, code: 'PERM-PROD-MANAGER-APPROVE', name: 'Production manager can approve master data', role_code: 'PROD_MANAGER', permission_code: 'MES_MASTER_DATA_APPROVE', resource_type: 'MES_MASTER_DATA', action: 'APPROVE' });
    await upsertMaster(client, 'md_user_resource_scope', { ...common, code: 'SCOPE-ADMIN-SITE-KZ3', name: 'Admin scope for Kizuna 3', user_id: ADMIN_USER_ID, role_code: 'PROD_MANAGER', scope_type: 'SITE', scope_resource_id: siteId, condition_expression: 'site_id = SITE-KZ3' });

    await upsertMaster(client, 'md_production_version', { ...common, code: 'PV-FG-WS-CM01-R1', name: 'Production Version FG-WS-CM01 R1', item_revision_id: fgRevId, mbom_header_id: mbomId, routing_header_id: routingId, site_id: siteId, is_default: true });

    await client.query('COMMIT');
    console.info('[Seed] MES master data seed applied');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
