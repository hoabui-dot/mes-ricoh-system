CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS material_request (
  request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id uuid NOT NULL,
  work_center_ref uuid NOT NULL,
  item_revision_id uuid NOT NULL,
  required_qty numeric(18,3) NOT NULL CHECK (required_qty > 0),
  already_staged_qty numeric(18,3) NOT NULL DEFAULT 0,
  shortfall_qty numeric(18,3) NOT NULL DEFAULT 0,
  available_qty numeric(18,3) NOT NULL DEFAULT 0,
  transferred_qty numeric(18,3) NOT NULL DEFAULT 0,
  status varchar(20) NOT NULL CHECK (status IN ('Staged', 'Shortage')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rm_storage_location (
  location_id uuid PRIMARY KEY,
  location_code varchar(30) NOT NULL,
  location_purpose varchar(30) NOT NULL CHECK (location_purpose IN ('Storage', 'WorkCenterStaging')),
  staging_for_work_center_ref uuid,
  status varchar(20) NOT NULL DEFAULT 'Active',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_material_request_wo ON material_request(wo_id);
CREATE INDEX IF NOT EXISTS ix_rm_storage_location_staging_ref ON rm_storage_location(staging_for_work_center_ref)
  WHERE staging_for_work_center_ref IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wms_outbound_user') THEN
    GRANT USAGE ON SCHEMA public TO wms_outbound_user;
    GRANT SELECT, INSERT, UPDATE ON TABLE outbox_events TO wms_outbound_user;
    GRANT SELECT, INSERT ON TABLE material_request TO wms_outbound_user;
    GRANT SELECT, INSERT, UPDATE ON TABLE rm_storage_location TO wms_outbound_user;
    REVOKE DELETE ON TABLE outbox_events FROM wms_outbound_user;
    REVOKE DELETE ON TABLE material_request FROM wms_outbound_user;
    REVOKE DELETE ON TABLE rm_storage_location FROM wms_outbound_user;
  END IF;
END $$;
