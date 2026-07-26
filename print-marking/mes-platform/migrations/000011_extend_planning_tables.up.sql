-- Migration: 000011_extend_planning_tables.up.sql
-- Extend shift templates and seed planning permissions

ALTER TABLE planning_shift_templates ADD COLUMN IF NOT EXISTS code VARCHAR(50);
ALTER TABLE planning_shift_templates ADD COLUMN IF NOT EXISTS description VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE planning_shift_templates ADD COLUMN IF NOT EXISTS break_start VARCHAR(5) NOT NULL DEFAULT '';
ALTER TABLE planning_shift_templates ADD COLUMN IF NOT EXISTS break_end VARCHAR(5) NOT NULL DEFAULT '';
ALTER TABLE planning_shift_templates ADD COLUMN IF NOT EXISTS working_hours NUMERIC(5, 2) NOT NULL DEFAULT 8.00;
ALTER TABLE planning_shift_templates ADD COLUMN IF NOT EXISTS cross_day BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE planning_shift_templates ADD COLUMN IF NOT EXISTS color VARCHAR(20) NOT NULL DEFAULT '#F97316';
ALTER TABLE planning_shift_templates ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';

-- For existing records, set code to lower-cased and snake-cased name
UPDATE planning_shift_templates SET code = LOWER(REPLACE(name, ' ', '_')) WHERE code IS NULL;
ALTER TABLE planning_shift_templates ALTER COLUMN code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_planning_shift_templates_code ON planning_shift_templates (code);

-- Extend projection dashboard snapshot table
ALTER TABLE projection_dashboard_snapshots ADD COLUMN IF NOT EXISTS busy_workers INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projection_dashboard_snapshots ADD COLUMN IF NOT EXISTS unassigned_workers INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projection_dashboard_snapshots ADD COLUMN IF NOT EXISTS overtime_workers INTEGER NOT NULL DEFAULT 0;

-- Seed permissions
INSERT INTO identity_permissions (name, resource, action, description, module, display_name, category) VALUES
    ('shift.create',      'shift',      'create',   'Create reusable shift templates',            'Planning',  'Create Shift Templates', 'Shifts'),
    ('shift.update',      'shift',      'update',   'Update reusable shift templates',            'Planning',  'Update Shift Templates', 'Shifts'),
    ('shift.delete',      'shift',      'delete',   'Delete reusable shift templates',            'Planning',  'Delete Shift Templates', 'Shifts'),
    ('calendar.generate', 'calendar',   'generate', 'Generate monthly shift calendar instances',   'Planning',  'Generate Calendar',      'Calendar'),
    ('calendar.update',   'calendar',   'update',   'Update calendar shift instances',            'Planning',  'Update Calendar',        'Calendar'),
    ('schedule.read',     'schedule',   'read',     'View monthly planning scheduling board',      'Planning',  'View Schedules',         'Scheduling'),
    ('schedule.assign',   'schedule',   'assign',   'Assign workers or teams to shift schedules', 'Planning',  'Assign Schedules',       'Scheduling'),
    ('schedule.bulk',     'schedule',   'bulk',     'Perform bulk schedule assignments',          'Planning',  'Bulk Scheduling',        'Scheduling'),
    ('team.assign',       'team_shift', 'assign',   'Assign entire teams to shift templates',     'Planning',  'Assign Teams',           'Teams'),
    ('worker.assign',     'worker_shift','assign',  'Assign individual workers to shift templates','Planning',  'Assign Workers',         'Workers'),
    ('planning.dashboard','planning_db','read',     'Access shift planning analytics dashboard',  'Planning',  'Planning Dashboard',     'Dashboard')
ON CONFLICT (name) DO UPDATE SET 
    module = EXCLUDED.module,
    display_name = EXCLUDED.display_name,
    category = EXCLUDED.category,
    description = EXCLUDED.description;
