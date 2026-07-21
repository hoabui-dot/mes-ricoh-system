import { Pool } from 'pg';
import { OUTBOX_TABLE_SQL } from '@mom-platform/shared-kernel';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';

const AUDIT_AND_LIFECYCLE_SQL = `
CREATE OR REPLACE FUNCTION fn_set_audit_timestamps()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_user_id UUID;
BEGIN
  BEGIN v_user_id := NULLIF(current_setting('app.current_user_id', true), '')::UUID;
  EXCEPTION WHEN OTHERS THEN v_user_id := '${SYSTEM_USER_ID}'::UUID; END;
  IF v_user_id IS NULL THEN v_user_id := '${SYSTEM_USER_ID}'::UUID; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := NOW(); NEW.updated_at := NOW();
    NEW.created_by := v_user_id; NEW.updated_by := v_user_id;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.created_at := OLD.created_at; NEW.created_by := OLD.created_by;
    NEW.updated_at := NOW(); NEW.updated_by := v_user_id;
    NEW.row_version := OLD.row_version + 1;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION fn_validate_master_lifecycle()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.lifecycle_status IS DISTINCT FROM NEW.lifecycle_status THEN
    IF OLD.lifecycle_status = 'Draft' AND NEW.lifecycle_status IN ('InReview','Released','Inactive') THEN
      RETURN NEW;
    ELSIF OLD.lifecycle_status = 'InReview' AND NEW.lifecycle_status IN ('Draft','Released','Inactive') THEN
      RETURN NEW;
    ELSIF OLD.lifecycle_status = 'Released' AND NEW.lifecycle_status IN ('Inactive','Obsolete') THEN
      RETURN NEW;
    ELSIF OLD.lifecycle_status = 'Inactive' AND NEW.lifecycle_status IN ('Released','Obsolete') THEN
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'Invalid lifecycle transition on % from % to %', TG_TABLE_NAME, OLD.lifecycle_status, NEW.lifecycle_status;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION fn_protect_released_master()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.lifecycle_status = 'Released' THEN
    IF to_jsonb(OLD) - 'lifecycle_status' - 'effective_to' - 'approved_by' - 'approved_at' - 'row_version' - 'updated_at' - 'updated_by'
       IS DISTINCT FROM
       to_jsonb(NEW) - 'lifecycle_status' - 'effective_to' - 'approved_by' - 'approved_at' - 'row_version' - 'updated_at' - 'updated_by' THEN
      RAISE EXCEPTION 'Structural columns are immutable after Released on %', TG_TABLE_NAME;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION fn_check_production_area_cycle()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_area_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.parent_area_id = NEW.master_id THEN
    RAISE EXCEPTION 'Production area cannot be its own parent';
  END IF;
  IF EXISTS (
    WITH RECURSIVE ancestors(master_id, parent_area_id) AS (
      SELECT master_id, parent_area_id FROM md_production_area WHERE master_id = NEW.parent_area_id
      UNION ALL
      SELECT p.master_id, p.parent_area_id FROM md_production_area p JOIN ancestors a ON p.master_id = a.parent_area_id
    )
    SELECT 1 FROM ancestors WHERE master_id = NEW.master_id
  ) THEN
    RAISE EXCEPTION 'Cycle detected in md_production_area';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION fn_check_mbom_line_cycle()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_line_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.parent_line_id = NEW.master_id THEN
    RAISE EXCEPTION 'MBOM line cannot be its own parent';
  END IF;
  IF EXISTS (
    WITH RECURSIVE ancestors(master_id, parent_line_id) AS (
      SELECT master_id, parent_line_id FROM md_mbom_line WHERE master_id = NEW.parent_line_id
      UNION ALL
      SELECT p.master_id, p.parent_line_id FROM md_mbom_line p JOIN ancestors a ON p.master_id = a.parent_line_id
    )
    SELECT 1 FROM ancestors WHERE master_id = NEW.master_id
  ) THEN
    RAISE EXCEPTION 'Cycle detected in md_mbom_line';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION fn_check_routing_predecessor_cycle()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.predecessor_seq IS NULL THEN RETURN NEW; END IF;
  IF NEW.predecessor_seq = NEW.seq THEN
    RAISE EXCEPTION 'Routing operation cannot precede itself';
  END IF;
  IF EXISTS (
    WITH RECURSIVE chain(seq, predecessor_seq) AS (
      SELECT seq, predecessor_seq FROM md_routing_operation
      WHERE routing_header_id = NEW.routing_header_id AND seq = NEW.predecessor_seq
      UNION ALL
      SELECT r.seq, r.predecessor_seq FROM md_routing_operation r JOIN chain c ON r.seq = c.predecessor_seq
      WHERE r.routing_header_id = NEW.routing_header_id
    )
    SELECT 1 FROM chain WHERE predecessor_seq = NEW.seq
  ) THEN
    RAISE EXCEPTION 'Cycle detected in md_routing_operation predecessor graph';
  END IF;
  RETURN NEW;
END; $$;
`;

