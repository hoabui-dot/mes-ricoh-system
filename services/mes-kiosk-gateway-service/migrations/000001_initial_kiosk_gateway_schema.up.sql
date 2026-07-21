CREATE TABLE IF NOT EXISTS terminal (
  terminal_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_code varchar(50) UNIQUE NOT NULL,
  site_id uuid NOT NULL,
  work_center_id uuid NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'OFFLINE' CHECK (status IN ('ONLINE', 'OFFLINE', 'DISABLED')),
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS terminal_session (
  session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_id uuid NOT NULL REFERENCES terminal(terminal_id),
  operator_user_id varchar(100) NOT NULL,
  logged_in_at timestamptz NOT NULL DEFAULT now(),
  logged_out_at timestamptz,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CLOSED'))
);

CREATE TABLE IF NOT EXISTS outbound_message_queue (
  message_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_id uuid NOT NULL REFERENCES terminal(terminal_id),
  payload jsonb NOT NULL,
  event_type varchar(100) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DELIVERED', 'EXPIRED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_terminal_code ON terminal(terminal_code);
CREATE INDEX IF NOT EXISTS idx_terminal_work_center ON terminal(work_center_id);
CREATE INDEX IF NOT EXISTS idx_outbound_queue_pending ON outbound_message_queue(terminal_id, created_at) WHERE status = 'PENDING';

-- Seed default shopfloor terminals
INSERT INTO terminal (terminal_id, terminal_code, site_id, work_center_id, status)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'KIOSK-MIX-01',  '9f785cbd-98aa-4b2c-98ef-287a189e760c', '40000000-0000-0000-0000-000000000001', 'OFFLINE'),
  ('a1000000-0000-0000-0000-000000000002', 'KIOSK-PREP-01', '9f785cbd-98aa-4b2c-98ef-287a189e760c', '40000000-0000-0000-0000-000000000002', 'OFFLINE'),
  ('a1000000-0000-0000-0000-000000000003', 'KIOSK-CUT-01',  '9f785cbd-98aa-4b2c-98ef-287a189e760c', '40000000-0000-0000-0000-000000000003', 'OFFLINE'),
  ('a1000000-0000-0000-0000-000000000004', 'KIOSK-MOLD-01', '9f785cbd-98aa-4b2c-98ef-287a189e760c', '40000000-0000-0000-0000-000000000004', 'OFFLINE'),
  ('a1000000-0000-0000-0000-000000000005', 'KIOSK-TRIM-01', '9f785cbd-98aa-4b2c-98ef-287a189e760c', '40000000-0000-0000-0000-000000000005', 'OFFLINE'),
  ('a1000000-0000-0000-0000-000000000006', 'KIOSK-QC-01',   '9f785cbd-98aa-4b2c-98ef-287a189e760c', '40000000-0000-0000-0000-000000000006', 'OFFLINE')
ON CONFLICT (terminal_code) DO NOTHING;
