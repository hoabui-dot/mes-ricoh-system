ALTER TABLE rm_routing_operation
  ADD COLUMN IF NOT EXISTS planning_mode varchar(30) NOT NULL DEFAULT 'INHERITED',
  ADD COLUMN IF NOT EXISTS resolved_source varchar(40),
  ADD COLUMN IF NOT EXISTS resolved_base_quantity numeric(18,6),
  ADD COLUMN IF NOT EXISTS resolved_setup_time_min numeric(12,3),
  ADD COLUMN IF NOT EXISTS resolved_cycle_time_sec numeric(12,3),
  ADD COLUMN IF NOT EXISTS resolved_required_workers integer,
  ADD COLUMN IF NOT EXISTS resolved_efficiency_factor numeric(8,4),
  ADD COLUMN IF NOT EXISTS resolved_standard_yield numeric(8,4);
