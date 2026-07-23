ALTER TABLE rm_item_revision ADD COLUMN IF NOT EXISTS name jsonb NOT NULL DEFAULT '{"vi":""}'::jsonb;
ALTER TABLE rm_mbom_header ADD COLUMN IF NOT EXISTS name jsonb NOT NULL DEFAULT '{"vi":""}'::jsonb;

ALTER TABLE md_label_template
  ALTER COLUMN template_name TYPE jsonb
  USING jsonb_build_object('vi', template_name::text);

ALTER TABLE md_label_template
  ADD COLUMN IF NOT EXISTS static_text jsonb NOT NULL DEFAULT '{"vi":""}'::jsonb;
