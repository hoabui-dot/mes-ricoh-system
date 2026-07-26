-- Migration: 000002_create_workforce_tables.up.sql
-- Phase 2: Workforce module
-- Author: MES Platform
-- Date: 2026-06-30

-- ─── Departments ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workforce_departments (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL,
    description VARCHAR(255) NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT workforce_departments_name_unique UNIQUE (name)
);

-- ─── Workshops ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workforce_workshops (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id UUID        NOT NULL REFERENCES workforce_departments(id) ON DELETE CASCADE,
    name          VARCHAR(100) NOT NULL,
    description   VARCHAR(255) NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT workforce_workshops_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_workforce_workshops_dept ON workforce_workshops (department_id);

-- ─── Teams ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workforce_teams (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workshop_id UUID        NOT NULL REFERENCES workforce_workshops(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    description VARCHAR(255) NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT workforce_teams_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_workforce_teams_workshop ON workforce_teams (workshop_id);

-- ─── Workers ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workforce_workers (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        UNIQUE, -- logical link to identity_users
    first_name    VARCHAR(100) NOT NULL,
    last_name     VARCHAR(100) NOT NULL,
    email         VARCHAR(255) NOT NULL,
    phone         VARCHAR(20)  NOT NULL DEFAULT '',
    employee_code VARCHAR(50)  NOT NULL,
    department_id UUID        REFERENCES workforce_departments(id) ON DELETE SET NULL,
    workshop_id   UUID        REFERENCES workforce_workshops(id)   ON DELETE SET NULL,
    team_id       UUID        REFERENCES workforce_teams(id)       ON DELETE SET NULL,
    status        VARCHAR(50)  NOT NULL DEFAULT 'active',
    availability  VARCHAR(50)  NOT NULL DEFAULT 'available',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ,

    CONSTRAINT workforce_workers_code_unique UNIQUE (employee_code),
    CONSTRAINT workforce_workers_email_unique UNIQUE (email),
    CONSTRAINT workforce_workers_status_check CHECK (status IN ('active', 'inactive', 'terminated')),
    CONSTRAINT workforce_workers_avail_check  CHECK (availability IN ('available', 'on_leave', 'suspended'))
);

CREATE INDEX IF NOT EXISTS idx_workforce_workers_email    ON workforce_workers (email) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_workforce_workers_code     ON workforce_workers (employee_code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_workforce_workers_dept     ON workforce_workers (department_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_workforce_workers_workshop ON workforce_workers (workshop_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_workforce_workers_team     ON workforce_workers (team_id) WHERE deleted_at IS NULL;

-- ─── Skills ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workforce_skills (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL,
    code        VARCHAR(50)  NOT NULL,
    description VARCHAR(255) NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT workforce_skills_name_unique UNIQUE (name),
    CONSTRAINT workforce_skills_code_unique UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_workforce_skills_code ON workforce_skills (code);

-- ─── Skill Matrix (Many-to-Many with proficiency) ──────────────────────────────
CREATE TABLE IF NOT EXISTS workforce_skill_matrix (
    worker_id         UUID        NOT NULL REFERENCES workforce_workers(id) ON DELETE CASCADE,
    skill_id          UUID        NOT NULL REFERENCES workforce_skills(id)  ON DELETE CASCADE,
    proficiency_level INTEGER     NOT NULL DEFAULT 1,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (worker_id, skill_id),
    CONSTRAINT workforce_skill_matrix_prof_check CHECK (proficiency_level BETWEEN 1 AND 4)
);

-- ─── Certificates ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workforce_certificates (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id         UUID        NOT NULL REFERENCES workforce_workers(id) ON DELETE CASCADE,
    name              VARCHAR(100) NOT NULL,
    issuing_authority VARCHAR(100) NOT NULL,
    certificate_number VARCHAR(100) NOT NULL,
    issued_at         TIMESTAMPTZ NOT NULL,
    expires_at        TIMESTAMPTZ NOT NULL,
    document_url      VARCHAR(255) NOT NULL DEFAULT '',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT workforce_certs_number_unique UNIQUE (certificate_number)
);

CREATE INDEX IF NOT EXISTS idx_workforce_certs_worker ON workforce_certificates (worker_id);

-- ─── Outbox Events ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workforce_outbox_events (
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

    CONSTRAINT workforce_outbox_events_status_check CHECK (status IN ('pending', 'published', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_workforce_outbox_events_status     ON workforce_outbox_events (status)     WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_workforce_outbox_events_created_at ON workforce_outbox_events (created_at) WHERE status = 'pending';
