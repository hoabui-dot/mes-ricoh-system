import { Pool } from 'pg';
import type { LocalizedText } from '@mom-platform/shared-kernel';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
const SITE_KZ3_ID = '11111111-1111-1111-1111-000000000003';

const localized = (vi: string, en: string, ja: string, ko: string): LocalizedText => ({ vi, en, ja, ko });

async function upsert(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  sql: string,
  params: unknown[],
): Promise<string> {
  const { rows } = await client.query(sql, params);
  const value = Object.values(rows[0] ?? {})[0];
  if (typeof value !== 'string') throw new Error('WMS seed upsert did not return an id');
  return value;
}

export async function seedWmsMasterData(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [SYSTEM_USER_ID]);

    const warehouseId = await upsert(
      client,
      `INSERT INTO wms_warehouse (warehouse_code, warehouse_name, warehouse_description, site_id, created_by)
       VALUES ($1, $2::jsonb, $3::jsonb, $4, $5)
       ON CONFLICT (warehouse_code) DO UPDATE SET warehouse_name = EXCLUDED.warehouse_name, warehouse_description = EXCLUDED.warehouse_description
       RETURNING warehouse_id`,
      [
        'WH-KZ3-RM',
        JSON.stringify(localized('Kho nguyên vật liệu Kizuna 3', 'Kizuna 3 raw material warehouse', 'キズナ3 原材料倉庫', '키즈나3 원자재 창고')),
        JSON.stringify(localized('Kho tiếp nhận và lưu trữ cao su, hóa chất và lõi kim loại trước khi cấp phát cho sản xuất.', 'Receiving and storage warehouse for rubber, chemicals, and metal cores before production staging.', '生産供給前のゴム、化学品、金属芯を受入・保管する倉庫。', '생산 공급 전 고무, 화학품, 금속 코어를 입고 및 보관하는 창고입니다.')),
        SITE_KZ3_ID,
        SYSTEM_USER_ID,
      ],
    );

    const zoneId = await upsert(
      client,
      `INSERT INTO wms_zone (warehouse_id, zone_code, zone_name, zone_type, created_by)
       VALUES ($1, $2, $3::jsonb, 'Storage', $4)
       ON CONFLICT (warehouse_id, zone_code) DO UPDATE SET zone_name = EXCLUDED.zone_name
       RETURNING zone_id`,
      [warehouseId, 'ZONE-RUBBER', JSON.stringify(localized('Khu lưu kho cao su', 'Rubber storage zone', 'ゴム保管ゾーン', '고무 보관 구역')), SYSTEM_USER_ID],
    );

    const locationId = await upsert(
      client,
      `INSERT INTO wms_storage_location (zone_id, location_code, location_name, created_by)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (zone_id, location_code) DO UPDATE SET location_name = EXCLUDED.location_name
       RETURNING location_id`,
      [zoneId, 'A01-R01', JSON.stringify(localized('Dãy A01 kệ R01', 'A01 rack R01', 'A01 ラック R01', 'A01 랙 R01')), SYSTEM_USER_ID],
    );

    await client.query(
      `INSERT INTO wms_storage_bin (location_id, bin_code, bin_name, capacity_qty, status, created_by)
       VALUES ($1, $2, $3::jsonb, $4, 'Active', $5)
       ON CONFLICT (location_id, bin_code) DO UPDATE SET bin_name = EXCLUDED.bin_name, capacity_qty = EXCLUDED.capacity_qty`,
      [locationId, 'BIN-A01-R01-L01', JSON.stringify(localized('Ô A01-R01 tầng 1', 'A01-R01 level 1 bin', 'A01-R01 レベル1 ビン', 'A01-R01 1단 빈')), '100.000', SYSTEM_USER_ID],
    );

    await client.query('COMMIT');
    console.info('[Seed] WMS master data seed applied');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
