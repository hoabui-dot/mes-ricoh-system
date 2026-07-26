CREATE TABLE IF NOT EXISTS wo_creation_workflow (
  workflow_id uuid PRIMARY KEY,
  correlation_id uuid NOT NULL,
  user_id text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  request_payload jsonb NOT NULL,
  status varchar(20) NOT NULL CHECK (status IN ('accepted','running','succeeded','failed','timed_out','cancelled')),
  current_step varchar(80),
  last_sequence bigint NOT NULL DEFAULT 0,
  work_order_id uuid,
  work_order_code varchar(50),
  error_code varchar(120),
  error_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  UNIQUE (user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS wo_creation_workflow_event (
  event_id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES wo_creation_workflow(workflow_id) ON DELETE CASCADE,
  event_type varchar(40) NOT NULL,
  sequence bigint NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_wo_creation_workflow_user_created
  ON wo_creation_workflow (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wo_creation_workflow_event_workflow
  ON wo_creation_workflow_event (workflow_id, sequence);
