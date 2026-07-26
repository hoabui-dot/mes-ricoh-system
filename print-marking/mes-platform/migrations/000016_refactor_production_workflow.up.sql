-- Up migration: Refactor Production Orders to planning-focused workflow
ALTER TABLE production_orders ADD COLUMN customer VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE production_orders ADD COLUMN product VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE production_orders ADD COLUMN product_revision VARCHAR(50) NOT NULL DEFAULT '';
ALTER TABLE production_orders ADD COLUMN workflow_id UUID REFERENCES production_workflows(id) ON DELETE SET NULL;
ALTER TABLE production_orders ADD COLUMN scrap_quantity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE production_orders ADD COLUMN approval_status VARCHAR(50) NOT NULL DEFAULT 'draft';
ALTER TABLE production_orders ADD COLUMN production_status VARCHAR(50) NOT NULL DEFAULT 'planned';

-- Allow station and operation_type to be nullable on the order level
ALTER TABLE production_orders ALTER COLUMN station DROP NOT NULL;
ALTER TABLE production_orders ALTER COLUMN operation_type DROP NOT NULL;

-- Add current_operation and workflow_progress to production_work_orders
ALTER TABLE production_work_orders ADD COLUMN current_operation VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE production_work_orders ADD COLUMN workflow_progress INTEGER NOT NULL DEFAULT 0;
