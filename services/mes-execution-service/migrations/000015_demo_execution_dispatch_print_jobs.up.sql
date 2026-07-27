ALTER TABLE wo_approval_log
  ADD COLUMN IF NOT EXISTS approval_mode varchar(40),
  ADD COLUMN IF NOT EXISTS resource_allocation_bypassed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bypass_reason text;

ALTER TABLE wo_operation
  ADD COLUMN IF NOT EXISTS execution_target_type varchar(30) NOT NULL DEFAULT 'KIOSK_DEMO',
  ADD COLUMN IF NOT EXISTS workstation_id uuid,
  ADD COLUMN IF NOT EXISTS print_station_id uuid,
  ADD COLUMN IF NOT EXISTS adapter_id varchar(100),
  ADD COLUMN IF NOT EXISTS dispatch_event_id uuid;

ALTER TABLE rm_routing_operation
  ADD COLUMN IF NOT EXISTS requires_output_label boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS workstation_id uuid;

CREATE TABLE IF NOT EXISTS wo_print_job (
  print_job_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_code varchar(80) NOT NULL UNIQUE,
  wo_id uuid NOT NULL REFERENCES wo_header(wo_id) ON DELETE CASCADE,
  wo_operation_id uuid NOT NULL REFERENCES wo_operation(wo_operation_id) ON DELETE CASCADE,
  routing_operation_id uuid,
  operation_id uuid NOT NULL,
  workstation_id uuid,
  print_station_id uuid,
  adapter_id varchar(100),
  output_label_id uuid,
  template_id uuid,
  template_version varchar(50),
  requested_quantity numeric(18,6) NOT NULL CHECK (requested_quantity > 0),
  status varchar(30) NOT NULL DEFAULT 'Pending',
  command_event_id uuid,
  idempotency_key varchar(200) NOT NULL UNIQUE,
  correlation_id varchar(200) NOT NULL,
  causation_id varchar(200),
  attempt_count integer NOT NULL DEFAULT 0,
  selected_printer_code varchar(100),
  created_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  last_error_code varchar(100),
  last_error_message text
);

CREATE TABLE IF NOT EXISTS wo_print_job_attempt (
  attempt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  print_job_id uuid NOT NULL REFERENCES wo_print_job(print_job_id) ON DELETE CASCADE,
  attempt_no integer NOT NULL,
  command_event_id uuid NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'DispatchQueued',
  selected_printer_code varchar(100),
  error_code varchar(100),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (print_job_id, attempt_no),
  UNIQUE (command_event_id)
);

CREATE TABLE IF NOT EXISTS wo_print_job_event (
  event_id varchar(200) PRIMARY KEY,
  print_job_id uuid REFERENCES wo_print_job(print_job_id) ON DELETE CASCADE,
  event_type varchar(100) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_wo_print_job_operation ON wo_print_job(wo_operation_id, status);
CREATE INDEX IF NOT EXISTS ix_wo_print_job_correlation ON wo_print_job(correlation_id);
