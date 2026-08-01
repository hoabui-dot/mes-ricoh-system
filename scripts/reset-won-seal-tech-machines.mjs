import { Client } from 'pg';

const mode = process.argv[2] || '--verify';
const dbUrl = process.env.MES_MASTER_DATA_DATABASE_URL || process.env.DATABASE_URL;
const userId = '00000000-0000-0000-0000-0000000000ad';
const namespace = 'WST-';
const siteCode = process.env.WON_SEAL_TECH_SITE_CODE || 'SITE-KZ3';
const today = new Date().toISOString().slice(0, 10);

if (!dbUrl) throw new Error('Missing MES_MASTER_DATA_DATABASE_URL or DATABASE_URL.');
if (['--cleanup', '--reset'].includes(mode) && process.env.NODE_ENV === 'production') throw new Error('DESTRUCTIVE_SEED_NOT_ALLOWED: production environment');
if (mode === '--reset' && process.env.ALLOW_DESTRUCTIVE_SEED !== 'true') throw new Error('DESTRUCTIVE_SEED_NOT_ALLOWED: set ALLOW_DESTRUCTIVE_SEED=true');

const machineDefinitions = [
  ['WST-EQ-WGH-01', 'Máy cân cao su tự động 01', 'Automatic rubber compound weighing station 01', 'Weighing', 'WST-WGH-001', 'WST-WGH-002'],
  ['WST-EQ-CUT-01', 'Máy cắt cao su 01', 'Rubber bale cutting machine 01', 'RawMaterialPreparation', 'WST-CUT-001', 'WST-CUT-002'],
  ['WST-EQ-MIX-35', 'Máy trộn cao su 35L', 'Internal rubber mixer 35L', 'InternalMixer', 'WST-MIX-001', 'WST-MIX-002', 'WST-MIX-003'],
  ['WST-EQ-MIX-55', 'Máy trộn cao su 55L', 'Internal rubber mixer 55L', 'InternalMixer', 'WST-MIX-004', 'WST-MIX-005', 'WST-MIX-006'],
  ['WST-EQ-MILL-16', 'Máy cán hai trục 16 inch', 'Two-roll mixing mill 16 inch', 'OpenMill', 'WST-MILL-001', 'WST-MILL-002'],
  ['WST-EQ-PRE-01', 'Máy tạo phôi cao su 01', 'Precision rubber preformer 01', 'Preformer', 'WST-PRE-001', 'WST-PRE-002'],
  ['WST-EQ-EXT-01', 'Dây chuyền đùn cao su 01', 'Rubber extrusion line 01', 'Extrusion', 'WST-EXT-001', 'WST-EXT-002'],
  ['WST-EQ-CMP-100', 'Máy ép cao su 100 tấn', 'Compression molding press 100T', 'CompressionPress', 'WST-CMP-100-001', 'WST-CMP-100-002', 'WST-CMP-100-003'],
  ['WST-EQ-CMP-150', 'Máy ép cao su 150 tấn', 'Compression molding press 150T', 'CompressionPress', 'WST-CMP-150-001', 'WST-CMP-150-002', 'WST-CMP-150-003'],
  ['WST-EQ-CMP-200', 'Máy ép cao su 200 tấn', 'Compression molding press 200T', 'CompressionPress', 'WST-CMP-200-001', 'WST-CMP-200-002'],
  ['WST-EQ-INJ-200', 'Máy ép phun cao su 200 tấn', 'Rubber injection molding machine 200T', 'InjectionPress', 'WST-INJ-200-001', 'WST-INJ-200-002'],
  ['WST-EQ-OVN-01', 'Lò hậu lưu hóa 01', 'Hot air post-curing oven 01', 'PostCuringOven', 'WST-OVN-001', 'WST-OVN-002'],
  ['WST-EQ-TRIM-01', 'Máy cắt ba via tự động 01', 'Automatic seal trimming machine 01', 'AutomaticTrimming', 'WST-TRIM-001', 'WST-TRIM-002'],
  ['WST-EQ-CRY-01', 'Máy tách ba via lạnh 01', 'Cryogenic deflashing machine 01', 'Deflashing', 'WST-CRY-001', 'WST-CRY-002'],
  ['WST-EQ-VIS-01', 'Máy kiểm tra ngoại quan 01', 'Automatic visual inspection machine 01', 'VisualInspection', 'WST-VIS-001', 'WST-VIS-002'],
  ['WST-EQ-DIM-01', 'Máy đo kích thước quang học 01', 'Optical dimension measurement system 01', 'DimensionalInspection', 'WST-DIM-001', 'WST-DIM-002'],
  ['WST-EQ-PACK-01', 'Máy đóng gói túi tự động 01', 'Automatic bag packaging machine 01', 'Packaging', 'WST-PACK-001', 'WST-PACK-002'],
  ['WST-EQ-UTILITY-01', 'Máy làm lạnh nước dùng chung 01', 'Shared industrial water chiller 01', 'Utility', 'WST-CHL-001'],
  ['WST-EQ-LEGACY-01', 'Thiết bị legacy không còn sử dụng', 'Obsolete legacy equipment', 'Legacy', 'WST-LEGACY-001'],
];

