import { Pool } from 'pg';
import { OUTBOX_TABLE_SQL } from '@mom-platform/shared-kernel';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';

const AUDIT_SQL = `
CREATE OR REPLACE FUNCTION fn_wms_set_audit_timestamps()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_user_id UUID;
BEGIN
  BEGIN v_user_id := NULLIF(current_setting('app.current_user_id', true), '')::UUID;
  EXCEPTION WHEN OTHERS THEN v_user_id := '${SYSTEM_USER_ID}'::UUID; END;
  IF v_user_id IS NULL THEN v_user_id := '${SYSTEM_USER_ID}'::UUID; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := NOW();
    NEW.updated_at := NOW();
    NEW.created_by := COALESCE(NEW.created_by, v_user_id);
    NEW.updated_by := v_user_id;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
    NEW.updated_at := NOW();
    NEW.updated_by := v_user_id;
    NEW.row_version := OLD.row_version + 1;
  END IF;
  RETURN NEW;
END; $$;
`;

const COMMON_AUDIT_COLUMNS_SQL = `
  created_by UUID NOT NULL DEFAULT '${SYSTEM_USER_ID}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  row_version INTEGER NOT NULL DEFAULT 1
`;

const LOCALIZED_CHECK = (column: string, required = true): string => {
  if (required) {
    return `jsonb_typeof(${column}) = 'object' AND ${column} ? 'vi' AND btrim(${column}->>'vi') <> ''`;
  }
  return `${column} IS NULL OR (jsonb_typeof(${column}) = 'object' AND ${column} ? 'vi' AND btrim(${column}->>'vi') <> '')`;
};

const TABLES_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

${OUTBOX_TABLE_SQL}

CREATE TABLE IF NOT EXISTS wms_warehouse (
  warehouse_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_code VARCHAR(30) NOT NULL UNIQUE,
  warehouse_name JSONB NOT NULL,
  site_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
  ${COMMON_AUDIT_COLUMNS_SQL},
  CONSTRAINT ck_wms_warehouse_name_localized CHECK (${LOCALIZED_CHECK('warehouse_name')})
);

CREATE TABLE IF NOT EXISTS wms_zone (
  zone_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES wms_warehouse(warehouse_id),
  zone_code VARCHAR(30) NOT NULL,
  zone_name JSONB NOT NULL,
  zone_type VARCHAR(30) NOT NULL CHECK (zone_type IN ('Receiving','Storage','Picking','Staging','Shipping')),
  status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
  ${COMMON_AUDIT_COLUMNS_SQL},
  UNIQUE (warehouse_id, zone_code),
  CONSTRAINT ck_wms_zone_name_localized CHECK (${LOCALIZED_CHECK('zone_name')})
);

CREATE TABLE IF NOT EXISTS wms_storage_location (
  location_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES wms_zone(zone_id),
  location_code VARCHAR(30) NOT NULL,
  location_name JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
  ${COMMON_AUDIT_COLUMNS_SQL},
  UNIQUE (zone_id, location_code),
  CONSTRAINT ck_wms_location_name_localized CHECK (${LOCALIZED_CHECK('location_name')})
);

CREATE TABLE IF NOT EXISTS wms_storage_bin (
  bin_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES wms_storage_location(location_id),
  bin_code VARCHAR(30) NOT NULL,
  bin_name JSONB,
  capacity_qty NUMERIC(18,3),
  capacity_uom_id UUID,
  status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
  ${COMMON_AUDIT_COLUMNS_SQL},
  UNIQUE (location_id, bin_code),
  CONSTRAINT ck_wms_bin_name_localized CHECK (${LOCALIZED_CHECK('bin_name', false)}),
  CONSTRAINT ck_wms_bin_capacity_non_negative CHECK (capacity_qty IS NULL OR capacity_qty >= 0)
);

CREATE TABLE IF NOT EXISTS rm_item_revision (
  item_revision_id UUID PRIMARY KEY,
  item_code VARCHAR(50) NOT NULL,
  item_name JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_rm_item_revision_name_localized CHECK (${LOCALIZED_CHECK('item_name')})
);

