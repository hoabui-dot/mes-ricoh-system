-- Assignment Module Migration (Up)
-- Phase 5: Assignment Engine

-- ─── Assignments ──────────────────────────────────────────────────────────────
CREATE TABLE assignment_assignments (
    id              UUID PRIMARY KEY,
    work_order_id   UUID NOT NULL,       -- logical ref: production_work_orders.id
    operation_id    UUID NOT NULL,       -- logical ref: production_operations.id
    revision        INTEGER NOT NULL DEFAULT 1,
    status          VARCHAR(50) NOT NULL DEFAULT 'proposed',
    proposed_by     VARCHAR(255) NOT NULL DEFAULT 'system',
    reviewed_by     UUID,                -- manager user id
    score           NUMERIC(6,2) NOT NULL DEFAULT 0.0,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_assignment_work_order       ON assignment_assignments (work_order_id);
CREATE INDEX idx_assignment_operation        ON assignment_assignments (operation_id);
CREATE INDEX idx_assignment_status           ON assignment_assignments (status);
CREATE INDEX idx_assignment_work_op_revision ON assignment_assignments (work_order_id, operation_id, revision DESC);

-- ─── Assigned Workers ─────────────────────────────────────────────────────────
-- Denormalized: worker_name is stored at assignment time so history is immutable.
CREATE TABLE assignment_assigned_workers (
    id              UUID PRIMARY KEY,
    assignment_id   UUID NOT NULL REFERENCES assignment_assignments(id) ON DELETE CASCADE,
    worker_id       UUID NOT NULL,       -- logical ref: workforce_workers.id
    worker_name     VARCHAR(255) NOT NULL,
    skill_matched   TEXT NOT NULL DEFAULT '[]',   -- JSON array of skill codes
    score           NUMERIC(6,2) NOT NULL DEFAULT 0.0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_assignment_assigned_workers_assignment ON assignment_assigned_workers (assignment_id);

-- ─── Outbox Events ────────────────────────────────────────────────────────────
CREATE TABLE assignment_outbox_events (
    id              UUID PRIMARY KEY,
    event_name      VARCHAR(255) NOT NULL,
    routing_key     VARCHAR(255) NOT NULL,
    payload         TEXT NOT NULL,
    status          VARCHAR(50) NOT NULL DEFAULT 'pending',
    retry_count     INTEGER NOT NULL DEFAULT 0,
    error           TEXT,
    published_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_assignment_outbox_status     ON assignment_outbox_events (status);
CREATE INDEX idx_assignment_outbox_created_at ON assignment_outbox_events (created_at);
