-- Drop old check constraints on workforce_workers
ALTER TABLE workforce_workers DROP CONSTRAINT IF EXISTS workforce_workers_status_check;
ALTER TABLE workforce_workers DROP CONSTRAINT IF EXISTS workforce_workers_avail_check;

-- Add new constraints that include all required options
ALTER TABLE workforce_workers ADD CONSTRAINT workforce_workers_status_check 
    CHECK (status IN ('active', 'probation', 'suspended', 'resigned', 'retired', 'inactive', 'terminated'));

ALTER TABLE workforce_workers ADD CONSTRAINT workforce_workers_avail_check 
    CHECK (availability IN ('available', 'busy', 'on_leave', 'sick_leave', 'training', 'overtime', 'offline', 'suspended'));

-- Add columns to workforce_workers
ALTER TABLE workforce_workers ADD COLUMN IF NOT EXISTS employee_number VARCHAR(50);
ALTER TABLE workforce_workers ADD COLUMN IF NOT EXISTS avatar VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE workforce_workers ADD COLUMN IF NOT EXISTS gender VARCHAR(20) NOT NULL DEFAULT '';
ALTER TABLE workforce_workers ADD COLUMN IF NOT EXISTS birthday DATE;
ALTER TABLE workforce_workers ADD COLUMN IF NOT EXISTS address VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE workforce_workers ADD COLUMN IF NOT EXISTS employment_date TIMESTAMPTZ;
ALTER TABLE workforce_workers ADD COLUMN IF NOT EXISTS position VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE workforce_workers ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';

-- Make employee_number unique safely for non-nulls
CREATE UNIQUE INDEX IF NOT EXISTS idx_workforce_workers_emp_num ON workforce_workers (employee_number) WHERE employee_number IS NOT NULL;

-- Add columns to workforce_departments
ALTER TABLE workforce_departments ADD COLUMN IF NOT EXISTS code VARCHAR(50);
ALTER TABLE workforce_departments ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES workforce_workers(id) ON DELETE SET NULL;
ALTER TABLE workforce_departments ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_workforce_depts_code ON workforce_departments (code) WHERE code IS NOT NULL;

-- Add columns to workforce_workshops
ALTER TABLE workforce_workshops ADD COLUMN IF NOT EXISTS code VARCHAR(50);
ALTER TABLE workforce_workshops ADD COLUMN IF NOT EXISTS factory VARCHAR(100) NOT NULL DEFAULT 'Main Factory';
ALTER TABLE workforce_workshops ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_workforce_workshops_code ON workforce_workshops (code) WHERE code IS NOT NULL;

-- Add columns to workforce_teams
ALTER TABLE workforce_teams ADD COLUMN IF NOT EXISTS code VARCHAR(50);
ALTER TABLE workforce_teams ADD COLUMN IF NOT EXISTS leader_id UUID REFERENCES workforce_workers(id) ON DELETE SET NULL;
ALTER TABLE workforce_teams ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_workforce_teams_code ON workforce_teams (code) WHERE code IS NOT NULL;
