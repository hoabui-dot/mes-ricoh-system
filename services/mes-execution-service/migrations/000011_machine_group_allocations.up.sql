-- Phase 4 resource combination support: preserve the selected group and reserve every required unit.
ALTER TABLE wo_resource_allocation ADD COLUMN IF NOT EXISTS planned_machine_group_id uuid;
ALTER TABLE wo_resource_allocation ADD COLUMN IF NOT EXISTS planned_primary_machine_unit_id uuid;
ALTER TABLE wo_resource_allocation ADD COLUMN IF NOT EXISTS planned_supporting_machine_units jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE wo_capacity_reservation DROP CONSTRAINT IF EXISTS wo_capacity_reservation_resource_type_check;
ALTER TABLE wo_capacity_reservation ADD CONSTRAINT wo_capacity_reservation_resource_type_check CHECK (resource_type IN ('WorkCenter','Workstation','Equipment','MachineUnit'));
CREATE INDEX IF NOT EXISTS ix_wo_resource_allocation_machine_group ON wo_resource_allocation(planned_machine_group_id);
