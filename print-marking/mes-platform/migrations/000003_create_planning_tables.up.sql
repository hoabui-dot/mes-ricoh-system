-- Migration: 000003_create_planning_tables.up.sql
-- Phase 3: Planning module
-- Author: MES Platform
-- Date: 2026-07-01

-- ─── Shift Templates ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS planning_shift_templates (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL,
    start_time  VARCHAR(5)   NOT NULL, -- format: "HH:MM"
    end_time    VARCHAR(5)   NOT NULL, -- format: "HH:MM"
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT planning_shift_templates_name_unique UNIQUE (name)
);

-- ─── Daily Shifts ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS planning_shifts (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_template_id UUID        NOT NULL REFERENCES planning_shift_templates(id) ON DELETE CASCADE,
    date              DATE        NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT planning_shifts_date_tpl_unique UNIQUE (date, shift_template_id)
);

CREATE INDEX IF NOT EXISTS idx_planning_shifts_date ON planning_shifts (date);

-- ─── Team Shift Assignments ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS planning_team_assignments (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id   UUID        NOT NULL REFERENCES planning_shifts(id) ON DELETE CASCADE,
    team_id    UUID        NOT NULL, -- logical reference to workforce_teams.id
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT planning_team_assignments_unique UNIQUE (shift_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_planning_team_assignments_team ON planning_team_assignments (team_id);

-- ─── Worker Shift Assignments ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS planning_worker_assignments (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id   UUID        NOT NULL REFERENCES planning_shifts(id) ON DELETE CASCADE,
    worker_id  UUID        NOT NULL, -- logical reference to workforce_workers.id
    role       VARCHAR(50)  NOT NULL DEFAULT 'operator',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT planning_worker_assignments_unique UNIQUE (shift_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_planning_worker_assignments_worker ON planning_worker_assignments (worker_id);

-- ─── Holidays ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS planning_holidays (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    date        DATE        NOT NULL,
    name        VARCHAR(100) NOT NULL,
    description VARCHAR(255) NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT planning_holidays_date_unique UNIQUE (date)
);

CREATE INDEX IF NOT EXISTS idx_planning_holidays_date ON planning_holidays (date);

-- ─── Leaves ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS planning_leaves (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id   UUID        NOT NULL, -- logical reference to workforce_workers.id
    start_date  DATE        NOT NULL,
    end_date    DATE        NOT NULL,
    status      VARCHAR(50)  NOT NULL DEFAULT 'pending',
    reason      VARCHAR(255) NOT NULL DEFAULT '',
    approved_by UUID,                 -- logical reference to identity_users.id
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT planning_leaves_status_check CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_planning_leaves_worker ON planning_leaves (worker_id);
CREATE INDEX IF NOT EXISTS idx_planning_leaves_dates  ON planning_leaves (start_date, end_date);

-- ─── Overtimes ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS planning_overtimes (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id   UUID          NOT NULL, -- logical reference to workforce_workers.id
    date        DATE          NOT NULL,
    hours       NUMERIC(4, 2) NOT NULL,
    status      VARCHAR(50)    NOT NULL DEFAULT 'pending',
    reason      VARCHAR(255)   NOT NULL DEFAULT '',
    approved_by UUID,                   -- logical reference to identity_users.id
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT planning_overtimes_status_check CHECK (status IN ('pending', 'approved', 'rejected')),
    CONSTRAINT planning_overtimes_hours_check  CHECK (hours > 0 AND hours <= 24.00)
);

CREATE INDEX IF NOT EXISTS idx_planning_overtimes_worker ON planning_overtimes (worker_id);
CREATE INDEX IF NOT EXISTS idx_planning_overtimes_date   ON planning_overtimes (date);

-- ─── Outbox Events ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS planning_outbox_events (
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

    CONSTRAINT planning_outbox_events_status_check CHECK (status IN ('pending', 'published', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_planning_outbox_events_status     ON planning_outbox_events (status)     WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_planning_outbox_events_created_at ON planning_outbox_events (created_at) WHERE status = 'pending';
