BEGIN;
DELETE FROM md_reason_code WHERE code IN ('EXEC-PHASE05-EQUIPMENT', 'QUALITY-PHASE05-SCRAP');
INSERT INTO md_reason_code(master_id, code, name, lifecycle_status, approved_at, reason_type, requires_comment)
VALUES
  ('05000000-0000-0000-0000-000000000601', 'EXEC-PHASE05-EQUIPMENT',
   '{"vi":"Lỗi thiết bị Phase 05","en":"Phase 05 equipment failure","ja":"Phase 05 設備故障","ko":"Phase 05 설비 오류"}',
   'Released', NOW(), 'ExecutionFailure', true),
  ('05000000-0000-0000-0000-000000000602', 'QUALITY-PHASE05-SCRAP',
   '{"vi":"Phế phẩm Phase 05","en":"Phase 05 quality scrap","ja":"Phase 05 品質不良","ko":"Phase 05 품질 불량"}',
   'Released', NOW(), 'Quality', false);
COMMIT;