CREATE TABLE IF NOT EXISTS wms_item_uom_mapping (
  mapping_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_revision_id UUID NOT NULL,
  storage_uom_code VARCHAR(20) NOT NULL,
  conversion_factor NUMERIC(18,6) NOT NULL CHECK (conversion_factor > 0),
  default_bin_capacity_qty NUMERIC(18,3),
  ${COMMON_AUDIT_COLUMNS_SQL},
  UNIQUE (item_revision_id, storage_uom_code),
  CONSTRAINT ck_wms_mapping_default_capacity_non_negative CHECK (default_bin_capacity_qty IS NULL OR default_bin_capacity_qty >= 0)
);

CREATE INDEX IF NOT EXISTS ix_wms_zone_warehouse ON wms_zone(warehouse_id);
CREATE INDEX IF NOT EXISTS ix_wms_location_zone ON wms_storage_location(zone_id);
CREATE INDEX IF NOT EXISTS ix_wms_bin_location ON wms_storage_bin(location_id);
CREATE INDEX IF NOT EXISTS ix_wms_mapping_item_revision ON wms_item_uom_mapping(item_revision_id);
`;

const TRIGGERS_SQL = `
${AUDIT_SQL}
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'wms_warehouse',
    'wms_zone',
    'wms_storage_location',
    'wms_storage_bin',
    'wms_item_uom_mapping'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON %I', t, t);
    EXECUTE format('CREATE TRIGGER trg_audit_%I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION fn_wms_set_audit_timestamps()', t, t);
    EXECUTE format('REVOKE DELETE ON TABLE %I FROM PUBLIC', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wms_master_data_user') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE %I TO wms_master_data_user', t);
      EXECUTE format('REVOKE DELETE ON TABLE %I FROM wms_master_data_user', t);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wms_master_data_user') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE rm_item_revision TO wms_master_data_user;
    GRANT SELECT, INSERT, UPDATE ON TABLE outbox_events TO wms_master_data_user;
    GRANT USAGE ON SCHEMA public TO wms_master_data_user;
  END IF;
END $$;
`;

const STAGING_LOCATION_SQL = `
ALTER TABLE wms_storage_location
  ADD COLUMN IF NOT EXISTS location_purpose VARCHAR(30) NOT NULL DEFAULT 'Storage',
  ADD COLUMN IF NOT EXISTS staging_for_work_center_ref UUID NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_location_purpose') THEN
    ALTER TABLE wms_storage_location
      ADD CONSTRAINT chk_location_purpose
      CHECK (location_purpose IN ('Storage', 'WorkCenterStaging'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_staging_ref_matches_purpose') THEN
    ALTER TABLE wms_storage_location
      ADD CONSTRAINT chk_staging_ref_matches_purpose
      CHECK (
        (location_purpose = 'WorkCenterStaging' AND staging_for_work_center_ref IS NOT NULL)
        OR
        (location_purpose = 'Storage' AND staging_for_work_center_ref IS NULL)
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_location_staging_work_center
  ON wms_storage_location (staging_for_work_center_ref)
  WHERE staging_for_work_center_ref IS NOT NULL;
`;

const WAREHOUSE_DESCRIPTION_SQL = `
ALTER TABLE wms_warehouse
  ADD COLUMN IF NOT EXISTS warehouse_description JSONB NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_wms_warehouse_description_localized') THEN
    ALTER TABLE wms_warehouse
      ADD CONSTRAINT ck_wms_warehouse_description_localized
      CHECK (${LOCALIZED_CHECK('warehouse_description', false)});
  END IF;
END $$;
`;

const MIGRATIONS: Array<{ name: string; sql: string }> = [
  { name: '0001_wms_master_data_schema', sql: TABLES_SQL },
  { name: '0002_wms_audit_triggers', sql: TRIGGERS_SQL },
  { name: '0003_wms_staging_location_purpose', sql: STAGING_LOCATION_SQL },
  { name: '0004_wms_warehouse_description_i18n', sql: WAREHOUSE_DESCRIPTION_SQL },
];

export async function runMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    for (const migration of MIGRATIONS) {
      const { rows } = await client.query('SELECT name FROM schema_migrations WHERE name = $1', [migration.name]);
      if (rows.length > 0) {
        console.info(`[Migration] Skipping already-applied: ${migration.name}`);
        continue;
      }
      console.info(`[Migration] Applying: ${migration.name}`);
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [migration.name]);
        await client.query('COMMIT');
        console.info(`[Migration] Applied: ${migration.name}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    client.release();
  }
}
