CREATE TABLE IF NOT EXISTS rm_item_revision (
  item_revision_id uuid PRIMARY KEY,
  item_code varchar(50) NOT NULL,
  item_name jsonb NOT NULL DEFAULT '{"vi":""}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON TABLE rm_item_revision TO wms_outbound_user;
