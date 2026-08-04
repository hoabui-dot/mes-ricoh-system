BEGIN;

DELETE FROM operation_confirmation WHERE wo_operation_id IN (SELECT wo_operation_id FROM wo_operation WHERE wo_id = '04000000-0000-0000-0000-000000000001');
DELETE FROM wo_operation_execution_history WHERE wo_id = '04000000-0000-0000-0000-000000000001';
DELETE FROM execution_session WHERE wo_operation_id IN (SELECT wo_operation_id FROM wo_operation WHERE wo_id = '04000000-0000-0000-0000-000000000001');
DELETE FROM wo_print_job WHERE wo_id = '04000000-0000-0000-0000-000000000001';
DELETE FROM wo_resource_allocation WHERE wo_id = '04000000-0000-0000-0000-000000000001';
DELETE FROM wo_operation WHERE wo_id = '04000000-0000-0000-0000-000000000001';
DELETE FROM wo_header WHERE wo_id = '04000000-0000-0000-0000-000000000001';
DELETE FROM rm_item_revision WHERE master_id = '04000000-0000-0000-0000-000000000017';
DELETE FROM rm_employee WHERE master_id = '04000000-0000-0000-0000-000000000016';
DELETE FROM rm_equipment WHERE master_id = '04000000-0000-0000-0000-000000000015';
DELETE FROM rm_work_center WHERE master_id = '04000000-0000-0000-0000-000000000013';

INSERT INTO rm_work_center(master_id, code, name, site_id, area_id, lifecycle_status)
VALUES ('04000000-0000-0000-0000-000000000013', 'WC-PHASE04-RUNTIME',
  '{"vi":"Trung tam Phase 04","en":"Phase 04 Work Center","ja":"Phase 04 ワークセンター","ko":"Phase 04 작업장"}',
  '04000000-0000-0000-0000-000000000010', '04000000-0000-0000-0000-000000000020', 'Released');

INSERT INTO rm_equipment(master_id, code, name, site_id, work_center_id, equipment_type, lifecycle_status)
VALUES ('04000000-0000-0000-0000-000000000015', 'EQ-PHASE04-RUNTIME',
  '{"vi":"May Phase 04","en":"Phase 04 Equipment","ja":"Phase 04 設備","ko":"Phase 04 설비"}',
  '04000000-0000-0000-0000-000000000010', '04000000-0000-0000-0000-000000000013', 'Machine', 'Released');

INSERT INTO rm_employee(master_id, code, name, site_id, employee_status, lifecycle_status)
VALUES ('04000000-0000-0000-0000-000000000016', 'OPERATOR-PHASE04',
  '{"vi":"Nhan vien Phase 04","en":"Phase 04 Operator","ja":"Phase 04 作業者","ko":"Phase 04 작업자"}',
  '04000000-0000-0000-0000-000000000010', 'Active', 'Released');

INSERT INTO rm_item_revision(master_id, code, name, revision_code, item_type, site_id, base_uom_id, base_uom_code, lifecycle_status)
VALUES ('04000000-0000-0000-0000-000000000017', 'ITEM-PHASE04-R1',
  '{"vi":"San pham Phase 04","en":"Phase 04 Product","ja":"Phase 04 製品","ko":"Phase 04 제품"}',
  'R1', 'FG', '04000000-0000-0000-0000-000000000010', '04000000-0000-0000-0000-000000000018', 'PCS', 'Released');

INSERT INTO wo_header(
  wo_id, wo_code, production_version_id, item_revision_id, item_code, item_name, quantity, uom_id,
  site_id, shift_id, planned_start_at, planned_end_at, status, created_by, dispatch_mode,
  selected_production_line_id, selected_production_line_code, selected_production_line_name_i18n,
  line_selection_mode, line_selection_status, updated_at)
VALUES (
  '04000000-0000-0000-0000-000000000001', 'WO-PHASE04-RUNTIME-01',
  '04000000-0000-0000-0000-000000000019', '04000000-0000-0000-0000-000000000017',
  'ITEM-PHASE04', 'San pham Phase 04', 100, '04000000-0000-0000-0000-000000000018',
  '04000000-0000-0000-0000-000000000010', '04000000-0000-0000-0000-000000000012',
  NOW() - INTERVAL '2 hours', NOW() + INTERVAL '4 hours', 'Paused', '04000000-0000-0000-0000-000000000016',
  'DEMO_SHARED_KIOSK', '04000000-0000-0000-0000-000000000011', 'LINE-PHASE04-RUNTIME',
  '{"vi":"Dây chuyền Phase 04","en":"Phase 04 Line","ja":"Phase 04 ライン","ko":"Phase 04 라인"}',
  'AUTO', 'READY', NOW());

