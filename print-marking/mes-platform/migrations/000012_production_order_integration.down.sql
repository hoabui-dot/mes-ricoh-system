-- Production Module Order Integration (Down)

-- Drop indexes and table
DROP INDEX IF EXISTS idx_production_orders_gateway_order;
DROP INDEX IF EXISTS idx_production_order_events_po;
DROP TABLE IF EXISTS production_order_events;

-- Drop columns from production_orders
ALTER TABLE production_orders DROP COLUMN IF EXISTS operation_type;
ALTER TABLE production_orders DROP COLUMN IF EXISTS station;
ALTER TABLE production_orders DROP COLUMN IF EXISTS gateway_order_id;
