ALTER TABLE wo_material_requirement
  ADD COLUMN IF NOT EXISTS demand_version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS ix_wo_material_requirement_demand_version
  ON wo_material_requirement (requirement_id, demand_version);
