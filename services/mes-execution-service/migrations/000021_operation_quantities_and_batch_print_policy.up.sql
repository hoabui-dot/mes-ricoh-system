ALTER TABLE rm_routing_operation
  ADD COLUMN IF NOT EXISTS units_per_label numeric(18,6),
  ADD COLUMN IF NOT EXISTS label_quantity_method varchar(40) NOT NULL DEFAULT 'CEIL_BY_UNITS_PER_LABEL',
  ADD COLUMN IF NOT EXISTS copies_per_label integer NOT NULL DEFAULT 1;

ALTER TABLE wo_operation
  ADD COLUMN IF NOT EXISTS operation_cycle_count numeric(18,6) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS expected_good_quantity numeric(18,6) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS requires_output_label boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS units_per_label numeric(18,6),
  ADD COLUMN IF NOT EXISTS label_quantity_method varchar(40) NOT NULL DEFAULT 'CEIL_BY_UNITS_PER_LABEL',
  ADD COLUMN IF NOT EXISTS copies_per_label integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS label_count integer,
  ADD COLUMN IF NOT EXISTS print_copies integer,
  ADD COLUMN IF NOT EXISTS print_status varchar(30) NOT NULL DEFAULT 'NotRequired';

ALTER TABLE wo_print_job
  ADD COLUMN IF NOT EXISTS label_count integer,
  ADD COLUMN IF NOT EXISTS copies_per_label integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_copies integer,
  ADD COLUMN IF NOT EXISTS units_per_label numeric(18,6),
  ADD COLUMN IF NOT EXISTS label_quantity_method varchar(40) NOT NULL DEFAULT 'CEIL_BY_UNITS_PER_LABEL';

CREATE INDEX IF NOT EXISTS ix_wo_operation_print_policy ON wo_operation(wo_id, requires_output_label, print_status);
