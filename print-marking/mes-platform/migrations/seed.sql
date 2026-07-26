-- ═══════════════════════════════════════════════════════════════════════════════
-- MES Platform — Initial Seed Data
--
-- Super Admin Account:
--   Email    : admin@mes-platform.com
--   Password : Admin@MES2025!
--   Role     : super_admin (all 16 permissions)
--
-- Sample accounts (same password: Admin@MES2025!):
--   admin.user@mes-platform.com    → admin    (15 permissions, no override)
--   john.manager@mes-platform.com  → manager  (7 permissions)
--   jane.operator@mes-platform.com → operator (2 permissions)
--
-- Run: docker exec -i mes-postgres psql -U mes -d mes_platform < migrations/seed.sql
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. USERS
-- ─────────────────────────────────────────────────────────────────────────────
-- Password hash for: Admin@MES2025!  (bcrypt cost=10)
-- $2b$10$bvaiyucKaZ1TKtz3cjO3yODoLl7oJ4a2748.RZGWL/y6S1Jc9QEci

INSERT INTO identity_users (
    id, username, email, password_hash, full_name, status
) VALUES
    (
        '00000000-0000-0000-0000-000000000010',
        'superadmin',
        'admin@mes-platform.com',
        '$2b$10$bvaiyucKaZ1TKtz3cjO3yODoLl7oJ4a2748.RZGWL/y6S1Jc9QEci',
        'System Administrator',
        'active'
    ),
    (
        '00000000-0000-0000-0000-000000000011',
        'admin.user',
        'admin.user@mes-platform.com',
        '$2b$10$bvaiyucKaZ1TKtz3cjO3yODoLl7oJ4a2748.RZGWL/y6S1Jc9QEci',
        'Admin User',
        'active'
    ),
    (
        '00000000-0000-0000-0000-000000000012',
        'john.manager',
        'john.manager@mes-platform.com',
        '$2b$10$bvaiyucKaZ1TKtz3cjO3yODoLl7oJ4a2748.RZGWL/y6S1Jc9QEci',
        'John Manager',
        'active'
    ),
    (
        '00000000-0000-0000-0000-000000000013',
        'jane.operator',
        'jane.operator@mes-platform.com',
        '$2b$10$bvaiyucKaZ1TKtz3cjO3yODoLl7oJ4a2748.RZGWL/y6S1Jc9QEci',
        'Jane Operator',
        'active'
    )
ON CONFLICT (email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    full_name     = EXCLUDED.full_name,
    status        = EXCLUDED.status,
    updated_at    = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. USER → ROLE ASSIGNMENTS
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO identity_user_roles (user_id, role_id) VALUES
    ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001'),
    ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000002'),
    ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000003'),
    ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000004')
ON CONFLICT (user_id, role_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ROLE → PERMISSION ASSIGNMENTS
-- ─────────────────────────────────────────────────────────────────────────────

-- super_admin → ALL 16 permissions
INSERT INTO identity_role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000001', id
FROM identity_permissions
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- admin → all except assignment.override
INSERT INTO identity_role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000002', id
FROM identity_permissions
WHERE name <> 'assignment.override'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- manager → 7 permissions
INSERT INTO identity_role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000003', id
FROM identity_permissions
WHERE name IN (
    'worker.view', 'worker.create', 'worker.update',
    'planning.publish', 'production.release',
    'dashboard.view', 'audit.view'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- operator → 2 permissions
INSERT INTO identity_role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000004', id
FROM identity_permissions
WHERE name IN ('dashboard.view', 'worker.view')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. SHIFT TEMPLATES  (columns: id, name, start_time, end_time)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO planning_shift_templates (id, name, start_time, end_time) VALUES
    ('30000000-0000-0000-0000-000000000001', 'Morning Shift',   '06:00', '14:00'),
    ('30000000-0000-0000-0000-000000000002', 'Afternoon Shift', '14:00', '22:00'),
    ('30000000-0000-0000-0000-000000000003', 'Night Shift',     '22:00', '06:00')
ON CONFLICT (name) DO NOTHING;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION REPORT
-- ─────────────────────────────────────────────────────────────────────────────
SELECT table_name, row_count FROM (
    SELECT 'identity_users'            AS table_name, count(*)::int AS row_count FROM identity_users             UNION ALL
    SELECT 'identity_roles',                          count(*)::int              FROM identity_roles              UNION ALL
    SELECT 'identity_permissions',                    count(*)::int              FROM identity_permissions        UNION ALL
    SELECT 'identity_user_roles',                     count(*)::int              FROM identity_user_roles         UNION ALL
    SELECT 'identity_role_permissions',               count(*)::int              FROM identity_role_permissions   UNION ALL
    SELECT 'workforce_departments',                   count(*)::int              FROM workforce_departments       UNION ALL
    SELECT 'workforce_skills',                        count(*)::int              FROM workforce_skills            UNION ALL
    SELECT 'planning_shift_templates',                count(*)::int              FROM planning_shift_templates
) counts ORDER BY table_name;

SELECT
    u.email,
    u.full_name,
    u.status,
    r.name AS role,
    (SELECT count(*)::int FROM identity_role_permissions rp
     JOIN identity_user_roles ur2 ON ur2.role_id = rp.role_id
     WHERE ur2.user_id = u.id) AS permissions
FROM identity_users u
LEFT JOIN identity_user_roles ur ON ur.user_id = u.id
LEFT JOIN identity_roles r ON r.id = ur.role_id
ORDER BY u.created_at;
