-- Production Module Migration (Up)
-- Phase 4: Production Orders, Work Orders, Routings, Operations

-- ─── Production Orders ────────────────────────────────────────────────────────
CREATE TABLE production_orders (
    id              UUID PRIMARY KEY,
    order_number    VARCHAR(100) UNIQUE NOT NULL,
    product_name    VARCHAR(255) NOT NULL,
    quantity        INTEGER NOT NULL DEFAULT 1,
    priority        INTEGER NOT NULL DEFAULT 50,  -- 1=lowest, 100=highest
    status          VARCHAR(50) NOT NULL DEFAULT 'draft',
    due_date        DATE,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_production_orders_status   ON production_orders (status);
CREATE INDEX idx_production_orders_priority ON production_orders (priority DESC);
CREATE INDEX idx_production_orders_due_date ON production_orders (due_date);

-- ─── Production Routings ──────────────────────────────────────────────────────
CREATE TABLE production_routings (
    id          UUID PRIMARY KEY,
    name        VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Production Operations (owned by Routing) ─────────────────────────────────
CREATE TABLE production_operations (
    id                  UUID PRIMARY KEY,
    routing_id          UUID NOT NULL REFERENCES production_routings(id) ON DELETE CASCADE,
    sequence            INTEGER NOT NULL,
    name                VARCHAR(255) NOT NULL,
    machine_type        VARCHAR(100) NOT NULL DEFAULT '',
    estimated_minutes   INTEGER NOT NULL DEFAULT 0,
    min_operators       INTEGER NOT NULL DEFAULT 1,
    max_operators       INTEGER NOT NULL DEFAULT 1,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (routing_id, sequence)
);

CREATE INDEX idx_production_operations_routing ON production_operations (routing_id);

-- ─── Operation Required Skills ─────────────────────────────────────────────────
CREATE TABLE production_operation_skills (
    operation_id    UUID NOT NULL REFERENCES production_operations(id) ON DELETE CASCADE,
    skill_code      VARCHAR(50) NOT NULL,
    PRIMARY KEY (operation_id, skill_code)
);

-- ─── Production Work Orders ───────────────────────────────────────────────────
CREATE TABLE production_work_orders (
    id                  UUID PRIMARY KEY,
    production_order_id UUID NOT NULL,       -- logical ref: production_orders.id
    routing_id          UUID NOT NULL,       -- logical ref: production_routings.id
    sequence            INTEGER NOT NULL DEFAULT 1,
    status              VARCHAR(50) NOT NULL DEFAULT 'pending',
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_production_work_orders_production_order ON production_work_orders (production_order_id);
CREATE INDEX idx_production_work_orders_status           ON production_work_orders (status);

-- ─── Outbox Events ────────────────────────────────────────────────────────────
CREATE TABLE production_outbox_events (
    id              UUID PRIMARY KEY,
    event_name      VARCHAR(255) NOT NULL,
    routing_key     VARCHAR(255) NOT NULL,
    payload         JSONB NOT NULL,
    status          VARCHAR(50) NOT NULL DEFAULT 'pending',
    retry_count     INTEGER NOT NULL DEFAULT 0,
    error           TEXT,
    published_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_production_outbox_status     ON production_outbox_events (status);
CREATE INDEX idx_production_outbox_created_at ON production_outbox_events (created_at);
