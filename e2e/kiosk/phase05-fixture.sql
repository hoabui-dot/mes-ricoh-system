BEGIN;

DELETE FROM outbox_events WHERE payload->'payload'->>'wo_id' = '05000000-0000-0000-0000-000000000001';
DELETE FROM operation_confirmation WHERE wo_operation_id IN (SELECT wo_operation_id FROM wo_operation WHERE wo_id = '05000000-0000-0000-0000-000000000001');
DELETE FROM wo_operation_execution_history WHERE wo_id = '05000000-0000-0000-0000-000000000001';
DELETE FROM execution_session WHERE wo_operation_id IN (SELECT wo_operation_id FROM wo_operation WHERE wo_id = '05000000-0000-0000-0000-000000000001');
DELETE FROM wo_print_job WHERE wo_id = '05000000-0000-0000-0000-000000000001';
DELETE FROM wo_resource_allocation WHERE wo_id = '05000000-0000-0000-0000-000000000001';
DELETE FROM wo_operation WHERE wo_id = '05000000-0000-0000-0000-000000000001';
DELETE FROM wo_header WHERE wo_id = '05000000-0000-0000-0000-000000000001';
DELETE FROM rm_item_revision WHERE master_id = '05000000-0000-0000-0000-000000000017';
DELETE FROM rm_equipment WHERE master_id = '05000000-0000-0000-0000-000000000015';
DELETE FROM rm_work_center WHERE master_id = '05000000-0000-0000-0000-000000000013';

INSERT INTO rm_work_center(master_id, code, name, site_id, area_id, lifecycle_status)
VALUES ('05000000-0000-0000-0000-000000000013', 'WC-PHASE05-RUNTIME',
  '{"vi":"Trung tâm Phase 05","en":"Phase 05 Work Center","ja":"Phase 05 ワークセンター","ko":"Phase 05 작업장"}',
  '05000000-0000-0000-0000-000000000010', '05000000-0000-0000-0000-000000000020', 'Released');

INSERT INTO rm_equipment(master_id, code, name, site_id, work_center_id, equipment_type, lifecycle_status)
VALUES ('05000000-0000-0000-0000-000000000015', 'EQ-PHASE05-RUNTIME',
  '{"vi":"Máy Phase 05","en":"Phase 05 Equipment","ja":"Phase 05 設備","ko":"Phase 05 설비"}',
  '05000000-0000-0000-0000-000000000010', '05000000-0000-0000-0000-000000000013', 'Machine', 'Released');

INSERT INTO rm_item_revision(master_id, code, name, revision_code, item_type, site_id, base_uom_id, base_uom_code, lifecycle_status)
VALUES ('05000000-0000-0000-0000-000000000017', 'ITEM-PHASE05-R1',
  '{"vi":"Sản phẩm Phase 05","en":"Phase 05 Product","ja":"Phase 05 製品","ko":"Phase 05 제품"}',
  'R1', 'FG', '05000000-0000-0000-0000-000000000010', '05000000-0000-0000-0000-000000000018', 'PCS', 'Released');

INSERT INTO wo_header(
  wo_id, wo_code, production_version_id, item_revision_id, item_code, item_name, quantity, uom_id,
  site_id, shift_id, planned_start_at, planned_end_at, status, created_by, dispatch_mode,
  selected_production_line_id, selected_production_line_code, selected_production_line_name_i18n,
  line_selection_mode, line_selection_status, updated_at)
VALUES (
  '05000000-0000-0000-0000-000000000001', 'WO-PHASE05-RUNTIME-01',
  '05000000-0000-0000-0000-000000000019', '05000000-0000-0000-0000-000000000017',
  'ITEM-PHASE05', 'Sản phẩm Phase 05', 10, '05000000-0000-0000-0000-000000000018',
  '05000000-0000-0000-0000-000000000010', '05000000-0000-0000-0000-000000000012',
  NOW() - INTERVAL '30 minutes', NOW() + INTERVAL '4 hours', 'Released', '__OPERATOR_ID__',
  'DEMO_SHARED_KIOSK', '05000000-0000-0000-0000-000000000011', 'LINE-PHASE05-RUNTIME',
  '{"vi":"Dây chuyền Phase 05","en":"Phase 05 Line","ja":"Phase 05 ライン","ko":"Phase 05 라인"}',
  'AUTO', 'READY', NOW());

INSERT INTO wo_operation(
  wo_operation_id, wo_id, sequence_no, operation_id, routing_operation_id, operation_code,
  operation_name, work_center_id, predecessor_seq, status, execution_target_type, workstation_id,
  production_line_id, production_line_code, production_line_name_i18n, expected_good_quantity,
  planned_start_at, planned_end_at, requires_output_label, print_status)
