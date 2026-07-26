-- Up migration: Manufacturing Dispatch Plan & Work Order Extensions

-- ─── Production Dispatch Plans ────────────────────────────────────────────────
CREATE TABLE production_dispatch_plans (
    id                  UUID PRIMARY KEY,
    production_order_id UUID NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
    quantity            INTEGER NOT NULL CHECK (quantity > 0),
    station             VARCHAR(100) NOT NULL,
    execution_team      VARCHAR(100) NOT NULL,
    dispatch_strategy   VARCHAR(50) NOT NULL DEFAULT 'Serial',
    batch_size          INTEGER NOT NULL DEFAULT 1,
    status              VARCHAR(50) NOT NULL DEFAULT 'pending',
    generated_count     INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_production_dispatch_plans_order ON production_dispatch_plans (production_order_id);

-- ─── Work Order Schema Enhancements ──────────────────────────────────────────
ALTER TABLE production_work_orders ADD COLUMN dispatch_plan_id UUID REFERENCES production_dispatch_plans(id) ON DELETE SET NULL;
ALTER TABLE production_work_orders ADD COLUMN serial_number VARCHAR(100) UNIQUE;
ALTER TABLE production_work_orders ADD COLUMN barcode VARCHAR(100);
ALTER TABLE production_work_orders ADD COLUMN qr_code VARCHAR(100);
ALTER TABLE production_work_orders ADD COLUMN current_step VARCHAR(100) DEFAULT '';
ALTER TABLE production_work_orders ADD COLUMN current_attempt INTEGER NOT NULL DEFAULT 1;
ALTER TABLE production_work_orders ADD COLUMN assigned_station VARCHAR(100) DEFAULT '';
ALTER TABLE production_work_orders ADD COLUMN assigned_team VARCHAR(100) DEFAULT '';
ALTER TABLE production_work_orders ADD COLUMN trace_id VARCHAR(100) DEFAULT '';
ALTER TABLE production_work_orders ADD COLUMN retry_history JSONB DEFAULT '[]';
ALTER TABLE production_work_orders ADD COLUMN gateway_job_id VARCHAR(100) DEFAULT NULL;

-- ─── Work Order Timelines ─────────────────────────────────────────────────────
CREATE TABLE production_work_order_timelines (
    id              UUID PRIMARY KEY,
    work_order_id   UUID NOT NULL REFERENCES production_work_orders(id) ON DELETE CASCADE,
    stage           VARCHAR(100) NOT NULL,
    status          VARCHAR(50) NOT NULL,
    detail          TEXT NOT NULL,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_production_work_order_timelines_wo ON production_work_order_timelines (work_order_id);
CREATE INDEX idx_production_work_order_timelines_occurred ON production_work_order_timelines (occurred_at ASC);

-- ─── Production Orders Extension ──────────────────────────────────────────────
ALTER TABLE production_orders ADD COLUMN quantity_completed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE production_orders ADD COLUMN quantity_running INTEGER NOT NULL DEFAULT 0;
ALTER TABLE production_orders ADD COLUMN quantity_failed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE production_orders ADD COLUMN quantity_cancelled INTEGER NOT NULL DEFAULT 0;
