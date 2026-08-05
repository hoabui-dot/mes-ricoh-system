CREATE TABLE IF NOT EXISTS wms_inventory_result_inbox (
  event_id UUID PRIMARY KEY,
  event_type VARCHAR(160) NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  processing_status VARCHAR(20) NOT NULL CHECK (processing_status IN ('PROCESSING','PROCESSED','CONFLICT','FAILED')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS wo_material_inventory_state (
  workflow_id UUID PRIMARY KEY,
  reservation_id UUID,
  reservation_ref TEXT,
  item_revision_id UUID,
  qty NUMERIC(18,6),
  status VARCHAR(40) NOT NULL,
  last_event_id UUID NOT NULL,
  last_event_type VARCHAR(160) NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_wo_material_inventory_state_ref ON wo_material_inventory_state(reservation_ref);
