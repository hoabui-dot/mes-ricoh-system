ALTER TABLE wo_header
  ADD COLUMN IF NOT EXISTS dispatch_mode varchar(30) NOT NULL DEFAULT 'WORK_CENTER';

ALTER TABLE wo_header
  DROP CONSTRAINT IF EXISTS wo_header_dispatch_mode_check;

ALTER TABLE wo_header
  ADD CONSTRAINT wo_header_dispatch_mode_check
  CHECK (dispatch_mode IN ('WORK_CENTER', 'DEMO_SHARED_KIOSK'));

CREATE INDEX IF NOT EXISTS ix_wo_header_dispatch_mode
  ON wo_header(dispatch_mode, status);
