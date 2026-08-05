ALTER TABLE outbox_events
  ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS aggregate_type TEXT,
  ADD COLUMN IF NOT EXISTS aggregate_id UUID,
  ADD COLUMN IF NOT EXISTS aggregate_version BIGINT,
  ADD COLUMN IF NOT EXISTS event_version INTEGER,
  ADD COLUMN IF NOT EXISTS correlation_id TEXT,
  ADD COLUMN IF NOT EXISTS causation_id TEXT,
  ADD COLUMN IF NOT EXISTS trace_id TEXT,
  ADD COLUMN IF NOT EXISTS partition_key TEXT;

CREATE INDEX IF NOT EXISTS idx_outbox_events_available
  ON outbox_events (status, available_at, created_at);

CREATE TABLE IF NOT EXISTS outbox_dead_letters (
  event_id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,
  topic TEXT NOT NULL,
  payload JSONB NOT NULL,
  retry_count INTEGER NOT NULL,
  error_message TEXT,
  parked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
