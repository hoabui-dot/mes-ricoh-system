CREATE TABLE IF NOT EXISTS rm_skill (
  master_id uuid PRIMARY KEY, code varchar(50) NOT NULL, name jsonb NOT NULL DEFAULT '{"vi":""}'::jsonb, lifecycle_status varchar(30) NOT NULL
);
CREATE TABLE IF NOT EXISTS rm_employee (
  master_id uuid PRIMARY KEY, code varchar(50) NOT NULL, name jsonb NOT NULL DEFAULT '{"vi":""}'::jsonb,
  site_id uuid NOT NULL, default_work_center_id uuid, employee_status varchar(20) NOT NULL DEFAULT 'Active', lifecycle_status varchar(30) NOT NULL
);
CREATE TABLE IF NOT EXISTS rm_employee_skill (
  employee_id uuid NOT NULL REFERENCES rm_employee(master_id), skill_id uuid NOT NULL REFERENCES rm_skill(master_id), level varchar(10) NOT NULL, PRIMARY KEY (employee_id, skill_id)
);
CREATE TABLE IF NOT EXISTS rm_employee_shift_schedule (
  schedule_id uuid PRIMARY KEY, employee_id uuid NOT NULL REFERENCES rm_employee(master_id), shift_id uuid NOT NULL,
  work_center_id uuid, schedule_date date NOT NULL, schedule_status varchar(20) NOT NULL DEFAULT 'Scheduled'
);
CREATE TABLE IF NOT EXISTS rm_operation_skill_requirement (
  master_id uuid PRIMARY KEY, operation_id uuid NOT NULL, skill_id uuid NOT NULL, minimum_level varchar(10) NOT NULL,
  required_persons integer NOT NULL DEFAULT 1, mandatory_flag boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS wo_operation_labor_assignment (
  assignment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), wo_id uuid NOT NULL REFERENCES wo_header(wo_id) ON DELETE CASCADE,
  wo_operation_id uuid NOT NULL REFERENCES wo_operation(wo_operation_id) ON DELETE CASCADE, employee_id uuid NOT NULL, skill_id uuid NOT NULL,
  minimum_level varchar(10) NOT NULL, matched_level varchar(10) NOT NULL, mandatory_flag boolean NOT NULL,
  assignment_status varchar(20) NOT NULL DEFAULT 'Proposed', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (wo_operation_id, employee_id, skill_id)
);
CREATE INDEX IF NOT EXISTS ix_wo_labor_assignment_wo ON wo_operation_labor_assignment(wo_id, wo_operation_id);
