-- Projection Module Migration (Up)
-- Phase 6: Read Models, Dashboard, Statistics

-- ─── Dashboard Read Model ─────────────────────────────────────────────────────
-- A single-row (or time-windowed) materialized summary for the factory dashboard.
-- Updated by consuming domain events via the read model builder.
CREATE TABLE projection_dashboard_snapshots (
    id              UUID PRIMARY KEY,
    snapshot_date   DATE NOT NULL UNIQUE,
    total_orders    INTEGER NOT NULL DEFAULT 0,
    draft_orders    INTEGER NOT NULL DEFAULT 0,
    released_orders INTEGER NOT NULL DEFAULT 0,
    in_progress_orders INTEGER NOT NULL DEFAULT 0,
    completed_orders   INTEGER NOT NULL DEFAULT 0,
    cancelled_orders   INTEGER NOT NULL DEFAULT 0,
    total_work_orders  INTEGER NOT NULL DEFAULT 0,
    pending_work_orders   INTEGER NOT NULL DEFAULT 0,
    active_work_orders    INTEGER NOT NULL DEFAULT 0,
    completed_work_orders INTEGER NOT NULL DEFAULT 0,
    total_workers       INTEGER NOT NULL DEFAULT 0,
    available_workers   INTEGER NOT NULL DEFAULT 0,
    on_leave_workers    INTEGER NOT NULL DEFAULT 0,
    open_assignments    INTEGER NOT NULL DEFAULT 0,
    approved_assignments INTEGER NOT NULL DEFAULT 0,
    avg_assignment_score NUMERIC(6,2) NOT NULL DEFAULT 0.0,
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_projection_dashboard_date ON projection_dashboard_snapshots (snapshot_date DESC);

-- ─── Production Order Stats ───────────────────────────────────────────────────
CREATE TABLE projection_order_stats (
    id              UUID PRIMARY KEY,
    period          VARCHAR(20) NOT NULL,  -- 'daily', 'weekly', 'monthly'
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    orders_created  INTEGER NOT NULL DEFAULT 0,
    orders_completed INTEGER NOT NULL DEFAULT 0,
    orders_cancelled INTEGER NOT NULL DEFAULT 0,
    avg_completion_days NUMERIC(6,2) NOT NULL DEFAULT 0.0,
    total_units_produced INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (period, period_start)
);

-- ─── Worker Utilization Stats ─────────────────────────────────────────────────
CREATE TABLE projection_worker_stats (
    id              UUID PRIMARY KEY,
    worker_id       UUID NOT NULL,          -- logical ref
    worker_name     VARCHAR(255) NOT NULL,  -- denormalized
    period          VARCHAR(20) NOT NULL,
    period_start    DATE NOT NULL,
    assignments_count     INTEGER NOT NULL DEFAULT 0,
    approved_count        INTEGER NOT NULL DEFAULT 0,
    overridden_count      INTEGER NOT NULL DEFAULT 0,
    avg_score             NUMERIC(6,2) NOT NULL DEFAULT 0.0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (worker_id, period, period_start)
);

CREATE INDEX idx_projection_worker_stats_period ON projection_worker_stats (period, period_start);
