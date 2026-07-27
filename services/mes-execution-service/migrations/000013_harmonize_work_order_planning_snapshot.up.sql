ALTER TABLE rm_production_standard
  ALTER COLUMN item_revision_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS routing_operation_id uuid,
  ADD COLUMN IF NOT EXISTS base_quantity numeric(18,6) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS standard_yield numeric(8,4) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS labor_count integer NOT NULL DEFAULT 1;

ALTER TABLE wo_operation
  ADD COLUMN IF NOT EXISTS base_quantity numeric(18,6) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS standard_yield numeric(8,4) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS required_workers integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS queue_time_min numeric(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS move_time_min numeric(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calculation_version varchar(30) NOT NULL DEFAULT 'routing-standard-v1',
  ADD COLUMN IF NOT EXISTS planning_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS ix_rm_production_standard_routing_resolution
  ON rm_production_standard(routing_operation_id, item_revision_id, lifecycle_status);
