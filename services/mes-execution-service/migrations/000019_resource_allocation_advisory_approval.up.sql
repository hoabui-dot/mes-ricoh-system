ALTER TABLE wo_approval_log
  ADD COLUMN IF NOT EXISTS resource_allocation_status varchar(30),
  ADD COLUMN IF NOT EXISTS approval_policy varchar(30),
  ADD COLUMN IF NOT EXISTS resource_allocation_warning_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS temporary_policy_version varchar(30);
