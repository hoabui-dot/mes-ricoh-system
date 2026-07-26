-- Phase 3: execution-owned planning allocations and capacity occupancy.
ALTER TABLE wo_operation ADD COLUMN IF NOT EXISTS routing_operation_id uuid;
CREATE INDEX IF NOT EXISTS ix_wo_operation_routing_operation ON wo_operation(routing_operation_id);
CREATE TABLE IF NOT EXISTS wo_resource_allocation (
  allocation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id uuid NOT NULL REFERENCES wo_header(wo_id) ON DELETE CASCADE,
  wo_operation_id uuid NOT NULL REFERENCES wo_operation(wo_operation_id) ON DELETE CASCADE,
  site_id uuid NOT NULL,
  planned_work_center_id uuid NOT NULL,
  planned_workstation_id uuid,
  planned_equipment_id uuid,
  planned_shift_id uuid NOT NULL,
  planned_start_at timestamptz NOT NULL,
  planned_end_at timestamptz NOT NULL,
  source varchar(30) NOT NULL CHECK (source IN ('PlannerSelected','SystemRecommended','ManualOverride','Reallocation')),
  status varchar(20) NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Validated','Committed','Superseded','Cancelled')),
  validation_status varchar(25) NOT NULL DEFAULT 'Valid' CHECK (validation_status IN ('Valid','ValidWithWarnings','Invalid','Stale')),
  resource_assignment_id uuid,
  resource_capability_id uuid,
  production_standard_id uuid,
  resource_calendar_id uuid,
  candidate_rank integer,
  recommendation_score numeric(12,4),
  setup_time_min numeric(12,3) NOT NULL DEFAULT 0,
  run_time_min numeric(12,3) NOT NULL DEFAULT 0,
  queue_time_min numeric(12,3) NOT NULL DEFAULT 0,
  move_time_min numeric(12,3) NOT NULL DEFAULT 0,
  total_duration_min numeric(12,3) NOT NULL DEFAULT 0,
  warning_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  allocated_by uuid NOT NULL,
  allocated_at timestamptz NOT NULL DEFAULT now(),
  superseded_by_allocation_id uuid REFERENCES wo_resource_allocation(allocation_id),
  change_reason text,
  row_version integer NOT NULL DEFAULT 1,
  UNIQUE (allocation_id, wo_operation_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_wo_active_resource_allocation
  ON wo_resource_allocation(wo_operation_id) WHERE status IN ('Draft','Validated','Committed');
CREATE INDEX IF NOT EXISTS ix_wo_resource_allocation_wo ON wo_resource_allocation(wo_id, status);
CREATE INDEX IF NOT EXISTS ix_wo_resource_allocation_resource_window ON wo_resource_allocation(planned_equipment_id, planned_start_at, planned_end_at) WHERE status = 'Committed';

CREATE TABLE IF NOT EXISTS wo_capacity_reservation (
  reservation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id uuid NOT NULL REFERENCES wo_resource_allocation(allocation_id) ON DELETE CASCADE,
  wo_id uuid NOT NULL REFERENCES wo_header(wo_id) ON DELETE CASCADE,
  wo_operation_id uuid NOT NULL REFERENCES wo_operation(wo_operation_id) ON DELETE CASCADE,
  resource_type varchar(20) NOT NULL CHECK (resource_type IN ('WorkCenter','Workstation','Equipment')),
  resource_id uuid NOT NULL,
  shift_id uuid NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  capacity_units numeric(12,3) NOT NULL DEFAULT 1 CHECK (capacity_units > 0),
  status varchar(20) NOT NULL DEFAULT 'Committed' CHECK (status IN ('Tentative','Committed','Released','Cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);
CREATE INDEX IF NOT EXISTS ix_wo_capacity_reservation_resource_window ON wo_capacity_reservation(resource_type, resource_id, start_at, end_at) WHERE status IN ('Tentative','Committed');
CREATE INDEX IF NOT EXISTS ix_wo_capacity_reservation_wo ON wo_capacity_reservation(wo_id, status);

CREATE TABLE IF NOT EXISTS wo_resource_allocation_audit (
  audit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id uuid NOT NULL,
  wo_id uuid NOT NULL REFERENCES wo_header(wo_id) ON DELETE CASCADE,
  wo_operation_id uuid NOT NULL REFERENCES wo_operation(wo_operation_id) ON DELETE CASCADE,
  action varchar(30) NOT NULL,
  previous_allocation_id uuid,
  new_allocation_id uuid,
  actor_user_id uuid NOT NULL,
  change_reason text,
  candidate_rank integer,
  validation_status varchar(25),
  warning_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  trace_id text,
  wo_row_version integer,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_wo_resource_allocation_audit_wo ON wo_resource_allocation_audit(wo_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS wo_resource_allocation_idempotency (
  idempotency_key text NOT NULL,
  user_id text NOT NULL,
  request_hash text NOT NULL,
  allocation_id uuid NOT NULL,
  response_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, idempotency_key)
);
