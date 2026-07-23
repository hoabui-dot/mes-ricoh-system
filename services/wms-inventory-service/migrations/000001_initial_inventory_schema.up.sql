CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inv_lot (
  lot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_code varchar(50) UNIQUE NOT NULL,
  item_revision_id uuid NOT NULL,
  received_at timestamptz NOT NULL,
  expiry_date date,
  status varchar(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Expired', 'Quarantined', 'Consumed')),
  original_qty numeric(18,3) NOT NULL CHECK (original_qty > 0),
  uom_code varchar(20) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inv_balance (
  balance_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL REFERENCES inv_lot(lot_id),
  location_id uuid NOT NULL,
  on_hand_qty numeric(18,3) NOT NULL CHECK (on_hand_qty >= 0),
  row_version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lot_id, location_id)
);

CREATE TABLE IF NOT EXISTS inv_stock_movement (
  movement_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_type varchar(30) NOT NULL CHECK (movement_type IN ('RECEIPT', 'TRANSFER_TO_STAGING', 'CONSUMPTION', 'ADJUSTMENT')),
  lot_id uuid NOT NULL REFERENCES inv_lot(lot_id),
  from_location_id uuid,
  to_location_id uuid,
  qty numeric(18,3) NOT NULL CHECK (qty > 0),
  wo_id uuid,
  work_center_ref uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE TABLE IF NOT EXISTS inv_discrepancy_log (
  discrepancy_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discrepancy_type varchar(50) NOT NULL,
  item_revision_id uuid NOT NULL,
  location_id uuid NOT NULL,
  requested_qty numeric(18,3) NOT NULL,
  consumed_qty numeric(18,3) NOT NULL,
  shortage_qty numeric(18,3) NOT NULL,
  wo_id uuid,
  work_center_ref uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rm_item_revision (
  item_revision_id uuid PRIMARY KEY,
  item_code varchar(50) NOT NULL,
  item_name jsonb NOT NULL DEFAULT '{"vi":""}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rm_storage_location (
  location_id uuid PRIMARY KEY,
  location_code varchar(30) NOT NULL,
  location_name jsonb NOT NULL DEFAULT '{"vi":""}'::jsonb,
  location_purpose varchar(30) NOT NULL CHECK (location_purpose IN ('Storage', 'WorkCenterStaging')),
  staging_for_work_center_ref uuid,
  status varchar(20) NOT NULL DEFAULT 'Active',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_inv_lot_item_status_expiry ON inv_lot(item_revision_id, status, expiry_date);
CREATE INDEX IF NOT EXISTS ix_inv_balance_location ON inv_balance(location_id);
CREATE INDEX IF NOT EXISTS ix_inv_movement_wo ON inv_stock_movement(wo_id);
CREATE INDEX IF NOT EXISTS ix_inv_discrepancy_wo ON inv_discrepancy_log(wo_id);
CREATE INDEX IF NOT EXISTS ix_rm_storage_location_staging_ref ON rm_storage_location(staging_for_work_center_ref)
  WHERE staging_for_work_center_ref IS NOT NULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['inv_lot', 'inv_balance', 'inv_stock_movement'] LOOP
    EXECUTE format('REVOKE DELETE ON TABLE %I FROM PUBLIC', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wms_inventory_user') THEN
      EXECUTE format('REVOKE DELETE ON TABLE %I FROM wms_inventory_user', t);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wms_inventory_user') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE inv_lot TO wms_inventory_user;
    GRANT SELECT, INSERT, UPDATE ON TABLE inv_balance TO wms_inventory_user;
    GRANT SELECT, INSERT ON TABLE inv_stock_movement TO wms_inventory_user;
    GRANT SELECT, INSERT ON TABLE inv_discrepancy_log TO wms_inventory_user;
    GRANT SELECT, INSERT, UPDATE ON TABLE rm_item_revision TO wms_inventory_user;
    GRANT SELECT, INSERT, UPDATE ON TABLE rm_storage_location TO wms_inventory_user;
    GRANT USAGE ON SCHEMA public TO wms_inventory_user;
  END IF;
END $$;
