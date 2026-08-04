ALTER TABLE rm_item_revision
  ADD COLUMN IF NOT EXISTS base_uom_code varchar(50);
