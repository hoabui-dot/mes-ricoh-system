DO $$ BEGIN
  ALTER TYPE wo_status ADD VALUE IF NOT EXISTS 'ResourceHold';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS rm_production_line (
  master_id uuid PRIMARY KEY,
  code varchar(50) NOT NULL,
  name jsonb NOT NULL DEFAULT '{"vi":""}'::jsonb,
  site_id uuid NOT NULL,
  area_id uuid,
  shopfloor_id uuid,
  line_type varchar(30),
  active_flag boolean NOT NULL DEFAULT true,
  lifecycle_status varchar(30) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rm_production_line_work_center (
  master_id uuid PRIMARY KEY,
  production_line_id uuid NOT NULL,
  work_center_id uuid NOT NULL,
  site_id uuid NOT NULL,
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  active_flag boolean NOT NULL DEFAULT true,
  lifecycle_status varchar(30) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_rm_line_wc_line_active
  ON rm_production_line_work_center(production_line_id, work_center_id, effective_from, effective_to)
  WHERE active_flag = true AND lifecycle_status = 'Released';

CREATE TABLE IF NOT EXISTS rm_production_version_line_eligibility (
  master_id uuid PRIMARY KEY,
  production_version_id uuid NOT NULL,
  production_line_id uuid NOT NULL,
  selection_role varchar(20) NOT NULL CHECK (selection_role IN ('PRIMARY','BACKUP')),
  priority integer NOT NULL DEFAULT 100,
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  active_flag boolean NOT NULL DEFAULT true,
  lifecycle_status varchar(30) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_rm_pv_line_eligibility_effective
  ON rm_production_version_line_eligibility(production_version_id, selection_role, priority, production_line_id)
  WHERE active_flag = true AND lifecycle_status = 'Released';

ALTER TABLE wo_header
  ADD COLUMN IF NOT EXISTS selected_production_line_id uuid,
  ADD COLUMN IF NOT EXISTS selected_production_line_code varchar(50),
  ADD COLUMN IF NOT EXISTS selected_production_line_name_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS line_selection_mode varchar(30) NOT NULL DEFAULT 'LEGACY_NOT_EVALUATED',
  ADD COLUMN IF NOT EXISTS line_selection_status varchar(30) NOT NULL DEFAULT 'NOT_EVALUATED',
  ADD COLUMN IF NOT EXISTS line_selection_reason text,
  ADD COLUMN IF NOT EXISTS fallback_reason text,
  ADD COLUMN IF NOT EXISTS resource_hold_reason jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS evaluated_line_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS line_locked_at timestamptz;

ALTER TABLE wo_operation
  ADD COLUMN IF NOT EXISTS production_line_id uuid,
  ADD COLUMN IF NOT EXISTS production_line_code varchar(50),
  ADD COLUMN IF NOT EXISTS production_line_name_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source_routing_work_center_id uuid;

ALTER TABLE wo_resource_allocation
  ADD COLUMN IF NOT EXISTS planned_production_line_id uuid;
CREATE INDEX IF NOT EXISTS ix_wo_resource_allocation_line
  ON wo_resource_allocation(wo_id, planned_production_line_id, status);

ALTER TABLE wo_capacity_reservation
  ADD COLUMN IF NOT EXISTS production_line_id uuid;
CREATE INDEX IF NOT EXISTS ix_wo_capacity_reservation_line
  ON wo_capacity_reservation(wo_id, production_line_id, status);

CREATE TABLE IF NOT EXISTS wo_line_selection_audit (
  audit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id uuid NOT NULL REFERENCES wo_header(wo_id) ON DELETE CASCADE,
  previous_production_line_id uuid,
  new_production_line_id uuid,
  action varchar(40) NOT NULL,
  actor_user_id uuid NOT NULL,
  reason text,
  evaluated_line_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  wo_row_version integer,
  trace_id text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_wo_line_selection_audit_wo
  ON wo_line_selection_audit(wo_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION fn_validate_wo_line_consistency()
RETURNS trigger AS $$
DECLARE
  selected_line uuid;
  selected_status text;
BEGIN
  SELECT selected_production_line_id, line_selection_status
    INTO selected_line, selected_status
    FROM wo_header
   WHERE wo_id = NEW.wo_id;

  IF TG_TABLE_NAME = 'wo_operation' THEN
    IF selected_line IS NOT NULL AND NEW.production_line_id IS DISTINCT FROM selected_line THEN
      RAISE EXCEPTION 'WO_LINE_OPERATION_MISMATCH' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'wo_resource_allocation' THEN
    IF selected_status = 'RESOURCE_HOLD' THEN
      RAISE EXCEPTION 'WO_LINE_RESOURCE_HOLD' USING ERRCODE = '23514';
    END IF;
    IF selected_line IS NOT NULL AND NEW.planned_production_line_id IS DISTINCT FROM selected_line THEN
      RAISE EXCEPTION 'WO_LINE_MIXED_ALLOCATION_REJECTED' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'wo_capacity_reservation' THEN
    IF selected_line IS NOT NULL AND NEW.production_line_id IS DISTINCT FROM selected_line THEN
      RAISE EXCEPTION 'WO_LINE_MIXED_RESERVATION_REJECTED' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wo_operation_line_consistency ON wo_operation;
CREATE TRIGGER trg_wo_operation_line_consistency
  BEFORE INSERT OR UPDATE OF production_line_id, wo_id ON wo_operation
  FOR EACH ROW EXECUTE FUNCTION fn_validate_wo_line_consistency();

DROP TRIGGER IF EXISTS trg_wo_resource_allocation_line_consistency ON wo_resource_allocation;
CREATE TRIGGER trg_wo_resource_allocation_line_consistency
  BEFORE INSERT OR UPDATE OF planned_production_line_id, wo_id ON wo_resource_allocation
  FOR EACH ROW EXECUTE FUNCTION fn_validate_wo_line_consistency();

DROP TRIGGER IF EXISTS trg_wo_capacity_reservation_line_consistency ON wo_capacity_reservation;
CREATE TRIGGER trg_wo_capacity_reservation_line_consistency
  BEFORE INSERT OR UPDATE OF production_line_id, wo_id ON wo_capacity_reservation
  FOR EACH ROW EXECUTE FUNCTION fn_validate_wo_line_consistency();
