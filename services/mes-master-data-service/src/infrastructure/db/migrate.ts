import { Pool } from 'pg';
import { OUTBOX_TABLE_SQL } from '@mom-platform/shared-kernel';
import { SEED_LOCALIZED_TEXT } from './seed-i18n.js';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function seedI18nValuesSql(): string {
  const rows: string[] = [];
  for (const [tableName, recordsByCode] of Object.entries(SEED_LOCALIZED_TEXT)) {
    for (const [code, columnsByName] of Object.entries(recordsByCode)) {
      for (const [columnName, value] of Object.entries(columnsByName)) {
        rows.push(
          `(${sqlString(tableName)}, ${sqlString(code)}, ${sqlString(columnName)}, jsonb_build_object('vi', ${sqlString(value.vi)}, 'en', ${sqlString(value.en)}, 'ja', ${sqlString(value.ja)}, 'ko', ${sqlString(value.ko)}))`,
        );
      }
    }
  }
  return rows.join(',\n        ');
}

const SEED_I18N_VALUES_SQL = seedI18nValuesSql();

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
    IF to_jsonb(OLD) - 'lifecycle_status' - 'effective_to' - 'is_default' - 'released_by' - 'approved_by' - 'approved_at' - 'row_version' - 'updated_at' - 'updated_by'
       IS DISTINCT FROM
       to_jsonb(NEW) - 'lifecycle_status' - 'effective_to' - 'is_default' - 'released_by' - 'approved_by' - 'approved_at' - 'row_version' - 'updated_at' - 'updated_by' THEN
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
  end_time VARCHAR(8) NOT NULL,
  crosses_midnight BOOLEAN NOT NULL DEFAULT FALSE
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
${tableSql('md_employee', `
  site_id UUID NOT NULL REFERENCES md_site(master_id),
  default_work_center_id UUID REFERENCES md_work_center(master_id),
  employee_status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (employee_status IN ('Active','Inactive','OnLeave')),
  hired_date DATE
`)}
CREATE TABLE IF NOT EXISTS md_employee_skill (
  employee_id UUID NOT NULL REFERENCES md_employee(master_id),
  skill_id UUID NOT NULL REFERENCES md_skill(master_id),
  level VARCHAR(10) NOT NULL,
  created_by UUID NOT NULL DEFAULT '${SYSTEM_USER_ID}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  row_version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (employee_id, skill_id)
);
CREATE TABLE IF NOT EXISTS md_employee_shift_schedule (
  schedule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES md_employee(master_id),
  shift_id UUID NOT NULL REFERENCES md_shift(master_id),
  work_center_id UUID REFERENCES md_work_center(master_id),
  schedule_date DATE NOT NULL,
  schedule_status VARCHAR(20) NOT NULL DEFAULT 'Scheduled' CHECK (schedule_status IN ('Scheduled','Absent','OnLeave','Cancelled')),
  created_by UUID NOT NULL DEFAULT '${SYSTEM_USER_ID}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  row_version INTEGER NOT NULL DEFAULT 1,
  UNIQUE (employee_id, schedule_date)
);
CREATE INDEX IF NOT EXISTS ix_md_employee_default_work_center ON md_employee(default_work_center_id);
CREATE INDEX IF NOT EXISTS ix_md_employee_schedule_work_center_date ON md_employee_shift_schedule(work_center_id, schedule_date);
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
    'md_skill','md_employee','md_operation_skill_requirement','md_role_permission','md_user_resource_scope'
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

DROP TRIGGER IF EXISTS trg_audit_md_employee_shift_schedule ON md_employee_shift_schedule;
CREATE TRIGGER trg_audit_md_employee_shift_schedule BEFORE INSERT OR UPDATE ON md_employee_shift_schedule
FOR EACH ROW EXECUTE FUNCTION fn_set_audit_timestamps();

DROP TRIGGER IF EXISTS trg_audit_md_employee_skill ON md_employee_skill;
CREATE TRIGGER trg_audit_md_employee_skill BEFORE INSERT OR UPDATE ON md_employee_skill
FOR EACH ROW EXECUTE FUNCTION fn_set_audit_timestamps();