VALUES
('05000000-0000-0000-0000-000000000101','05000000-0000-0000-0000-000000000001',10,'05000000-0000-0000-0000-000000000201','05000000-0000-0000-0000-000000000301','OP-PREP','{"vi":"Chuẩn bị","en":"Preparation","ja":"準備","ko":"준비"}','05000000-0000-0000-0000-000000000013',NULL,'Ready','MANUAL','05000000-0000-0000-0000-000000000014','05000000-0000-0000-0000-000000000011','LINE-PHASE05-RUNTIME','{"vi":"Dây chuyền Phase 05","en":"Phase 05 Line","ja":"Phase 05 ライン","ko":"Phase 05 라인"}',10,NOW()-INTERVAL '30 minutes',NOW()+INTERVAL '30 minutes',false,'NotRequired'),
('05000000-0000-0000-0000-000000000102','05000000-0000-0000-0000-000000000001',20,'05000000-0000-0000-0000-000000000202','05000000-0000-0000-0000-000000000302','OP-QC','{"vi":"Kiểm tra chất lượng","en":"Quality check","ja":"品質検査","ko":"품질 검사"}','05000000-0000-0000-0000-000000000013','10','Ready','MANUAL','05000000-0000-0000-0000-000000000014','05000000-0000-0000-0000-000000000011','LINE-PHASE05-RUNTIME','{"vi":"Dây chuyền Phase 05","en":"Phase 05 Line","ja":"Phase 05 ライン","ko":"Phase 05 라인"}',10,NOW()+INTERVAL '30 minutes',NOW()+INTERVAL '90 minutes',true,'NotRequired'),
('05000000-0000-0000-0000-000000000103','05000000-0000-0000-0000-000000000001',30,'05000000-0000-0000-0000-000000000203','05000000-0000-0000-0000-000000000303','OP-TRIM','{"vi":"Hoàn thiện","en":"Finishing","ja":"仕上げ","ko":"마무리"}','05000000-0000-0000-0000-000000000013','20','Ready','MANUAL','05000000-0000-0000-0000-000000000014','05000000-0000-0000-0000-000000000011','LINE-PHASE05-RUNTIME','{"vi":"Dây chuyền Phase 05","en":"Phase 05 Line","ja":"Phase 05 ライン","ko":"Phase 05 라인"}',10,NOW()+INTERVAL '90 minutes',NOW()+INTERVAL '150 minutes',false,'NotRequired'),
('05000000-0000-0000-0000-000000000104','05000000-0000-0000-0000-000000000001',40,'05000000-0000-0000-0000-000000000204','05000000-0000-0000-0000-000000000304','OP-PRINT','{"vi":"In nhãn","en":"Print label","ja":"ラベル印刷","ko":"라벨 인쇄"}','05000000-0000-0000-0000-000000000013','30','Pending','PRINT_STATION','05000000-0000-0000-0000-000000000014','05000000-0000-0000-0000-000000000011','LINE-PHASE05-RUNTIME','{"vi":"Dây chuyền Phase 05","en":"Phase 05 Line","ja":"Phase 05 ライン","ko":"Phase 05 라인"}',10,NOW()+INTERVAL '150 minutes',NOW()+INTERVAL '180 minutes',true,'NotRequired');

INSERT INTO wo_resource_allocation(
  wo_id, wo_operation_id, site_id, planned_work_center_id, planned_workstation_id, planned_equipment_id,
  planned_shift_id, planned_start_at, planned_end_at, source, status, validation_status,
  validation_snapshot, allocated_by, planned_production_line_id)
SELECT '05000000-0000-0000-0000-000000000001', wo_operation_id,
  '05000000-0000-0000-0000-000000000010', '05000000-0000-0000-0000-000000000013',
  '05000000-0000-0000-0000-000000000014', '05000000-0000-0000-0000-000000000015',
  '05000000-0000-0000-0000-000000000012', NOW()-INTERVAL '30 minutes', NOW()+INTERVAL '4 hours',
  'SystemRecommended', 'Committed', 'Valid',
  '{"candidate":{"workstation":{"id":"05000000-0000-0000-0000-000000000014","code":"WS-PHASE05-RUNTIME","name":{"vi":"Trạm Phase 05","en":"Phase 05 Workstation","ja":"Phase 05 ワークステーション","ko":"Phase 05 워크스테이션"}}}}',
  '__OPERATOR_ID__', '05000000-0000-0000-0000-000000000011'
FROM wo_operation
WHERE wo_id = '05000000-0000-0000-0000-000000000001' AND execution_target_type <> 'PRINT_STATION';

COMMIT;
