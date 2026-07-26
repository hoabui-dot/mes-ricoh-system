-- Down migration: Rollback Manufacturing Dispatch

ALTER TABLE production_orders DROP COLUMN IF EXISTS quantity_completed;
ALTER TABLE production_orders DROP COLUMN IF EXISTS quantity_running;
ALTER TABLE production_orders DROP COLUMN IF EXISTS quantity_failed;
ALTER TABLE production_orders DROP COLUMN IF EXISTS quantity_cancelled;

DROP TABLE IF EXISTS production_work_order_timelines CASCADE;

ALTER TABLE production_work_orders DROP COLUMN IF EXISTS dispatch_plan_id;
ALTER TABLE production_work_orders DROP COLUMN IF EXISTS serial_number;
ALTER TABLE production_work_orders DROP COLUMN IF EXISTS barcode;
ALTER TABLE production_work_orders DROP COLUMN IF EXISTS qr_code;
ALTER TABLE production_work_orders DROP COLUMN IF EXISTS current_step;
ALTER TABLE production_work_orders DROP COLUMN IF EXISTS current_attempt;
ALTER TABLE production_work_orders DROP COLUMN IF EXISTS assigned_station;
ALTER TABLE production_work_orders DROP COLUMN IF EXISTS assigned_team;
ALTER TABLE production_work_orders DROP COLUMN IF EXISTS trace_id;
ALTER TABLE production_work_orders DROP COLUMN IF EXISTS retry_history;
ALTER TABLE production_work_orders DROP COLUMN IF EXISTS gateway_job_id;

DROP TABLE IF EXISTS production_dispatch_plans CASCADE;
