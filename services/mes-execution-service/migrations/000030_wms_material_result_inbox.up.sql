CREATE TABLE IF NOT EXISTS wms_material_result_inbox (
  event_id UUID PRIMARY KEY,
  event_type VARCHAR(160) NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  processing_status VARCHAR(20) NOT NULL CHECK (processing_status IN ('PROCESSING','PROCESSED','CONFLICT','FAILED')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS ix_wms_material_result_inbox_status ON wms_material_result_inbox(processing_status);
