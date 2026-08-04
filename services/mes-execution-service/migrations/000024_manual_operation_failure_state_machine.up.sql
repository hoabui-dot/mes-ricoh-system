DO $$ BEGIN
  ALTER TYPE wo_status ADD VALUE IF NOT EXISTS 'Paused';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE execution_session
  DROP CONSTRAINT IF EXISTS execution_session_status_check;

ALTER TABLE execution_session
  ADD CONSTRAINT execution_session_status_check
  CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'FAILED', 'ABORTED'));

CREATE TABLE IF NOT EXISTS wo_operation_execution_history (
  history_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id uuid NOT NULL REFERENCES wo_header(wo_id) ON DELETE CASCADE,
  wo_operation_id uuid NOT NULL REFERENCES wo_operation(wo_operation_id) ON DELETE CASCADE,
  session_id uuid REFERENCES execution_session(session_id),
  action varchar(30) NOT NULL CHECK (action IN ('FAILED', 'ABORTED', 'RETRY_REQUESTED')),
  reason_code varchar(50),
  reason_name_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason_text text,
  actor_user_id uuid NOT NULL,
  actor_role_code varchar(50) NOT NULL,
  terminal_ref varchar(100) NOT NULL,
  from_operation_status varchar(30) NOT NULL,
  to_operation_status varchar(30) NOT NULL,
  from_wo_status varchar(30) NOT NULL,
  to_wo_status varchar(30) NOT NULL,
  idempotency_key varchar(200) NOT NULL,
  trace_id varchar(200) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (action, idempotency_key)
);

CREATE INDEX IF NOT EXISTS ix_wo_operation_execution_history_operation
  ON wo_operation_execution_history(wo_operation_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS ix_wo_operation_execution_history_session
  ON wo_operation_execution_history(session_id, occurred_at DESC);
