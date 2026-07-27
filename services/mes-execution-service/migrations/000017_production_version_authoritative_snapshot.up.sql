ALTER TABLE rm_item_revision ADD COLUMN IF NOT EXISTS base_uom_id uuid;
ALTER TABLE rm_production_version
  ADD COLUMN IF NOT EXISTS name_i18n jsonb NOT NULL DEFAULT '{"vi":"","en":"","ja":"","ko":""}'::jsonb,
  ADD COLUMN IF NOT EXISTS min_lot_size numeric(18,6),
  ADD COLUMN IF NOT EXISTS max_lot_size numeric(18,6);
ALTER TABLE wo_header
  ADD COLUMN IF NOT EXISTS production_version_code varchar(50),
  ADD COLUMN IF NOT EXISTS production_version_name_i18n jsonb,
  ADD COLUMN IF NOT EXISTS item_revision_code varchar(50),
  ADD COLUMN IF NOT EXISTS item_revision_name_i18n jsonb,
  ADD COLUMN IF NOT EXISTS mbom_code varchar(50),
  ADD COLUMN IF NOT EXISTS routing_code varchar(50),
  ADD COLUMN IF NOT EXISTS planning_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