const workstationMap = {
  'WST-EQ-WGH-01': ['WS-MIXING-01', 'WST-GRP-WEIGHING', 'OP-PREP'],
  'WST-EQ-CUT-01': ['WS-CUTTING-01', 'WST-GRP-RAW-CUTTING', 'OP-PREP'],
  'WST-EQ-MIX-35': ['WS-MIXING-01', 'WST-GRP-MIXERS-35L', 'OP-MIX'],
  'WST-EQ-MIX-55': ['WS-MIXING-01', 'WST-GRP-MIXERS-55L', 'OP-MIX'],
  'WST-EQ-MILL-16': ['WS-MIXING-01', 'WST-GRP-OPEN-MILLS', 'OP-MIX'],
  'WST-EQ-PRE-01': ['WS-CUTTING-01', 'WST-GRP-PREFORMERS', 'OP-PREP'],
  'WST-EQ-EXT-01': ['WS-CUTTING-01', 'WST-GRP-EXTRUSION', 'OP-PREP'],
  'WST-EQ-CMP-100': ['WS-MOLD-KIOSK01', 'WST-GRP-COMPRESSION-100T', 'OP-MOLD'],
  'WST-EQ-CMP-150': ['WS-MOLD-KIOSK01', 'WST-GRP-COMPRESSION-150T', 'OP-MOLD'],
  'WST-EQ-CMP-200': ['WS-MOLD-KIOSK01', 'WST-GRP-COMPRESSION-200T', 'OP-MOLD'],
  'WST-EQ-INJ-200': ['WS-MOLD-KIOSK01', 'WST-GRP-INJECTION', 'OP-MOLD'],
  'WST-EQ-OVN-01': ['WS-MOLD-KIOSK01', 'WST-GRP-POST-CURING', 'OP-MOLD'],
  'WST-EQ-TRIM-01': ['WS-CUTTING-01', 'WST-GRP-AUTO-TRIMMING', 'OP-TRIM'],
  'WST-EQ-CRY-01': ['WS-CUTTING-01', 'WST-GRP-DEFLASHING', 'OP-TRIM'],
  'WST-EQ-VIS-01': ['WS-QC-01', 'WST-GRP-VISUAL-INSPECTION', 'OP-QC'],
  'WST-EQ-DIM-01': ['WS-QC-01', 'WST-GRP-DIMENSIONAL-INSPECTION', 'OP-QC'],
  'WST-EQ-PACK-01': ['WS-QC-01', 'WST-GRP-PACKAGING', 'OP-QC'],
};

async function loadContext(db) {
  const site = (await db.query('SELECT master_id, code FROM md_site WHERE code=$1', [siteCode])).rows[0];
  if (!site) throw new Error(`SITE_NOT_FOUND: ${siteCode}`);
  const workstations = new Map((await db.query("SELECT master_id,code,site_id,work_center_id,shopfloor_id FROM md_workstation WHERE code = ANY($1::text[]) AND lifecycle_status='Released' AND active_flag=TRUE", [Object.values(workstationMap).map((x) => x[0])])).rows.map((row) => [row.code, row]));
  const shifts = (await db.query("SELECT master_id,code FROM md_shift WHERE site_id=$1 AND lifecycle_status='Released' ORDER BY code", [site.master_id])).rows;
  const operations = new Map((await db.query("SELECT master_id,code FROM md_operation WHERE lifecycle_status='Released' AND code = ANY($1::text[])", [['OP-PREP', 'OP-MIX', 'OP-MOLD', 'OP-TRIM', 'OP-QC']])).rows.map((row) => [row.code, row]));
  if (!shifts.length) throw new Error('SHIFT_NOT_FOUND: no Released shift exists for the selected Site');
  return { site, workstations, shifts, operations };
}

