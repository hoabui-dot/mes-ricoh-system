ALTER TABLE rm_item_revision ADD COLUMN IF NOT EXISTS name jsonb NOT NULL DEFAULT '{"vi":""}'::jsonb;
ALTER TABLE rm_mbom_header ADD COLUMN IF NOT EXISTS name jsonb NOT NULL DEFAULT '{"vi":""}'::jsonb;
ALTER TABLE rm_work_center ADD COLUMN IF NOT EXISTS name jsonb NOT NULL DEFAULT '{"vi":""}'::jsonb;
ALTER TABLE rm_equipment ADD COLUMN IF NOT EXISTS name jsonb NOT NULL DEFAULT '{"vi":""}'::jsonb;