INSERT INTO wo_operation(
  wo_operation_id, wo_id, sequence_no, operation_id, routing_operation_id, operation_code,
  operation_name, work_center_id, predecessor_seq, status, execution_target_type, workstation_id,
  production_line_id, production_line_code, production_line_name_i18n, expected_good_quantity,
  planned_start_at, planned_end_at, print_status)
VALUES
('04000000-0000-0000-0000-000000000101','04000000-0000-0000-0000-000000000001',10,'04000000-0000-0000-0000-000000000201','04000000-0000-0000-0000-000000000301','OP-PREP','{"vi":"Chuẩn bị","en":"Preparation","ja":"準備","ko":"준비"}','04000000-0000-0000-0000-000000000013',NULL,'Finished','MANUAL','04000000-0000-0000-0000-000000000014','04000000-0000-0000-0000-000000000011','LINE-PHASE04-RUNTIME','{"vi":"Dây chuyền Phase 04","en":"Phase 04 Line","ja":"Phase 04 ライン","ko":"Phase 04 라인"}',100,NOW()-INTERVAL '2 hours',NOW()-INTERVAL '90 minutes','NotRequired'),
('04000000-0000-0000-0000-000000000102','04000000-0000-0000-0000-000000000001',20,'04000000-0000-0000-0000-000000000202','04000000-0000-0000-0000-000000000302','OP-ASSEMBLY','{"vi":"Lắp ráp","en":"Assembly","ja":"組立","ko":"조립"}','04000000-0000-0000-0000-000000000013','10','InProgress','MANUAL','04000000-0000-0000-0000-000000000014','04000000-0000-0000-0000-000000000011','LINE-PHASE04-RUNTIME','{"vi":"Dây chuyền Phase 04","en":"Phase 04 Line","ja":"Phase 04 ライン","ko":"Phase 04 라인"}',100,NOW()-INTERVAL '90 minutes',NOW()-INTERVAL '30 minutes','NotRequired'),
('04000000-0000-0000-0000-000000000103','04000000-0000-0000-0000-000000000001',30,'04000000-0000-0000-0000-000000000203','04000000-0000-0000-0000-000000000303','OP-QC','{"vi":"Kiểm tra","en":"Quality check","ja":"品質検査","ko":"품질 검사"}','04000000-0000-0000-0000-000000000013','20','ExecutionError','MANUAL','04000000-0000-0000-0000-000000000014','04000000-0000-0000-0000-000000000011','LINE-PHASE04-RUNTIME','{"vi":"Dây chuyền Phase 04","en":"Phase 04 Line","ja":"Phase 04 ライン","ko":"Phase 04 라인"}',100,NOW()-INTERVAL '30 minutes',NOW()+INTERVAL '30 minutes','NotRequired'),
('04000000-0000-0000-0000-000000000104','04000000-0000-0000-0000-000000000001',40,'04000000-0000-0000-0000-000000000204','04000000-0000-0000-0000-000000000304','OP-PACK','{"vi":"Đóng gói","en":"Packing","ja":"梱包","ko":"포장"}','04000000-0000-0000-0000-000000000013','30','Ready','MANUAL','04000000-0000-0000-0000-000000000014','04000000-0000-0000-0000-000000000011','LINE-PHASE04-RUNTIME','{"vi":"Dây chuyền Phase 04","en":"Phase 04 Line","ja":"Phase 04 ライン","ko":"Phase 04 라인"}',100,NOW()+INTERVAL '30 minutes',NOW()+INTERVAL '90 minutes','NotRequired'),
('04000000-0000-0000-0000-000000000105','04000000-0000-0000-0000-000000000001',50,'04000000-0000-0000-0000-000000000205','04000000-0000-0000-0000-000000000305','OP-FINAL','{"vi":"Hoàn thiện","en":"Finishing","ja":"仕上げ","ko":"마무리"}','04000000-0000-0000-0000-000000000013',NULL,'Pending','MANUAL','04000000-0000-0000-0000-000000000014','04000000-0000-0000-0000-000000000011','LINE-PHASE04-RUNTIME','{"vi":"Dây chuyền Phase 04","en":"Phase 04 Line","ja":"Phase 04 ライン","ko":"Phase 04 라인"}',100,NOW()+INTERVAL '90 minutes',NOW()+INTERVAL '150 minutes','NotRequired'),
('04000000-0000-0000-0000-000000000106','04000000-0000-0000-0000-000000000001',60,'04000000-0000-0000-0000-000000000206','04000000-0000-0000-0000-000000000306','OP-PRINT','{"vi":"In nhãn","en":"Print label","ja":"ラベル印刷","ko":"라벨 인쇄"}','04000000-0000-0000-0000-000000000013','50','DispatchQueued','PRINT_STATION','04000000-0000-0000-0000-000000000014','04000000-0000-0000-0000-000000000011','LINE-PHASE04-RUNTIME','{"vi":"Dây chuyền Phase 04","en":"Phase 04 Line","ja":"Phase 04 ライン","ko":"Phase 04 라인"}',100,NOW()+INTERVAL '150 minutes',NOW()+INTERVAL '180 minutes','Queued');

