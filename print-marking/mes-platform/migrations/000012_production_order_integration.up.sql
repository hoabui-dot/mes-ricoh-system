-- Production Module Order Integration (Up)

-- Alter production_orders table
ALTER TABLE production_orders ADD COLUMN operation_type VARCHAR(50) DEFAULT 'PRINT_ONLY' NOT NULL;
ALTER TABLE production_orders ADD COLUMN station VARCHAR(100) DEFAULT '' NOT NULL;
ALTER TABLE production_orders ADD COLUMN gateway_order_id VARCHAR(100) DEFAULT NULL;

-- Create production_order_events table for timeline tracking
CREATE TABLE production_order_events (
    id                  UUID PRIMARY KEY,
    production_order_id UUID NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
    event_type          VARCHAR(100) NOT NULL,
    status              VARCHAR(50) NOT NULL,
    message             TEXT NOT NULL,
    occurred_at         TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast timeline queries
CREATE INDEX idx_production_order_events_po ON production_order_events(production_order_id);
CREATE INDEX idx_production_orders_gateway_order ON production_orders(gateway_order_id);
