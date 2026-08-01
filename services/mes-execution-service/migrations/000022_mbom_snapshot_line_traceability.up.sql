ALTER TABLE rm_mbom_header
  ADD COLUMN IF NOT EXISTS business_version varchar(30),
  ADD COLUMN IF NOT EXISTS structure_version integer NOT NULL DEFAULT 1;

ALTER TABLE rm_mbom_line
  ADD COLUMN IF NOT EXISTS optional_flag boolean NOT NULL DEFAULT false;

ALTER TABLE wo_material_requirement
  ADD COLUMN IF NOT EXISTS mbom_header_id uuid,
  ADD COLUMN IF NOT EXISTS mbom_version varchar(30),
  ADD COLUMN IF NOT EXISTS mbom_line_id uuid,
  ADD COLUMN IF NOT EXISTS source_parent_line_id uuid,
  ADD COLUMN IF NOT EXISTS quantity_per numeric(18,6),
  ADD COLUMN IF NOT EXISTS scaled_quantity numeric(18,6),
  ADD COLUMN IF NOT EXISTS scrap_rate numeric(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS optional_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS substitute_id uuid,
  ADD COLUMN IF NOT EXISTS actual_component_item_revision_id uuid,
  ADD COLUMN IF NOT EXISTS conversion_factor_used numeric(18,6);

CREATE INDEX IF NOT EXISTS ix_wo_material_requirement_source_line
  ON wo_material_requirement(wo_id, mbom_line_id);
