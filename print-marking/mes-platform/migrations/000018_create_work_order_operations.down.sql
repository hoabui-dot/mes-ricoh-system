DELETE FROM workflow_operations WHERE workflow_id IN ('501ae111-0000-0000-0000-000000000001', '501ae111-0000-0000-0000-000000000002', '501ae111-0000-0000-0000-000000000003');
DELETE FROM production_workflows WHERE id IN ('501ae111-0000-0000-0000-000000000001', '501ae111-0000-0000-0000-000000000002', '501ae111-0000-0000-0000-000000000003');

DROP TABLE IF EXISTS work_order_operations;

ALTER TABLE workflow_operations DROP COLUMN IF EXISTS operation_name;
ALTER TABLE workflow_operations DROP COLUMN IF EXISTS requires_station;
ALTER TABLE workflow_operations DROP COLUMN IF EXISTS default_station_type;
ALTER TABLE workflow_operations DROP COLUMN IF EXISTS quality_check_required;
ALTER TABLE workflow_operations DROP COLUMN IF EXISTS is_final_operation;
ALTER TABLE workflow_operations DROP COLUMN IF EXISTS required_skills;
