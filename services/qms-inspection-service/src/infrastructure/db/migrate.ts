import { Pool } from 'pg';
import { OUTBOX_TABLE_SQL } from '@mom-platform/shared-kernel';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
const localized = (column: string, optional = false) => optional
  ? `${column} IS NULL OR (jsonb_typeof(${column}) = 'object' AND ${column} ? 'vi' AND btrim(${column}->>'vi') <> '')`
  : `jsonb_typeof(${column}) = 'object' AND ${column} ? 'vi' AND btrim(${column}->>'vi') <> ''`;

const SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
${OUTBOX_TABLE_SQL}
CREATE TABLE IF NOT EXISTS qms_defect_code (
  defect_code_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), defect_code VARCHAR(40) NOT NULL UNIQUE,
  defect_name JSONB NOT NULL, defect_category VARCHAR(20) NOT NULL CHECK (defect_category IN ('Critical','Major','Minor')),
  status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_qms_defect_name_localized CHECK (${localized('defect_name')})
);
CREATE TABLE IF NOT EXISTS qms_inspection_plan (
  plan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), plan_code VARCHAR(40) NOT NULL UNIQUE, plan_name JSONB NOT NULL,
  plan_description JSONB, item_revision_id UUID NOT NULL, operation_id UUID NOT NULL, site_id UUID NOT NULL,
  plan_version INTEGER NOT NULL DEFAULT 1 CHECK (plan_version > 0), sampling_method VARCHAR(20) NOT NULL DEFAULT 'Full' CHECK (sampling_method IN ('Full','AQL','Fixed')),
  sample_size NUMERIC(18,3), status VARCHAR(20) NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','InReview','Released','Obsolete')),
  effective_from TIMESTAMPTZ, effective_to TIMESTAMPTZ, created_by UUID NOT NULL DEFAULT '${SYSTEM_USER_ID}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), row_version INTEGER NOT NULL DEFAULT 1,
  UNIQUE (item_revision_id, operation_id, site_id, plan_version), CONSTRAINT ck_qms_plan_name_localized CHECK (${localized('plan_name')}),
  CONSTRAINT ck_qms_plan_sample_size CHECK (sample_size IS NULL OR sample_size > 0), CONSTRAINT ck_qms_plan_effective_date CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from)
);
CREATE TABLE IF NOT EXISTS qms_inspection_characteristic (
  characteristic_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), plan_id UUID NOT NULL REFERENCES qms_inspection_plan(plan_id), sequence_no INTEGER NOT NULL CHECK (sequence_no > 0),
  characteristic_code VARCHAR(40) NOT NULL, characteristic_name JSONB NOT NULL, measurement_type VARCHAR(20) NOT NULL CHECK (measurement_type IN ('Attribute','Variable')),
  spec_min NUMERIC(18,6), spec_max NUMERIC(18,6), target_value NUMERIC(18,6), uom_id UUID, default_defect_code_id UUID REFERENCES qms_defect_code(defect_code_id),
  mandatory_flag BOOLEAN NOT NULL DEFAULT TRUE, UNIQUE (plan_id, sequence_no), UNIQUE (plan_id, characteristic_code), CONSTRAINT ck_qms_characteristic_name_localized CHECK (${localized('characteristic_name')}),
  CONSTRAINT ck_qms_characteristic_bounds CHECK (spec_min IS NULL OR spec_max IS NULL OR spec_min <= spec_max), CONSTRAINT ck_qms_variable_uom CHECK (measurement_type <> 'Variable' OR uom_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS qms_inspection_result (
  result_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), plan_id UUID REFERENCES qms_inspection_plan(plan_id), work_order_id UUID NOT NULL, work_center_id UUID,
  item_revision_id UUID NOT NULL, lot_or_label_ref VARCHAR(120), inspected_qty NUMERIC(18,6) NOT NULL CHECK (inspected_qty > 0), passed_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  failed_qty NUMERIC(18,6) NOT NULL DEFAULT 0, overall_result VARCHAR(20) CHECK (overall_result IS NULL OR overall_result IN ('Pass','Fail')), inspector_user_id UUID,
  inspected_at TIMESTAMPTZ, source_event_id UUID NOT NULL UNIQUE, missing_plan_flag BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS qms_inspection_result_detail (
  detail_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), result_id UUID NOT NULL REFERENCES qms_inspection_result(result_id), characteristic_id UUID NOT NULL REFERENCES qms_inspection_characteristic(characteristic_id),
  measured_value NUMERIC(18,6), result_flag VARCHAR(10) NOT NULL CHECK (result_flag IN ('Pass','Fail')), defect_code_id UUID REFERENCES qms_defect_code(defect_code_id), comment VARCHAR(1000),
  UNIQUE (result_id, characteristic_id), CONSTRAINT ck_qms_detail_defect CHECK (result_flag <> 'Fail' OR defect_code_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS qms_rm_item_revision (item_revision_id UUID PRIMARY KEY, item_code VARCHAR(50) NOT NULL, item_name JSONB NOT NULL, lifecycle_status VARCHAR(20) NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CONSTRAINT ck_qms_rm_item_name CHECK (${localized('item_name')}));
CREATE TABLE IF NOT EXISTS qms_rm_operation (operation_id UUID PRIMARY KEY, operation_code VARCHAR(50) NOT NULL, operation_name JSONB NOT NULL, operation_type VARCHAR(50) NOT NULL, site_id UUID, lifecycle_status VARCHAR(20) NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CONSTRAINT ck_qms_rm_operation_name CHECK (${localized('operation_name')}));
CREATE TABLE IF NOT EXISTS qms_rm_site (site_id UUID PRIMARY KEY, site_code VARCHAR(30) NOT NULL, site_name JSONB NOT NULL, lifecycle_status VARCHAR(20) NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CONSTRAINT ck_qms_rm_site_name CHECK (${localized('site_name')}));
CREATE TABLE IF NOT EXISTS qms_rm_uom (uom_id UUID PRIMARY KEY, uom_code VARCHAR(20) NOT NULL, uom_name JSONB NOT NULL, lifecycle_status VARCHAR(20) NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CONSTRAINT ck_qms_rm_uom_name CHECK (${localized('uom_name')}));
CREATE INDEX IF NOT EXISTS ix_qms_plan_scope ON qms_inspection_plan(item_revision_id, operation_id, site_id, status);
CREATE INDEX IF NOT EXISTS ix_qms_result_status ON qms_inspection_result(overall_result, created_at);
CREATE INDEX IF NOT EXISTS ix_qms_result_wo ON qms_inspection_result(work_order_id);
REVOKE DELETE ON qms_defect_code, qms_inspection_plan, qms_inspection_characteristic, qms_inspection_result, qms_inspection_result_detail FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qms_inspection_user') THEN
    GRANT USAGE ON SCHEMA public TO qms_inspection_user;
    GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO qms_inspection_user;
    REVOKE DELETE ON qms_defect_code, qms_inspection_plan, qms_inspection_characteristic, qms_inspection_result, qms_inspection_result_detail FROM qms_inspection_user;
  END IF;
END $$;
`;

export async function runMigrations(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const { rows } = await pool.query<{ name: string }>('SELECT name FROM schema_migrations WHERE name = $1', ['0001_qms_inspection_schema']);
  if (rows.length > 0) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(SQL);
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', ['0001_qms_inspection_schema']);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
