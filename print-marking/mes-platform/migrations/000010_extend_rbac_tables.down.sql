-- Drop index
DROP INDEX IF EXISTS idx_identity_roles_code;

-- Drop columns
ALTER TABLE identity_permissions DROP COLUMN IF EXISTS category;
ALTER TABLE identity_permissions DROP COLUMN IF EXISTS display_name;
ALTER TABLE identity_permissions DROP COLUMN IF EXISTS module;

ALTER TABLE identity_roles DROP COLUMN IF EXISTS is_system;
ALTER TABLE identity_roles DROP COLUMN IF EXISTS code;
