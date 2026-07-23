-- Initial Schema Migration for mes-traceability-service

CREATE TABLE IF NOT EXISTS md_label_template (
  template_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_code varchar(50) UNIQUE NOT NULL,
  template_name jsonb NOT NULL,
  static_text jsonb NOT NULL DEFAULT '{"vi":""}'::jsonb,
  layout_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS md_numbering_rule (
  rule_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code varchar(50) UNIQUE NOT NULL,
  prefix varchar(20) NOT NULL DEFAULT '',
  date_format varchar(20) NOT NULL DEFAULT 'YYYYMMDD',
  sequence_length integer NOT NULL DEFAULT 4,
  reset_frequency varchar(20) NOT NULL DEFAULT 'DAILY',
  site_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS md_numbering_sequence (
  rule_id uuid NOT NULL REFERENCES md_numbering_rule(rule_id),
  sequence_key varchar(50) NOT NULL,
  current_value integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rule_id, sequence_key)
);

CREATE TABLE IF NOT EXISTS md_qr_split_rule (
  split_rule_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code varchar(50) UNIQUE NOT NULL,
  split_algorithm varchar(30) NOT NULL CHECK (split_algorithm IN ('AREA_BASED', 'MASS_BASED', 'FIXED_COUNT')),
  default_yield_ratio numeric(7,4) NOT NULL DEFAULT 1.0000,
  target_uom_id uuid NOT NULL,
  site_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS md_traceability_policy (
  policy_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_revision_id uuid NOT NULL,
  operation_code varchar(50) NOT NULL,
  tracking_type varchar(30) NOT NULL CHECK (tracking_type IN ('MOTHER_CHILD_QR', 'LOT', 'SERIAL')),
  numbering_rule_id uuid REFERENCES md_numbering_rule(rule_id),
  qr_split_rule_id uuid REFERENCES md_qr_split_rule(split_rule_id),
  label_template_id uuid REFERENCES md_label_template(template_id),
  site_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_policy_item_op UNIQUE (item_revision_id, operation_code)
);

CREATE TABLE IF NOT EXISTS label_instance (
  label_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label_code varchar(100) UNIQUE NOT NULL,
  item_revision_id uuid NOT NULL,
  lot_or_serial_no varchar(50) NOT NULL,
  parent_label_id uuid REFERENCES label_instance(label_id),
  quantity numeric(18,6) NOT NULL CHECK (quantity >= 0),
  uom_id uuid NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CONSUMED', 'SCRAPPED')),
  created_by_operation varchar(50) NOT NULL,
  site_id uuid NOT NULL,
  idempotency_key varchar(100) UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_label_instance_parent ON label_instance(parent_label_id);
CREATE INDEX IF NOT EXISTS idx_label_instance_lot ON label_instance(lot_or_serial_no);

CREATE TABLE IF NOT EXISTS genealogy_event (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label_id uuid NOT NULL REFERENCES label_instance(label_id),
  related_label_id uuid REFERENCES label_instance(label_id),
  relationship_type varchar(30) NOT NULL CHECK (relationship_type IN ('SPLIT_FROM', 'CONSUMED_INTO', 'MERGED_INTO')),
  operation_code varchar(50) NOT NULL,
  wo_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_genealogy_label ON genealogy_event(label_id);
CREATE INDEX IF NOT EXISTS idx_genealogy_related ON genealogy_event(related_label_id);

-- Standard Transactional Outbox Table
CREATE TABLE IF NOT EXISTS outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type varchar(100) NOT NULL,
  topic varchar(100) NOT NULL,
  payload jsonb NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'PENDING',
  retry_count integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events(created_at) WHERE status = 'PENDING';

-- Local Read-Model Projection Tables (rm_*)
CREATE TABLE IF NOT EXISTS rm_item_revision (
  master_id uuid PRIMARY KEY,
  code varchar(50) NOT NULL,
  name jsonb NOT NULL DEFAULT '{"vi":""}'::jsonb,
  revision_code varchar(30) NOT NULL,
  item_type varchar(40),
  site_id uuid NOT NULL,
  lifecycle_status varchar(30) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rm_mbom_header (
  master_id uuid PRIMARY KEY,
  code varchar(50) NOT NULL,
  name jsonb NOT NULL DEFAULT '{"vi":""}'::jsonb,
  item_revision_id uuid NOT NULL,
  site_id uuid NOT NULL,
  base_quantity numeric(18,6) NOT NULL,
  base_uom_id uuid NOT NULL,
  lifecycle_status varchar(30) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rm_mbom_line (
  master_id uuid PRIMARY KEY,
  mbom_header_id uuid NOT NULL,
  parent_line_id uuid,
  seq integer NOT NULL,
  component_revision_id uuid NOT NULL,
  quantity_per numeric(18,6) NOT NULL,
  uom_id uuid NOT NULL,
  phantom_flag boolean NOT NULL DEFAULT false,
  issue_operation_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
