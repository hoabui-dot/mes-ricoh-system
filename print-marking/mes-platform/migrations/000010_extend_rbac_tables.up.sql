-- ─── Extend identity_roles ──────────────────────────────────────────────────
ALTER TABLE identity_roles ADD COLUMN IF NOT EXISTS code VARCHAR(100);
ALTER TABLE identity_roles ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;

-- Update codes for existing default roles
UPDATE identity_roles SET code = name, is_system = TRUE WHERE code IS NULL OR code = '';

-- Set code default to name if still null
UPDATE identity_roles SET code = LOWER(REPLACE(name, ' ', '_')) WHERE code IS NULL;

-- Make code unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_roles_code ON identity_roles (code);

-- ─── Insert System Roles ──────────────────────────────────────────────────────
INSERT INTO identity_roles (id, name, code, description, is_system) VALUES
    ('00000000-0000-0000-0000-000000000005', 'Factory Manager',     'factory_manager',     'Full factory level management & decision authority', TRUE),
    ('00000000-0000-0000-0000-000000000006', 'Production Manager',  'production_manager',  'Manages production lines, work orders, and shifts',  TRUE),
    ('00000000-0000-0000-0000-000000000007', 'HR Manager',          'hr_manager',          'Manages workforce, departments, skills & certs',    TRUE),
    ('00000000-0000-0000-0000-000000000008', 'Shift Supervisor',    'supervisor',          'Manages floor shifts, team assignments & jobs',      TRUE),
    ('00000000-0000-0000-0000-000000000009', 'Viewer',              'viewer',              'Read-only access across system modules',             TRUE)
ON CONFLICT (code) DO NOTHING;

-- ─── Extend identity_permissions ─────────────────────────────────────────────
ALTER TABLE identity_permissions ADD COLUMN IF NOT EXISTS module VARCHAR(100) NOT NULL DEFAULT 'Identity';
ALTER TABLE identity_permissions ADD COLUMN IF NOT EXISTS display_name VARCHAR(150) NOT NULL DEFAULT '';
ALTER TABLE identity_permissions ADD COLUMN IF NOT EXISTS category VARCHAR(100) NOT NULL DEFAULT 'General';

-- ─── Upsert Permissions with Metadata ──────────────────────────────────────
INSERT INTO identity_permissions (name, resource, action, description, module, display_name, category) VALUES
    -- Workforce Module
    ('worker.read',       'worker',     'read',     'View worker profiles and details',           'Workforce', 'View Workers',      'Workers'),
    ('worker.create',     'worker',     'create',   'Add new workers to the system',              'Workforce', 'Create Workers',    'Workers'),
    ('worker.update',     'worker',     'update',   'Update worker profiles and assignments',      'Workforce', 'Update Workers',    'Workers'),
    ('worker.delete',     'worker',     'delete',   'Soft-delete workers',                       'Workforce', 'Delete Workers',    'Workers'),
    ('department.read',   'department', 'read',     'View factory departments',                   'Workforce', 'View Departments',  'Departments'),
    ('department.create', 'department', 'create',   'Create factory departments',                 'Workforce', 'Create Departments','Departments'),
    ('department.update', 'department', 'update',   'Update factory departments',                 'Workforce', 'Update Departments','Departments'),
    ('department.delete', 'department', 'delete',   'Delete factory departments',                 'Workforce', 'Delete Departments','Departments'),
    ('team.read',         'team',       'read',     'View factory teams',                         'Workforce', 'View Teams',        'Teams'),
    ('team.create',       'team',       'create',   'Create factory teams',                       'Workforce', 'Create Teams',      'Teams'),
    ('team.update',       'team',       'update',   'Update factory teams',                       'Workforce', 'Update Teams',      'Teams'),
    ('team.delete',       'team',       'delete',   'Delete factory teams',                       'Workforce', 'Delete Teams',      'Teams'),
    ('skill.read',        'skill',      'read',     'View skill matrix and capabilities',         'Workforce', 'View Skills',       'Skills'),
    ('skill.create',      'skill',      'create',   'Add new skills to matrix',                   'Workforce', 'Create Skills',     'Skills'),
    ('skill.update',      'skill',      'update',   'Update skills and levels',                   'Workforce', 'Update Skills',     'Skills'),
    ('skill.delete',      'skill',      'delete',   'Delete skills',                              'Workforce', 'Delete Skills',     'Skills'),

    -- Planning Module
    ('shift.read',        'shift',      'read',     'View shift calendars and schedules',         'Planning',  'View Shifts',       'Shifts'),
    ('shift.assign',      'shift',      'assign',   'Assign workers to shifts',                   'Planning',  'Assign Shifts',     'Shifts'),
    ('shift.edit',        'shift',      'edit',     'Edit shift parameters',                      'Planning',  'Edit Shifts',       'Shifts'),
    ('planning.publish',  'planning',   'publish',  'Publish shift plans and calendars',          'Planning',  'Publish Plans',     'Plans'),

    -- Production Module
    ('production.read',   'production', 'read',     'View production orders and job statuses',    'Production','View Production',   'Orders'),
    ('production.release','production', 'release',  'Release production work orders',             'Production','Release Production','Orders'),
    ('production.cancel', 'production', 'cancel',   'Cancel production orders',                   'Production','Cancel Production', 'Orders'),

    -- Dashboard & Analytics
    ('dashboard.view',    'dashboard',  'view',     'Access executive & operational dashboards',   'Dashboard', 'View Dashboard',   'Dashboard'),
    ('audit.view',        'audit',      'view',     'Access audit trail and system logs',         'Audit',     'View Audit Logs',   'Audit'),

    -- Identity & RBAC Module
    ('user.manage',       'user',       'manage',   'Manage users and user role assignments',     'Identity',  'Manage Users',      'User Management'),
    ('role.manage',       'role',       'manage',   'Create, edit, and assign system roles',      'Identity',  'Manage Roles',      'Role Management'),
    ('permission.manage', 'permission', 'manage',   'View and assign permissions',                'Identity',  'Manage Permissions','Permission Management')
ON CONFLICT (name) DO UPDATE SET 
    module = EXCLUDED.module,
    display_name = EXCLUDED.display_name,
    category = EXCLUDED.category,
    description = EXCLUDED.description;
