-- Real-Time Execution Tables for mes-execution-service (Stage B)

CREATE TABLE IF NOT EXISTS execution_session (
  session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_operation_id uuid NOT NULL REFERENCES wo_operation(wo_operation_id),
  terminal_ref varchar(100) NOT NULL,
  operator_user_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  status varchar(20) NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'ABORTED'))
);

CREATE TABLE IF NOT EXISTS operation_confirmation (
  confirmation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_operation_id uuid NOT NULL REFERENCES wo_operation(wo_operation_id),
  session_id uuid NOT NULL REFERENCES execution_session(session_id),
  qty_good numeric(18,6) NOT NULL DEFAULT 0,
  qty_scrap numeric(18,6) NOT NULL DEFAULT 0,
  reason_code varchar(50),
  input_label_id uuid,
  output_label_id uuid,
  confirmed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS material_consumption (
  consumption_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id uuid NOT NULL REFERENCES wo_header(wo_id),
  wo_operation_id uuid NOT NULL REFERENCES wo_operation(wo_operation_id),
  component_revision_id uuid NOT NULL,
  qty_consumed numeric(18,6) NOT NULL,
  uom varchar(50) NOT NULL,
  source varchar(20) NOT NULL CHECK (source IN ('BACKFLUSH', 'MANUAL_SCAN')),
  label_id uuid,
  consumed_at timestamptz NOT NULL DEFAULT now()
);