REVOKE DELETE ON TABLE md_employee_skill FROM PUBLIC;
REVOKE DELETE ON TABLE md_employee_shift_schedule FROM PUBLIC;

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
  {
    name: '0003_labor_resource_management',
    sql: `
      ALTER TABLE md_shift ADD COLUMN IF NOT EXISTS crosses_midnight BOOLEAN NOT NULL DEFAULT FALSE;
      ${tableSql('md_employee', `
        site_id UUID NOT NULL REFERENCES md_site(master_id),
        default_work_center_id UUID REFERENCES md_work_center(master_id),
        employee_status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (employee_status IN ('Active','Inactive','OnLeave')),
        hired_date DATE
      `)}
      CREATE TABLE IF NOT EXISTS md_employee_skill (
        employee_id UUID NOT NULL REFERENCES md_employee(master_id),
        skill_id UUID NOT NULL REFERENCES md_skill(master_id),
        level VARCHAR(10) NOT NULL,
        created_by UUID NOT NULL DEFAULT '${SYSTEM_USER_ID}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by UUID,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        row_version INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (employee_id, skill_id)
      );
      CREATE TABLE IF NOT EXISTS md_employee_shift_schedule (
        schedule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID NOT NULL REFERENCES md_employee(master_id),
        shift_id UUID NOT NULL REFERENCES md_shift(master_id),
        work_center_id UUID REFERENCES md_work_center(master_id),
        schedule_date DATE NOT NULL,
        schedule_status VARCHAR(20) NOT NULL DEFAULT 'Scheduled' CHECK (schedule_status IN ('Scheduled','Absent','OnLeave','Cancelled')),
        created_by UUID NOT NULL DEFAULT '${SYSTEM_USER_ID}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by UUID,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        row_version INTEGER NOT NULL DEFAULT 1,
        UNIQUE (employee_id, schedule_date)
      );
      CREATE INDEX IF NOT EXISTS ix_md_employee_default_work_center ON md_employee(default_work_center_id);
      CREATE INDEX IF NOT EXISTS ix_md_employee_schedule_work_center_date ON md_employee_shift_schedule(work_center_id, schedule_date);
      ${ATTACH_TRIGGERS_SQL}
    `,
  },
  {
    name: '0004_i18n_localized_text',
    sql: `
      DO $$ BEGIN
        CREATE TYPE supported_locale AS ENUM ('vi','en','ja','ko');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      ALTER TABLE md_site ADD COLUMN IF NOT EXISTS default_locale supported_locale NOT NULL DEFAULT 'vi';
      ALTER TABLE md_employee ADD COLUMN IF NOT EXISTS preferred_locale supported_locale;

      DO $$
      DECLARE spec RECORD;
      DECLARE current_type TEXT;
      BEGIN
        FOR spec IN
          SELECT * FROM (VALUES
            ('md_item', 'name'),
            ('md_item_revision', 'name'),
            ('md_work_center', 'name'),
            ('md_equipment', 'name'),
            ('md_skill', 'name'),
            ('md_reason_code', 'name'),
            ('md_operation', 'name'),
            ('md_work_instruction', 'instruction_text')
          ) AS t(table_name, column_name)
        LOOP
          SELECT udt_name INTO current_type
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = spec.table_name AND column_name = spec.column_name;

          IF current_type IS DISTINCT FROM 'jsonb' THEN
            EXECUTE format(
              'ALTER TABLE %I ALTER COLUMN %I TYPE JSONB USING CASE WHEN %I IS NULL THEN jsonb_build_object(''vi'', '''') ELSE jsonb_build_object(''vi'', %I::TEXT) END',
              spec.table_name,
              spec.column_name,
              spec.column_name,
              spec.column_name
            );
          END IF;

          EXECUTE format(
            'ALTER TABLE %I ADD CONSTRAINT ck_%s_%s_localized_text CHECK (jsonb_typeof(%I) = ''object'' AND %I ? ''vi'' AND btrim(%I->>''vi'') <> '''') NOT VALID',
            spec.table_name,
            spec.table_name,
            spec.column_name,
            spec.column_name,
            spec.column_name,
            spec.column_name
          );
        END LOOP;
      END $$;
    `,
  },
  {
    name: '0005_i18n_data_quality_flags',
    sql: `
      CREATE TABLE IF NOT EXISTS i18n_data_quality_flag (
        flag_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        table_name VARCHAR(100) NOT NULL,
        column_name VARCHAR(100) NOT NULL,
        row_id UUID NOT NULL,
        flagged_locale VARCHAR(5) NOT NULL DEFAULT 'vi',
        current_value TEXT NOT NULL,
        detected_language_guess VARCHAR(10),
        confidence DECIMAL(4,3),
        status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED','DISMISSED')),
        flagged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at TIMESTAMPTZ,
        resolved_by UUID
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_i18n_dq_open_flag
        ON i18n_data_quality_flag(table_name, column_name, row_id, flagged_locale)
        WHERE status = 'OPEN';
      CREATE INDEX IF NOT EXISTS ix_i18n_dq_status_table
        ON i18n_data_quality_flag(status, table_name, flagged_at DESC);
    `,
  },
  {
    name: '0006_seed_i18n_enrichment',
    sql: `
      CREATE TEMP TABLE tmp_seed_i18n (
        table_name TEXT NOT NULL,
        code TEXT NOT NULL,
        column_name TEXT NOT NULL,
        value JSONB NOT NULL
      ) ON COMMIT DROP;

      INSERT INTO tmp_seed_i18n (table_name, code, column_name, value)
      VALUES
        ${SEED_I18N_VALUES_SQL};

      DO $$
      DECLARE rec RECORD;
      DECLARE current_type TEXT;
      DECLARE protect_trigger_name TEXT;
      BEGIN
        FOR rec IN SELECT * FROM tmp_seed_i18n LOOP
          SELECT udt_name INTO current_type
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = rec.table_name AND column_name = rec.column_name;

          IF current_type = 'jsonb' THEN
            protect_trigger_name := 'trg_protect_released_' || rec.table_name;
            IF EXISTS (
              SELECT 1
              FROM pg_trigger
              WHERE tgrelid = format('%I', rec.table_name)::regclass
                AND tgname = protect_trigger_name
            ) THEN
              EXECUTE format('ALTER TABLE %I DISABLE TRIGGER %I', rec.table_name, protect_trigger_name);
            END IF;

            EXECUTE format(
              'UPDATE %I
               SET %I = $1
               WHERE code = $2
                 AND (
                   NOT (%I ?& ARRAY[''vi'',''en'',''ja'',''ko''])
                   OR %I->>''vi'' = $3
                 )',
              rec.table_name,
              rec.column_name,
              rec.column_name,
              rec.column_name
            )
            USING rec.value, rec.code, rec.value->>'en';

            EXECUTE format(
              'UPDATE i18n_data_quality_flag flag
               SET status = ''RESOLVED'',
                   resolved_at = NOW(),
                   resolved_by = $1::uuid
               FROM %I target
               WHERE flag.status = ''OPEN''
                 AND flag.table_name = $2
                 AND flag.column_name = $3
                 AND flag.row_id = target.master_id
                 AND target.code = $4',
              rec.table_name
            )
            USING '${SYSTEM_USER_ID}', rec.table_name, rec.column_name, rec.code;

            IF EXISTS (
              SELECT 1
              FROM pg_trigger
              WHERE tgrelid = format('%I', rec.table_name)::regclass
                AND tgname = protect_trigger_name
            ) THEN
              EXECUTE format('ALTER TABLE %I ENABLE TRIGGER %I', rec.table_name, protect_trigger_name);
            END IF;
          END IF;
        END LOOP;
      END $$;
    `,
  },
  {
    name: '0007_enrich_mbom_routing_domain_models',
    sql: `
      ALTER TABLE md_mbom_header
        ALTER COLUMN name TYPE JSONB USING jsonb_build_object('vi', name, 'en', name, 'ja', name, 'ko', name),
        ADD COLUMN IF NOT EXISTS description JSONB,
        ADD COLUMN IF NOT EXISTS business_version VARCHAR(30) NOT NULL DEFAULT '1',
        ADD COLUMN IF NOT EXISTS purpose VARCHAR(30) NOT NULL DEFAULT 'Standard',
        ADD COLUMN IF NOT EXISTS change_reason JSONB,
        ADD COLUMN IF NOT EXISTS engineering_note JSONB,
        ADD COLUMN IF NOT EXISTS reference_document VARCHAR(500);
      ALTER TABLE md_mbom_header DROP CONSTRAINT IF EXISTS ck_md_mbom_header_name_localized_text;
      ALTER TABLE md_mbom_header ADD CONSTRAINT ck_md_mbom_header_name_localized_text
        CHECK (jsonb_typeof(name) = 'object' AND name ? 'vi' AND btrim(name->>'vi') <> '');
      ALTER TABLE md_mbom_header ADD CONSTRAINT ck_md_mbom_header_purpose
        CHECK (purpose IN ('Standard','Alternate','Prototype','Rework'));

      ALTER TABLE md_routing_header
        ALTER COLUMN name TYPE JSONB USING jsonb_build_object('vi', name, 'en', name, 'ja', name, 'ko', name),
        ADD COLUMN IF NOT EXISTS description JSONB,
        ADD COLUMN IF NOT EXISTS business_version VARCHAR(30) NOT NULL DEFAULT '1',
        ADD COLUMN IF NOT EXISTS routing_type VARCHAR(30) NOT NULL DEFAULT 'Standard',
        ADD COLUMN IF NOT EXISTS production_purpose JSONB,
        ADD COLUMN IF NOT EXISTS change_reason JSONB,
        ADD COLUMN IF NOT EXISTS engineering_note JSONB,
        ADD COLUMN IF NOT EXISTS reference_document VARCHAR(500);
      ALTER TABLE md_routing_header DROP CONSTRAINT IF EXISTS ck_md_routing_header_name_localized_text;
      ALTER TABLE md_routing_header ADD CONSTRAINT ck_md_routing_header_name_localized_text
        CHECK (jsonb_typeof(name) = 'object' AND name ? 'vi' AND btrim(name->>'vi') <> '');
      ALTER TABLE md_routing_header ADD CONSTRAINT ck_md_routing_header_type
        CHECK (routing_type IN ('Standard','Alternate','Rework'));

      ALTER TABLE md_operation
        ADD COLUMN IF NOT EXISTS description JSONB,
        ADD COLUMN IF NOT EXISTS quantity_reporting VARCHAR(30) NOT NULL DEFAULT 'GoodOnly',
        ADD COLUMN IF NOT EXISTS allow_partial_completion BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS operator_instruction_summary JSONB,
        ADD COLUMN IF NOT EXISTS quality_requirement_summary JSONB;

      ALTER TABLE md_mbom_header DISABLE TRIGGER USER;
      ALTER TABLE md_routing_header DISABLE TRIGGER USER;
      ALTER TABLE md_operation DISABLE TRIGGER USER;
      UPDATE md_mbom_header mb
      SET name = CASE mb.code
        WHEN 'MBOM-FG-WS-CM01-R1' THEN jsonb_build_object('vi','Định mức sản xuất chân máy ô tô R1','en','Automotive Engine Mount Manufacturing BOM R1','ja','自動車エンジンマウント製造BOM R1','ko','자동차 엔진 마운트 제조 BOM R1')
        WHEN 'MBOM-SFG-ROLL-EPDM-R1' THEN jsonb_build_object('vi','Định mức cuộn cao su EPDM R1','en','EPDM Parent Rubber Roll Manufacturing BOM R1','ja','EPDM親ゴムロール製造BOM R1','ko','EPDM 모 고무 롤 제조 BOM R1')
        ELSE name END,
        description = CASE mb.code
          WHEN 'MBOM-FG-WS-CM01-R1' THEN jsonb_build_object('vi','Định mức vật tư tiêu chuẩn cho sản phẩm chân máy ô tô.','en','Standard material structure for the automotive engine mount.','ja','自動車エンジンマウントの標準部品構成。','ko','자동차 엔진 마운트의 표준 자재 구성입니다.')
          WHEN 'MBOM-SFG-ROLL-EPDM-R1' THEN jsonb_build_object('vi','Định mức cho cuộn cao su mẹ dùng trong công đoạn cắt.','en','Material structure for the parent rubber roll used in cutting.','ja','切断工程で使用する親ゴムロールの部品構成。','ko','절단 공정에 사용하는 모 고무 롤의 자재 구성입니다.')
          ELSE jsonb_build_object('vi', code, 'en', code, 'ja', code, 'ko', code) END,
        business_version = COALESCE(NULLIF(regexp_replace(code, '^.*-R([0-9]+).*$', '\\1'), code), '1')
      WHERE name IS NOT NULL;
      UPDATE md_routing_header rt
      SET name = CASE rt.code
        WHEN 'RT-FG-WS-CM01-R1' THEN jsonb_build_object('vi','Quy trình sản xuất chân máy ô tô R1','en','Standard Automotive Engine Mount Production Routing R1','ja','標準自動車エンジンマウント工程 R1','ko','표준 자동차 엔진 마운트 공정 R1')
        ELSE name END,
        description = CASE rt.code
          WHEN 'RT-FG-WS-CM01-R1' THEN jsonb_build_object('vi','Quy trình tiêu chuẩn từ luyện cao su đến kiểm tra chất lượng.','en','Standard route from rubber mixing through final quality inspection.','ja','ゴム混練から最終品質検査までの標準工程。','ko','고무 혼련부터 최종 품질 검사까지의 표준 공정입니다.')
          ELSE jsonb_build_object('vi', code, 'en', code, 'ja', code, 'ko', code) END,
        business_version = COALESCE(NULLIF(regexp_replace(code, '^.*-R([0-9]+).*$', '\\1'), code), '1')
      WHERE name IS NOT NULL;
      UPDATE md_operation SET description = CASE code
        WHEN 'OP-MIX' THEN jsonb_build_object('vi','Chuẩn bị hỗn hợp cao su và tạo nhãn mẻ mẹ.','en','Prepare the rubber compound and issue the mother batch label.','ja','ゴム配合を準備し、母材バッチラベルを発行する。','ko','고무 배합을 준비하고 모 배치 라벨을 발행합니다.')
        WHEN 'OP-PREP' THEN jsonb_build_object('vi','Chuẩn bị và xử lý bề mặt lõi kim loại.','en','Prepare and treat the metal core surface.','ja','金属芯の表面を準備・処理する。','ko','금속 코어 표면을 준비하고 처리합니다.')
        WHEN 'OP-CUT' THEN jsonb_build_object('vi','Cắt phôi cao su theo kích thước yêu cầu.','en','Cut the rubber blank to the required size.','ja','ゴムブランクを指定寸法に切断する。','ko','고무 블랭크를 요구 치수로 절단합니다.')
        WHEN 'OP-MOLD' THEN jsonb_build_object('vi','Ép dính và lưu hóa trong khuôn.','en','Bond and vulcanize the assembly in the mold.','ja','金型で接着・加硫成形する。','ko','금형에서 접착 및 가황 성형합니다.')
        WHEN 'OP-TRIM' THEN jsonb_build_object('vi','Cắt bavia và hoàn thiện sản phẩm.','en','Trim flash and finish the product.','ja','バリを取り、製品を仕上げる。','ko','플래시를 제거하고 제품을 마감합니다.')
        WHEN 'OP-QC' THEN jsonb_build_object('vi','Kiểm tra chất lượng thành phẩm.','en','Inspect finished-product quality.','ja','完成品の品質を検査する。','ko','완제품 품질을 검사합니다.')
        ELSE COALESCE(description, jsonb_build_object('vi', code, 'en', code, 'ja', code, 'ko', code)) END,
        quantity_reporting = CASE WHEN operation_type = 'Inspection' THEN 'GoodScrap' ELSE 'GoodOnly' END,
        allow_partial_completion = CASE WHEN confirmation_mode = 'QuantityOnly' THEN TRUE ELSE FALSE END;
      ALTER TABLE md_mbom_header ENABLE TRIGGER USER;
      ALTER TABLE md_routing_header ENABLE TRIGGER USER;
      ALTER TABLE md_operation ENABLE TRIGGER USER;
    `,
  },
  {
    name: '0008_routing_numbering_and_operation_timing',
    sql: `
      CREATE TABLE IF NOT EXISTS md_routing_numbering_daily (
        number_date DATE PRIMARY KEY,
        current_value BIGINT NOT NULL CHECK (current_value > 0),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_md_routing_header_code ON md_routing_header(code);
      ALTER TABLE md_routing_operation
        ADD COLUMN IF NOT EXISTS scheduling_mode VARCHAR(30) NOT NULL DEFAULT 'Finite',
        ADD COLUMN IF NOT EXISTS queue_time_min NUMERIC(12,3) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS move_time_min NUMERIC(12,3) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS overlap_allowed BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS transfer_batch_qty NUMERIC(18,6),
        ADD COLUMN IF NOT EXISTS milestone_flag BOOLEAN NOT NULL DEFAULT FALSE;
    `,
  },
  {
    name: '0009_work_center_capability_cycle_time',
    sql: `
      ALTER TABLE md_resource_capability
        ADD COLUMN IF NOT EXISTS cycle_time_sec NUMERIC(12,3) NOT NULL DEFAULT 0;
      UPDATE md_resource_capability SET cycle_time_sec = 60 WHERE cycle_time_sec <= 0;
      ALTER TABLE md_resource_capability
        DROP CONSTRAINT IF EXISTS ck_md_resource_capability_cycle_time,
        ADD CONSTRAINT ck_md_resource_capability_cycle_time CHECK (cycle_time_sec > 0);
    `,
  },
  {
    name: '0010_ebom_and_mbom_traceability',
    sql: `
      CREATE TABLE IF NOT EXISTS md_ebom_header (
        master_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(50) NOT NULL,
        name JSONB NOT NULL,
        description JSONB,
        item_revision_id UUID NOT NULL REFERENCES md_item_revision(master_id),
        business_version VARCHAR(30) NOT NULL DEFAULT '1',
        version_no INTEGER NOT NULL DEFAULT 1,
        lifecycle_status master_lifecycle_status NOT NULL DEFAULT 'Draft',
        effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        effective_to TIMESTAMPTZ,
        created_by UUID NOT NULL DEFAULT '${SYSTEM_USER_ID}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by UUID, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), approved_by UUID, approved_at TIMESTAMPTZ,
        row_version INTEGER NOT NULL DEFAULT 1, attributes JSONB NOT NULL DEFAULT '{}'::JSONB,
        UNIQUE (code, business_version),
        CHECK (jsonb_typeof(name) = 'object' AND name ? 'vi' AND btrim(name->>'vi') <> '')
      );
      CREATE TABLE IF NOT EXISTS md_ebom_line (
        master_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(50) NOT NULL,
        name VARCHAR(200) NOT NULL DEFAULT 'EBOM line',
        version_no INTEGER NOT NULL DEFAULT 1,
        lifecycle_status master_lifecycle_status NOT NULL DEFAULT 'Draft',
        effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(), effective_to TIMESTAMPTZ,
        ebom_header_id UUID NOT NULL REFERENCES md_ebom_header(master_id) ON DELETE CASCADE,
        parent_line_id UUID REFERENCES md_ebom_line(master_id),
        seq INTEGER NOT NULL,
        component_revision_id UUID NOT NULL REFERENCES md_item_revision(master_id),
        quantity_per NUMERIC(18,6) NOT NULL CHECK (quantity_per > 0),
        uom_id UUID NOT NULL REFERENCES md_uom(master_id),
        reference_designator VARCHAR(120), note TEXT,
        phantom_design_flag BOOLEAN NOT NULL DEFAULT FALSE,
        created_by UUID NOT NULL DEFAULT '${SYSTEM_USER_ID}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by UUID, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), row_version INTEGER NOT NULL DEFAULT 1, attributes JSONB NOT NULL DEFAULT '{}'::JSONB,
        UNIQUE (ebom_header_id, seq)
      );
      ALTER TABLE md_mbom_line ADD COLUMN IF NOT EXISTS source_ebom_line_id UUID REFERENCES md_ebom_line(master_id);
      CREATE INDEX IF NOT EXISTS ix_md_ebom_line_header ON md_ebom_line(ebom_header_id, seq);
    `,
  },
  {
    name: '0011_item_revision_engineering_change_control',
    sql: `
      ALTER TABLE md_item_revision
        ADD COLUMN IF NOT EXISTS item_group VARCHAR(80),
        ADD COLUMN IF NOT EXISTS base_uom_id UUID REFERENCES md_uom(master_id),
        ADD COLUMN IF NOT EXISTS planning_strategy VARCHAR(40),
        ADD COLUMN IF NOT EXISTS procurement_type VARCHAR(40),
        ADD COLUMN IF NOT EXISTS tracking_level VARCHAR(40),
        ADD COLUMN IF NOT EXISTS default_scrap_rate NUMERIC(8,4),
        ADD COLUMN IF NOT EXISTS specification_ref VARCHAR(255),
        ADD COLUMN IF NOT EXISTS change_reason VARCHAR(500),
        ADD COLUMN IF NOT EXISTS released_by UUID,
        ADD COLUMN IF NOT EXISTS previous_revision_id UUID REFERENCES md_item_revision(master_id);
      ALTER TABLE md_item_revision DISABLE TRIGGER USER;
      UPDATE md_item_revision r
      SET item_group = COALESCE(r.item_group, i.item_group),
          base_uom_id = COALESCE(r.base_uom_id, i.base_uom_id),
          planning_strategy = COALESCE(r.planning_strategy, 'MakeToStock'),
          procurement_type = COALESCE(r.procurement_type, CASE WHEN i.item_type = 'RM' THEN 'Buy' ELSE 'Make' END),
          tracking_level = COALESCE(r.tracking_level, 'None'),
          default_scrap_rate = COALESCE(r.default_scrap_rate, 0)
      FROM md_item i
      WHERE i.master_id = r.item_id;
      CREATE TABLE IF NOT EXISTS md_item_revision_numbering (
        item_id UUID PRIMARY KEY REFERENCES md_item(master_id) ON DELETE CASCADE,
        current_value INTEGER NOT NULL CHECK (current_value > 0),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      INSERT INTO md_item_revision_numbering (item_id, current_value)
      SELECT item_id, MAX(version_no)
      FROM md_item_revision
      GROUP BY item_id
      ON CONFLICT (item_id) DO UPDATE SET current_value = GREATEST(md_item_revision_numbering.current_value, EXCLUDED.current_value);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_md_uom_code_case_insensitive ON md_uom (UPPER(code));
      CREATE INDEX IF NOT EXISTS ix_md_item_revision_effective ON md_item_revision(item_id, site_id, lifecycle_status, effective_from, effective_to);
      ALTER TABLE md_item_revision ENABLE TRIGGER USER;
    `,
  },
  {
    name: '0012_item_revision_engineering_change_control_constraints',
    sql: `
      ALTER TABLE md_item_revision
        ALTER COLUMN item_group SET NOT NULL,
        ALTER COLUMN base_uom_id SET NOT NULL,
        ALTER COLUMN planning_strategy SET NOT NULL,
        ALTER COLUMN procurement_type SET NOT NULL,
        ALTER COLUMN tracking_level SET NOT NULL,
        ALTER COLUMN default_scrap_rate SET NOT NULL;
      ALTER TABLE md_item_revision
        ADD CONSTRAINT ck_md_item_revision_scrap_rate CHECK (default_scrap_rate >= 0 AND default_scrap_rate <= 1);
    `,
  },
  {
    name: '0013_item_revision_backfill_repair',
    sql: `
      ALTER TABLE md_item_revision DISABLE TRIGGER USER;
      UPDATE md_item_revision r
      SET item_group = COALESCE(r.item_group, i.item_group),
          base_uom_id = COALESCE(r.base_uom_id, i.base_uom_id),
          planning_strategy = COALESCE(r.planning_strategy, 'MakeToStock'),
          procurement_type = COALESCE(r.procurement_type, CASE WHEN i.item_type = 'RM' THEN 'Buy' ELSE 'Make' END),
          tracking_level = COALESCE(r.tracking_level, 'None'),
          default_scrap_rate = COALESCE(r.default_scrap_rate, 0)
      FROM md_item i
      WHERE i.master_id = r.item_id;
      ALTER TABLE md_item_revision ENABLE TRIGGER USER;
    `,
  },
  {
    name: '0014_site_localized_name',
    sql: `
      ALTER TABLE md_site DISABLE TRIGGER USER;
      ALTER TABLE md_site
        ALTER COLUMN name TYPE JSONB
        USING jsonb_build_object('vi', name, 'en', name, 'ja', name, 'ko', name);
      UPDATE md_site
      SET name = seed.localized_name
      FROM (VALUES
        ('SITE-KZ3', '{"vi":"S-Factory - Kizuna 3","en":"S-Factory - Kizuna 3","ja":"S-Factory - キズナ3","ko":"S-Factory - 키즈나 3"}'::jsonb)
      ) AS seed(code, localized_name)
      WHERE md_site.code = seed.code;
      ALTER TABLE md_site
        ADD CONSTRAINT ck_md_site_name_localized
        CHECK (jsonb_typeof(name) = 'object' AND name ? 'vi' AND btrim(name->>'vi') <> '');
      ALTER TABLE md_site ENABLE TRIGGER USER;
    `,
  },
  {
    name: '0015_resource_master_data_foundation',
    sql: `
      CREATE EXTENSION IF NOT EXISTS btree_gist;

      ALTER TABLE md_production_area DISABLE TRIGGER USER;
      ALTER TABLE md_production_area
        ALTER COLUMN name TYPE JSONB USING jsonb_build_object('vi', name, 'en', name, 'ja', name, 'ko', name),
        ADD COLUMN IF NOT EXISTS description JSONB,
        ADD COLUMN IF NOT EXISTS sequence_no INTEGER NOT NULL DEFAULT 0;
      UPDATE md_production_area SET sequence_no = COALESCE(sequence_no, 0);
      ALTER TABLE md_production_area ENABLE TRIGGER USER;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_md_production_area_site_code ON md_production_area(site_id, code);
      ALTER TABLE md_production_area DROP CONSTRAINT IF EXISTS ck_md_production_area_type;
      ALTER TABLE md_production_area ADD CONSTRAINT ck_md_production_area_type CHECK (area_type IN ('Workshop','Line','Cell','Zone','Production'));

      ALTER TABLE md_work_center
        ADD COLUMN IF NOT EXISTS resource_type VARCHAR(30) NOT NULL DEFAULT 'MachineGroup',
        ADD COLUMN IF NOT EXISTS capacity_model VARCHAR(30) NOT NULL DEFAULT 'TimeBased',
        ADD COLUMN IF NOT EXISTS finite_capacity_flag BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS default_shift_id UUID REFERENCES md_shift(master_id),
        ADD COLUMN IF NOT EXISTS max_concurrent_jobs INTEGER NOT NULL DEFAULT 1;
      UPDATE md_work_center SET resource_type = CASE WHEN work_center_type = 'Labor' THEN 'LaborCell' ELSE 'MachineGroup' END WHERE resource_type IS NULL;
      ALTER TABLE md_work_center DROP CONSTRAINT IF EXISTS ck_md_work_center_resource_type;
      ALTER TABLE md_work_center ADD CONSTRAINT ck_md_work_center_resource_type CHECK (resource_type IN ('MachineGroup','LaborCell','Mixed'));
      ALTER TABLE md_work_center DROP CONSTRAINT IF EXISTS ck_md_work_center_capacity_model;
      ALTER TABLE md_work_center ADD CONSTRAINT ck_md_work_center_capacity_model CHECK (capacity_model IN ('TimeBased','QuantityBased'));
      ALTER TABLE md_work_center DROP CONSTRAINT IF EXISTS ck_md_work_center_concurrency;
      ALTER TABLE md_work_center ADD CONSTRAINT ck_md_work_center_concurrency CHECK (max_concurrent_jobs > 0);

      ALTER TABLE md_workstation DISABLE TRIGGER USER;
      ALTER TABLE md_workstation
        ALTER COLUMN name TYPE JSONB USING jsonb_build_object('vi', name, 'en', name, 'ja', name, 'ko', name),
        ADD COLUMN IF NOT EXISTS area_id UUID,
        ADD COLUMN IF NOT EXISTS description JSONB,
        ADD COLUMN IF NOT EXISTS execution_mode VARCHAR(30) NOT NULL DEFAULT 'Kiosk',
        ADD COLUMN IF NOT EXISTS max_concurrent_jobs INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS default_terminal_id UUID;
      UPDATE md_workstation ws SET area_id = wc.area_id, execution_mode = CASE WHEN ws.workstation_type IN ('Kiosk','Tablet','Manual','Automatic') THEN ws.workstation_type ELSE 'Kiosk' END
      FROM md_work_center wc WHERE wc.master_id = ws.work_center_id;
      ALTER TABLE md_workstation ALTER COLUMN area_id SET NOT NULL;
      ALTER TABLE md_workstation ALTER COLUMN work_center_id DROP NOT NULL;
      ALTER TABLE md_workstation ADD CONSTRAINT fk_md_workstation_area FOREIGN KEY (area_id) REFERENCES md_production_area(master_id);
      ALTER TABLE md_workstation ADD CONSTRAINT ck_md_workstation_execution_mode CHECK (execution_mode IN ('Kiosk','Tablet','Manual','Automatic'));
      ALTER TABLE md_workstation ADD CONSTRAINT ck_md_workstation_concurrency CHECK (max_concurrent_jobs > 0);
      ALTER TABLE md_workstation ENABLE TRIGGER USER;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_md_workstation_site_code ON md_workstation(site_id, code);

      ALTER TABLE md_equipment
        ADD COLUMN IF NOT EXISTS description JSONB,
        ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(100),
        ADD COLUMN IF NOT EXISTS model VARCHAR(100),
        ADD COLUMN IF NOT EXISTS serial_number VARCHAR(100),
        ADD COLUMN IF NOT EXISTS planning_resource_flag BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS execution_status VARCHAR(30) NOT NULL DEFAULT 'Available',
        ADD COLUMN IF NOT EXISTS default_efficiency NUMERIC(7,4) NOT NULL DEFAULT 1;
      ALTER TABLE md_equipment ALTER COLUMN work_center_id DROP NOT NULL;
      ALTER TABLE md_equipment ADD CONSTRAINT ck_md_equipment_execution_status CHECK (execution_status IN ('Available','Maintenance','OutOfService'));
      ALTER TABLE md_equipment ADD CONSTRAINT ck_md_equipment_efficiency CHECK (default_efficiency > 0 AND default_efficiency <= 2);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_md_equipment_site_code ON md_equipment(site_id, code);

      ALTER TABLE md_resource_assignment
        ADD COLUMN IF NOT EXISTS site_id UUID,
        ADD COLUMN IF NOT EXISTS assignment_role VARCHAR(20) NOT NULL DEFAULT 'Primary',
        ADD COLUMN IF NOT EXISTS scheduling_flag BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS oee_aggregation_flag BOOLEAN NOT NULL DEFAULT FALSE;
      UPDATE md_resource_assignment ra SET site_id = wc.site_id, assignment_role = CASE WHEN ra.assignment_type IN ('Alternate','Supporting') THEN ra.assignment_type ELSE 'Primary' END
      FROM md_work_center wc WHERE wc.master_id = ra.work_center_id;
      ALTER TABLE md_resource_assignment ALTER COLUMN site_id SET NOT NULL;
      ALTER TABLE md_resource_assignment ADD CONSTRAINT fk_md_resource_assignment_site FOREIGN KEY (site_id) REFERENCES md_site(master_id);
      ALTER TABLE md_resource_assignment ADD CONSTRAINT ck_md_resource_assignment_role CHECK (assignment_role IN ('Primary','Alternate','Supporting'));
      ALTER TABLE md_resource_assignment ADD CONSTRAINT ck_md_resource_assignment_dates CHECK (effective_to IS NULL OR effective_to > effective_from);
      CREATE INDEX IF NOT EXISTS ix_md_resource_assignment_current ON md_resource_assignment(site_id, work_center_id, workstation_id, effective_from, effective_to);
      CREATE INDEX IF NOT EXISTS ix_md_resource_assignment_equipment ON md_resource_assignment(equipment_id, effective_from, effective_to);
      ALTER TABLE md_resource_assignment DROP CONSTRAINT IF EXISTS ex_md_resource_assignment_primary_equipment;
      ALTER TABLE md_resource_assignment ADD CONSTRAINT ex_md_resource_assignment_primary_equipment
        EXCLUDE USING gist (equipment_id WITH =, tstzrange(effective_from, COALESCE(effective_to, 'infinity'::timestamptz), '[)') WITH &&)
        WHERE (assignment_role = 'Primary' AND equipment_id IS NOT NULL);

      CREATE OR REPLACE FUNCTION fn_validate_resource_assignment()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      DECLARE wc_site UUID; wc_area UUID; ws_site UUID; ws_area UUID; eq_site UUID;
      BEGIN
        SELECT site_id, area_id INTO wc_site, wc_area FROM md_work_center WHERE master_id = NEW.work_center_id;
        IF wc_site IS NULL OR wc_site <> NEW.site_id THEN RAISE EXCEPTION 'Resource assignment Work Center and Site must match'; END IF;
        IF NEW.workstation_id IS NOT NULL THEN
          SELECT site_id, area_id INTO ws_site, ws_area FROM md_workstation WHERE master_id = NEW.workstation_id;
          IF ws_site IS NULL OR ws_site <> NEW.site_id OR ws_area <> wc_area THEN RAISE EXCEPTION 'Resource assignment Workstation must match Site and Area'; END IF;
          IF EXISTS (SELECT 1 FROM md_workstation WHERE master_id = NEW.workstation_id AND active_flag = FALSE) THEN RAISE EXCEPTION 'Inactive Workstation cannot receive an active assignment'; END IF;
        END IF;
        IF NEW.equipment_id IS NOT NULL THEN
          SELECT site_id INTO eq_site FROM md_equipment WHERE master_id = NEW.equipment_id;
          IF eq_site IS NULL OR eq_site <> NEW.site_id THEN RAISE EXCEPTION 'Resource assignment Equipment and Site must match'; END IF;
          IF EXISTS (SELECT 1 FROM md_equipment WHERE master_id = NEW.equipment_id AND (active_flag = FALSE OR execution_status = 'OutOfService')) THEN RAISE EXCEPTION 'Inactive or OutOfService Equipment cannot receive an active assignment'; END IF;
        END IF;
        RETURN NEW;
      END; $$;
      DROP TRIGGER IF EXISTS trg_validate_resource_assignment ON md_resource_assignment;
      CREATE TRIGGER trg_validate_resource_assignment BEFORE INSERT OR UPDATE ON md_resource_assignment FOR EACH ROW EXECUTE FUNCTION fn_validate_resource_assignment();

      CREATE OR REPLACE FUNCTION fn_validate_resource_hierarchy()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      DECLARE parent_site UUID; area_site UUID; wc_site UUID; wc_area UUID;
      BEGIN
        IF TG_TABLE_NAME = 'md_work_center' THEN
          SELECT site_id INTO area_site FROM md_production_area WHERE master_id = NEW.area_id;
          IF area_site IS NULL OR area_site <> NEW.site_id THEN RAISE EXCEPTION 'Work Center Area and Site must match'; END IF;
        ELSIF TG_TABLE_NAME = 'md_workstation' THEN
          SELECT site_id INTO area_site FROM md_production_area WHERE master_id = NEW.area_id;
          SELECT site_id, area_id INTO wc_site, wc_area FROM md_work_center WHERE master_id = NEW.work_center_id;
          IF area_site IS NULL OR area_site <> NEW.site_id OR (NEW.work_center_id IS NOT NULL AND (wc_site <> NEW.site_id OR wc_area <> NEW.area_id)) THEN RAISE EXCEPTION 'Workstation Area, Work Center, and Site must match'; END IF;
        ELSIF TG_TABLE_NAME = 'md_equipment' THEN
          SELECT site_id INTO wc_site FROM md_work_center WHERE master_id = NEW.work_center_id;
          IF NEW.work_center_id IS NOT NULL AND (wc_site IS NULL OR wc_site <> NEW.site_id) THEN RAISE EXCEPTION 'Equipment Work Center and Site must match'; END IF;
        END IF;
        RETURN NEW;
      END; $$;
      DROP TRIGGER IF EXISTS trg_validate_work_center_hierarchy ON md_work_center;
      CREATE TRIGGER trg_validate_work_center_hierarchy BEFORE INSERT OR UPDATE ON md_work_center FOR EACH ROW EXECUTE FUNCTION fn_validate_resource_hierarchy();
      DROP TRIGGER IF EXISTS trg_validate_workstation_hierarchy ON md_workstation;
      CREATE TRIGGER trg_validate_workstation_hierarchy BEFORE INSERT OR UPDATE ON md_workstation FOR EACH ROW EXECUTE FUNCTION fn_validate_resource_hierarchy();
      DROP TRIGGER IF EXISTS trg_validate_equipment_hierarchy ON md_equipment;
      CREATE TRIGGER trg_validate_equipment_hierarchy BEFORE INSERT OR UPDATE ON md_equipment FOR EACH ROW EXECUTE FUNCTION fn_validate_resource_hierarchy();
    `,
  },
  {
    name: '0016_resource_hierarchy_parent_site_validation',
    sql: `
      CREATE OR REPLACE FUNCTION fn_check_production_area_cycle()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      DECLARE parent_site UUID;
      BEGIN
        IF NEW.parent_area_id IS NULL THEN RETURN NEW; END IF;
        IF NEW.parent_area_id = NEW.master_id THEN
          RAISE EXCEPTION 'Production area cannot be its own parent';
        END IF;
        SELECT site_id INTO parent_site FROM md_production_area WHERE master_id = NEW.parent_area_id;
        IF parent_site IS NULL OR parent_site <> NEW.site_id THEN
          RAISE EXCEPTION 'Production area parent must belong to the same Site';
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
    `,
  },
  {
    name: '0017_resource_master_data_i18n_backfill',
    sql: `
      ALTER TABLE md_resource_assignment DISABLE TRIGGER USER;
      ALTER TABLE md_resource_assignment
        ALTER COLUMN name TYPE JSONB USING jsonb_build_object('vi', name, 'en', name, 'ja', name, 'ko', name);
      ALTER TABLE md_resource_assignment ENABLE TRIGGER USER;

      UPDATE md_production_area SET name = CASE code
        WHEN 'AREA-RUBBER' THEN '{"vi":"Khu vực gia công cao su","en":"Rubber Processing Area","ja":"ゴム加工エリア","ko":"고무 가공 구역"}'::jsonb
        WHEN 'AREA-MOLDING' THEN '{"vi":"Khu vực ép lưu hóa","en":"Vulcanization Molding Area","ja":"加硫成形エリア","ko":"가황 성형 구역"}'::jsonb
        ELSE name END,
        description = CASE code
        WHEN 'AREA-RUBBER' THEN '{"vi":"Khu vực luyện, cắt và chuẩn bị cao su.","en":"Mixing, cutting, and rubber preparation area.","ja":"混練、切断、ゴム準備エリア。","ko":"혼련, 절단 및 고무 준비 구역."}'::jsonb
        WHEN 'AREA-MOLDING' THEN '{"vi":"Khu vực ép, lưu hóa và kiểm tra sản phẩm.","en":"Molding, vulcanization, and product inspection area.","ja":"成形、加硫、製品検査エリア。","ko":"성형, 가황 및 제품 검사 구역."}'::jsonb
        ELSE description END
      WHERE code IN ('AREA-RUBBER','AREA-MOLDING');

      UPDATE md_workstation SET name = CASE code
        WHEN 'WS-MOLD-KIOSK01' THEN '{"vi":"Trạm kiosk máy ép 01","en":"Molding Kiosk 01","ja":"成形キオスク01","ko":"성형 키오스크 01"}'::jsonb
        ELSE CASE WHEN jsonb_typeof(name) = 'object' THEN name ELSE jsonb_build_object('vi', name #>> '{}', 'en', name #>> '{}', 'ja', name #>> '{}', 'ko', name #>> '{}') END END,
        description = CASE WHEN code = 'WS-MOLD-KIOSK01' THEN '{"vi":"Điểm thực thi cho máy ép thủy lực.","en":"Execution point for hydraulic molding.","ja":"油圧成形用の実行ポイント。","ko":"유압 성형 실행 지점."}'::jsonb ELSE description END;

      UPDATE md_resource_assignment
      SET name = CASE WHEN jsonb_typeof(name) = 'object' THEN name ELSE jsonb_build_object('vi', name #>> '{}', 'en', name #>> '{}', 'ja', name #>> '{}', 'ko', name #>> '{}') END,
          scheduling_flag = COALESCE(scheduling_flag, TRUE),
          oee_aggregation_flag = COALESCE(oee_aggregation_flag, FALSE);
    `,
  },
  {
    name: '0018_resource_assignment_i18n_backfill',
    sql: `
      UPDATE md_resource_assignment
      SET name = CASE WHEN code = 'ASSIGN-MOLD-KIOSK01'
        THEN '{"vi":"Gán kiosk máy ép","en":"Molding kiosk assignment","ja":"成形キオスク割当","ko":"성형 키오스크 할당"}'::jsonb
        ELSE name END,
        scheduling_flag = CASE WHEN code = 'ASSIGN-MOLD-KIOSK01' THEN TRUE ELSE scheduling_flag END,
        oee_aggregation_flag = CASE WHEN code = 'ASSIGN-MOLD-KIOSK01' THEN TRUE ELSE oee_aggregation_flag END
      WHERE code = 'ASSIGN-MOLD-KIOSK01';
    `,
  },
  {
    name: '0019_resource_planning_constraints_phase_2',
    sql: `
      ALTER TABLE md_resource_capability
        ADD COLUMN IF NOT EXISTS site_id UUID,
        ADD COLUMN IF NOT EXISTS product_revision_id UUID,
        ADD COLUMN IF NOT EXISTS item_group VARCHAR(80),
        ADD COLUMN IF NOT EXISTS eligibility BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS priority_no INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS speed_factor NUMERIC(7,4) NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS min_lot_size NUMERIC(18,6),
        ADD COLUMN IF NOT EXISTS max_lot_size NUMERIC(18,6),
        ADD COLUMN IF NOT EXISTS setup_family VARCHAR(50);
      UPDATE md_resource_capability rc SET site_id = wc.site_id
      FROM md_work_center wc WHERE wc.master_id = rc.work_center_id AND rc.site_id IS NULL;
      UPDATE md_resource_capability rc SET product_revision_id = ps.item_revision_id
      FROM md_production_standard ps
      WHERE rc.product_revision_id IS NULL AND ps.operation_id = rc.operation_id AND ps.work_center_id = rc.work_center_id;
      ALTER TABLE md_resource_capability
        ADD CONSTRAINT ck_md_resource_capability_priority CHECK (priority_no > 0),
        ADD CONSTRAINT ck_md_resource_capability_speed CHECK (speed_factor > 0),
        ADD CONSTRAINT ck_md_resource_capability_lot CHECK (min_lot_size IS NULL OR min_lot_size > 0),
        ADD CONSTRAINT ck_md_resource_capability_lot_order CHECK (max_lot_size IS NULL OR min_lot_size IS NULL OR max_lot_size >= min_lot_size);
      CREATE INDEX IF NOT EXISTS ix_md_resource_capability_resolution ON md_resource_capability(site_id, operation_id, product_revision_id, item_group, work_center_id, equipment_id, effective_from, effective_to);

      ALTER TABLE md_resource_calendar
        ALTER COLUMN work_center_id DROP NOT NULL,
        ALTER COLUMN available_from DROP NOT NULL,
        ALTER COLUMN available_to DROP NOT NULL,
        ADD COLUMN IF NOT EXISTS site_id UUID,
        ADD COLUMN IF NOT EXISTS resource_type VARCHAR(20),
        ADD COLUMN IF NOT EXISTS resource_id UUID,
        ADD COLUMN IF NOT EXISTS workstation_id UUID,
        ADD COLUMN IF NOT EXISTS calendar_date DATE,
        ADD COLUMN IF NOT EXISTS shift_id UUID,
        ADD COLUMN IF NOT EXISTS availability_status VARCHAR(20) NOT NULL DEFAULT 'Available',
        ADD COLUMN IF NOT EXISTS available_minutes INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS capacity_factor NUMERIC(7,4) NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS reason_id UUID,
        ADD COLUMN IF NOT EXISTS note JSONB;
      UPDATE md_resource_calendar c SET site_id = eq.site_id, resource_type = 'Equipment', resource_id = c.equipment_id
      FROM md_equipment eq WHERE c.equipment_id = eq.master_id AND c.site_id IS NULL;
      UPDATE md_resource_calendar c SET site_id = ws.site_id, resource_type = 'Workstation', resource_id = c.workstation_id
      FROM md_workstation ws WHERE c.workstation_id = ws.master_id AND c.site_id IS NULL;
      UPDATE md_resource_calendar c SET site_id = wc.site_id, resource_type = 'WorkCenter', resource_id = c.work_center_id
      FROM md_work_center wc WHERE c.work_center_id = wc.master_id AND c.site_id IS NULL;
      UPDATE md_resource_calendar SET calendar_date = COALESCE(calendar_date, COALESCE(available_from, NOW())::date),
        available_minutes = CASE WHEN available_minutes = 0 AND available_from IS NOT NULL AND available_to IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (available_to - available_from))::INTEGER / 60) ELSE available_minutes END,
        capacity_factor = CASE WHEN capacity_factor = 1 AND capacity_percent IS NOT NULL THEN capacity_percent ELSE capacity_factor END;
      UPDATE md_resource_calendar c SET shift_id = (SELECT s.master_id FROM md_shift s WHERE s.site_id = c.site_id ORDER BY s.code LIMIT 1) WHERE c.shift_id IS NULL;
      UPDATE md_resource_calendar SET availability_status = 'Available' WHERE availability_status IS NULL;
      ALTER TABLE md_resource_calendar ALTER COLUMN site_id SET NOT NULL, ALTER COLUMN resource_type SET NOT NULL, ALTER COLUMN resource_id SET NOT NULL, ALTER COLUMN calendar_date SET NOT NULL, ALTER COLUMN shift_id SET NOT NULL;
      ALTER TABLE md_resource_calendar
        ADD CONSTRAINT ck_md_resource_calendar_type CHECK (resource_type IN ('WorkCenter','Workstation','Equipment')),
        ADD CONSTRAINT ck_md_resource_calendar_status CHECK (availability_status IN ('Available','PlannedDown','Holiday')),
        ADD CONSTRAINT ck_md_resource_calendar_minutes CHECK (available_minutes >= 0),
        ADD CONSTRAINT ck_md_resource_calendar_factor CHECK (capacity_factor >= 0),
        ADD CONSTRAINT ck_md_resource_calendar_down_zero CHECK (availability_status = 'Available' OR available_minutes = 0);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_md_resource_calendar_resource_date_shift ON md_resource_calendar(resource_type, resource_id, calendar_date, shift_id);
      CREATE INDEX IF NOT EXISTS ix_md_resource_calendar_resolution ON md_resource_calendar(site_id, calendar_date, shift_id, resource_type, resource_id);

      ALTER TABLE md_production_standard
        ADD COLUMN IF NOT EXISTS site_id UUID,
        ADD COLUMN IF NOT EXISTS routing_operation_id UUID,
        ADD COLUMN IF NOT EXISTS base_quantity NUMERIC(18,6) NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS standard_yield NUMERIC(8,4) NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS source_method VARCHAR(30) NOT NULL DEFAULT 'Engineering',
        ADD COLUMN IF NOT EXISTS sample_size INTEGER,
        ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS valid_to TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS review_due_date TIMESTAMPTZ;
      ALTER TABLE md_production_standard DISABLE TRIGGER USER;
      UPDATE md_production_standard ps SET site_id = wc.site_id
      FROM md_work_center wc WHERE wc.master_id = ps.work_center_id AND ps.site_id IS NULL;
      UPDATE md_production_standard ps SET routing_operation_id = ro.master_id
      FROM md_routing_operation ro WHERE ps.routing_operation_id IS NULL AND ro.operation_id = ps.operation_id AND ro.work_center_id = ps.work_center_id;
      UPDATE md_production_standard SET valid_from = COALESCE(valid_from, effective_from), setup_time_min = COALESCE(setup_time_min, 0), cycle_time_sec = COALESCE(cycle_time_sec, 1);
      ALTER TABLE md_production_standard ENABLE TRIGGER USER;
      ALTER TABLE md_production_standard
        ADD CONSTRAINT ck_md_production_standard_base_quantity CHECK (base_quantity > 0),
        ADD CONSTRAINT ck_md_production_standard_yield CHECK (standard_yield > 0),
        ADD CONSTRAINT ck_md_production_standard_efficiency CHECK (efficiency_factor > 0),
        ADD CONSTRAINT ck_md_production_standard_labor CHECK (labor_count > 0),
        ADD CONSTRAINT ck_md_production_standard_cycle CHECK (cycle_time_sec > 0),
        ADD CONSTRAINT ck_md_production_standard_setup CHECK (setup_time_min >= 0),
        ADD CONSTRAINT ck_md_production_standard_dates CHECK (valid_to IS NULL OR valid_to > valid_from);
      CREATE INDEX IF NOT EXISTS ix_md_production_standard_resolution ON md_production_standard(site_id, item_revision_id, routing_operation_id, work_center_id, equipment_id, valid_from, valid_to);

      ALTER TABLE md_operation_skill_requirement
        ADD COLUMN IF NOT EXISTS site_id UUID,
        ADD COLUMN IF NOT EXISTS routing_operation_id UUID,
        ADD COLUMN IF NOT EXISTS required_persons INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS mandatory_flag BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS active_flag BOOLEAN NOT NULL DEFAULT TRUE;
      UPDATE md_operation_skill_requirement osr SET routing_operation_id = ro.master_id, site_id = r.site_id
      FROM md_routing_operation ro JOIN md_routing_header r ON r.master_id = ro.routing_header_id
      WHERE osr.routing_operation_id IS NULL AND ro.operation_id = osr.operation_id;
      ALTER TABLE md_operation_skill_requirement
        ADD CONSTRAINT ck_md_operation_skill_required_persons CHECK (required_persons > 0),
        ADD CONSTRAINT ck_md_operation_skill_dates CHECK (effective_to IS NULL OR effective_to > effective_from);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_md_operation_skill_active ON md_operation_skill_requirement(routing_operation_id, skill_id, effective_from) WHERE active_flag = TRUE;
      CREATE INDEX IF NOT EXISTS ix_md_operation_skill_resolution ON md_operation_skill_requirement(site_id, routing_operation_id, effective_from, effective_to);

      CREATE OR REPLACE FUNCTION fn_validate_planning_capability()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      DECLARE wc_site UUID; eq_site UUID;
      BEGIN
        SELECT site_id INTO wc_site FROM md_work_center WHERE master_id = NEW.work_center_id AND active_flag = TRUE;
        IF wc_site IS NULL OR NEW.site_id IS DISTINCT FROM wc_site THEN RAISE EXCEPTION 'CAPABILITY_WORK_CENTER_SITE_INVALID'; END IF;
        IF NEW.product_revision_id IS NULL AND NULLIF(NEW.item_group, '') IS NULL THEN RAISE EXCEPTION 'CAPABILITY_SCOPE_REQUIRED'; END IF;
        IF NEW.equipment_id IS NOT NULL THEN
          SELECT site_id INTO eq_site FROM md_equipment WHERE master_id = NEW.equipment_id AND active_flag = TRUE AND planning_resource_flag = TRUE AND execution_status = 'Available';
          IF eq_site IS NULL OR eq_site <> NEW.site_id THEN RAISE EXCEPTION 'CAPABILITY_EQUIPMENT_NOT_PLANNING_ELIGIBLE'; END IF;
          IF NOT EXISTS (SELECT 1 FROM md_resource_assignment ra WHERE ra.work_center_id = NEW.work_center_id AND ra.equipment_id = NEW.equipment_id AND ra.scheduling_flag = TRUE AND tstzrange(ra.effective_from, COALESCE(ra.effective_to, 'infinity'::timestamptz), '[)') && tstzrange(NEW.effective_from, COALESCE(NEW.effective_to, 'infinity'::timestamptz), '[)')) THEN RAISE EXCEPTION 'CAPABILITY_EQUIPMENT_ASSIGNMENT_REQUIRED'; END IF;
        END IF;
        RETURN NEW;
      END; $$;
      DROP TRIGGER IF EXISTS trg_validate_planning_capability ON md_resource_capability;
      CREATE TRIGGER trg_validate_planning_capability BEFORE INSERT OR UPDATE ON md_resource_capability FOR EACH ROW EXECUTE FUNCTION fn_validate_planning_capability();

      CREATE OR REPLACE FUNCTION fn_validate_resource_calendar()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      DECLARE expected_site UUID; shift_site UUID; active_resource BOOLEAN;
      BEGIN
        IF NEW.availability_status <> 'Available' AND NEW.available_minutes <> 0 THEN RAISE EXCEPTION 'CALENDAR_NON_AVAILABLE_MUST_BE_ZERO'; END IF;
        SELECT site_id INTO shift_site FROM md_shift WHERE master_id = NEW.shift_id;
        IF shift_site IS NULL OR shift_site <> NEW.site_id THEN RAISE EXCEPTION 'CALENDAR_SHIFT_SITE_INVALID'; END IF;
        IF NEW.resource_type = 'WorkCenter' THEN SELECT site_id, active_flag INTO expected_site, active_resource FROM md_work_center WHERE master_id = NEW.resource_id;
        ELSIF NEW.resource_type = 'Workstation' THEN SELECT site_id, active_flag INTO expected_site, active_resource FROM md_workstation WHERE master_id = NEW.resource_id;
        ELSE SELECT site_id, active_flag INTO expected_site, active_resource FROM md_equipment WHERE master_id = NEW.resource_id; END IF;
        IF expected_site IS NULL OR expected_site <> NEW.site_id THEN RAISE EXCEPTION 'CALENDAR_RESOURCE_SITE_INVALID'; END IF;
        IF NEW.calendar_date >= CURRENT_DATE AND active_resource = FALSE THEN RAISE EXCEPTION 'CALENDAR_INACTIVE_RESOURCE'; END IF;
        RETURN NEW;
      END; $$;
      DROP TRIGGER IF EXISTS trg_validate_resource_calendar ON md_resource_calendar;
      CREATE TRIGGER trg_validate_resource_calendar BEFORE INSERT OR UPDATE ON md_resource_calendar FOR EACH ROW EXECUTE FUNCTION fn_validate_resource_calendar();
    `,
  },
  {
    name: '0020_resource_planning_demo_fixture_alignment',
    sql: `
      UPDATE md_equipment SET planning_resource_flag = TRUE
      WHERE code IN ('EQ-MOLD-HYD01','EQ-MOLD-HYD02');
      UPDATE md_resource_calendar SET calendar_date = '2026-08-05', available_minutes = 540, availability_status = 'Available'
      WHERE code = 'CAL-WC-VULCAN-MOLD-2026';
      UPDATE md_operation_skill_requirement SET required_persons = 2
      WHERE code = 'REQ-OP-MOLD-SKILL';
    `,
  },
  {
    name: '0021_correct_resource_hierarchy_shopfloors',
    sql: `
      CREATE TABLE IF NOT EXISTS md_resource_numbering_daily (
        prefix VARCHAR(10) NOT NULL,
        number_date DATE NOT NULL,
        current_value BIGINT NOT NULL CHECK (current_value > 0),
        PRIMARY KEY (prefix, number_date)
      );
      CREATE TABLE IF NOT EXISTS md_shopfloor (
        master_id UUID PRIMARY KEY,
        code VARCHAR(50) NOT NULL UNIQUE,
        name JSONB NOT NULL,
        description JSONB,
        version_no INTEGER NOT NULL DEFAULT 1,
        site_id UUID NOT NULL REFERENCES md_site(master_id),
        lifecycle_status master_lifecycle_status NOT NULL DEFAULT 'Draft',
        effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        effective_to TIMESTAMPTZ,
        created_by UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by UUID,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        row_version INTEGER NOT NULL DEFAULT 1,
        attributes JSONB NOT NULL DEFAULT '{}'::jsonb
      );
      ALTER TABLE md_work_center ADD COLUMN IF NOT EXISTS shopfloor_id UUID;
      ALTER TABLE md_workstation ADD COLUMN IF NOT EXISTS shopfloor_id UUID;
      ALTER TABLE md_workstation ADD COLUMN IF NOT EXISTS machine_requirement_flag BOOLEAN NOT NULL DEFAULT TRUE;
      UPDATE md_shopfloor sf SET name = a.name, description = a.description, site_id = a.site_id,
        lifecycle_status = a.lifecycle_status, effective_from = a.effective_from, created_by = a.created_by,
        updated_at = a.updated_at, row_version = a.row_version
      FROM md_production_area a WHERE a.master_id = sf.master_id;
      INSERT INTO md_shopfloor (master_id, code, name, description, site_id, lifecycle_status, effective_from, created_by, attributes)
      SELECT master_id, code, name, description, site_id, lifecycle_status, effective_from, created_by, attributes
      FROM md_production_area
      ON CONFLICT (master_id) DO NOTHING;
      UPDATE md_work_center SET shopfloor_id = area_id WHERE shopfloor_id IS NULL;
      UPDATE md_workstation ws SET shopfloor_id = wc.shopfloor_id, site_id = wc.site_id, area_id = wc.area_id
      FROM md_work_center wc WHERE wc.master_id = ws.work_center_id AND ws.work_center_id IS NOT NULL;
      ALTER TABLE md_work_center ADD CONSTRAINT fk_md_work_center_shopfloor FOREIGN KEY (shopfloor_id) REFERENCES md_shopfloor(master_id);
      ALTER TABLE md_workstation ADD CONSTRAINT fk_md_workstation_shopfloor FOREIGN KEY (shopfloor_id) REFERENCES md_shopfloor(master_id);
      CREATE INDEX IF NOT EXISTS ix_md_shopfloor_site ON md_shopfloor(site_id, code);
      CREATE INDEX IF NOT EXISTS ix_md_work_center_shopfloor ON md_work_center(shopfloor_id, code);
      CREATE INDEX IF NOT EXISTS ix_md_workstation_work_center ON md_workstation(work_center_id, code);
    `,
  },
  {
    name: '0022_shopfloor_version_compatibility',
    sql: `ALTER TABLE md_shopfloor ADD COLUMN IF NOT EXISTS version_no INTEGER NOT NULL DEFAULT 1;`,
  },
  {
    name: '0023_workstation_machine_groups_and_units',
    sql: `
      ALTER TABLE md_equipment ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE md_equipment ADD CONSTRAINT ck_md_equipment_quantity CHECK (quantity >= 1);
      CREATE TABLE IF NOT EXISTS md_machine_unit (
        machine_unit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        machine_id UUID NOT NULL REFERENCES md_equipment(master_id),
        code VARCHAR(100) NOT NULL UNIQUE,
        unit_sequence INTEGER NOT NULL CHECK (unit_sequence >= 1),
        serial_number VARCHAR(100),
        execution_status VARCHAR(30) NOT NULL DEFAULT 'Available' CHECK (execution_status IN ('Available','Maintenance','OutOfService')),
        active_flag BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (machine_id, unit_sequence)
      );
      INSERT INTO md_machine_unit (machine_id, code, unit_sequence, execution_status, active_flag)
      SELECT eq.master_id, eq.code || '-01', 1, eq.execution_status, eq.active_flag
      FROM md_equipment eq
      WHERE NOT EXISTS (SELECT 1 FROM md_machine_unit mu WHERE mu.machine_id = eq.master_id);
      CREATE TABLE IF NOT EXISTS md_workstation_machine_group (
        master_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(50) NOT NULL UNIQUE,
        name JSONB NOT NULL,
        description JSONB,
        version_no INTEGER NOT NULL DEFAULT 1,
        lifecycle_status master_lifecycle_status NOT NULL DEFAULT 'Draft',
        effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        effective_to TIMESTAMPTZ,
        created_by UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by UUID,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        row_version INTEGER NOT NULL DEFAULT 1,
        attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
        site_id UUID NOT NULL REFERENCES md_site(master_id),
        shopfloor_id UUID NOT NULL REFERENCES md_shopfloor(master_id),
        work_center_id UUID NOT NULL REFERENCES md_work_center(master_id),
        workstation_id UUID NOT NULL REFERENCES md_workstation(master_id),
        group_type VARCHAR(50),
        minimum_required_machines INTEGER NOT NULL DEFAULT 1 CHECK (minimum_required_machines >= 1),
        maximum_concurrent_jobs INTEGER NOT NULL DEFAULT 1 CHECK (maximum_concurrent_jobs >= 1),
        CHECK (effective_to IS NULL OR effective_to > effective_from)
      );
      INSERT INTO md_workstation_machine_group
        (master_id, code, name, description, site_id, shopfloor_id, work_center_id, workstation_id, lifecycle_status, effective_from, created_by)
      SELECT gen_random_uuid(), 'MG-LEGACY-' || LEFT(ws.master_id::text, 8),
        jsonb_build_object('vi', 'Nhóm máy mặc định', 'en', 'Default machine group', 'ja', '既定のマシングループ', 'ko', '기본 머신 그룹'),
        jsonb_build_object('vi', 'Nhóm được tạo từ dữ liệu gán máy cũ', 'en', 'Migrated from the legacy machine assignment', 'ja', '旧マシン割当から移行', 'ko', '기존 머신 할당에서 마이그레이션'),
        ws.site_id, ws.shopfloor_id, ws.work_center_id, ws.master_id, 'Released', MIN(ra.effective_from), (array_agg(ra.created_by ORDER BY ra.effective_from))[1]
      FROM md_workstation ws JOIN md_resource_assignment ra ON ra.workstation_id = ws.master_id AND ra.equipment_id IS NOT NULL
      WHERE NOT EXISTS (SELECT 1 FROM md_workstation_machine_group mg WHERE mg.workstation_id = ws.master_id)
      GROUP BY ws.master_id, ws.site_id, ws.shopfloor_id, ws.work_center_id;
      ALTER TABLE md_resource_assignment ADD COLUMN IF NOT EXISTS machine_group_id UUID REFERENCES md_workstation_machine_group(master_id);
      ALTER TABLE md_resource_assignment ADD COLUMN IF NOT EXISTS machine_unit_id UUID REFERENCES md_machine_unit(machine_unit_id);
      ALTER TABLE md_resource_assignment ADD COLUMN IF NOT EXISTS requirement_type VARCHAR(20) NOT NULL DEFAULT 'Required';
      ALTER TABLE md_resource_assignment ADD COLUMN IF NOT EXISTS sequence_no INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE md_resource_assignment ADD CONSTRAINT ck_md_resource_assignment_requirement_type CHECK (requirement_type IN ('Required','Optional'));
      CREATE INDEX IF NOT EXISTS ix_md_machine_unit_machine ON md_machine_unit(machine_id, active_flag, execution_status);
      CREATE INDEX IF NOT EXISTS ix_md_machine_group_workstation ON md_workstation_machine_group(workstation_id, lifecycle_status, effective_from);
      CREATE INDEX IF NOT EXISTS ix_md_resource_assignment_machine_group ON md_resource_assignment(machine_group_id, effective_from, effective_to);
      UPDATE md_resource_assignment ra SET machine_group_id = mg.master_id,
        machine_unit_id = COALESCE(ra.machine_unit_id, (SELECT mu.machine_unit_id FROM md_machine_unit mu WHERE mu.machine_id = ra.equipment_id AND mu.unit_sequence = 1)),
        requirement_type = 'Required'
      FROM md_workstation_machine_group mg
      WHERE ra.workstation_id = mg.workstation_id AND ra.equipment_id IS NOT NULL AND ra.machine_group_id IS NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS ux_md_group_active_primary ON md_resource_assignment(machine_group_id)
        WHERE machine_group_id IS NOT NULL AND assignment_role = 'Primary' AND effective_to IS NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS ux_md_group_active_member ON md_resource_assignment(machine_group_id, COALESCE(machine_unit_id, equipment_id))
        WHERE machine_group_id IS NOT NULL AND effective_to IS NULL;
    `,
  },
  {
    name: '0024_resource_crud_capabilities_and_skill_scopes',
    sql: `
      CREATE TABLE IF NOT EXISTS md_workstation_machine_requirement (
        requirement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        machine_group_id UUID NOT NULL REFERENCES md_workstation_machine_group(master_id) ON DELETE CASCADE,
        machine_id UUID NOT NULL REFERENCES md_equipment(master_id),
        role VARCHAR(20) NOT NULL CHECK (role IN ('Primary','Supporting')),
        required_quantity INTEGER NOT NULL DEFAULT 1 CHECK (required_quantity >= 1),
        requirement_type VARCHAR(20) NOT NULL DEFAULT 'Required' CHECK (requirement_type IN ('Required','Optional')),
        pinned_machine_unit_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        sequence_no INTEGER NOT NULL DEFAULT 1 CHECK (sequence_no >= 1),
        effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        effective_to TIMESTAMPTZ,
        active_flag BOOLEAN NOT NULL DEFAULT TRUE,
        created_by UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by UUID,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ended_by UUID,
        ended_at TIMESTAMPTZ,
        CHECK (effective_to IS NULL OR effective_to > effective_from),
        CHECK (jsonb_typeof(pinned_machine_unit_ids) = 'array')
      );
      CREATE UNIQUE INDEX IF NOT EXISTS ux_md_machine_requirement_active
        ON md_workstation_machine_requirement(machine_group_id, machine_id, role, sequence_no)
        WHERE active_flag = TRUE AND effective_to IS NULL;
      CREATE INDEX IF NOT EXISTS ix_md_machine_requirement_machine
        ON md_workstation_machine_requirement(machine_id, active_flag, effective_to);
      INSERT INTO md_workstation_machine_requirement
        (machine_group_id, machine_id, role, required_quantity, requirement_type, pinned_machine_unit_ids, sequence_no, effective_from, effective_to, created_by)
      SELECT ra.machine_group_id, ra.equipment_id, ra.assignment_role, 1, ra.requirement_type,
             CASE WHEN ra.machine_unit_id IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(ra.machine_unit_id::text) END,
             ra.sequence_no, ra.effective_from, ra.effective_to, ra.created_by
      FROM md_resource_assignment ra
      WHERE ra.machine_group_id IS NOT NULL AND ra.equipment_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM md_workstation_machine_requirement r
          WHERE r.machine_group_id = ra.machine_group_id AND r.machine_id = ra.equipment_id
            AND r.role = ra.assignment_role AND r.sequence_no = ra.sequence_no
        );

      CREATE TABLE IF NOT EXISTS md_workstation_operation_capability (
        capability_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workstation_id UUID NOT NULL REFERENCES md_workstation(master_id) ON DELETE CASCADE,
        operation_id UUID NOT NULL REFERENCES md_operation(master_id),
        cycle_time_sec NUMERIC(12,3) NOT NULL CHECK (cycle_time_sec > 0),
        setup_time_min NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (setup_time_min >= 0),
        base_quantity NUMERIC(18,6) NOT NULL DEFAULT 1 CHECK (base_quantity > 0),
        efficiency_factor NUMERIC(7,4) NOT NULL DEFAULT 1 CHECK (efficiency_factor > 0),
        scheduling_mode VARCHAR(30) NOT NULL DEFAULT 'Finite',
        effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        effective_to TIMESTAMPTZ,
        active_flag BOOLEAN NOT NULL DEFAULT TRUE,
        created_by UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by UUID,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (effective_to IS NULL OR effective_to > effective_from),
        UNIQUE (workstation_id, operation_id, effective_from)
      );
      CREATE INDEX IF NOT EXISTS ix_md_ws_capability_resolution
        ON md_workstation_operation_capability(workstation_id, operation_id, active_flag, effective_from);

      CREATE TABLE IF NOT EXISTS md_skill_group (
        skill_group_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(80) NOT NULL UNIQUE,
        name JSONB NOT NULL,
        description JSONB,
        scope_type VARCHAR(20) NOT NULL DEFAULT 'Employee' CHECK (scope_type IN ('Machine','Workstation','WorkCenter','Employee')),
        lifecycle_status VARCHAR(20) NOT NULL DEFAULT 'Draft',
        created_by UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by UUID,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE md_skill ADD COLUMN IF NOT EXISTS skill_group_id UUID REFERENCES md_skill_group(skill_group_id);
      ALTER TABLE md_skill ADD COLUMN IF NOT EXISTS scope_type VARCHAR(20) NOT NULL DEFAULT 'Employee';
      ALTER TABLE md_skill ADD CONSTRAINT ck_md_skill_scope_type CHECK (scope_type IN ('Machine','Workstation','WorkCenter','Employee'));
      CREATE TABLE IF NOT EXISTS md_resource_skill_assignment (
        assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        resource_type VARCHAR(20) NOT NULL CHECK (resource_type IN ('Machine','Workstation','WorkCenter')),
        resource_id UUID NOT NULL,
        skill_id UUID NOT NULL REFERENCES md_skill(master_id),
        minimum_level VARCHAR(10) NOT NULL DEFAULT 'Basic',
        required_flag BOOLEAN NOT NULL DEFAULT TRUE,
        effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        effective_to TIMESTAMPTZ,
        active_flag BOOLEAN NOT NULL DEFAULT TRUE,
        created_by UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by UUID,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ended_by UUID,
        ended_at TIMESTAMPTZ,
        CHECK (effective_to IS NULL OR effective_to > effective_from),
        UNIQUE (resource_type, resource_id, skill_id, effective_from)
      );
      CREATE INDEX IF NOT EXISTS ix_md_resource_skill_assignment_lookup
        ON md_resource_skill_assignment(resource_type, resource_id, active_flag, effective_to);
      INSERT INTO md_skill_group (code, name, created_by)
      SELECT 'LEGACY', jsonb_build_object('vi','Kỹ năng cũ','en','Legacy skills','ja','レガシースキル','ko','레거시 기술'), '00000000-0000-0000-0000-000000000001'
      WHERE NOT EXISTS (SELECT 1 FROM md_skill_group WHERE code = 'LEGACY');
      UPDATE md_skill SET skill_group_id = (SELECT skill_group_id FROM md_skill_group WHERE code = 'LEGACY') WHERE skill_group_id IS NULL;
      CREATE INDEX IF NOT EXISTS ix_md_skill_scope ON md_skill(scope_type, lifecycle_status);
    `,
  },
  {
    name: '0025_work_center_composition_and_code_reservations',
    sql: `
      CREATE TABLE IF NOT EXISTS md_work_center_composition (
        composition_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        work_center_id UUID NOT NULL REFERENCES md_work_center(master_id) ON DELETE CASCADE,
        workstation_id UUID NOT NULL REFERENCES md_workstation(master_id),
        operation_id UUID NOT NULL REFERENCES md_operation(master_id),
        effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        effective_to TIMESTAMPTZ,
        active_flag BOOLEAN NOT NULL DEFAULT TRUE,
        created_by UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by UUID,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ended_by UUID,
        ended_at TIMESTAMPTZ,
        CHECK (effective_to IS NULL OR effective_to > effective_from),
        UNIQUE (work_center_id, workstation_id, operation_id, effective_from)
      );
      CREATE INDEX IF NOT EXISTS ix_md_work_center_composition_lookup
        ON md_work_center_composition(work_center_id, active_flag, effective_to);
      CREATE TABLE IF NOT EXISTS md_business_code_reservation (
        reservation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_type VARCHAR(40) NOT NULL,
        prefix VARCHAR(10) NOT NULL,
        code VARCHAR(100) NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ,
        created_by UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS ix_md_code_reservation_active
        ON md_business_code_reservation(entity_type, expires_at) WHERE consumed_at IS NULL;
    `,
  },
  {
    name: '0026_canonical_skill_scope_and_legacy_cleanup_support',
    sql: `
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'md_skill_group' AND column_name = 'scope_type')
           AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'md_skill_group' AND column_name = 'scope') THEN
          ALTER TABLE md_skill_group RENAME COLUMN scope_type TO scope;
        ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'md_skill_group' AND column_name = 'scope_type')
           AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'md_skill_group' AND column_name = 'scope') THEN
          UPDATE md_skill_group SET scope = COALESCE(NULLIF(scope, ''), scope_type);
          ALTER TABLE md_skill_group DROP COLUMN scope_type;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'md_skill' AND column_name = 'scope_type')
           AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'md_skill' AND column_name = 'scope') THEN
          ALTER TABLE md_skill RENAME COLUMN scope_type TO scope;
        ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'md_skill' AND column_name = 'scope_type')
           AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'md_skill' AND column_name = 'scope') THEN
          UPDATE md_skill SET scope = COALESCE(NULLIF(scope, ''), scope_type);
          ALTER TABLE md_skill DROP COLUMN scope_type;
        END IF;
      END $$;
      ALTER TABLE md_skill_group ADD COLUMN IF NOT EXISTS scope VARCHAR(20) NOT NULL DEFAULT 'Employee';
      ALTER TABLE md_skill ADD COLUMN IF NOT EXISTS scope VARCHAR(20) NOT NULL DEFAULT 'Employee';
      ALTER TABLE md_skill_group ADD COLUMN IF NOT EXISTS legacy_flag BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE md_skill ADD COLUMN IF NOT EXISTS legacy_flag BOOLEAN NOT NULL DEFAULT FALSE;
      UPDATE md_skill_group SET scope = 'Employee' WHERE scope IS NULL OR scope NOT IN ('Machine','Workstation','WorkCenter','Employee');
      UPDATE md_skill SET scope = 'Employee' WHERE scope IS NULL OR scope NOT IN ('Machine','Workstation','WorkCenter','Employee');
      UPDATE md_skill_group SET legacy_flag = TRUE WHERE code = 'LEGACY' OR scope = 'Employee';
      UPDATE md_skill SET legacy_flag = TRUE WHERE code LIKE 'SK_%' AND (skill_group_id IS NULL OR scope = 'Employee');
      CREATE TABLE IF NOT EXISTS md_legacy_skill_migration_map (
        mapping_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        legacy_skill_id UUID NOT NULL,
        target_scope VARCHAR(20) NOT NULL CHECK (target_scope IN ('Machine','Workstation','WorkCenter','Employee')),
        new_skill_id UUID NOT NULL REFERENCES md_skill(master_id),
        migrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (legacy_skill_id, target_scope)
      );
      CREATE INDEX IF NOT EXISTS ix_md_skill_scope_active ON md_skill(scope, lifecycle_status, legacy_flag);
      CREATE INDEX IF NOT EXISTS ix_md_skill_group_scope_active ON md_skill_group(scope, lifecycle_status, legacy_flag);
      CREATE UNIQUE INDEX IF NOT EXISTS ux_md_skill_active_business_name
        ON md_skill(skill_group_id, scope, lower(COALESCE(name->>'vi', name->>'en', name->>'ja', name->>'ko')))
        WHERE legacy_flag = FALSE AND lifecycle_status NOT IN ('Inactive','Obsolete');
      CREATE UNIQUE INDEX IF NOT EXISTS ux_md_skill_group_active_business_name
        ON md_skill_group(scope, lower(COALESCE(name->>'vi', name->>'en', name->>'ja', name->>'ko')))
        WHERE legacy_flag = FALSE AND lifecycle_status NOT IN ('Inactive','Obsolete');
    `,
  },
  {
    name: '0027_worker_skill_assignment_history',
    sql: `
      ALTER TABLE md_employee_skill ADD COLUMN IF NOT EXISTS effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW();
      ALTER TABLE md_employee_skill ADD COLUMN IF NOT EXISTS effective_to TIMESTAMPTZ;
      ALTER TABLE md_employee_skill ADD COLUMN IF NOT EXISTS active_flag BOOLEAN NOT NULL DEFAULT TRUE;
      ALTER TABLE md_employee_skill ADD COLUMN IF NOT EXISTS qualification_status VARCHAR(20) NOT NULL DEFAULT 'Active';
      ALTER TABLE md_employee_skill ADD COLUMN IF NOT EXISTS certificate_code VARCHAR(100);
      ALTER TABLE md_employee_skill ADD COLUMN IF NOT EXISTS certified_at TIMESTAMPTZ;
      ALTER TABLE md_employee_skill ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
      ALTER TABLE md_employee_skill ADD COLUMN IF NOT EXISTS ended_by UUID;
      ALTER TABLE md_employee_skill ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
      ALTER TABLE md_employee_skill DROP CONSTRAINT IF EXISTS md_employee_skill_pkey;
      ALTER TABLE md_employee_skill ADD CONSTRAINT md_employee_skill_pkey PRIMARY KEY (employee_id, skill_id, effective_from);
      ALTER TABLE md_employee_skill ADD CONSTRAINT ck_md_employee_skill_dates CHECK (effective_to IS NULL OR effective_to > effective_from);
      ALTER TABLE md_employee_skill ADD CONSTRAINT ck_md_employee_skill_qualification CHECK (qualification_status IN ('Active','Expired','Suspended','Pending'));
      CREATE UNIQUE INDEX IF NOT EXISTS ux_md_employee_skill_active
        ON md_employee_skill(employee_id, skill_id) WHERE active_flag = TRUE AND effective_to IS NULL;
      CREATE INDEX IF NOT EXISTS ix_md_employee_skill_skill_active
        ON md_employee_skill(skill_id, active_flag, effective_to);
    `,
  },
  {
    name: '0028_skill_definition_description',
    sql: `
      ALTER TABLE md_skill ADD COLUMN IF NOT EXISTS description JSONB;
    `,
  },
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