const COMMON_COLUMNS_SQL = `
  master_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL,
  name VARCHAR(200) NOT NULL,
  version_no INTEGER NOT NULL DEFAULT 1,
  lifecycle_status master_lifecycle_status NOT NULL DEFAULT 'Draft',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  created_by UUID NOT NULL DEFAULT '${SYSTEM_USER_ID}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  row_version INTEGER NOT NULL DEFAULT 1,
  attributes JSONB NOT NULL DEFAULT '{}'::JSONB
`;

const tableSql = (table: string, specificColumns: string): string => `
CREATE TABLE IF NOT EXISTS ${table} (
${COMMON_COLUMNS_SQL}${specificColumns ? `,\n${specificColumns}` : ''}
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_${table}_code_version ON ${table}(code, version_no);
`;

const TABLES_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN
  CREATE TYPE master_lifecycle_status AS ENUM ('Draft','InReview','Released','Inactive','Obsolete');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

${OUTBOX_TABLE_SQL}

CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

${tableSql('md_site', `
  timezone VARCHAR(80) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  address TEXT
`)}
${tableSql('md_production_area', `
  site_id UUID NOT NULL REFERENCES md_site(master_id),
  parent_area_id UUID REFERENCES md_production_area(master_id),
  area_type VARCHAR(50) NOT NULL DEFAULT 'Production'
`)}
${tableSql('md_uom', `
  uom_class VARCHAR(50) NOT NULL,
  decimal_precision INTEGER NOT NULL DEFAULT 6
`)}
${tableSql('md_uom_conversion', `
  from_uom_id UUID NOT NULL REFERENCES md_uom(master_id),
  to_uom_id UUID NOT NULL REFERENCES md_uom(master_id),
  factor NUMERIC(18,8) NOT NULL CHECK (factor > 0)
`)}
${tableSql('md_shift', `
  site_id UUID NOT NULL REFERENCES md_site(master_id),
  start_time VARCHAR(8) NOT NULL,
  end_time VARCHAR(8) NOT NULL
`)}
${tableSql('md_reason_code', `
  reason_type VARCHAR(50) NOT NULL,
  requires_comment BOOLEAN NOT NULL DEFAULT FALSE
`)}
${tableSql('md_item', `
  item_group VARCHAR(80) NOT NULL,
  item_type VARCHAR(40) NOT NULL CHECK (item_type IN ('FG','SFG','RM')),
  base_uom_id UUID NOT NULL REFERENCES md_uom(master_id)
`)}
${tableSql('md_item_revision', `
  item_id UUID NOT NULL REFERENCES md_item(master_id),
  revision_code VARCHAR(30) NOT NULL,
  site_id UUID NOT NULL REFERENCES md_site(master_id),
  is_default BOOLEAN NOT NULL DEFAULT FALSE
`)}
${tableSql('md_mbom_header', `
  item_revision_id UUID NOT NULL REFERENCES md_item_revision(master_id),
  site_id UUID NOT NULL REFERENCES md_site(master_id),
  base_quantity NUMERIC(18,6) NOT NULL CHECK (base_quantity > 0),
  base_uom_id UUID NOT NULL REFERENCES md_uom(master_id)
`)}
${tableSql('md_operation', `
  operation_type VARCHAR(50) NOT NULL,
  confirmation_mode VARCHAR(50) NOT NULL,
  requires_material_scan BOOLEAN NOT NULL DEFAULT FALSE,
  requires_output_label BOOLEAN NOT NULL DEFAULT FALSE,
  is_schedulable BOOLEAN NOT NULL DEFAULT TRUE
`)}
${tableSql('md_mbom_line', `
  mbom_header_id UUID NOT NULL REFERENCES md_mbom_header(master_id),
  parent_line_id UUID REFERENCES md_mbom_line(master_id),
  seq INTEGER NOT NULL,
  component_revision_id UUID NOT NULL REFERENCES md_item_revision(master_id),
  quantity_per NUMERIC(18,6) NOT NULL CHECK (quantity_per > 0),
  uom_id UUID NOT NULL REFERENCES md_uom(master_id),
  scrap_rate NUMERIC(8,4) NOT NULL DEFAULT 0 CHECK (scrap_rate >= 0),
  issue_operation_id UUID REFERENCES md_operation(master_id),
  backflush_flag BOOLEAN NOT NULL DEFAULT FALSE,
  phantom_flag BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (mbom_header_id, seq)
`)}
${tableSql('md_component_substitute', `
  mbom_line_id UUID NOT NULL REFERENCES md_mbom_line(master_id),
  substitute_revision_id UUID NOT NULL REFERENCES md_item_revision(master_id),
  priority INTEGER NOT NULL DEFAULT 1
`)}
${tableSql('md_routing_header', `
  item_revision_id UUID NOT NULL REFERENCES md_item_revision(master_id),
  site_id UUID NOT NULL REFERENCES md_site(master_id)
`)}
${tableSql('md_routing_operation', `
  routing_header_id UUID NOT NULL REFERENCES md_routing_header(master_id),
  operation_id UUID NOT NULL REFERENCES md_operation(master_id),
  work_center_id UUID NOT NULL,
  seq INTEGER NOT NULL,
  predecessor_seq INTEGER,
  UNIQUE (routing_header_id, seq)
`)}
${tableSql('md_production_version', `
  item_revision_id UUID NOT NULL REFERENCES md_item_revision(master_id),
  mbom_header_id UUID NOT NULL REFERENCES md_mbom_header(master_id),
  routing_header_id UUID NOT NULL REFERENCES md_routing_header(master_id),
  site_id UUID NOT NULL REFERENCES md_site(master_id),
  is_default BOOLEAN NOT NULL DEFAULT FALSE
`)}
${tableSql('md_work_center', `
  site_id UUID NOT NULL REFERENCES md_site(master_id),
  area_id UUID NOT NULL REFERENCES md_production_area(master_id),
  work_center_type VARCHAR(50) NOT NULL DEFAULT 'Production',
  active_flag BOOLEAN NOT NULL DEFAULT TRUE
`)}
ALTER TABLE md_routing_operation
  DROP CONSTRAINT IF EXISTS fk_md_routing_operation_work_center,
  ADD CONSTRAINT fk_md_routing_operation_work_center FOREIGN KEY (work_center_id) REFERENCES md_work_center(master_id);

