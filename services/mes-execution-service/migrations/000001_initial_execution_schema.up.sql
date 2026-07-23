DO $$ BEGIN
  CREATE TYPE wo_status AS ENUM (
    'Draft', 'PendingApproval', 'Approved', 'Released', 'InProgress', 'Completed', 'Closed', 'Cancelled'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS wo_header (
  wo_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_code varchar(50) UNIQUE NOT NULL,
  production_version_id uuid NOT NULL,
  item_revision_id uuid NOT NULL,
  item_code varchar(50) NOT NULL,
  item_name varchar(200) NOT NULL,
  quantity numeric(18,3) NOT NULL CHECK (quantity > 0),
  uom_id uuid NOT NULL,
  site_id uuid NOT NULL,
  shift_id uuid,
  planned_start_at timestamptz NOT NULL,
  planned_end_at timestamptz NOT NULL,
  status wo_status NOT NULL DEFAULT 'Draft',
  attached_document_refs jsonb DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS wo_operation (
  wo_operation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id uuid NOT NULL REFERENCES wo_header(wo_id),
  sequence_no integer NOT NULL,
  operation_id uuid NOT NULL,
  operation_code varchar(50) NOT NULL,
  work_center_id uuid NOT NULL,
  equipment_id uuid,
  predecessor_seq varchar(100),
  standard_setup_time_min numeric(12,3),
  standard_cycle_time_sec numeric(12,3),
  standard_efficiency_factor numeric(7,4),
  planned_start_at timestamptz,
  planned_end_at timestamptz,
  status varchar(20) NOT NULL DEFAULT 'Pending',
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS wo_material_requirement (
  requirement_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id uuid NOT NULL REFERENCES wo_header(wo_id),
  component_item_revision_id uuid NOT NULL,
  component_item_code varchar(50) NOT NULL,
  required_qty numeric(18,6) NOT NULL,
  uom_id uuid NOT NULL,
  issue_operation_id uuid,
  backflush_flag boolean NOT NULL DEFAULT false,
  phantom_flag boolean NOT NULL DEFAULT false,
  stock_check_status varchar(20) NOT NULL DEFAULT 'NotChecked'
);

CREATE TABLE IF NOT EXISTS wo_approval_log (
  log_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id uuid NOT NULL REFERENCES wo_header(wo_id),
  action varchar(20) NOT NULL,
  actor_user_id uuid NOT NULL,
  actor_role_code varchar(50),
  comment text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

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
  component_item_code varchar(50),
  quantity_per numeric(18,6) NOT NULL,
  uom_id uuid NOT NULL,
  scrap_rate numeric(8,4) NOT NULL DEFAULT 0,
  issue_operation_id uuid,
  backflush_flag boolean NOT NULL DEFAULT false,
  phantom_flag boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS rm_routing_header (
  master_id uuid PRIMARY KEY,
  code varchar(50) NOT NULL,
  item_revision_id uuid NOT NULL,
  site_id uuid NOT NULL,
  lifecycle_status varchar(30) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rm_routing_operation (
  master_id uuid PRIMARY KEY,
  routing_header_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  operation_code varchar(50),
  work_center_id uuid NOT NULL,
  seq integer NOT NULL,
  predecessor_seq integer
);

CREATE TABLE IF NOT EXISTS rm_production_version (
  master_id uuid PRIMARY KEY,
  code varchar(50) NOT NULL,
  item_revision_id uuid NOT NULL,
  mbom_header_id uuid NOT NULL,
  routing_header_id uuid NOT NULL,
  site_id uuid NOT NULL,
  lifecycle_status varchar(30) NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rm_production_standard (
  master_id uuid PRIMARY KEY,
  item_revision_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  work_center_id uuid NOT NULL,
  equipment_id uuid,
  setup_time_min numeric(12,3),
  cycle_time_sec numeric(12,3),
  efficiency_factor numeric(8,4),
  lifecycle_status varchar(30) NOT NULL
);

CREATE TABLE IF NOT EXISTS rm_work_center (
  master_id uuid PRIMARY KEY,
  code varchar(50) NOT NULL,
  name jsonb NOT NULL DEFAULT '{"vi":""}'::jsonb,
  site_id uuid NOT NULL,
  area_id uuid NOT NULL,
  active_flag boolean NOT NULL DEFAULT true,
  lifecycle_status varchar(30) NOT NULL
);

CREATE TABLE IF NOT EXISTS rm_equipment (
  master_id uuid PRIMARY KEY,
  code varchar(50) NOT NULL,
  name jsonb NOT NULL DEFAULT '{"vi":""}'::jsonb,
  site_id uuid NOT NULL,
  work_center_id uuid NOT NULL,
  equipment_type varchar(80) NOT NULL,
  active_flag boolean NOT NULL DEFAULT true,
  lifecycle_status varchar(30) NOT NULL
);

CREATE TABLE IF NOT EXISTS rm_resource_capability (
  master_id uuid PRIMARY KEY,
  operation_id uuid NOT NULL,
  work_center_id uuid NOT NULL,
  equipment_id uuid,
  capability_type varchar(50) NOT NULL DEFAULT 'Eligible',
  active_flag boolean NOT NULL DEFAULT true,
  lifecycle_status varchar(30) NOT NULL
);

CREATE TABLE IF NOT EXISTS rm_resource_calendar (
  master_id uuid PRIMARY KEY,
  work_center_id uuid NOT NULL,
  equipment_id uuid,
  available_from timestamptz NOT NULL,
  available_to timestamptz NOT NULL,
  capacity_percent numeric(8,4) NOT NULL DEFAULT 1,
  lifecycle_status varchar(30) NOT NULL
);

-- Outbox table
CREATE TABLE IF NOT EXISTS outbox_events (
  id uuid PRIMARY KEY,
  event_type text NOT NULL,
  topic text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  retry_count integer NOT NULL DEFAULT 0,
  error_message text
);