INSERT INTO wo_resource_allocation(
  wo_id, wo_operation_id, site_id, planned_work_center_id, planned_workstation_id, planned_equipment_id,
  planned_shift_id, planned_start_at, planned_end_at, source, status, validation_status,
  validation_snapshot, allocated_by, planned_production_line_id)
SELECT '04000000-0000-0000-0000-000000000001', wo_operation_id,
  '04000000-0000-0000-0000-000000000010', '04000000-0000-0000-0000-000000000013',
  '04000000-0000-0000-0000-000000000014', '04000000-0000-0000-0000-000000000015',
  '04000000-0000-0000-0000-000000000012', NOW()-INTERVAL '2 hours', NOW()+INTERVAL '4 hours',
  'SystemRecommended', 'Committed', 'Valid',
  '{"candidate":{"workstation":{"id":"04000000-0000-0000-0000-000000000014","code":"WS-PHASE04-RUNTIME","name":{"vi":"Trạm Phase 04","en":"Phase 04 Workstation","ja":"Phase 04 ワークステーション","ko":"Phase 04 워크스테이션"}}}}',
  '04000000-0000-0000-0000-000000000016', '04000000-0000-0000-0000-000000000011'
FROM wo_operation
WHERE wo_id = '04000000-0000-0000-0000-000000000001' AND execution_target_type <> 'PRINT_STATION';

INSERT INTO execution_session(session_id, wo_operation_id, terminal_ref, operator_user_id, started_at, ended_at, status)
VALUES
('04000000-0000-0000-0000-000000000401','04000000-0000-0000-0000-000000000101','KIOSK-DEMO-01','04000000-0000-0000-0000-000000000016',NOW()-INTERVAL '110 minutes',NOW()-INTERVAL '100 minutes','COMPLETED'),
('04000000-0000-0000-0000-000000000402','04000000-0000-0000-0000-000000000102','KIOSK-DEMO-01','04000000-0000-0000-0000-000000000016',NOW()-INTERVAL '20 minutes',NULL,'IN_PROGRESS'),
('04000000-0000-0000-0000-000000000403','04000000-0000-0000-0000-000000000103','KIOSK-DEMO-01','04000000-0000-0000-0000-000000000016',NOW()-INTERVAL '50 minutes',NOW()-INTERVAL '40 minutes','FAILED');

INSERT INTO operation_confirmation(wo_operation_id, session_id, qty_good, qty_scrap, confirmed_at)
VALUES ('04000000-0000-0000-0000-000000000101','04000000-0000-0000-0000-000000000401',98,2,NOW()-INTERVAL '100 minutes');

INSERT INTO wo_operation_execution_history(
  wo_id, wo_operation_id, session_id, action, reason_code, reason_name_i18n, reason_text,
  actor_user_id, actor_role_code, terminal_ref, from_operation_status, to_operation_status,
  from_wo_status, to_wo_status, idempotency_key, trace_id, occurred_at)
VALUES ('04000000-0000-0000-0000-000000000001','04000000-0000-0000-0000-000000000103',
  '04000000-0000-0000-0000-000000000403','FAILED','EXEC-EQUIPMENT',
  '{"vi":"Lỗi thiết bị","en":"Equipment failure","ja":"設備故障","ko":"설비 고장"}',
  'Motor stopped','04000000-0000-0000-0000-000000000016','OPERATOR','KIOSK-DEMO-01',
  'InProgress','ExecutionError','InProgress','Paused','phase04-runtime-failure','phase04-runtime',NOW()-INTERVAL '40 minutes');

INSERT INTO wo_print_job(
  print_job_id, job_code, wo_id, wo_operation_id, operation_id, workstation_id,
  requested_quantity, status, idempotency_key, correlation_id, attempt_count,
  selected_printer_code, dispatched_at)
VALUES ('04000000-0000-0000-0000-000000000501','PJ-PHASE04-RUNTIME',
  '04000000-0000-0000-0000-000000000001','04000000-0000-0000-0000-000000000106',
  '04000000-0000-0000-0000-000000000206','04000000-0000-0000-0000-000000000014',
  100,'DispatchQueued','phase04-runtime-print','phase04-runtime',1,'PRINTER-PHASE04',NOW()-INTERVAL '5 minutes');

COMMIT;