${tableSql('md_production_standard', `
  item_revision_id UUID NOT NULL REFERENCES md_item_revision(master_id),
  operation_id UUID NOT NULL REFERENCES md_operation(master_id),
  work_center_id UUID NOT NULL REFERENCES md_work_center(master_id),
  equipment_id UUID,
  labor_count INTEGER NOT NULL DEFAULT 1,
  skill_id UUID,
  minimum_level VARCHAR(10),
  setup_time_min NUMERIC(12,3),
  cycle_time_sec NUMERIC(12,3),
  efficiency_factor NUMERIC(8,4) NOT NULL DEFAULT 1
`)}
${tableSql('md_work_instruction', `
  operation_id UUID NOT NULL REFERENCES md_operation(master_id),
  instruction_text TEXT NOT NULL,
  document_url TEXT
`)}
${tableSql('md_workstation', `
  site_id UUID NOT NULL REFERENCES md_site(master_id),
  work_center_id UUID NOT NULL REFERENCES md_work_center(master_id),
  workstation_type VARCHAR(50) NOT NULL DEFAULT 'Kiosk',
  active_flag BOOLEAN NOT NULL DEFAULT TRUE
`)}
${tableSql('md_equipment', `
  site_id UUID NOT NULL REFERENCES md_site(master_id),
  work_center_id UUID NOT NULL REFERENCES md_work_center(master_id),
  equipment_type VARCHAR(80) NOT NULL,
  active_flag BOOLEAN NOT NULL DEFAULT TRUE
`)}
ALTER TABLE md_production_standard
  DROP CONSTRAINT IF EXISTS fk_md_production_standard_equipment,
  ADD CONSTRAINT fk_md_production_standard_equipment FOREIGN KEY (equipment_id) REFERENCES md_equipment(master_id);
