import { createHash } from 'crypto';
import { Pool, type PoolClient } from 'pg';

type LocalizedText = { vi: string; en: string; ja: string; ko: string };

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
const BASE_DATE = new Date('2026-07-22T08:00:00.000Z');

const MES_MASTER_DATA_URL = process.env['MES_MASTER_DATA_URL'] ?? 'postgresql://mes_master_data_user:mes_master_data_pass@localhost:15434/mes_master_data_db';
const WMS_MASTER_DATA_URL = process.env['WMS_MASTER_DATA_URL'] ?? 'postgresql://wms_master_data_owner:wms_master_data_owner_pass@localhost:15438/wms_master_data_db';
const WMS_INVENTORY_URL = process.env['WMS_INVENTORY_URL'] ?? 'postgresql://wms_inventory_owner:wms_inventory_owner_pass@localhost:15439/wms_inventory_db';
const WMS_INBOUND_URL = process.env['WMS_INBOUND_URL'] ?? 'postgresql://wms_inbound_owner:wms_inbound_owner_pass@localhost:15440/wms_inbound_db';
const WMS_OUTBOUND_URL = process.env['WMS_OUTBOUND_URL'] ?? 'postgresql://wms_outbound_owner:wms_outbound_owner_pass@localhost:15441/wms_outbound_db';

