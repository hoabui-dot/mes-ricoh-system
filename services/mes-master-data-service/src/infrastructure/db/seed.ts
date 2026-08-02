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
  const conflictTarget = table === 'md_material_group' ? '((UPPER(code)))' : '(code, version_no)';
  const sql = `
    INSERT INTO ${table} (${columns.join(', ')})
    VALUES (${placeholders.join(', ')})
    ON CONFLICT ${conflictTarget} DO NOTHING
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
	    const shopfloorResult = await client.query(`
	      INSERT INTO md_shopfloor (code, name, description, site_id, lifecycle_status, effective_from, created_by, version_no)
	      VALUES ('SF-KZ3-MAIN', $1::jsonb, $2::jsonb, $3, 'Released', $4, $5, 1)
	      ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, site_id=EXCLUDED.site_id, lifecycle_status='Released', effective_to=NULL, updated_by=$5, updated_at=NOW()
	      RETURNING master_id
	    `, [
	      JSON.stringify({ vi: 'Xưởng chính Kizuna 3', en: 'Kizuna 3 Main Shopfloor', ja: 'キズナ3 メイン現場', ko: '키즈나 3 메인 작업장' }),
	      JSON.stringify({ vi: 'Xưởng sản xuất MES canonical.', en: 'Canonical MES production shopfloor.', ja: 'MES 標準生産現場。', ko: 'MES 표준 생산 작업장.' }),
	      siteId,
	      now,
	      SYSTEM_USER_ID,
	    ]);
	    const shopfloorId = String(shopfloorResult.rows[0]['master_id']);
	    await client.query(`
	      INSERT INTO md_print_station (code, name, description, site_id, shopfloor_id, gateway_base_url, deployment_mode, status, capabilities, software_version, is_active, created_by, updated_by, configured_allocation_limit)
	      VALUES ('PS-CANONICAL-01', $1::jsonb, $2::jsonb, $3, $4, 'http://print-station-adapter:8080', 'SIMULATION', 'ONLINE', $5::jsonb, 'canonical-seed', TRUE, $6, $6, 10)
	      ON CONFLICT ((LOWER(code))) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, site_id=EXCLUDED.site_id, shopfloor_id=EXCLUDED.shopfloor_id, gateway_base_url=EXCLUDED.gateway_base_url, deployment_mode=EXCLUDED.deployment_mode, status='ONLINE', capabilities=EXCLUDED.capabilities, software_version=EXCLUDED.software_version, is_active=TRUE, updated_by=$6, updated_at=NOW(), configured_allocation_limit=10
	    `, [
	      JSON.stringify({ vi: 'Trạm in canonical 01', en: 'Canonical Print Station 01', ja: '標準印刷ステーション01', ko: '표준 프린트 스테이션 01' }),
	      JSON.stringify({ vi: 'Trạm in dùng cho canonical MES flow.', en: 'Print station for canonical MES flows.', ja: 'MES 標準フロー用印刷ステーション。', ko: 'MES 표준 흐름용 프린트 스테이션.' }),
	      siteId,
	      shopfloorId,
	      JSON.stringify(['WORK_ORDER_LABEL', 'QR']),
	      SYSTEM_USER_ID,
	    ]);
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

    const pcsId = await upsertMaster(client, 'md_uom', { ...common, code: 'PCS', name: 'Piece', uom_class: 'Count', decimal_precision: 0, allow_fraction: false });
    const kgId = await upsertMaster(client, 'md_uom', { ...common, code: 'KG', name: 'Kilogram', uom_class: 'Weight', decimal_precision: 3, allow_fraction: true });
    const m2Id = await upsertMaster(client, 'md_uom', { ...common, code: 'M2', name: 'Square metre', uom_class: 'Area', decimal_precision: 4, allow_fraction: true });
    await upsertMaster(client, 'md_uom', { ...common, code: 'G', name: 'Gram', uom_class: 'Weight', decimal_precision: 3, allow_fraction: true });
    await upsertMaster(client, 'md_uom', { ...common, code: 'M', name: 'Metre', uom_class: 'Length', decimal_precision: 3, allow_fraction: true });
    await upsertMaster(client, 'md_uom', { ...common, code: 'L', name: 'Litre', uom_class: 'Volume', decimal_precision: 3, allow_fraction: true });
    await upsertMaster(client, 'md_uom', { ...common, code: 'MIN', name: 'Minute', uom_class: 'Time', decimal_precision: 2, allow_fraction: true });
    const shiftAId = await upsertMaster(client, 'md_shift', { ...common, code: 'SHIFT-A', name: 'Day Shift', site_id: siteId, start_time: '08:00', end_time: '17:00' });
    await upsertMaster(client, 'md_reason_code', { ...common, code: 'QC-BOND-FAIL', name: 'Bonding Failure', reason_type: 'Quality', requires_comment: true });

    const materialGroupIds = new Map<string, string>();
    for (const code of ['FG_RUBBER_METAL', 'SFG_TREATED_METAL', 'SFG_COMPOUND', 'RM_METAL_BASE', 'RM_CHEMICALS']) {
      materialGroupIds.set(code, await upsertMaster(client, 'md_material_group', { ...common, code, name: code }));
    }

    const fgItemId = await upsertMaster(client, 'md_item', { ...common, code: 'FG-WS-CM01', name: 'Cao su chân máy ô tô', item_group: 'FG_RUBBER_METAL', material_group_id: materialGroupIds.get('FG_RUBBER_METAL'), item_type: 'FG', base_uom_id: pcsId });
    const metItemId = await upsertMaster(client, 'md_item', { ...common, code: 'SFG-MET-CM01', name: 'Lõi thép đã xử lý keo dính', item_group: 'SFG_TREATED_METAL', material_group_id: materialGroupIds.get('SFG_TREATED_METAL'), item_type: 'SFG', base_uom_id: pcsId });
    const rubItemId = await upsertMaster(client, 'md_item', { ...common, code: 'SFG-RUB-CM01', name: 'Phôi cao su định lượng', item_group: 'SFG_COMPOUND', material_group_id: materialGroupIds.get('SFG_COMPOUND'), item_type: 'SFG', base_uom_id: pcsId });
    const rollItemId = await upsertMaster(client, 'md_item', { ...common, code: 'SFG-ROLL-EPDM', name: 'Tấm cao su mẹ EPDM dạng cuộn', item_group: 'SFG_COMPOUND', material_group_id: materialGroupIds.get('SFG_COMPOUND'), item_type: 'SFG', base_uom_id: m2Id });
    const steelItemId = await upsertMaster(client, 'md_item', { ...common, code: 'RM-STL-05', name: 'Thép tấm định hình thô', item_group: 'RM_METAL_BASE', material_group_id: materialGroupIds.get('RM_METAL_BASE'), item_type: 'RM', base_uom_id: pcsId });
    const bondItemId = await upsertMaster(client, 'md_item', { ...common, code: 'RM-CHEM-BOND', name: 'Keo lưu hóa đặc chủng', item_group: 'RM_CHEMICALS', material_group_id: materialGroupIds.get('RM_CHEMICALS'), item_type: 'RM', base_uom_id: kgId });

    const revisionDefaults = { planning_strategy: 'MakeToStock', tracking_level: 'None', default_scrap_rate: 0 };
    const fgRevId = await upsertMaster(client, 'md_item_revision', { ...common, ...revisionDefaults, code: 'FG-WS-CM01-R1', name: 'FG-WS-CM01 Revision 1', item_id: fgItemId, item_group: 'FG_RUBBER_METAL', material_group_id: materialGroupIds.get('FG_RUBBER_METAL'), base_uom_id: pcsId, procurement_type: 'Make', revision_code: 'R1', site_id: siteId, is_default: true });
    const metRevId = await upsertMaster(client, 'md_item_revision', { ...common, ...revisionDefaults, code: 'SFG-MET-CM01-R1', name: 'Treated metal revision 1', item_id: metItemId, item_group: 'SFG_TREATED_METAL', material_group_id: materialGroupIds.get('SFG_TREATED_METAL'), base_uom_id: pcsId, procurement_type: 'Make', revision_code: 'R1', site_id: siteId, is_default: true });
    const rubRevId = await upsertMaster(client, 'md_item_revision', { ...common, ...revisionDefaults, code: 'SFG-RUB-CM01-R1', name: 'Rubber child blank revision 1', item_id: rubItemId, item_group: 'SFG_COMPOUND', material_group_id: materialGroupIds.get('SFG_COMPOUND'), base_uom_id: pcsId, procurement_type: 'Make', revision_code: 'R1', site_id: siteId, is_default: true });
    const rollRevId = await upsertMaster(client, 'md_item_revision', { ...common, ...revisionDefaults, code: 'SFG-ROLL-EPDM-R1', name: 'EPDM parent roll revision 1', item_id: rollItemId, item_group: 'SFG_COMPOUND', material_group_id: materialGroupIds.get('SFG_COMPOUND'), base_uom_id: m2Id, procurement_type: 'Make', revision_code: 'R1', site_id: siteId, is_default: true });
    const steelRevId = await upsertMaster(client, 'md_item_revision', { ...common, ...revisionDefaults, code: 'RM-STL-05-R1', name: 'Steel raw material revision 1', item_id: steelItemId, item_group: 'RM_METAL_BASE', material_group_id: materialGroupIds.get('RM_METAL_BASE'), base_uom_id: pcsId, procurement_type: 'Buy', revision_code: 'R1', site_id: siteId, is_default: true });
    const bondRevId = await upsertMaster(client, 'md_item_revision', { ...common, ...revisionDefaults, code: 'RM-CHEM-BOND-R1', name: 'Bonding chemical revision 1', item_id: bondItemId, item_group: 'RM_CHEMICALS', material_group_id: materialGroupIds.get('RM_CHEMICALS'), base_uom_id: kgId, procurement_type: 'Buy', revision_code: 'R1', site_id: siteId, is_default: true });

    const opMixId = await upsertMaster(client, 'md_operation', { ...common, code: 'OP-MIX', name: 'Luyện cán cao su', operation_type: 'Production', confirmation_mode: 'StartFinish', requires_material_scan: true, requires_output_label: true, is_schedulable: true });
    const opPrepId = await upsertMaster(client, 'md_operation', { ...common, code: 'OP-PREP', name: 'Xử lý lõi kim loại', operation_type: 'Production', confirmation_mode: 'QuantityOnly', requires_material_scan: true, requires_output_label: false, is_schedulable: true });
    const opCutId = await upsertMaster(client, 'md_operation', { ...common, code: 'OP-CUT', name: 'Cắt tách phôi tấm mẹ-con', operation_type: 'Production', confirmation_mode: 'StartFinish', requires_material_scan: true, requires_output_label: true, is_schedulable: true });
    const opMoldId = await upsertMaster(client, 'md_operation', { ...common, code: 'OP-MOLD', name: 'Ép dính và Lưu hóa', operation_type: 'Production', confirmation_mode: 'StartFinish', requires_material_scan: true, requires_output_label: true, is_schedulable: true });
    const opTrimId = await upsertMaster(client, 'md_operation', { ...common, code: 'OP-TRIM', name: 'Cắt bavia / Định hình', operation_type: 'Production', confirmation_mode: 'QuantityOnly', requires_material_scan: false, requires_output_label: false, is_schedulable: true });
    const opQcId = await upsertMaster(client, 'md_operation', { ...common, code: 'OP-QC', name: 'Kiểm tra chất lượng', operation_type: 'Inspection', confirmation_mode: 'StartFinish', requires_material_scan: false, requires_output_label: true, is_schedulable: true });

	    const wcMixId = await upsertMaster(client, 'md_work_center', { ...common, code: 'WC-MIXING', name: 'Banbury Mixing Work Center', site_id: siteId, area_id: areaRubberId, shopfloor_id: shopfloorId, work_center_type: 'Production', active_flag: true });
	    const wcCutId = await upsertMaster(client, 'md_work_center', { ...common, code: 'WC-CUTTING', name: 'Rubber Cutting Work Center', site_id: siteId, area_id: areaRubberId, shopfloor_id: shopfloorId, work_center_type: 'Production', active_flag: true });
	    const wcMoldId = await upsertMaster(client, 'md_work_center', { ...common, code: 'WC-VULCAN-MOLD', name: 'Cụm máy ép thủy lực gia nhiệt', site_id: siteId, area_id: areaRubberId, shopfloor_id: shopfloorId, work_center_type: 'Production', active_flag: true });
	    const wcQcId = await upsertMaster(client, 'md_work_center', { ...common, code: 'WC-QC', name: 'Quality Inspection', site_id: siteId, area_id: areaRubberId, shopfloor_id: shopfloorId, work_center_type: 'Inspection', active_flag: true });

	    const wsMoldId = await upsertMaster(client, 'md_workstation', { ...common, code: 'WS-MOLD-KIOSK01', name: 'Molding Kiosk 01', site_id: siteId, area_id: areaRubberId, shopfloor_id: shopfloorId, work_center_id: wcMoldId, workstation_type: 'Kiosk', execution_mode: 'Kiosk', active_flag: true });
	    const wsMixId = await upsertMaster(client, 'md_workstation', { ...common, code: 'WS-MIXING-01', name: 'Mixing Workstation', site_id: siteId, area_id: areaRubberId, shopfloor_id: shopfloorId, work_center_id: wcMixId, workstation_type: 'Kiosk', execution_mode: 'Kiosk', active_flag: true });
	    const wsCutId = await upsertMaster(client, 'md_workstation', { ...common, code: 'WS-CUTTING-01', name: 'Cutting Workstation', site_id: siteId, area_id: areaRubberId, shopfloor_id: shopfloorId, work_center_id: wcCutId, workstation_type: 'Kiosk', execution_mode: 'Kiosk', active_flag: true });
	    const wsQcId = await upsertMaster(client, 'md_workstation', { ...common, code: 'WS-QC-01', name: 'Quality Inspection Workstation', site_id: siteId, area_id: areaRubberId, shopfloor_id: shopfloorId, work_center_id: wcQcId, workstation_type: 'Kiosk', execution_mode: 'Kiosk', active_flag: true });
	    const printStation = await client.query(`SELECT master_id FROM md_print_station WHERE code='PS-CANONICAL-01' LIMIT 1`);
	    const printStationId = String(printStation.rows[0]['master_id']);
	    await client.query(`
	      INSERT INTO md_print_station_runtime_projection
	        (print_station_id, station_code, adapter_id, runtime_status, kafka_status, printer_count, online_printer_count, error_printer_count, last_heartbeat_at, last_status_change_at, ready_printer_count, active_for_work_printer_count, registered_printer_count, busy_printer_count, offline_printer_count)
	      VALUES ($1, 'PS-CANONICAL-01', 'PRINT-ADAPTER-01', 'ONLINE', 'CONNECTED', 1, 1, 0, NOW(), NOW(), 1, 1, 1, 0, 0)
	      ON CONFLICT (print_station_id) DO UPDATE SET runtime_status='ONLINE', kafka_status='CONNECTED', printer_count=1, online_printer_count=1, error_printer_count=0, last_heartbeat_at=NOW(), last_status_change_at=NOW(), ready_printer_count=1, active_for_work_printer_count=1, registered_printer_count=1, busy_printer_count=0, offline_printer_count=0, updated_at=NOW()
	    `, [printStationId]);
	    for (const wsId of [wsMoldId, wsMixId, wsCutId, wsQcId]) {
	      await client.query(`
	        INSERT INTO md_workstation_print_station_binding (workstation_id, print_station_id, role, effective_from, is_active, created_by, allocated_printer_quantity)
	        VALUES ($1, $2, 'PRIMARY', $3, TRUE, $4, 1)
	        ON CONFLICT DO NOTHING
	      `, [wsId, printStationId, now, SYSTEM_USER_ID]);
	    }
	    const eqHyd01Id = await upsertMaster(client, 'md_equipment', { ...common, code: 'EQ-MOLD-HYD01', name: 'Máy ép 500 tấn', site_id: siteId, work_center_id: wcMoldId, equipment_type: 'HydraulicPress', active_flag: true, planning_resource_flag: true, execution_status: 'Available' });
	    const eqHyd02Id = await upsertMaster(client, 'md_equipment', { ...common, code: 'EQ-MOLD-HYD02', name: 'Máy ép 300 tấn', site_id: siteId, work_center_id: wcMoldId, equipment_type: 'HydraulicPress', active_flag: true, planning_resource_flag: true, execution_status: 'Available' });
	    const baseLineName = JSON.stringify({ vi: 'Dây chuyền Resource Planning cơ sở 1', en: 'Base Resource Planning Line 1', ja: '基本リソース計画ライン1', ko: '기본 리소스 계획 라인 1' });
	    const baseLineExisting = await client.query(`SELECT master_id FROM md_production_line WHERE site_id=$1 AND UPPER(code)=UPPER('LINE-BASE-1') AND active_flag=TRUE AND effective_to IS NULL LIMIT 1`, [siteId]);
	    let baseLineId = String(baseLineExisting.rows[0]?.['master_id'] || '');
	    if (baseLineId) {
	      await client.query(`UPDATE md_production_line SET name=$1::jsonb, lifecycle_status='Released', area_id=$2, shopfloor_id=$3, default_shift_id=$4, line_type='Production', updated_by=$5, updated_at=NOW() WHERE master_id=$6`, [baseLineName, areaRubberId, shopfloorId, shiftAId, SYSTEM_USER_ID, baseLineId]);
	    } else {
	      const baseLineInserted = await client.query(`
	        INSERT INTO md_production_line (code, name, version_no, lifecycle_status, effective_from, created_by, approved_by, approved_at, site_id, area_id, shopfloor_id, default_shift_id, line_type, active_flag)
	        VALUES ('LINE-BASE-1', $1::jsonb, 1, 'Released', $2, $3, $3, $2, $4, $5, $6, $7, 'Production', TRUE)
	        RETURNING master_id
	      `, [baseLineName, now, SYSTEM_USER_ID, siteId, areaRubberId, shopfloorId, shiftAId]);
	      baseLineId = String(baseLineInserted.rows[0]['master_id']);
	    }
	    const machineUnitResult = await client.query(`
	      INSERT INTO md_machine_unit (machine_id, code, unit_sequence, serial_number, execution_status, active_flag, lifecycle_status, physical_identity_status, planning_resource_flag)
	      VALUES ($1, 'UNIT-MOLD-HYD01-01', 1, 'SN-MOLD-HYD01-01', 'Available', TRUE, 'Released', 'Identified', TRUE)
	      ON CONFLICT (machine_id, unit_sequence) DO UPDATE SET code=EXCLUDED.code, serial_number=EXCLUDED.serial_number, execution_status='Available', active_flag=TRUE, lifecycle_status='Released', physical_identity_status='Identified', planning_resource_flag=TRUE, updated_at=NOW()
	      RETURNING machine_unit_id
	    `, [eqHyd01Id]);
	    const machineUnitId = String(machineUnitResult.rows[0]['machine_unit_id']);
	    const machineGroupResult = await client.query(`
	      INSERT INTO md_workstation_machine_group (code, name, description, version_no, lifecycle_status, effective_from, created_by, updated_by, site_id, shopfloor_id, work_center_id, workstation_id, group_type, minimum_required_machines, maximum_concurrent_jobs)
	      VALUES ('MG-MOLD-KIOSK01', $1::jsonb, $2::jsonb, 1, 'Released', $3, $4, $4, $5, $6, $7, $8, 'PrimaryMachine', 1, 1)
	      ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, lifecycle_status='Released', effective_to=NULL, updated_by=$4, updated_at=NOW(), site_id=EXCLUDED.site_id, shopfloor_id=EXCLUDED.shopfloor_id, work_center_id=EXCLUDED.work_center_id, workstation_id=EXCLUDED.workstation_id, group_type=EXCLUDED.group_type, minimum_required_machines=EXCLUDED.minimum_required_machines, maximum_concurrent_jobs=EXCLUDED.maximum_concurrent_jobs
	      RETURNING master_id
	    `, [
	      JSON.stringify({ vi: 'Nhóm máy ép kiosk 01', en: 'Molding kiosk 01 machine group', ja: '成形キオスク01マシングループ', ko: '성형 키오스크 01 머신 그룹' }),
	      JSON.stringify({ vi: 'Nhóm máy canonical cho kiểm thử resource planning.', en: 'Canonical machine group for resource-planning verification.', ja: 'リソース計画検証用の標準マシングループ。', ko: '리소스 계획 검증용 표준 머신 그룹.' }),
	      now,
	      SYSTEM_USER_ID,
	      siteId,
	      shopfloorId,
	      wcMoldId,
	      wsMoldId,
	    ]);
	    const machineGroupId = String(machineGroupResult.rows[0]['master_id']);

    const skillGroupResult = await client.query(`
      INSERT INTO md_skill_group (code, name, description, scope, legacy_flag, lifecycle_status, created_by)
      VALUES
        ('SKG-EMP-PROCESS', jsonb_build_object('vi','Kỹ năng nhân sự công đoạn','en','Employee Process Skills','ja','従業員工程スキル','ko','직원 공정 기술'), jsonb_build_object('vi','Kỹ năng nhân sự dùng cho phân công lao động công đoạn sản xuất.','en','Employee skills used for production operation labor readiness.','ja','生産工程の作業者準備判定に使用する従業員スキル。','ko','생산 공정 작업자 준비 판정에 사용하는 직원 기술입니다.'), 'Employee', FALSE, 'Released', $1),
        ('SKG-EMP-QUALITY', jsonb_build_object('vi','Kỹ năng nhân sự kiểm tra','en','Employee Inspection Skills','ja','従業員検査スキル','ko','직원 검사 기술'), jsonb_build_object('vi','Kỹ năng nhân sự dùng cho kiểm tra chất lượng.','en','Employee skills used for quality inspection labor readiness.','ja','品質検査の作業者準備判定に使用する従業員スキル。','ko','품질 검사 작업자 준비 판정에 사용하는 직원 기술입니다.'), 'Employee', FALSE, 'Released', $1)
      ON CONFLICT (code) DO UPDATE SET legacy_flag = FALSE, scope = EXCLUDED.scope
      RETURNING skill_group_id, code
    `, [ADMIN_USER_ID]);
    const skillGroups = new Map(skillGroupResult.rows.map((row: { code: string; skill_group_id: string }) => [row.code, row.skill_group_id]));
	    const skillMixId = await upsertMaster(client, 'md_skill', { ...common, code: 'SK-EMP-MIX-MASTER', name: 'Kỹ thuật viên luyện cán cao cấp', skill_group: 'Employee', skill_group_id: skillGroups.get('SKG-EMP-PROCESS'), scope: 'Employee', legacy_flag: false, minimum_level: 'L3' });
	    const skillVulcanId = await upsertMaster(client, 'md_skill', { ...common, code: 'SK-EMP-VULCAN-OPERATOR', name: 'Nhân sự vận hành ép lưu hóa', skill_group: 'Employee', skill_group_id: skillGroups.get('SKG-EMP-PROCESS'), scope: 'Employee', legacy_flag: false, minimum_level: 'L2' });
	    const skillInspectionId = await upsertMaster(client, 'md_skill', { ...common, code: 'SK-EMP-INSPECTION', name: 'Nhân sự kiểm tra chất lượng', skill_group: 'Employee', skill_group_id: skillGroups.get('SKG-EMP-QUALITY'), scope: 'Employee', legacy_flag: false, minimum_level: 'L2' });
	    const eqMixId = await upsertMaster(client, 'md_equipment', { ...common, code: 'EQ-MIX-BANBURY01', name: 'Banbury mixer 01', site_id: siteId, work_center_id: wcMixId, equipment_type: 'Mixer', active_flag: true, planning_resource_flag: true, execution_status: 'Available' });
	    const mixUnitResult = await client.query(`
	      INSERT INTO md_machine_unit (machine_id, code, unit_sequence, serial_number, execution_status, active_flag, lifecycle_status, physical_identity_status, planning_resource_flag)
	      VALUES ($1, 'UNIT-MIX-BANBURY01-01', 1, 'SN-MIX-BANBURY01-01', 'Available', TRUE, 'Released', 'Identified', TRUE)
	      ON CONFLICT (machine_id, unit_sequence) DO UPDATE SET code=EXCLUDED.code, serial_number=EXCLUDED.serial_number, execution_status='Available', active_flag=TRUE, lifecycle_status='Released', physical_identity_status='Identified', planning_resource_flag=TRUE, updated_at=NOW()
	      RETURNING machine_unit_id
	    `, [eqMixId]);
	    const mixUnitId = String(mixUnitResult.rows[0]['machine_unit_id']);
	    const mixGroupResult = await client.query(`
	      INSERT INTO md_workstation_machine_group (code, name, description, version_no, lifecycle_status, effective_from, created_by, updated_by, site_id, shopfloor_id, work_center_id, workstation_id, group_type, minimum_required_machines, maximum_concurrent_jobs)
	      VALUES ('MG-MIXING-01', $1::jsonb, $2::jsonb, 1, 'Released', $3, $4, $4, $5, $6, $7, $8, 'PrimaryMachine', 1, 1)
	      ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, lifecycle_status='Released', effective_to=NULL, updated_by=$4, updated_at=NOW(), site_id=EXCLUDED.site_id, shopfloor_id=EXCLUDED.shopfloor_id, work_center_id=EXCLUDED.work_center_id, workstation_id=EXCLUDED.workstation_id, group_type=EXCLUDED.group_type
	      RETURNING master_id
	    `, [
	      JSON.stringify({ vi: 'Nhóm máy trộn 01', en: 'Mixing machine group 01', ja: '混練マシングループ01', ko: '혼련 머신 그룹 01' }),
	      JSON.stringify({ vi: 'Nhóm máy canonical cho công đoạn trộn.', en: 'Canonical machine group for mixing.', ja: '混練工程用の標準マシングループ。', ko: '혼련 공정용 표준 머신 그룹.' }),
	      now,
	      SYSTEM_USER_ID,
	      siteId,
	      shopfloorId,
	      wcMixId,
	      wsMixId,
	    ]);
	    const mixGroupId = String(mixGroupResult.rows[0]['master_id']);
	    await upsertMaster(client, 'md_resource_assignment', { ...common, code: 'ASSIGN-MIXING-01', name: 'Mixing machine assignment', site_id: siteId, work_center_id: wcMixId, workstation_id: wsMixId, equipment_id: eqMixId, assignment_type: 'MachineUnit', assignment_role: 'Primary', scheduling_flag: true, oee_aggregation_flag: true, machine_group_id: mixGroupId, machine_unit_id: mixUnitId, requirement_type: 'Required', sequence_no: 1 });
	    await client.query(`
	      INSERT INTO md_workstation_machine_requirement (machine_group_id, machine_id, role, required_quantity, requirement_type, pinned_machine_unit_ids, sequence_no, effective_from, active_flag, created_by, updated_by)
	      VALUES ($1, $2, 'Primary', 1, 'Required', jsonb_build_array($3::text), 1, $4, TRUE, $5, $5)
	      ON CONFLICT (machine_group_id, machine_id, role, sequence_no) WHERE active_flag = TRUE AND effective_to IS NULL
	      DO UPDATE SET required_quantity=1, requirement_type='Required', pinned_machine_unit_ids=jsonb_build_array($3::text), updated_by=$5, updated_at=NOW()
	    `, [mixGroupId, eqMixId, mixUnitId, now, SYSTEM_USER_ID]);
	    const employeeId = '00000000-0000-4000-8000-000000000201';
	    const scheduleId = '00000000-0000-4000-8000-000000000202';
	    await client.query(`
	      INSERT INTO md_employee (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, approved_by, approved_at, site_id, default_work_center_id, employee_status, hired_date, preferred_locale)
	      VALUES ($1, 'EMP-MIX-001', 'Mixing Operator 001', 1, 'Released', $2::timestamptz, $3, $3, $2::timestamptz, $4, $5, 'Active', ($2::timestamptz)::date, 'en')
	      ON CONFLICT (code, version_no) DO UPDATE SET name=EXCLUDED.name, lifecycle_status='Released', effective_to=NULL, updated_by=$3, updated_at=NOW(), site_id=EXCLUDED.site_id, default_work_center_id=EXCLUDED.default_work_center_id, employee_status='Active'
	    `, [employeeId, now, SYSTEM_USER_ID, siteId, wcMixId]);
	    await client.query(`
	      INSERT INTO md_employee_skill (employee_id, skill_id, level, created_by, effective_from, active_flag, qualification_status, certified_at)
	      VALUES ($1, $2, 'L3', $3, $4, TRUE, 'Active', $4)
	      ON CONFLICT (employee_id, skill_id) WHERE active_flag = TRUE AND effective_to IS NULL
	      DO UPDATE SET level='L3', qualification_status='Active', certified_at=$4, updated_by=$3, updated_at=NOW()
	    `, [employeeId, skillMixId, SYSTEM_USER_ID, now]);
	    await client.query(`
	      INSERT INTO md_employee_shift_schedule (schedule_id, employee_id, shift_id, work_center_id, schedule_date, schedule_status, created_by)
	      VALUES ($1, $2, $3, $4, DATE '2026-08-03', 'Scheduled', $5)
	      ON CONFLICT (employee_id, schedule_date) DO UPDATE SET shift_id=EXCLUDED.shift_id, work_center_id=EXCLUDED.work_center_id, schedule_status='Scheduled', updated_by=$5, updated_at=NOW()
	    `, [scheduleId, employeeId, shiftAId, wcMixId, SYSTEM_USER_ID]);
	    const ensureBaseMachine = async (fixture: { equipmentCode: string; equipmentName: string; unitCode: string; serial: string; groupCode: string; groupName: string; assignmentCode: string; workCenterId: string; workstationId: string; equipmentType: string }) => {
	      const equipmentId = await upsertMaster(client, 'md_equipment', { ...common, code: fixture.equipmentCode, name: fixture.equipmentName, site_id: siteId, work_center_id: fixture.workCenterId, equipment_type: fixture.equipmentType, active_flag: true, planning_resource_flag: true, execution_status: 'Available' });
	      const unitResult = await client.query(`
	        INSERT INTO md_machine_unit (machine_id, code, unit_sequence, serial_number, execution_status, active_flag, lifecycle_status, physical_identity_status, planning_resource_flag)
	        VALUES ($1, $2, 1, $3, 'Available', TRUE, 'Released', 'Identified', TRUE)
	        ON CONFLICT (machine_id, unit_sequence) DO UPDATE SET code=EXCLUDED.code, serial_number=EXCLUDED.serial_number, execution_status='Available', active_flag=TRUE, lifecycle_status='Released', physical_identity_status='Identified', planning_resource_flag=TRUE, updated_at=NOW()
	        RETURNING machine_unit_id
	      `, [equipmentId, fixture.unitCode, fixture.serial]);
	      const unitId = String(unitResult.rows[0]['machine_unit_id']);
	      const groupResult = await client.query(`
	        INSERT INTO md_workstation_machine_group (code, name, version_no, lifecycle_status, effective_from, created_by, updated_by, site_id, shopfloor_id, work_center_id, workstation_id, group_type, minimum_required_machines, maximum_concurrent_jobs)
	        VALUES ($1, $2::jsonb, 1, 'Released', $3, $4, $4, $5, $6, $7, $8, 'PrimaryMachine', 1, 1)
	        ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, lifecycle_status='Released', effective_to=NULL, updated_by=$4, updated_at=NOW(), site_id=EXCLUDED.site_id, shopfloor_id=EXCLUDED.shopfloor_id, work_center_id=EXCLUDED.work_center_id, workstation_id=EXCLUDED.workstation_id
	        RETURNING master_id
	      `, [fixture.groupCode, JSON.stringify({ vi: fixture.groupName, en: fixture.groupName, ja: fixture.groupName, ko: fixture.groupName }), now, SYSTEM_USER_ID, siteId, shopfloorId, fixture.workCenterId, fixture.workstationId]);
	      const groupId = String(groupResult.rows[0]['master_id']);
	      await upsertMaster(client, 'md_resource_assignment', { ...common, code: fixture.assignmentCode, name: `${fixture.groupName} assignment`, site_id: siteId, work_center_id: fixture.workCenterId, workstation_id: fixture.workstationId, equipment_id: equipmentId, assignment_type: 'MachineUnit', assignment_role: 'Primary', scheduling_flag: true, oee_aggregation_flag: true, machine_group_id: groupId, machine_unit_id: unitId, requirement_type: 'Required', sequence_no: 1 });
	      await client.query(`
	        INSERT INTO md_workstation_machine_requirement (machine_group_id, machine_id, role, required_quantity, requirement_type, pinned_machine_unit_ids, sequence_no, effective_from, active_flag, created_by, updated_by)
	        VALUES ($1, $2, 'Primary', 1, 'Required', jsonb_build_array($3::text), 1, $4, TRUE, $5, $5)
	        ON CONFLICT (machine_group_id, machine_id, role, sequence_no) WHERE active_flag = TRUE AND effective_to IS NULL
	        DO UPDATE SET required_quantity=1, requirement_type='Required', pinned_machine_unit_ids=jsonb_build_array($3::text), updated_by=$5, updated_at=NOW()
	      `, [groupId, equipmentId, unitId, now, SYSTEM_USER_ID]);
	      return equipmentId;
	    };
	    const eqCutId = await ensureBaseMachine({ equipmentCode: 'EQ-CUTTER01', equipmentName: 'Rubber cutter 01', unitCode: 'UNIT-CUTTER01-01', serial: 'SN-CUTTER01-01', groupCode: 'MG-CUTTING-01', groupName: 'Cutting machine group 01', assignmentCode: 'ASSIGN-CUTTING-01', workCenterId: wcCutId, workstationId: wsCutId, equipmentType: 'Cutter' });
	    const eqQcId = await ensureBaseMachine({ equipmentCode: 'EQ-QC01', equipmentName: 'QC station 01', unitCode: 'UNIT-QC01-01', serial: 'SN-QC01-01', groupCode: 'MG-QC-01', groupName: 'QC machine group 01', assignmentCode: 'ASSIGN-QC-01', workCenterId: wcQcId, workstationId: wsQcId, equipmentType: 'InspectionStation' });
	    for (const [empId, empCode, empName, skillId, level, wcId, schedule] of [
	      ['00000000-0000-4000-8000-000000000203', 'EMP-VULCAN-001', 'Vulcan Operator 001', skillVulcanId, 'L2', wcMoldId, '00000000-0000-4000-8000-000000000204'],
	      ['00000000-0000-4000-8000-000000000205', 'EMP-VULCAN-002', 'Vulcan Operator 002', skillVulcanId, 'L2', wcMoldId, '00000000-0000-4000-8000-000000000206'],
	      ['00000000-0000-4000-8000-000000000207', 'EMP-QC-001', 'QC Operator 001', skillInspectionId, 'L2', wcQcId, '00000000-0000-4000-8000-000000000208'],
	    ] as const) {
	      await client.query(`
	        INSERT INTO md_employee (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, approved_by, approved_at, site_id, default_work_center_id, employee_status, hired_date, preferred_locale)
	        VALUES ($1, $2, $3, 1, 'Released', $4::timestamptz, $5, $5, $4::timestamptz, $6, $7, 'Active', ($4::timestamptz)::date, 'en')
	        ON CONFLICT (code, version_no) DO UPDATE SET name=EXCLUDED.name, lifecycle_status='Released', effective_to=NULL, updated_by=$5, updated_at=NOW(), site_id=EXCLUDED.site_id, default_work_center_id=EXCLUDED.default_work_center_id, employee_status='Active'
	      `, [empId, empCode, empName, now, SYSTEM_USER_ID, siteId, wcId]);
	      await client.query(`
	        INSERT INTO md_employee_skill (employee_id, skill_id, level, created_by, effective_from, active_flag, qualification_status, certified_at)
	        VALUES ($1, $2, $3, $4, $5, TRUE, 'Active', $5)
	        ON CONFLICT (employee_id, skill_id) WHERE active_flag = TRUE AND effective_to IS NULL
	        DO UPDATE SET level=EXCLUDED.level, qualification_status='Active', certified_at=$5, updated_by=$4, updated_at=NOW()
	      `, [empId, skillId, level, SYSTEM_USER_ID, now]);
	      await client.query(`
	        INSERT INTO md_employee_shift_schedule (schedule_id, employee_id, shift_id, work_center_id, schedule_date, schedule_status, created_by)
	        VALUES ($1, $2, $3, $4, DATE '2026-08-03', 'Scheduled', $5)
	        ON CONFLICT (employee_id, schedule_date) DO UPDATE SET shift_id=EXCLUDED.shift_id, work_center_id=EXCLUDED.work_center_id, schedule_status='Scheduled', updated_by=$5, updated_at=NOW()
	      `, [schedule, empId, shiftAId, wcId, SYSTEM_USER_ID]);
	    }

	    const mbomId = await upsertMaster(client, 'md_mbom_header', { ...common, code: 'MBOM-FG-WS-CM01-R1', name: 'MBOM Cao su chân máy ô tô', site_id: siteId, item_revision_id: fgRevId, base_quantity: '100.000000', base_uom_id: pcsId });
    await upsertMaster(client, 'md_mbom_line', { ...common, code: 'MBOM-FG-WS-CM01-R1-L10', name: 'Treated metal core', mbom_header_id: mbomId, seq: 10, component_revision_id: metRevId, quantity_per: '100.000000', uom_id: pcsId, scrap_rate: '0.0100', issue_operation_id: opMoldId, backflush_flag: true, phantom_flag: false });
    await upsertMaster(client, 'md_mbom_line', { ...common, code: 'MBOM-FG-WS-CM01-R1-L20', name: 'Rubber child blank', mbom_header_id: mbomId, seq: 20, component_revision_id: rubRevId, quantity_per: '102.000000', uom_id: pcsId, scrap_rate: '0.0200', issue_operation_id: opMoldId, backflush_flag: true, phantom_flag: false });
    await upsertMaster(client, 'md_mbom_line', { ...common, code: 'MBOM-FG-WS-CM01-R1-L30', name: 'Raw steel blank', mbom_header_id: mbomId, seq: 30, component_revision_id: steelRevId, quantity_per: '101.000000', uom_id: pcsId, scrap_rate: '0.0050', issue_operation_id: opPrepId, backflush_flag: false, phantom_flag: false });
    await upsertMaster(client, 'md_mbom_line', { ...common, code: 'MBOM-FG-WS-CM01-R1-L40', name: 'Bonding chemical', mbom_header_id: mbomId, seq: 40, component_revision_id: bondRevId, quantity_per: '1.500000', uom_id: kgId, scrap_rate: '0.0500', issue_operation_id: opPrepId, backflush_flag: true, phantom_flag: false });
    await upsertMaster(client, 'md_mbom_line', { ...common, code: 'MBOM-FG-WS-CM01-R1-L50', name: 'EPDM parent roll phantom', mbom_header_id: mbomId, seq: 50, component_revision_id: rollRevId, quantity_per: '15.500000', uom_id: m2Id, scrap_rate: '0.0300', issue_operation_id: opCutId, backflush_flag: true, phantom_flag: true });

    const childMbomId = await upsertMaster(client, 'md_mbom_header', { ...common, code: 'MBOM-SFG-ROLL-EPDM-R1', name: 'Child MBOM for EPDM phantom roll', site_id: siteId, item_revision_id: rollRevId, base_quantity: '1.000000', base_uom_id: m2Id });
    await upsertMaster(client, 'md_mbom_line', { ...common, code: 'MBOM-SFG-ROLL-EPDM-R1-L10', name: 'Synthetic rubber base', mbom_header_id: childMbomId, seq: 10, component_revision_id: rollRevId, quantity_per: '1.000000', uom_id: m2Id, scrap_rate: '0.0000', issue_operation_id: opMixId, backflush_flag: true, phantom_flag: false });

    const routingId = await upsertMaster(client, 'md_routing_header', { ...common, code: 'RT-FG-WS-CM01-R1', name: 'Routing Cao su chân máy ô tô', item_revision_id: fgRevId });
    const roMixId = await upsertMaster(client, 'md_routing_operation', { ...common, code: 'RT-FG-WS-CM01-R1-010', name: 'Mixing', routing_header_id: routingId, operation_id: opMixId, work_center_id: wcMixId, seq: 10 });
    const roPrepId = await upsertMaster(client, 'md_routing_operation', { ...common, code: 'RT-FG-WS-CM01-R1-020', name: 'Metal Prep', routing_header_id: routingId, operation_id: opPrepId, work_center_id: wcMoldId, seq: 20, predecessor_seq: 10 });
    const roCutId = await upsertMaster(client, 'md_routing_operation', { ...common, code: 'RT-FG-WS-CM01-R1-030', name: 'Cutting', routing_header_id: routingId, operation_id: opCutId, work_center_id: wcCutId, seq: 30, predecessor_seq: 20 });
    const roMoldId = await upsertMaster(client, 'md_routing_operation', { ...common, code: 'RT-FG-WS-CM01-R1-040', name: 'Molding', routing_header_id: routingId, operation_id: opMoldId, work_center_id: wcMoldId, seq: 40, predecessor_seq: 30 });
    const roTrimId = await upsertMaster(client, 'md_routing_operation', { ...common, code: 'RT-FG-WS-CM01-R1-050', name: 'Trimming', routing_header_id: routingId, operation_id: opTrimId, work_center_id: wcMoldId, seq: 50, predecessor_seq: 40 });
    const roQcId = await upsertMaster(client, 'md_routing_operation', { ...common, code: 'RT-FG-WS-CM01-R1-060', name: 'QC', routing_header_id: routingId, operation_id: opQcId, work_center_id: wcQcId, seq: 60, predecessor_seq: 50 });

    for (const [workCenterId, workstationId, operationId] of [
      [wcMixId, wsMixId, opMixId], [wcMoldId, wsMoldId, opPrepId], [wcCutId, wsCutId, opCutId],
      [wcMoldId, wsMoldId, opMoldId], [wcMoldId, wsMoldId, opTrimId], [wcQcId, wsQcId, opQcId],
    ] as const) {
      await client.query(`INSERT INTO md_work_center_composition (work_center_id, workstation_id, operation_id, created_by)
        SELECT $1, $2, $3, $4 WHERE NOT EXISTS (
          SELECT 1 FROM md_work_center_composition WHERE work_center_id = $1 AND workstation_id = $2
            AND operation_id = $3 AND active_flag = TRUE AND (effective_to IS NULL OR effective_to > NOW())
        )`, [workCenterId, workstationId, operationId, SYSTEM_USER_ID]);
      await client.query(`INSERT INTO md_workstation_operation_capability (workstation_id, operation_id, cycle_time_sec, setup_time_min, base_quantity, efficiency_factor, scheduling_mode, created_by)
        SELECT $1, $2, 60, 0, 1, 1, 'Finite', $3 WHERE NOT EXISTS (
          SELECT 1 FROM md_workstation_operation_capability WHERE workstation_id = $1 AND operation_id = $2
            AND active_flag = TRUE AND (effective_to IS NULL OR effective_to > NOW())
        )`, [workstationId, operationId, SYSTEM_USER_ID]);
    }

    const standardDefaults = { site_id: siteId, base_quantity: '1.000000', standard_yield: '1.0000', source_method: 'Engineering', valid_from: now };
    await upsertMaster(client, 'md_production_standard', { ...common, ...standardDefaults, code: 'STD-FG-WS-CM01-MOLD-HYD01', name: 'Mold standard HYD01', item_revision_id: fgRevId, routing_operation_id: roMoldId, operation_id: opMoldId, work_center_id: wcMoldId, equipment_id: eqHyd01Id, labor_count: 1, skill_id: skillVulcanId, minimum_level: 'L2', setup_time_min: '15.000', cycle_time_sec: '45.000', efficiency_factor: '0.9200' });
    await upsertMaster(client, 'md_production_standard', { ...common, ...standardDefaults, code: 'STD-FG-WS-CM01-MOLD-HYD02', name: 'Mold standard HYD02', item_revision_id: fgRevId, routing_operation_id: roMoldId, operation_id: opMoldId, work_center_id: wcMoldId, equipment_id: eqHyd02Id, labor_count: 1, skill_id: skillVulcanId, minimum_level: 'L2', setup_time_min: '12.000', cycle_time_sec: '60.000', efficiency_factor: '0.8800' });
    await upsertMaster(client, 'md_production_standard', { ...common, ...standardDefaults, code: 'STD-FG-WS-CM01-MIX', name: 'Mixing standard', item_revision_id: fgRevId, routing_operation_id: roMixId, operation_id: opMixId, work_center_id: wcMixId, labor_count: 1, skill_id: skillMixId, minimum_level: 'L3', setup_time_min: '20.000', cycle_time_sec: '120.000', efficiency_factor: '0.9000' });
    await upsertMaster(client, 'md_production_standard', { ...common, ...standardDefaults, code: 'STD-FG-WS-CM01-PREP', name: 'Metal prep standard', item_revision_id: fgRevId, routing_operation_id: roPrepId, operation_id: opPrepId, work_center_id: wcMoldId, labor_count: 1, skill_id: skillVulcanId, minimum_level: 'L1', setup_time_min: '10.000', cycle_time_sec: '30.000', efficiency_factor: '0.9000' });
    await upsertMaster(client, 'md_production_standard', { ...common, ...standardDefaults, code: 'STD-FG-WS-CM01-CUT', name: 'Cutting standard', item_revision_id: fgRevId, routing_operation_id: roCutId, operation_id: opCutId, work_center_id: wcCutId, labor_count: 1, skill_id: skillVulcanId, minimum_level: 'L1', setup_time_min: '8.000', cycle_time_sec: '20.000', efficiency_factor: '0.9000' });
    await upsertMaster(client, 'md_production_standard', { ...common, ...standardDefaults, code: 'STD-FG-WS-CM01-TRIM', name: 'Trimming standard', item_revision_id: fgRevId, routing_operation_id: roTrimId, operation_id: opTrimId, work_center_id: wcMoldId, labor_count: 1, skill_id: skillVulcanId, minimum_level: 'L1', setup_time_min: '5.000', cycle_time_sec: '15.000', efficiency_factor: '0.9000' });
    await upsertMaster(client, 'md_production_standard', { ...common, ...standardDefaults, code: 'STD-FG-WS-CM01-QC', name: 'QC standard', item_revision_id: fgRevId, routing_operation_id: roQcId, operation_id: opQcId, work_center_id: wcQcId, labor_count: 1, skill_id: skillInspectionId, minimum_level: 'L2', setup_time_min: '5.000', cycle_time_sec: '25.000', efficiency_factor: '0.9000' });
    await upsertMaster(client, 'md_work_instruction', { ...common, code: 'WI-OP-MOLD-CURING', name: 'Curing temperature instruction', operation_id: opMoldId, instruction_text: 'Maintain curing range 150°C - 180°C before confirmation.' });
	    await upsertMaster(client, 'md_resource_assignment', { ...common, code: 'ASSIGN-MOLD-KIOSK01', name: 'Molding kiosk assignment', site_id: siteId, work_center_id: wcMoldId, workstation_id: wsMoldId, equipment_id: eqHyd01Id, assignment_type: 'MachineUnit', assignment_role: 'Primary', scheduling_flag: true, oee_aggregation_flag: true, machine_group_id: machineGroupId, machine_unit_id: machineUnitId, requirement_type: 'Required', sequence_no: 1 });
	    await client.query(`
	      INSERT INTO md_workstation_machine_requirement (machine_group_id, machine_id, role, required_quantity, requirement_type, pinned_machine_unit_ids, sequence_no, effective_from, active_flag, created_by, updated_by)
	      VALUES ($1, $2, 'Primary', 1, 'Required', jsonb_build_array($3::text), 1, $4, TRUE, $5, $5)
	      ON CONFLICT (machine_group_id, machine_id, role, sequence_no) WHERE active_flag = TRUE AND effective_to IS NULL
	      DO UPDATE SET required_quantity=1, requirement_type='Required', pinned_machine_unit_ids=jsonb_build_array($3::text), updated_by=$5, updated_at=NOW()
	    `, [machineGroupId, eqHyd01Id, machineUnitId, now, SYSTEM_USER_ID]);

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
	    await upsertMaster(client, 'md_resource_calendar', { ...common, code: 'CAL-WC-VULCAN-MOLD-2026', name: 'Molding availability 2026', site_id: siteId, resource_type: 'Equipment', resource_id: eqHyd01Id, workstation_id: wsMoldId, shift_id: shiftAId, calendar_date: '2026-08-03', work_center_id: wcMoldId, equipment_id: eqHyd01Id, available_from: now, available_to: future, available_minutes: 540, capacity_factor: '1.0000', capacity_percent: '1.0000' });
	    await upsertMaster(client, 'md_resource_calendar', { ...common, code: 'CAL-EQ-MIX-BANBURY01-2026', name: 'Mixing equipment availability 2026', site_id: siteId, resource_type: 'Equipment', resource_id: eqMixId, workstation_id: wsMixId, shift_id: shiftAId, calendar_date: '2026-08-03', work_center_id: wcMixId, equipment_id: eqMixId, available_from: now, available_to: future, available_minutes: 540, capacity_factor: '1.0000', capacity_percent: '1.0000' });
	    await upsertMaster(client, 'md_resource_calendar', { ...common, code: 'CAL-EQ-CUTTER01-2026', name: 'Cutting equipment availability 2026', site_id: siteId, resource_type: 'Equipment', resource_id: eqCutId, workstation_id: wsCutId, shift_id: shiftAId, calendar_date: '2026-08-03', work_center_id: wcCutId, equipment_id: eqCutId, available_from: now, available_to: future, available_minutes: 540, capacity_factor: '1.0000', capacity_percent: '1.0000' });
	    await upsertMaster(client, 'md_resource_calendar', { ...common, code: 'CAL-EQ-QC01-2026', name: 'QC equipment availability 2026', site_id: siteId, resource_type: 'Equipment', resource_id: eqQcId, workstation_id: wsQcId, shift_id: shiftAId, calendar_date: '2026-08-03', work_center_id: wcQcId, equipment_id: eqQcId, available_from: now, available_to: future, available_minutes: 540, capacity_factor: '1.0000', capacity_percent: '1.0000' });
	    for (const [code, wcId, wsId] of [
	      ['MIXING', wcMixId, wsMixId],
	      ['CUTTING', wcCutId, wsCutId],
	      ['MOLD', wcMoldId, wsMoldId],
	      ['QC', wcQcId, wsQcId],
	    ] as const) {
	      await upsertMaster(client, 'md_resource_calendar', { ...common, code: `CAL-WC-${code}-BASE-2026`, name: `${code} work center availability 2026`, site_id: siteId, resource_type: 'WorkCenter', resource_id: wcId, workstation_id: wsId, shift_id: shiftAId, calendar_date: '2026-08-03', work_center_id: wcId, available_from: now, available_to: future, available_minutes: 540, capacity_factor: '1.0000', capacity_percent: '1.0000' });
	    }
	    await upsertMaster(client, 'md_operation_skill_requirement', { ...common, code: 'REQ-OP-MIX-SKILL', name: 'Mix skill requirement', site_id: siteId, routing_operation_id: roMixId, operation_id: opMixId, skill_id: skillMixId, minimum_level: 'L3', required_persons: 1, mandatory_flag: true, active_flag: true });
    await upsertMaster(client, 'md_operation_skill_requirement', { ...common, code: 'REQ-OP-MOLD-SKILL', name: 'Mold skill requirement', site_id: siteId, routing_operation_id: roMoldId, operation_id: opMoldId, skill_id: skillVulcanId, minimum_level: 'L2', required_persons: 2, mandatory_flag: true, active_flag: true });
    await upsertMaster(client, 'md_operation_skill_requirement', { ...common, code: 'REQ-OP-QC-SKILL', name: 'QC skill requirement', site_id: siteId, routing_operation_id: roQcId, operation_id: opQcId, skill_id: skillInspectionId, minimum_level: 'L2', required_persons: 1, mandatory_flag: true, active_flag: true });
    await upsertMaster(client, 'md_role_permission', { ...common, code: 'PERM-PROD-MANAGER-APPROVE', name: 'Production manager can approve master data', role_code: 'PROD_MANAGER', permission_code: 'MES_MASTER_DATA_APPROVE', resource_type: 'MES_MASTER_DATA', action: 'APPROVE' });
    await upsertMaster(client, 'md_user_resource_scope', { ...common, code: 'SCOPE-ADMIN-SITE-KZ3', name: 'Admin scope for Kizuna 3', user_id: ADMIN_USER_ID, role_code: 'PROD_MANAGER', scope_type: 'SITE', scope_resource_id: siteId, condition_expression: 'site_id = SITE-KZ3' });

	    await upsertMaster(client, 'md_production_version', { ...common, code: 'PV-FG-WS-CM01-R1', name: 'Production Version FG-WS-CM01 R1', name_i18n: { vi: 'Phiên bản sản xuất FG-WS-CM01 R1', en: 'Production Version FG-WS-CM01 R1', ja: 'FG-WS-CM01 R1 生産バージョン', ko: 'FG-WS-CM01 R1 생산 버전' }, item_revision_id: fgRevId, mbom_header_id: mbomId, routing_header_id: routingId, site_id: siteId, is_default: true });
	    for (const [index, wcId] of [wcMixId, wcMoldId, wcCutId, wcQcId].entries()) {
	      await client.query(`
	        INSERT INTO md_production_line_work_center (production_line_id, work_center_id, sequence_no, mandatory_flag, effective_from, active_flag, created_by)
	        SELECT $1, $2, $3, TRUE, $4, TRUE, $5
	        WHERE NOT EXISTS (
	          SELECT 1 FROM md_production_line_work_center
	          WHERE production_line_id = $1 AND work_center_id = $2
	            AND active_flag = TRUE AND effective_to IS NULL
	        )
	      `, [baseLineId, wcId, index + 1, now, SYSTEM_USER_ID]);
	    }
	    await client.query(`
	      INSERT INTO md_production_version_line_eligibility (production_version_id, production_line_id, is_primary, priority_no, efficiency_factor, selection_mode, selection_policy, lifecycle_status, effective_from, active_flag, created_by)
	      VALUES ($1, $2, TRUE, 1, 1, 'PrimaryOnly', 'PrimaryOnly', 'Released', $3, TRUE, $4)
	      ON CONFLICT DO NOTHING
	    `, [fgRevId && (await client.query(`SELECT master_id FROM md_production_version WHERE code='PV-FG-WS-CM01-R1' LIMIT 1`)).rows[0]['master_id'], baseLineId, now, SYSTEM_USER_ID]);

	    // Legacy seed calls still provide item_group for readability. Resolve that
    // compatibility input to the authoritative material-group foreign key.
    await client.query(`
      INSERT INTO md_material_group (code, name, created_by)
      SELECT DISTINCT i.item_group, jsonb_build_object('vi', i.item_group, 'en', i.item_group, 'ja', i.item_group, 'ko', i.item_group), $1::uuid
      FROM md_item i WHERE i.item_group IS NOT NULL
      ON CONFLICT ((UPPER(code))) DO NOTHING`, [SYSTEM_USER_ID]);
    await client.query(`UPDATE md_item i SET material_group_id = g.master_id FROM md_material_group g WHERE UPPER(g.code) = UPPER(i.item_group) AND i.material_group_id IS NULL AND i.lifecycle_status <> 'Released'`);
    await client.query(`UPDATE md_item_revision r SET material_group_id = g.master_id FROM md_item i, md_material_group g WHERE i.master_id = r.item_id AND UPPER(g.code) = UPPER(r.item_group) AND r.material_group_id IS NULL AND r.lifecycle_status <> 'Released'`);
    await client.query(`UPDATE md_item_revision r SET material_group_id = i.material_group_id FROM md_item i WHERE i.master_id = r.item_id AND r.material_group_id IS NULL AND r.lifecycle_status <> 'Released'`);
    await client.query('COMMIT');
    console.info('[Seed] MES master data seed applied');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
