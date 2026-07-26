-- Migration: 000001_create_identity_tables.up.sql
-- Phase 1: Identity module — create all identity schema tables.
-- Author: MES Platform
-- Date: 2026-06-30

-- ─── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS identity_users (
    id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    username                  VARCHAR(50)  NOT NULL,
    email                     VARCHAR(255) NOT NULL,
    password_hash             VARCHAR(255) NOT NULL,
    full_name                 VARCHAR(100) NOT NULL DEFAULT '',
    phone                     VARCHAR(20)  NOT NULL DEFAULT '',
    status                    VARCHAR(50)  NOT NULL DEFAULT 'active',
    last_login_at             TIMESTAMPTZ,
    password_reset_token      VARCHAR(255) NOT NULL DEFAULT '',
    password_reset_expires_at TIMESTAMPTZ,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at                TIMESTAMPTZ,

    CONSTRAINT identity_users_username_unique UNIQUE (username),
    CONSTRAINT identity_users_email_unique    UNIQUE (email),
    CONSTRAINT identity_users_status_check    CHECK  (status IN ('active', 'inactive', 'suspended'))
);

CREATE INDEX IF NOT EXISTS idx_identity_users_email       ON identity_users (email)   WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_identity_users_username    ON identity_users (username) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_identity_users_status      ON identity_users (status)   WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_identity_users_created_at  ON identity_users (created_at DESC);

-- ─── Roles ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS identity_roles (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(50)  NOT NULL,
    description VARCHAR(255) NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT identity_roles_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_identity_roles_name ON identity_roles (name);

-- ─── Permissions ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS identity_permissions (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL,
    description VARCHAR(255) NOT NULL DEFAULT '',
    resource    VARCHAR(50)  NOT NULL,
    action      VARCHAR(50)  NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT identity_permissions_name_unique     UNIQUE (name),
    CONSTRAINT identity_permissions_resource_action UNIQUE (resource, action)
);

CREATE INDEX IF NOT EXISTS idx_identity_permissions_resource ON identity_permissions (resource);

-- ─── User ↔ Role (many-to-many) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS identity_user_roles (
    user_id UUID NOT NULL REFERENCES identity_users(id)  ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES identity_roles(id)  ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_identity_user_roles_user_id ON identity_user_roles (user_id);
CREATE INDEX IF NOT EXISTS idx_identity_user_roles_role_id ON identity_user_roles (role_id);

-- ─── Role ↔ Permission (many-to-many) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS identity_role_permissions (
    role_id       UUID NOT NULL REFERENCES identity_roles(id)       ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES identity_permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_identity_role_permissions_role_id ON identity_role_permissions (role_id);

-- ─── Refresh Tokens ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS identity_refresh_tokens (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    user_agent TEXT        NOT NULL DEFAULT '',
    ip_address VARCHAR(45) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT identity_refresh_tokens_hash_unique UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_identity_refresh_tokens_user_id    ON identity_refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_identity_refresh_tokens_expires_at ON identity_refresh_tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_identity_refresh_tokens_revoked_at ON identity_refresh_tokens (revoked_at);

-- ─── Audit Logs ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS identity_audit_logs (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID        REFERENCES identity_users(id) ON DELETE SET NULL,
    action         VARCHAR(100) NOT NULL,
    resource       VARCHAR(100) NOT NULL,
    resource_id    VARCHAR(255) NOT NULL DEFAULT '',
    old_value      JSONB,
    new_value      JSONB,
    ip_address     VARCHAR(45)  NOT NULL DEFAULT '',
    user_agent     TEXT         NOT NULL DEFAULT '',
    trace_id       VARCHAR(255) NOT NULL DEFAULT '',
    correlation_id VARCHAR(255) NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_identity_audit_logs_user_id    ON identity_audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_identity_audit_logs_action     ON identity_audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_identity_audit_logs_created_at ON identity_audit_logs (created_at DESC);

-- ─── Outbox Events ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS identity_outbox_events (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name   VARCHAR(255) NOT NULL,
    routing_key  VARCHAR(255) NOT NULL,
    payload      JSONB        NOT NULL,
    status       VARCHAR(50)  NOT NULL DEFAULT 'pending',
    retry_count  INTEGER      NOT NULL DEFAULT 0,
    error        TEXT         NOT NULL DEFAULT '',
    published_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT identity_outbox_events_status_check CHECK (status IN ('pending', 'published', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_identity_outbox_events_status     ON identity_outbox_events (status)     WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_identity_outbox_events_created_at ON identity_outbox_events (created_at) WHERE status = 'pending';

-- ─── Seed Default Roles ───────────────────────────────────────────────────────
INSERT INTO identity_roles (id, name, description) VALUES
    ('00000000-0000-0000-0000-000000000001', 'super_admin', 'Full system access — no restrictions'),
    ('00000000-0000-0000-0000-000000000002', 'admin',       'Administrative access to all modules'),
    ('00000000-0000-0000-0000-000000000003', 'manager',     'Production planning and workforce management'),
    ('00000000-0000-0000-0000-000000000004', 'operator',    'View-only dashboard and limited actions')
ON CONFLICT (name) DO NOTHING;

-- ─── Seed Default Permissions ─────────────────────────────────────────────────
INSERT INTO identity_permissions (name, resource, action, description) VALUES
    -- Identity
    ('user.create',       'user',       'create',   'Create new user accounts'),
    ('user.view',         'user',       'view',     'View user profiles and lists'),
    ('user.update',       'user',       'update',   'Update user information and status'),
    ('user.delete',       'user',       'delete',   'Delete user accounts'),
    ('role.manage',       'role',       'manage',   'Create, update, and delete roles'),
    ('permission.manage', 'permission', 'manage',   'Create and assign permissions'),
    -- Workforce
    ('worker.create',     'worker',     'create',   'Add workers to the system'),
    ('worker.view',       'worker',     'view',     'View worker profiles and skill matrix'),
    ('worker.update',     'worker',     'update',   'Update worker information'),
    ('worker.delete',     'worker',     'delete',   'Remove workers from the system'),
    -- Planning
    ('planning.publish',  'planning',   'publish',  'Publish shift plans and calendars'),
    ('planning.override', 'planning',   'override', 'Override published plans'),
    -- Production
    ('production.release','production', 'release',  'Release production and work orders'),
    -- Assignment
    ('assignment.override','assignment','override',  'Override automatic assignments'),
    -- Audit & Dashboard
    ('audit.view',        'audit',      'view',     'View audit trail'),
    ('dashboard.view',    'dashboard',  'view',     'Access the MES dashboard')
ON CONFLICT (name) DO NOTHING;