function stableUuid(input: string): string {
  const hex = createHash('sha256').update(`wonsealtech:wms-demo:${input}`).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function l10n(vi: string, en: string, ja: string, ko: string): LocalizedText {
  return { vi, en, ja, ko };
}

function isoDate(offsetDays: number): string {
  const d = new Date(BASE_DATE);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function isoTs(offsetDays: number, hour = 8): string {
  const d = new Date(BASE_DATE);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

async function withTx<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getMesReferences(pool: Pool) {
  const { rows: itemRows } = await pool.query(`
    SELECT ir.master_id::text AS id, ir.code, ir.name
    FROM md_item_revision ir
    WHERE ir.lifecycle_status = 'Released'
    ORDER BY ir.code
  `);
  const { rows: wcRows } = await pool.query(`
    SELECT master_id::text AS id, code, name
    FROM md_work_center
    WHERE lifecycle_status = 'Released'
    ORDER BY code
  `);

  const items = new Map<string, { id: string; code: string; name: string }>();
  for (const row of itemRows) items.set(String(row.code), { id: String(row.id), code: String(row.code), name: String(row.name) });

  const workCenters = new Map<string, { id: string; code: string; name: string }>();
  for (const row of wcRows) workCenters.set(String(row.code), { id: String(row.id), code: String(row.code), name: String(row.name) });

  const fallbackItems = [
    ['FG-WS-CM01-R1', 'Automotive engine mount revision 1'],
    ['SFG-MET-CM01-R1', 'Treated metal core revision 1'],
    ['SFG-RUB-CM01-R1', 'Rubber child blank revision 1'],
    ['SFG-ROLL-EPDM-R1', 'EPDM parent roll revision 1'],
    ['RM-STL-05-R1', 'Steel raw blank revision 1'],
    ['RM-CHEM-BOND-R1', 'Bonding chemical revision 1'],
  ] as const;
  for (const [code, name] of fallbackItems) {
    if (!items.has(code)) items.set(code, { id: stableUuid(`item:${code}`), code, name });
  }

  const extraItems = [
    ['RM-NBR-70-R1', 'NBR 70 compound revision 1'],
    ['RM-EPDM-60-R1', 'EPDM 60 compound revision 1'],
    ['RM-CARBON-BLACK-R1', 'Carbon black N330 revision 1'],
    ['RM-SULFUR-R1', 'Sulfur curing agent revision 1'],
    ['RM-ZINC-OXIDE-R1', 'Zinc oxide activator revision 1'],
    ['RM-ADH-PRIMER-R1', 'Metal primer adhesive revision 1'],
    ['PKG-CARTON-MOUNT-R1', 'Engine mount carton revision 1'],
    ['FG-WS-BUSH02-R1', 'Rubber metal bushing revision 1'],
  ] as const;
  for (const [code, name] of extraItems) items.set(code, { id: stableUuid(`item:${code}`), code, name });

  const fallbackWcs = [
    ['WC-MIXING', 'Banbury Mixing Work Center'],
    ['WC-CUTTING', 'Rubber Cutting Work Center'],
    ['WC-VULCAN-MOLD', 'Vulcanization Molding Work Center'],
    ['WC-QC', 'Quality Inspection Work Center'],
  ] as const;
  for (const [code, name] of fallbackWcs) {
    if (!workCenters.has(code)) workCenters.set(code, { id: stableUuid(`work-center:${code}`), code, name });
  }

  return { items, workCenters };
}

async function upsertWarehouse(client: PoolClient, code: string, name: LocalizedText, description: LocalizedText, siteId: string) {
  const { rows } = await client.query(
    `INSERT INTO wms_warehouse (warehouse_code, warehouse_name, warehouse_description, site_id, status, created_by)
     VALUES ($1, $2::jsonb, $3::jsonb, $4, 'Active', $5)
     ON CONFLICT (warehouse_code) DO UPDATE
     SET warehouse_name = EXCLUDED.warehouse_name,
         warehouse_description = EXCLUDED.warehouse_description,
         site_id = EXCLUDED.site_id,
         status = 'Active',
         updated_at = NOW()
     RETURNING warehouse_id::text`,
    [code, JSON.stringify(name), JSON.stringify(description), siteId, SYSTEM_USER_ID],
  );
  return String(rows[0].warehouse_id);
}

async function upsertZone(client: PoolClient, warehouseId: string, code: string, name: LocalizedText, type: string) {
  const { rows } = await client.query(
    `INSERT INTO wms_zone (warehouse_id, zone_code, zone_name, zone_type, status, created_by)
     VALUES ($1, $2, $3::jsonb, $4, 'Active', $5)
     ON CONFLICT (warehouse_id, zone_code) DO UPDATE
     SET zone_name = EXCLUDED.zone_name, zone_type = EXCLUDED.zone_type, status = 'Active', updated_at = NOW()
     RETURNING zone_id::text`,
    [warehouseId, code, JSON.stringify(name), type, SYSTEM_USER_ID],
  );
  return String(rows[0].zone_id);
}

async function upsertLocation(client: PoolClient, zoneId: string, code: string, name: LocalizedText, purpose: 'Storage' | 'WorkCenterStaging', workCenterRef?: string) {
  const { rows } = await client.query(
    `INSERT INTO wms_storage_location (zone_id, location_code, location_name, location_purpose, staging_for_work_center_ref, status, created_by)
     VALUES ($1, $2, $3::jsonb, $4, NULLIF($5, '')::uuid, 'Active', $6)
     ON CONFLICT (zone_id, location_code) DO UPDATE
     SET location_name = EXCLUDED.location_name,
         location_purpose = EXCLUDED.location_purpose,
         staging_for_work_center_ref = EXCLUDED.staging_for_work_center_ref,
         status = 'Active',
         updated_at = NOW()
     RETURNING location_id::text`,
    [zoneId, code, JSON.stringify(name), purpose, workCenterRef ?? '', SYSTEM_USER_ID],
  );
  return String(rows[0].location_id);
}

async function upsertBin(client: PoolClient, locationId: string, code: string, name: LocalizedText, capacityQty: string, capacityUomId?: string) {
  await client.query(
    `INSERT INTO wms_storage_bin (location_id, bin_code, bin_name, capacity_qty, capacity_uom_id, status, created_by)
     VALUES ($1, $2, $3::jsonb, $4, NULLIF($5, '')::uuid, 'Active', $6)
     ON CONFLICT (location_id, bin_code) DO UPDATE
     SET bin_name = EXCLUDED.bin_name, capacity_qty = EXCLUDED.capacity_qty, capacity_uom_id = EXCLUDED.capacity_uom_id, status = 'Active', updated_at = NOW()`,
    [locationId, code, JSON.stringify(name), capacityQty, capacityUomId ?? '', SYSTEM_USER_ID],
  );
}

async function seedWmsMasterData(pool: Pool, refs: Awaited<ReturnType<typeof getMesReferences>>) {
  return withTx(pool, async (client) => {
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [SYSTEM_USER_ID]);
    const siteId = stableUuid('site:SITE-KZ3');

    const whRaw = await upsertWarehouse(
      client,
      'WH-KZ3-RM',
      l10n('Kho nguyên vật liệu Kizuna 3', 'Kizuna 3 raw material warehouse', 'キズナ3 原材料倉庫', '키즈나3 원자재 창고'),
      l10n('Quản lý tiếp nhận, cách ly chất lượng, lưu kho cao su, hóa chất và lõi kim loại trước khi cấp liệu.', 'Manages receiving, quality hold, and storage for rubber, chemicals, and metal cores before staging.', '供給前の受入、品質保留、ゴム・化学品・金属芯の保管を管理します。', '공급 전 입고, 품질 보류, 고무/화학품/금속 코어 보관을 관리합니다.'),
      siteId,
    );
    const whWip = await upsertWarehouse(
      client,
      'WH-KZ3-WIP',
      l10n('Kho bán thành phẩm Kizuna 3', 'Kizuna 3 WIP warehouse', 'キズナ3 仕掛品倉庫', '키즈나3 재공 창고'),
      l10n('Theo dõi bán thành phẩm và các vị trí staging cấp liệu trực tiếp cho work center sản xuất.', 'Tracks WIP stock and staging locations that feed production work centers directly.', '仕掛品在庫と生産ワークセンターへ直接供給するステージングを追跡します。', '재공 재고와 생산 워크센터에 직접 공급하는 스테이징 위치를 추적합니다.'),
      siteId,
    );
    const whFg = await upsertWarehouse(
      client,
      'WH-KZ3-FG',
      l10n('Kho thành phẩm Kizuna 3', 'Kizuna 3 finished goods warehouse', 'キズナ3 完成品倉庫', '키즈나3 완제품 창고'),
      l10n('Lưu trữ thành phẩm đóng gói, kiểm soát số dư theo lô và sẵn sàng bàn giao xuất hàng.', 'Stores packed finished goods with lot-level balances ready for shipping handoff.', '梱包済み完成品をロット別残高で保管し、出荷引き渡しに備えます。', '포장 완제품을 로트 단위 잔량으로 보관하고 출하 인계를 준비합니다.'),
      siteId,
    );

    const zoneCodes = {
      receiving: await upsertZone(client, whRaw, 'ZONE-RECEIVING', l10n('Khu nhập hàng', 'Receiving zone', '入荷ゾーン', '입고 구역'), 'Receiving'),
      quarantine: await upsertZone(client, whRaw, 'ZONE-QUARANTINE', l10n('Khu cách ly chất lượng', 'Quality quarantine zone', '品質隔離ゾーン', '품질 격리 구역'), 'Storage'),
      rubber: await upsertZone(client, whRaw, 'ZONE-RUBBER', l10n('Khu lưu kho cao su', 'Rubber storage zone', 'ゴム保管ゾーン', '고무 보관 구역'), 'Storage'),
      chemical: await upsertZone(client, whRaw, 'ZONE-CHEM', l10n('Khu hóa chất', 'Chemical storage zone', '化学品保管ゾーン', '화학품 보관 구역'), 'Storage'),
      metal: await upsertZone(client, whRaw, 'ZONE-METAL', l10n('Khu lõi kim loại', 'Metal core storage zone', '金属芯保管ゾーン', '금속 코어 보관 구역'), 'Storage'),
      staging: await upsertZone(client, whWip, 'ZONE-WC-STAGING', l10n('Khu cấp liệu công đoạn', 'Work center staging zone', '工程供給ゾーン', '공정 공급 구역'), 'Staging'),
      wip: await upsertZone(client, whWip, 'ZONE-WIP-RUBBER', l10n('Khu bán thành phẩm cao su', 'Rubber WIP zone', 'ゴム仕掛品ゾーン', '고무 재공 구역'), 'Storage'),
      fg: await upsertZone(client, whFg, 'ZONE-FG-PACKED', l10n('Khu thành phẩm đóng gói', 'Packed finished goods zone', '梱包完成品ゾーン', '포장 완제품 구역'), 'Storage'),
    };

    const wc = refs.workCenters;
    const locations = new Map<string, string>();
    const locationInputs: Array<[string, string, LocalizedText, 'Storage' | 'WorkCenterStaging', string?]> = [
      [zoneCodes.receiving, 'RCV-DOCK-01', l10n('Cửa nhập 01', 'Receiving dock 01', '入荷ドック01', '입고 도크 01'), 'Storage'],
      [zoneCodes.quarantine, 'QA-HOLD-01', l10n('Vị trí cách ly QA 01', 'QA hold location 01', 'QA保留ロケーション01', 'QA 보류 위치 01'), 'Storage'],
      [zoneCodes.rubber, 'RUB-A01-R01', l10n('Cao su dãy A01 kệ R01', 'Rubber A01 rack R01', 'ゴム A01 ラック R01', '고무 A01 랙 R01'), 'Storage'],
      [zoneCodes.rubber, 'RUB-A01-R02', l10n('Cao su dãy A01 kệ R02', 'Rubber A01 rack R02', 'ゴム A01 ラック R02', '고무 A01 랙 R02'), 'Storage'],
      [zoneCodes.rubber, 'RUB-A02-R01', l10n('Cao su dãy A02 kệ R01', 'Rubber A02 rack R01', 'ゴム A02 ラック R01', '고무 A02 랙 R01'), 'Storage'],
      [zoneCodes.chemical, 'CHEM-C01-R01', l10n('Hóa chất C01 kệ R01', 'Chemical C01 rack R01', '化学品 C01 ラック R01', '화학품 C01 랙 R01'), 'Storage'],
      [zoneCodes.chemical, 'CHEM-COLD-01', l10n('Tủ mát hóa chất 01', 'Chemical cold cabinet 01', '化学品冷蔵庫01', '화학품 냉장고 01'), 'Storage'],
      [zoneCodes.metal, 'MET-M01-R01', l10n('Lõi kim loại M01 kệ R01', 'Metal M01 rack R01', '金属 M01 ラック R01', '금속 M01 랙 R01'), 'Storage'],
      [zoneCodes.wip, 'WIP-ROLL-01', l10n('Cuộn cao su mẹ WIP 01', 'WIP parent roll 01', '仕掛親ロール01', '재공 마스터 롤 01'), 'Storage'],
      [zoneCodes.fg, 'FG-PACK-01', l10n('Thành phẩm đóng gói 01', 'Packed FG 01', '梱包完成品01', '포장 완제품 01'), 'Storage'],
      [zoneCodes.staging, 'STG-WC-MIXING', l10n('Cấp liệu luyện cán', 'Mixing staging', '混練供給', '혼련 공급'), 'WorkCenterStaging', wc.get('WC-MIXING')?.id],
      [zoneCodes.staging, 'STG-WC-CUTTING', l10n('Cấp liệu cắt phôi', 'Cutting staging', '切断供給', '절단 공급'), 'WorkCenterStaging', wc.get('WC-CUTTING')?.id],
      [zoneCodes.staging, 'STG-WC-MOLD', l10n('Cấp liệu ép lưu hóa', 'Molding staging', '成形供給', '성형 공급'), 'WorkCenterStaging', wc.get('WC-VULCAN-MOLD')?.id],
      [zoneCodes.staging, 'STG-WC-QC', l10n('Chờ kiểm tra QC', 'QC staging', 'QC待機', 'QC 대기'), 'WorkCenterStaging', wc.get('WC-QC')?.id],
    ];

    for (const [zoneId, code, name, purpose, workCenterRef] of locationInputs) {
      locations.set(code, await upsertLocation(client, zoneId, code, name, purpose, workCenterRef));
    }

    for (const [code, locationId] of locations) {
      const binCount = code.startsWith('STG-') ? 2 : 3;
      for (let i = 1; i <= binCount; i += 1) {
        await upsertBin(client, locationId, `${code}-B${String(i).padStart(2, '0')}`, l10n(`${code} ô ${i}`, `${code} bin ${i}`, `${code} ビン ${i}`, `${code} 빈 ${i}`), code.includes('CHEM') ? '500.000' : '1200.000');
      }
    }

    for (const item of refs.items.values()) {
      await client.query(
        `INSERT INTO rm_item_revision (item_revision_id, item_code, item_name, updated_at)
         VALUES ($1, $2, $3::jsonb, NOW())
         ON CONFLICT (item_revision_id) DO UPDATE
         SET item_code = EXCLUDED.item_code, item_name = EXCLUDED.item_name, updated_at = NOW()`,
        [item.id, item.code, JSON.stringify(l10n(item.name, item.name, item.name, item.name))],
      );
      const uom = item.code.includes('CHEM') || item.code.includes('CARBON') || item.code.includes('SULFUR') || item.code.includes('ZINC') || item.code.includes('NBR') || item.code.includes('EPDM-60') ? 'KG' : item.code.includes('ROLL') ? 'M2' : 'PCS';
      await client.query(
        `INSERT INTO wms_item_uom_mapping (item_revision_id, storage_uom_code, conversion_factor, default_bin_capacity_qty, created_by)
         VALUES ($1, $2, '1.000000', $3, $4)
         ON CONFLICT (item_revision_id, storage_uom_code) DO UPDATE
         SET conversion_factor = EXCLUDED.conversion_factor, default_bin_capacity_qty = EXCLUDED.default_bin_capacity_qty, updated_at = NOW()`,
        [item.id, uom, uom === 'KG' ? '500.000' : uom === 'M2' ? '300.000' : '1200.000', SYSTEM_USER_ID],
      );
    }

    return { locations };
  });
}

async function seedReadModels(pool: Pool, refs: Awaited<ReturnType<typeof getMesReferences>>, locations: Map<string, string>, locationPurposeByCode: Map<string, 'Storage' | 'WorkCenterStaging'>, stagingRefByCode: Map<string, string | undefined>) {
  await withTx(pool, async (client) => {
    for (const item of refs.items.values()) {
      await client.query(
        `INSERT INTO rm_item_revision (item_revision_id, item_code, item_name, updated_at)
         VALUES ($1, $2, $3::jsonb, NOW())
         ON CONFLICT (item_revision_id) DO UPDATE
         SET item_code = EXCLUDED.item_code, item_name = EXCLUDED.item_name, updated_at = NOW()`,
        [item.id, item.code, JSON.stringify(l10n(item.name, item.name, item.name, item.name))],
      );
    }
    for (const [code, id] of locations) {
      await client.query(
        `INSERT INTO rm_storage_location (location_id, location_code, location_name, location_purpose, staging_for_work_center_ref, status, updated_at)
         VALUES ($1, $2, $3::jsonb, $4, NULLIF($5, '')::uuid, 'Active', NOW())
         ON CONFLICT (location_id) DO UPDATE
         SET location_code = EXCLUDED.location_code,
             location_name = EXCLUDED.location_name,
             location_purpose = EXCLUDED.location_purpose,
             staging_for_work_center_ref = EXCLUDED.staging_for_work_center_ref,
             status = 'Active',
             updated_at = NOW()`,
        [id, code, JSON.stringify(l10n(code, code, code, code)), locationPurposeByCode.get(code), stagingRefByCode.get(code) ?? ''],
      );
    }
  });
}

async function seedOutboundReadModel(pool: Pool, locations: Map<string, string>, locationPurposeByCode: Map<string, 'Storage' | 'WorkCenterStaging'>, stagingRefByCode: Map<string, string | undefined>) {
  await withTx(pool, async (client) => {
    for (const [code, id] of locations) {
      await client.query(
        `INSERT INTO rm_storage_location (location_id, location_code, location_purpose, staging_for_work_center_ref, status, updated_at)
         VALUES ($1, $2, $3, NULLIF($4, '')::uuid, 'Active', NOW())
         ON CONFLICT (location_id) DO UPDATE
         SET location_code = EXCLUDED.location_code,
             location_purpose = EXCLUDED.location_purpose,
             staging_for_work_center_ref = EXCLUDED.staging_for_work_center_ref,
             status = 'Active',
             updated_at = NOW()`,
        [id, code, locationPurposeByCode.get(code), stagingRefByCode.get(code) ?? ''],
      );
    }
  });
}

async function seedInventory(pool: Pool, refs: Awaited<ReturnType<typeof getMesReferences>>, locations: Map<string, string>) {
  const item = (code: string) => refs.items.get(code)?.id ?? stableUuid(`item:${code}`);
  const loc = (code: string) => {
    const id = locations.get(code);
    if (!id) throw new Error(`Missing seeded location ${code}`);
    return id;
  };

  const lots = [
    ['LOT-RUB-CM01-260423-A', 'SFG-RUB-CM01-R1', -90, 35, 'Active', '850.000', 'PCS', [['RUB-A01-R01', '420.000'], ['STG-WC-MOLD', '120.000']]],
    ['LOT-RUB-CM01-260505-B', 'SFG-RUB-CM01-R1', -78, 5, 'Active', '900.000', 'PCS', [['RUB-A01-R02', '350.000'], ['STG-WC-MOLD', '180.000']]],
    ['LOT-RUB-CM01-260620-C', 'SFG-RUB-CM01-R1', -32, 72, 'Active', '1200.000', 'PCS', [['RUB-A02-R01', '760.000']]],
    ['LOT-MET-CM01-260428-A', 'SFG-MET-CM01-R1', -85, 365, 'Active', '1100.000', 'PCS', [['MET-M01-R01', '760.000'], ['STG-WC-MOLD', '95.000']]],
    ['LOT-MET-CM01-260610-B', 'SFG-MET-CM01-R1', -42, 365, 'Active', '1400.000', 'PCS', [['MET-M01-R01', '1180.000']]],
    ['LOT-STL-05-260501-A', 'RM-STL-05-R1', -81, 540, 'Active', '2500.000', 'PCS', [['MET-M01-R01', '2100.000'], ['STG-WC-MOLD', '140.000']]],
    ['LOT-BOND-260424-A', 'RM-CHEM-BOND-R1', -89, -5, 'Expired', '180.000', 'KG', [['CHEM-COLD-01', '46.500']]],
    ['LOT-BOND-260701-B', 'RM-CHEM-BOND-R1', -21, 3, 'Active', '220.000', 'KG', [['CHEM-COLD-01', '88.750'], ['STG-WC-MOLD', '12.250']]],
    ['LOT-ROLL-EPDM-260514-A', 'SFG-ROLL-EPDM-R1', -69, 120, 'Active', '420.000', 'M2', [['WIP-ROLL-01', '260.000'], ['STG-WC-CUTTING', '32.500']]],
    ['LOT-NBR70-260605-A', 'RM-NBR-70-R1', -47, 60, 'Active', '980.000', 'KG', [['RUB-A01-R01', '620.000'], ['STG-WC-MIXING', '75.000']]],
    ['LOT-EPDM60-260612-A', 'RM-EPDM-60-R1', -40, 80, 'Active', '760.000', 'KG', [['RUB-A02-R01', '510.000']]],
    ['LOT-CBLACK-260518-A', 'RM-CARBON-BLACK-R1', -65, 180, 'Active', '1500.000', 'KG', [['CHEM-C01-R01', '1140.000'], ['STG-WC-MIXING', '65.000']]],
    ['LOT-SULFUR-260430-A', 'RM-SULFUR-R1', -83, 20, 'Active', '360.000', 'KG', [['CHEM-C01-R01', '170.000']]],
    ['LOT-ZNO-260603-A', 'RM-ZINC-OXIDE-R1', -49, 240, 'Active', '440.000', 'KG', [['CHEM-C01-R01', '310.000']]],
    ['LOT-PRIMER-260629-A', 'RM-ADH-PRIMER-R1', -23, 8, 'Active', '120.000', 'KG', [['CHEM-COLD-01', '53.000']]],
    ['LOT-CARTON-260716-A', 'PKG-CARTON-MOUNT-R1', -6, 720, 'Active', '3000.000', 'PCS', [['FG-PACK-01', '2650.000']]],
    ['LOT-FG-CM01-260708-A', 'FG-WS-CM01-R1', -14, 365, 'Active', '650.000', 'PCS', [['FG-PACK-01', '620.000']]],
    ['LOT-FG-BUSH02-260718-A', 'FG-WS-BUSH02-R1', -4, 365, 'Active', '420.000', 'PCS', [['FG-PACK-01', '420.000']]],
    ['LOT-QA-RUB-260710-HOLD', 'SFG-RUB-CM01-R1', -12, 45, 'Quarantined', '120.000', 'PCS', [['QA-HOLD-01', '120.000']]],
    ['LOT-RCV-EPDM-260722-A', 'RM-EPDM-60-R1', 0, 100, 'Active', '500.000', 'KG', [['RCV-DOCK-01', '500.000']]],
  ] as const;

  await withTx(pool, async (client) => {
    for (const [lotCode, itemCode, receivedOffset, expiryOffset, status, originalQty, uom, balances] of lots) {
      const lotId = stableUuid(`lot:${lotCode}`);
      await client.query(
        `INSERT INTO inv_lot (lot_id, lot_code, item_revision_id, received_at, expiry_date, status, original_qty, uom_code)
         VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8)
         ON CONFLICT (lot_code) DO UPDATE
         SET item_revision_id = EXCLUDED.item_revision_id,
             received_at = EXCLUDED.received_at,
             expiry_date = EXCLUDED.expiry_date,
             status = EXCLUDED.status,
             original_qty = EXCLUDED.original_qty,
             uom_code = EXCLUDED.uom_code
         RETURNING lot_id`,
        [lotId, lotCode, item(itemCode), isoTs(receivedOffset), isoDate(expiryOffset), status, originalQty, uom],
      );
      for (const [locationCode, qty] of balances) {
        await client.query(
          `INSERT INTO inv_balance (balance_id, lot_id, location_id, on_hand_qty, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (lot_id, location_id) DO UPDATE
           SET on_hand_qty = EXCLUDED.on_hand_qty, row_version = inv_balance.row_version + 1, updated_at = NOW()`,
          [stableUuid(`balance:${lotCode}:${locationCode}`), lotId, loc(locationCode), qty],
        );
      }
    }

    const movementRows = [
      ['RECEIPT', 'LOT-RUB-CM01-260423-A', null, 'RUB-A01-R01', '850.000', -90],
      ['RECEIPT', 'LOT-BOND-260701-B', null, 'CHEM-COLD-01', '220.000', -21],
      ['RECEIPT', 'LOT-RCV-EPDM-260722-A', null, 'RCV-DOCK-01', '500.000', 0],
      ['TRANSFER_TO_STAGING', 'LOT-RUB-CM01-260423-A', 'RUB-A01-R01', 'STG-WC-MOLD', '120.000', -16],
      ['TRANSFER_TO_STAGING', 'LOT-RUB-CM01-260505-B', 'RUB-A01-R02', 'STG-WC-MOLD', '180.000', -10],
      ['TRANSFER_TO_STAGING', 'LOT-ROLL-EPDM-260514-A', 'WIP-ROLL-01', 'STG-WC-CUTTING', '32.500', -9],
      ['TRANSFER_TO_STAGING', 'LOT-NBR70-260605-A', 'RUB-A01-R01', 'STG-WC-MIXING', '75.000', -7],
      ['CONSUMPTION', 'LOT-RUB-CM01-260423-A', 'STG-WC-MOLD', null, '55.000', -5],
      ['CONSUMPTION', 'LOT-BOND-260701-B', 'STG-WC-MOLD', null, '6.500', -4],
      ['ADJUSTMENT', 'LOT-QA-RUB-260710-HOLD', 'QA-HOLD-01', null, '0.001', -2],
    ] as const;
    for (const [type, lotCode, fromCode, toCode, qty, offset] of movementRows) {
      await client.query(
        `INSERT INTO inv_stock_movement (movement_id, movement_type, lot_id, from_location_id, to_location_id, qty, wo_id, work_center_ref, occurred_at, created_by)
         VALUES ($1, $2, $3, NULLIF($4, '')::uuid, NULLIF($5, '')::uuid, $6, NULLIF($7, '')::uuid, NULLIF($8, '')::uuid, $9, $10)
         ON CONFLICT (movement_id) DO UPDATE
         SET movement_type = EXCLUDED.movement_type,
             lot_id = EXCLUDED.lot_id,
             from_location_id = EXCLUDED.from_location_id,
             to_location_id = EXCLUDED.to_location_id,
             qty = EXCLUDED.qty,
             occurred_at = EXCLUDED.occurred_at`,
        [
          stableUuid(`movement:${type}:${lotCode}:${offset}`),
          type,
          stableUuid(`lot:${lotCode}`),
          fromCode ? loc(fromCode) : '',
          toCode ? loc(toCode) : '',
          qty,
          stableUuid(`wo:${offset}`),
          '',
          isoTs(offset, 10),
          SYSTEM_USER_ID,
        ],
      );
    }

    const demoLotForLocation = (locationCode: string) => {
      if (locationCode.includes('CHEM-COLD')) return 'LOT-BOND-260701-B';
      if (locationCode.includes('CHEM')) return 'LOT-CBLACK-260518-A';
      if (locationCode.includes('MET')) return 'LOT-MET-CM01-260610-B';
      if (locationCode.includes('FG')) return 'LOT-FG-CM01-260708-A';
      if (locationCode.includes('QA')) return 'LOT-QA-RUB-260710-HOLD';
      if (locationCode.includes('RCV')) return 'LOT-RCV-EPDM-260722-A';
      if (locationCode.includes('ROLL') || locationCode.includes('CUTTING')) return 'LOT-ROLL-EPDM-260514-A';
      if (locationCode.includes('MIXING')) return 'LOT-NBR70-260605-A';
      if (locationCode.includes('MOLD')) return 'LOT-RUB-CM01-260505-B';
      return 'LOT-RUB-CM01-260620-C';
    };

    let locationIndex = 0;
    for (const [locationCode, locationId] of locations) {
      const lotCode = demoLotForLocation(locationCode);
      await client.query(
        `INSERT INTO inv_stock_movement (movement_id, movement_type, lot_id, from_location_id, to_location_id, qty, wo_id, work_center_ref, occurred_at, created_by)
         VALUES ($1, 'ADJUSTMENT', $2, NULL, $3, '0.001', NULL, NULL, $4, $5)
         ON CONFLICT (movement_id) DO UPDATE
         SET lot_id = EXCLUDED.lot_id,
             to_location_id = EXCLUDED.to_location_id,
             occurred_at = EXCLUDED.occurred_at`,
        [
          stableUuid(`movement:location-demo:${locationCode}`),
          stableUuid(`lot:${lotCode}`),
          locationId,
          isoTs(-1, 8 + (locationIndex % 8)),
          SYSTEM_USER_ID,
        ],
      );
      locationIndex += 1;
    }

    const discrepancies = [
      ['STAGING_OVER_CONSUMPTION', 'SFG-RUB-CM01-R1', 'STG-WC-MOLD', '150.000', '125.000', '25.000', -6, 'Operator consumed more than staged balance'],
      ['CYCLE_COUNT_VARIANCE', 'RM-CHEM-BOND-R1', 'CHEM-COLD-01', '100.000', '97.500', '2.500', -18, 'Cold cabinet count difference'],
      ['QUARANTINE_HOLD', 'SFG-RUB-CM01-R1', 'QA-HOLD-01', '120.000', '0.000', '120.000', -12, 'Lot held pending QC release'],
    ] as const;
    for (const [type, itemCode, locationCode, requested, consumed, shortage, offset, reason] of discrepancies) {
      await client.query(
        `INSERT INTO inv_discrepancy_log (discrepancy_id, discrepancy_type, item_revision_id, location_id, requested_qty, consumed_qty, shortage_qty, wo_id, work_center_ref, detail, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, $9::jsonb, $10)
         ON CONFLICT (discrepancy_id) DO UPDATE
         SET requested_qty = EXCLUDED.requested_qty,
             consumed_qty = EXCLUDED.consumed_qty,
             shortage_qty = EXCLUDED.shortage_qty,
             detail = EXCLUDED.detail,
             created_at = EXCLUDED.created_at`,
        [stableUuid(`discrepancy:${type}:${itemCode}:${offset}`), type, item(itemCode), loc(locationCode), requested, consumed, shortage, stableUuid(`wo:${offset}`), JSON.stringify({ reason, source: 'demo-seed' }), isoTs(offset, 16)],
      );
    }
  });
}

async function seedInbound(pool: Pool, refs: Awaited<ReturnType<typeof getMesReferences>>, locations: Map<string, string>) {
  const item = (code: string) => refs.items.get(code)?.id ?? stableUuid(`item:${code}`);
  const loc = (code: string) => {
    const id = locations.get(code);
    if (!id) throw new Error(`Missing seeded location ${code}`);
    return id;
  };
  const receipts = [
    ['RCV-DEMO-260423', 'RUB-A01-R01', -90, 'Confirmed', [['SFG-RUB-CM01-R1', 'LOT-RUB-CM01-260423-A', '850.000', 'PCS', isoDate(35)], ['RM-NBR-70-R1', 'LOT-NBR70-260423-X', '300.000', 'KG', isoDate(55)]]],
    ['RCV-DEMO-260501', 'MET-M01-R01', -82, 'Confirmed', [['RM-STL-05-R1', 'LOT-STL-05-260501-A', '2500.000', 'PCS', isoDate(540)]]],
    ['RCV-DEMO-260514', 'WIP-ROLL-01', -69, 'Confirmed', [['SFG-ROLL-EPDM-R1', 'LOT-ROLL-EPDM-260514-A', '420.000', 'M2', isoDate(120)]]],
    ['RCV-DEMO-260612', 'RUB-A02-R01', -40, 'Confirmed', [['RM-EPDM-60-R1', 'LOT-EPDM60-260612-A', '760.000', 'KG', isoDate(80)]]],
    ['RCV-DEMO-260701', 'CHEM-COLD-01', -21, 'Confirmed', [['RM-CHEM-BOND-R1', 'LOT-BOND-260701-B', '220.000', 'KG', isoDate(3)], ['RM-ADH-PRIMER-R1', 'LOT-PRIMER-260701-X', '80.000', 'KG', isoDate(12)]]],
    ['RCV-DEMO-260722', 'RCV-DOCK-01', 0, 'Draft', [['RM-EPDM-60-R1', 'LOT-RCV-EPDM-260722-A', '500.000', 'KG', isoDate(100)]]],
  ] as const;

  await withTx(pool, async (client) => {
    for (const [receiptCode, locationCode, offset, status, lines] of receipts) {
      const receiptId = stableUuid(`receipt:${receiptCode}`);
      await client.query(
        `INSERT INTO inbound_receipt (receipt_id, receipt_code, warehouse_location_id, status, created_by, created_at, confirmed_at)
         VALUES ($1, $2, $3, $4::varchar, $5, $6, CASE WHEN $4::varchar = 'Confirmed' THEN $7::timestamptz ELSE NULL END)
         ON CONFLICT (receipt_code) DO UPDATE
         SET warehouse_location_id = EXCLUDED.warehouse_location_id,
             status = EXCLUDED.status,
             created_at = EXCLUDED.created_at,
             confirmed_at = EXCLUDED.confirmed_at`,
        [receiptId, receiptCode, loc(locationCode), status, SYSTEM_USER_ID, isoTs(offset, 9), isoTs(offset + 1, 11)],
      );
      for (const [itemCode, lotCode, qty, uom, expiryDate] of lines) {
        await client.query(
          `INSERT INTO inbound_receipt_line (line_id, receipt_id, item_revision_id, lot_code, qty, uom_code, expiry_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7::date)
           ON CONFLICT (receipt_id, lot_code) DO UPDATE
           SET item_revision_id = EXCLUDED.item_revision_id,
               qty = EXCLUDED.qty,
               uom_code = EXCLUDED.uom_code,
               expiry_date = EXCLUDED.expiry_date`,
          [stableUuid(`receipt-line:${receiptCode}:${lotCode}`), receiptId, item(itemCode), lotCode, qty, uom, expiryDate],
        );
      }
    }
  });
}

async function seedOutbound(pool: Pool, refs: Awaited<ReturnType<typeof getMesReferences>>) {
  const item = (code: string) => refs.items.get(code)?.id ?? stableUuid(`item:${code}`);
  const wc = (code: string) => refs.workCenters.get(code)?.id ?? stableUuid(`work-center:${code}`);
  const requests = [
    ['WO-DEMO-260715-001', 'WC-VULCAN-MOLD', 'SFG-RUB-CM01-R1', '300.000', '80.000', '220.000', '530.000', '220.000', 'Staged', -7],
    ['WO-DEMO-260716-002', 'WC-VULCAN-MOLD', 'RM-CHEM-BOND-R1', '30.000', '12.250', '17.750', '88.750', '17.750', 'Staged', -6],
    ['WO-DEMO-260717-003', 'WC-CUTTING', 'SFG-ROLL-EPDM-R1', '75.000', '32.500', '42.500', '260.000', '42.500', 'Staged', -5],
    ['WO-DEMO-260718-004', 'WC-MIXING', 'RM-CARBON-BLACK-R1', '180.000', '65.000', '115.000', '1140.000', '115.000', 'Staged', -4],
    ['WO-DEMO-260719-005', 'WC-MIXING', 'RM-SULFUR-R1', '600.000', '0.000', '600.000', '170.000', '0.000', 'Shortage', -3],
    ['WO-DEMO-260720-006', 'WC-VULCAN-MOLD', 'SFG-MET-CM01-R1', '100.000', '95.000', '5.000', '1940.000', '5.000', 'Staged', -2],
    ['WO-DEMO-260721-007', 'WC-QC', 'FG-WS-CM01-R1', '40.000', '0.000', '40.000', '620.000', '40.000', 'Staged', -1],
  ] as const;

  await withTx(pool, async (client) => {
    for (const [woCode, wcCode, itemCode, required, already, shortfall, available, transferred, status, offset] of requests) {
      const requestId = stableUuid(`material-request:${woCode}:${itemCode}`);
      await client.query(
        `INSERT INTO material_request (request_id, request_code, wo_id, work_center_ref, work_center_code, item_revision_id, item_code, work_order_code, work_order_name, uom_code, required_qty, already_staged_qty, shortfall_qty, available_qty, transferred_qty, status, detail, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'KG', $10, $11, $12, $13, $14, $15, $16::jsonb, $17)
         ON CONFLICT (request_id) DO UPDATE
         SET required_qty = EXCLUDED.required_qty,
             already_staged_qty = EXCLUDED.already_staged_qty,
             shortfall_qty = EXCLUDED.shortfall_qty,
             available_qty = EXCLUDED.available_qty,
             transferred_qty = EXCLUDED.transferred_qty,
             status = EXCLUDED.status,
             detail = EXCLUDED.detail,
             created_at = EXCLUDED.created_at`,
        [
          requestId,
          `MR-${woCode.replace(/[^A-Za-z0-9]/g, '').slice(-12)}`,
          stableUuid(`wo:${woCode}`),
          wc(wcCode),
          wcCode,
          item(itemCode),
          itemCode,
          woCode,
          `Material request for ${woCode}`,
          required,
          already,
          shortfall,
          available,
          transferred,
          status,
          JSON.stringify({ wo_code: woCode, work_center_code: wcCode, item_code: itemCode, seed_window: '2026-04-23..2026-07-22' }),
          isoTs(offset, 14),
        ],
      );
      await client.query(
        `INSERT INTO outbox_events (id, event_type, topic, payload, status, created_at)
         VALUES ($1, $2, 'wms.outbound.material', $3::jsonb, 'PENDING', $4)
         ON CONFLICT (id) DO UPDATE
         SET event_type = EXCLUDED.event_type, payload = EXCLUDED.payload, created_at = EXCLUDED.created_at`,
        [
          stableUuid(`outbox:${requestId}`),
          status === 'Shortage' ? 'WMS.Outbound.MaterialShortageDeclared.v1' : 'WMS.Outbound.MaterialStaged.v1',
          JSON.stringify({ request_id: requestId, status, wo_code: woCode, item_code: itemCode }),
          isoTs(offset, 14),
        ],
      );
    }
  });
}

async function summarize(pools: { wmsMaster: Pool; inventory: Pool; inbound: Pool; outbound: Pool }) {
  const [warehouses, locations, bins, items, lots, balances, movements, discrepancies, receipts, requests] = await Promise.all([
    pools.wmsMaster.query('SELECT count(*)::int AS count FROM wms_warehouse'),
    pools.wmsMaster.query('SELECT count(*)::int AS count FROM wms_storage_location'),
    pools.wmsMaster.query('SELECT count(*)::int AS count FROM wms_storage_bin'),
    pools.wmsMaster.query('SELECT count(*)::int AS count FROM rm_item_revision'),
    pools.inventory.query('SELECT count(*)::int AS count FROM inv_lot'),
    pools.inventory.query('SELECT count(*)::int AS count FROM inv_balance WHERE on_hand_qty > 0'),
    pools.inventory.query('SELECT count(*)::int AS count FROM inv_stock_movement'),
    pools.inventory.query('SELECT count(*)::int AS count FROM inv_discrepancy_log'),
    pools.inbound.query('SELECT count(*)::int AS count FROM inbound_receipt'),
    pools.outbound.query('SELECT count(*)::int AS count FROM material_request'),
  ]);
  console.info('[Seed] WMS demo seed applied');
  console.table({
    warehouses: warehouses.rows[0].count,
    locations: locations.rows[0].count,
    bins: bins.rows[0].count,
    item_revisions: items.rows[0].count,
    lots: lots.rows[0].count,
    positive_balances: balances.rows[0].count,
    stock_movements: movements.rows[0].count,
    discrepancies: discrepancies.rows[0].count,
    inbound_receipts: receipts.rows[0].count,
    material_requests: requests.rows[0].count,
  });
}

async function main() {
  const mes = new Pool({ connectionString: MES_MASTER_DATA_URL });
  const wmsMaster = new Pool({ connectionString: WMS_MASTER_DATA_URL });
  const inventory = new Pool({ connectionString: WMS_INVENTORY_URL });
  const inbound = new Pool({ connectionString: WMS_INBOUND_URL });
  const outbound = new Pool({ connectionString: WMS_OUTBOUND_URL });

  try {
    const refs = await getMesReferences(mes);
    const { locations } = await seedWmsMasterData(wmsMaster, refs);
    const locationPurposeByCode = new Map<string, 'Storage' | 'WorkCenterStaging'>();
    const stagingRefByCode = new Map<string, string | undefined>();
    for (const code of locations.keys()) {
      const isStaging = code.startsWith('STG-');
      locationPurposeByCode.set(code, isStaging ? 'WorkCenterStaging' : 'Storage');
      if (code === 'STG-WC-MIXING') stagingRefByCode.set(code, refs.workCenters.get('WC-MIXING')?.id);
      if (code === 'STG-WC-CUTTING') stagingRefByCode.set(code, refs.workCenters.get('WC-CUTTING')?.id);
      if (code === 'STG-WC-MOLD') stagingRefByCode.set(code, refs.workCenters.get('WC-VULCAN-MOLD')?.id);
      if (code === 'STG-WC-QC') stagingRefByCode.set(code, refs.workCenters.get('WC-QC')?.id);
    }
    await seedReadModels(inventory, refs, locations, locationPurposeByCode, stagingRefByCode);
    await seedOutboundReadModel(outbound, locations, locationPurposeByCode, stagingRefByCode);
    await seedInventory(inventory, refs, locations);
    await seedInbound(inbound, refs, locations);
    await seedOutbound(outbound, refs);
    await summarize({ wmsMaster, inventory, inbound, outbound });
  } finally {
    await Promise.all([mes.end(), wmsMaster.end(), inventory.end(), inbound.end(), outbound.end()]);
  }
}

main().catch((err) => {
  console.error('[Seed] WMS demo seed failed:', err);
  process.exit(1);
});
