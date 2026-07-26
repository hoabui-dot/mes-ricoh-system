-- Production Module Migration (Down)
DROP TABLE IF EXISTS production_outbox_events;
DROP TABLE IF EXISTS production_work_orders;
DROP TABLE IF EXISTS production_operation_skills;
DROP TABLE IF EXISTS production_operations;
DROP TABLE IF EXISTS production_routings;
DROP TABLE IF EXISTS production_orders;