async function cleanup(db) {
  const codes = machineDefinitions.map(([code]) => code);
  const units = await db.query('SELECT machine_unit_id FROM md_machine_unit WHERE machine_id IN (SELECT master_id FROM md_equipment WHERE code=ANY($1::text[]))', [codes]);
  const equipmentIds = `(SELECT master_id FROM md_equipment WHERE code=ANY($1::text[]))`;
  const unitIds = units.rows.map((row) => row.machine_unit_id);
  await db.query('BEGIN');
  try {
    const refs = await db.query(`SELECT COUNT(*)::int AS count FROM md_production_standard WHERE equipment_id IN ${equipmentIds}`, [codes]);
    if (Number(refs.rows[0].count) > 0) throw new Error('MACHINE_HAS_DEPENDENT_PRODUCTION_STANDARD');
    await db.query(`DELETE FROM md_resource_calendar WHERE equipment_id IN ${equipmentIds}`, [codes]);
    await db.query(`DELETE FROM md_resource_capability WHERE equipment_id IN ${equipmentIds}`, [codes]);
    await db.query(`DELETE FROM md_resource_assignment WHERE equipment_id IN ${equipmentIds} OR machine_unit_id=ANY($2::uuid[]) OR machine_group_id IN (SELECT master_id FROM md_workstation_machine_group WHERE code LIKE 'WST-GRP-%')`, [codes, unitIds.length ? unitIds : ['00000000-0000-0000-0000-000000000000']]);
    await db.query("DELETE FROM md_workstation_machine_requirement WHERE machine_group_id IN (SELECT master_id FROM md_workstation_machine_group WHERE code LIKE 'WST-GRP-%') OR machine_id IN (SELECT master_id FROM md_equipment WHERE code=ANY($1::text[]))", [codes]);
    await db.query("DELETE FROM md_workstation_machine_group WHERE code LIKE 'WST-GRP-%'");
    await db.query('DELETE FROM md_machine_unit WHERE machine_id IN ' + equipmentIds, [codes]);
    await db.query('DELETE FROM md_equipment WHERE code=ANY($1::text[])', [codes]);
    await db.query('COMMIT');
    console.log('[CLEANUP] Won Seal Tech WST namespace removed safely');
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}

async function seed(db, context) {
  await db.query('BEGIN');
  try {
    const equipment = new Map();
    for (const [code, vi, en, type, ...unitCodes] of machineDefinitions) {
      const retired = type === 'Utility' || type === 'Legacy';
      const status = type === 'Legacy' ? 'Obsolete' : retired ? 'Inactive' : 'Released';
      const ws = workstationMap[code] ? context.workstations.get(workstationMap[code][0]) : null;
      const equipmentRow = (await db.query(`INSERT INTO md_equipment (master_id,code,name,version_no,lifecycle_status,effective_from,created_by,updated_by,attributes,site_id,work_center_id,equipment_type,active_flag,description,manufacturer,model,planning_resource_flag,execution_status,default_efficiency,quantity) VALUES (gen_random_uuid(),$1,$2::jsonb,1,$3,NOW(),$4,$4,'{"seed_namespace":"WST-WON-SEAL-TECH"}'::jsonb,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (site_id,code) DO UPDATE SET name=EXCLUDED.name,lifecycle_status=EXCLUDED.lifecycle_status,work_center_id=EXCLUDED.work_center_id,equipment_type=EXCLUDED.equipment_type,active_flag=EXCLUDED.active_flag,planning_resource_flag=EXCLUDED.planning_resource_flag,execution_status=EXCLUDED.execution_status,quantity=EXCLUDED.quantity,updated_at=NOW() RETURNING *`, [code, JSON.stringify({ vi, en }), status, userId, context.site.master_id, ws?.work_center_id || null, type, !retired, JSON.stringify({ vi: 'Thiết bị thuộc dataset Won Seal Tech.', en: 'Equipment in the Won Seal Tech demo dataset.' }), 'Won Seal Tech', `WST-${type.toUpperCase()}-MODEL`, !retired, retired ? 'OutOfService' : 'Available', 1, unitCodes.length])).rows[0];
      equipment.set(code, equipmentRow);
      for (let index = 0; index < unitCodes.length; index += 1) {
        const unitStatus = type === 'Legacy' ? 'Obsolete' : type === 'Utility' ? 'Inactive' : 'Released';
        const execution = code === 'WST-EQ-CMP-200' && index === 0 ? 'Maintenance' : type === 'Legacy' ? 'OutOfService' : 'Available';
        await db.query(`INSERT INTO md_machine_unit (machine_id,code,unit_sequence,serial_number,lifecycle_status,physical_identity_status,planning_resource_flag,execution_status,active_flag) VALUES ($1,$2,$3,$4,$5,'Identified',$6,$7,$8) ON CONFLICT (code) DO UPDATE SET machine_id=EXCLUDED.machine_id,serial_number=EXCLUDED.serial_number,lifecycle_status=EXCLUDED.lifecycle_status,planning_resource_flag=EXCLUDED.planning_resource_flag,execution_status=EXCLUDED.execution_status,active_flag=EXCLUDED.active_flag`, [equipmentRow.master_id, unitCodes[index], index + 1, `SN-${unitCodes[index]}`, unitStatus, !retired && execution === 'Available', execution, !retired]);
      }
    }
    for (const [equipmentCode, [wsCode, groupCode, operationCode]] of Object.entries(workstationMap)) {
      const ws = context.workstations.get(wsCode); const eq = equipment.get(equipmentCode); if (!ws || !eq) continue;
      const group = (await db.query(`INSERT INTO md_workstation_machine_group (master_id,code,name,description,version_no,lifecycle_status,effective_from,created_by,updated_by,attributes,site_id,shopfloor_id,work_center_id,workstation_id,group_type,minimum_required_machines,maximum_concurrent_jobs) VALUES (gen_random_uuid(),$1,$2::jsonb,$3::jsonb,1,'Released',NOW(),$4,$4,'{"seed_namespace":"WST-WON-SEAL-TECH"}'::jsonb,$5,$6,$7,$8,'Production',1,1) ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,lifecycle_status='Released',effective_to=NULL,updated_at=NOW() RETURNING *`, [groupCode, JSON.stringify({ vi: `Nhóm máy ${equipmentCode}`, en: `Machine group ${equipmentCode}` }), JSON.stringify({ vi: 'Nhóm tài nguyên tương đương cho kế hoạch sản xuất seal.', en: 'Interchangeable resources for seal production planning.' }), userId, context.site.master_id, ws.shopfloor_id, ws.work_center_id, ws.master_id])).rows[0];
      await db.query(`INSERT INTO md_workstation_machine_requirement (requirement_id,machine_group_id,machine_id,role,required_quantity,requirement_type,pinned_machine_unit_ids,sequence_no,effective_from,active_flag,created_by,created_at,updated_at) VALUES (gen_random_uuid(),$1,$2,'Primary',1,'Required','[]'::jsonb,1,NOW(),TRUE,$3,NOW(),NOW())`, [group.master_id, eq.master_id, userId]);
      const units = (await db.query('SELECT machine_unit_id,code FROM md_machine_unit WHERE machine_id=$1 AND planning_resource_flag=TRUE ORDER BY unit_sequence', [eq.master_id])).rows;
      for (const [index, unit] of units.entries()) await db.query(`INSERT INTO md_resource_assignment (master_id,code,name,version_no,lifecycle_status,effective_from,created_by,updated_by,attributes,work_center_id,workstation_id,equipment_id,assignment_type,site_id,assignment_role,scheduling_flag,oee_aggregation_flag,machine_group_id,machine_unit_id,requirement_type,sequence_no) VALUES (gen_random_uuid(),$1,$2::jsonb,1,'Released',NOW(),$3,$3,'{"seed_namespace":"WST-WON-SEAL-TECH"}'::jsonb,$4,$5,$6,'MachineGroupMember',$7,$8,TRUE,FALSE,$9,$10,'Required',$11) ON CONFLICT DO NOTHING`, [`WST-RA-${groupCode}-${String(index + 1).padStart(2, '0')}`, JSON.stringify({ vi: `Gán ${unit.code}`, en: `Assignment ${unit.code}` }), userId, ws.work_center_id, ws.master_id, eq.master_id, context.site.master_id, index ? 'Supporting' : 'Primary', group.master_id, unit.machine_unit_id, index + 1]);
      const operation = context.operations.get(operationCode);
      if (operation) await db.query(`INSERT INTO md_resource_capability (master_id,code,name,version_no,lifecycle_status,effective_from,created_by,updated_by,attributes,operation_id,work_center_id,equipment_id,capability_type,active_flag,cycle_time_sec,site_id,item_group,eligibility,priority_no,speed_factor,setup_family) VALUES (gen_random_uuid(),$1,$2::jsonb,1,'Released',NOW(),$3,$3,'{"seed_namespace":"WST-WON-SEAL-TECH"}'::jsonb,$4,$5,$6,'Eligible',TRUE,60,$7,'SEAL',TRUE,1,1,$8) ON CONFLICT DO NOTHING`, [`WST-CAP-${equipmentCode}`, JSON.stringify({ vi: `Năng lực ${operationCode}`, en: `${operationCode} capability` }), userId, operation.master_id, ws.work_center_id, eq.master_id, context.site.master_id, typeName(equipmentCode)]);
      for (const shift of context.shifts) await db.query(`INSERT INTO md_resource_calendar (master_id,code,name,version_no,lifecycle_status,effective_from,created_by,updated_by,attributes,work_center_id,equipment_id,available_from,available_to,capacity_percent,site_id,resource_type,resource_id,workstation_id,calendar_date,shift_id,availability_status,available_minutes,capacity_factor) VALUES (gen_random_uuid(),$1,$2::jsonb,1,'Released',NOW(),$3,$3,'{"seed_namespace":"WST-WON-SEAL-TECH"}'::jsonb,$4,$5,NOW(),NOW()+INTERVAL '1 day',1,$6,'Equipment',$5,$7,$8,$9,'Available',540,1) ON CONFLICT (resource_type,resource_id,calendar_date,shift_id) DO UPDATE SET lifecycle_status='Released',available_minutes=540,availability_status='Available',effective_to=NULL`, [`WST-CAL-${equipmentCode}-${today}-${shift.code}`, JSON.stringify({ vi: `Lịch ${equipmentCode}`, en: `${equipmentCode} calendar` }), userId, ws.work_center_id, eq.master_id, context.site.master_id, ws.master_id, today, shift.master_id]);
    }
    await db.query('COMMIT');
    console.log('[SEED] Won Seal Tech Machine dataset created');
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}

function typeName(code) { return code.replace('WST-EQ-', '').replaceAll('-', '_'); }

async function verify(db) {
  const machines = (await db.query("SELECT COUNT(*)::int AS count, COUNT(*) FILTER (WHERE lifecycle_status='Released')::int AS released FROM md_equipment WHERE code LIKE 'WST-EQ-%'")).rows[0];
  const units = (await db.query("SELECT COUNT(*)::int AS count, COUNT(*) FILTER (WHERE planning_resource_flag)::int AS planning FROM md_machine_unit WHERE code LIKE 'WST-%' AND code NOT LIKE 'WST-GRP-%'")).rows[0];
  const groups = (await db.query("SELECT COUNT(*)::int AS count FROM md_workstation_machine_group WHERE code LIKE 'WST-GRP-%'")).rows[0];
  const assignments = (await db.query("SELECT COUNT(*)::int AS count FROM md_resource_assignment WHERE code LIKE 'WST-RA-%' AND effective_to IS NULL")).rows[0];
  const calendars = (await db.query("SELECT COUNT(*)::int AS count FROM md_resource_calendar WHERE code LIKE 'WST-CAL-%' AND lifecycle_status='Released'")).rows[0];
  const invalid = await db.query("SELECT COUNT(*)::int AS count FROM md_resource_assignment ra LEFT JOIN md_workstation ws ON ws.master_id=ra.workstation_id LEFT JOIN md_machine_unit mu ON mu.machine_unit_id=ra.machine_unit_id WHERE ra.code LIKE 'WST-RA-%' AND (ws.master_id IS NULL OR mu.machine_unit_id IS NULL OR ws.site_id <> ra.site_id)");
  const passed = Number(machines.count) >= 18 && Number(units.count) >= 30 && Number(groups.count) >= 15 && Number(assignments.count) >= 30 && Number(calendars.count) > 0 && Number(invalid.rows[0].count) === 0;
  console.log(JSON.stringify({ machines, units, groups, assignments, calendars, invalid: invalid.rows[0], result: passed ? 'PASSED' : 'FAILED' }, null, 2));
  if (!passed) process.exitCode = 1;
}

const db = new Client({ connectionString: dbUrl });
await db.connect();
try {
  if (mode === '--cleanup') await cleanup(db);
  else if (mode === '--seed') await seed(db, await loadContext(db));
  else if (mode === '--verify') await verify(db);
  else if (mode === '--reset') { await cleanup(db); await seed(db, await loadContext(db)); await verify(db); }
  else throw new Error('Usage: --cleanup | --seed | --verify | --reset');
} finally { await db.end(); }
