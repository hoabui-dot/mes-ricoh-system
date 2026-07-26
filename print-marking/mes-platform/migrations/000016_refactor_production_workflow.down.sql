-- Down migration: Rollback production planning refactor
ALTER TABLE production_work_orders DROP COLUMN IF EXISTS workflow_progress;
ALTER TABLE production_work_orders DROP COLUMN IF EXISTS current_operation;

ALTER TABLE production_orders ALTER COLUMN operation_type SET NOT NULL;
ALTER TABLE production_orders ALTER COLUMN station SET NOT NULL;

ALTER TABLE production_orders DROP COLUMN IF EXISTS production_status;
ALTER TABLE production_orders DROP COLUMN IF EXISTS approval_status;
ALTER TABLE production_orders DROP COLUMN IF EXISTS scrap_quantity;
ALTER TABLE production_orders DROP COLUMN IF EXISTS workflow_id;
ALTER TABLE production_orders DROP COLUMN IF EXISTS product_revision;
ALTER TABLE production_orders DROP COLUMN IF EXISTS product;
ALTER TABLE production_orders DROP COLUMN IF EXISTS customer;
