ALTER TABLE outbound_message_queue
  ADD COLUMN IF NOT EXISTS event_id varchar(100);

UPDATE outbound_message_queue
SET event_id = message_id::text
WHERE event_id IS NULL;

ALTER TABLE outbound_message_queue
  ALTER COLUMN event_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_outbound_queue_terminal_event
  ON outbound_message_queue(terminal_id, event_id);

CREATE TABLE IF NOT EXISTS consumed_execution_event (
  event_id varchar(100) PRIMARY KEY,
  event_type varchar(150) NOT NULL,
  status varchar(20) NOT NULL CHECK (status IN ('PROCESSING', 'PROCESSED', 'FAILED')),
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_consumed_execution_event_status
  ON consumed_execution_event(status, received_at);