${tableSql('md_resource_assignment', `
  work_center_id UUID NOT NULL REFERENCES md_work_center(master_id),
  workstation_id UUID REFERENCES md_workstation(master_id),
  equipment_id UUID REFERENCES md_equipment(master_id),
  assignment_type VARCHAR(50) NOT NULL
`)}
${tableSql('md_resource_capability', `
  operation_id UUID NOT NULL REFERENCES md_operation(master_id),
  work_center_id UUID NOT NULL REFERENCES md_work_center(master_id),
  equipment_id UUID REFERENCES md_equipment(master_id),
  capability_type VARCHAR(50) NOT NULL DEFAULT 'Eligible',
  active_flag BOOLEAN NOT NULL DEFAULT TRUE
`)}
${tableSql('md_resource_calendar', `
  work_center_id UUID NOT NULL REFERENCES md_work_center(master_id),
  equipment_id UUID REFERENCES md_equipment(master_id),
  available_from TIMESTAMPTZ NOT NULL,
  available_to TIMESTAMPTZ NOT NULL,
  capacity_percent NUMERIC(8,4) NOT NULL DEFAULT 1,
  CHECK (available_to > available_from)
`)}
${tableSql('md_skill', `
  skill_group VARCHAR(80) NOT NULL,
  minimum_level VARCHAR(10) NOT NULL
`)}
ALTER TABLE md_production_standard
  DROP CONSTRAINT IF EXISTS fk_md_production_standard_skill,
  ADD CONSTRAINT fk_md_production_standard_skill FOREIGN KEY (skill_id) REFERENCES md_skill(master_id);
${tableSql('md_operation_skill_requirement', `
  operation_id UUID NOT NULL REFERENCES md_operation(master_id),
  skill_id UUID NOT NULL REFERENCES md_skill(master_id),
  minimum_level VARCHAR(10) NOT NULL
`)}
${tableSql('md_role_permission', `
  role_code VARCHAR(80) NOT NULL,
  permission_code VARCHAR(120) NOT NULL,
  resource_type VARCHAR(80) NOT NULL,
  action VARCHAR(50) NOT NULL
`)}
${tableSql('md_user_resource_scope', `
  user_id UUID NOT NULL,
  role_code VARCHAR(80) NOT NULL,
  scope_type VARCHAR(80) NOT NULL,
  scope_resource_id UUID NOT NULL,
  condition_expression TEXT
`)}
`;

const ATTACH_TRIGGERS_SQL = `
${AUDIT_AND_LIFECYCLE_SQL}
DO $$
DECLARE t TEXT;
DECLARE protected_tables TEXT[] := ARRAY[
  'md_item_revision','md_mbom_header','md_mbom_line',
  'md_routing_header','md_routing_operation','md_production_standard'
];
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'md_site','md_production_area','md_uom','md_uom_conversion','md_shift','md_reason_code',
    'md_item','md_item_revision','md_mbom_header','md_mbom_line','md_component_substitute','md_production_version',
    'md_operation','md_routing_header','md_routing_operation','md_production_standard','md_work_instruction',
    'md_work_center','md_workstation','md_equipment','md_resource_assignment','md_resource_capability','md_resource_calendar',
    'md_skill','md_operation_skill_requirement','md_role_permission','md_user_resource_scope'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON %I', t, t);
    EXECUTE format('CREATE TRIGGER trg_audit_%I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION fn_set_audit_timestamps()', t, t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_lifecycle_%I ON %I', t, t);
    EXECUTE format('CREATE TRIGGER trg_lifecycle_%I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION fn_validate_master_lifecycle()', t, t);
    IF t = ANY(protected_tables) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_protect_released_%I ON %I', t, t);
      EXECUTE format('CREATE TRIGGER trg_protect_released_%I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION fn_protect_released_master()', t, t);
    END IF;
    EXECUTE format('REVOKE DELETE ON TABLE %I FROM PUBLIC', t);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_area_no_cycle ON md_production_area;
CREATE TRIGGER trg_area_no_cycle BEFORE INSERT OR UPDATE OF parent_area_id ON md_production_area
FOR EACH ROW EXECUTE FUNCTION fn_check_production_area_cycle();

DROP TRIGGER IF EXISTS trg_mbom_line_no_cycle ON md_mbom_line;
CREATE TRIGGER trg_mbom_line_no_cycle BEFORE INSERT OR UPDATE OF parent_line_id ON md_mbom_line
FOR EACH ROW EXECUTE FUNCTION fn_check_mbom_line_cycle();

DROP TRIGGER IF EXISTS trg_routing_no_cycle ON md_routing_operation;
CREATE TRIGGER trg_routing_no_cycle BEFORE INSERT OR UPDATE OF predecessor_seq ON md_routing_operation
FOR EACH ROW EXECUTE FUNCTION fn_check_routing_predecessor_cycle();
`;

const MIGRATIONS: Array<{ name: string; sql: string }> = [
  { name: '0001_master_data_schema', sql: TABLES_SQL },
  { name: '0002_governance_triggers', sql: ATTACH_TRIGGERS_SQL },
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
