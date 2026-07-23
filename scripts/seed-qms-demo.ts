import { Pool, type PoolClient } from 'pg';

const INSPECTION_URL = process.env['QMS_INSPECTION_DATABASE_URL'] ?? 'postgresql://qms_inspection_user:qms_inspection_pass@localhost:15442/qms_inspection_db';
const NONCONFORMANCE_URL = process.env['QMS_NONCONFORMANCE_DATABASE_URL'] ?? 'postgresql://qms_nonconformance_user:qms_nonconformance_pass@localhost:15443/qms_nonconformance_db';
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
const QC_USER_ID = '8740ea3a-0076-487d-a2ff-a067eb3177bc';
const MANAGER_USER_ID = '00000000-0000-0000-0000-000000000002';
const SITE_ID = '9f785cbd-98aa-4b2c-98ef-287a189e760c';
const ITEM_REVISION_ID = '16e323c4-0cb8-41e6-ad57-3f2c4810a1bf';
const OPERATION_ID = '7f6c2d22-882f-4a64-bc4a-048492588f56';
const WORK_CENTER_ID = 'bee6283c-0deb-4306-8f44-e07e1c92341e';
const UOM_ID = '11111111-1111-4111-8111-111111111111';

const ids = {
  releasedPlan: 'a0000000-0000-4000-8000-000000000001', draftPlan: 'a0000000-0000-4000-8000-000000000002', reviewPlan: 'a0000000-0000-4000-8000-000000000003', obsoletePlan: 'a0000000-0000-4000-8000-000000000004',
  visual: 'a1000000-0000-4000-8000-000000000001', dimension: 'a1000000-0000-4000-8000-000000000002', hardness: 'a1000000-0000-4000-8000-000000000003', torque: 'a1000000-0000-4000-8000-000000000004',
  pendingResult: 'b0000000-0000-4000-8000-000000000001', passResult: 'b0000000-0000-4000-8000-000000000002', failResult: 'b0000000-0000-4000-8000-000000000003', historyResult: 'b0000000-0000-4000-8000-000000000004',
  pendingEvent: 'b1000000-0000-4000-8000-000000000001', passEvent: 'b1000000-0000-4000-8000-000000000002', failEvent: 'b1000000-0000-4000-8000-000000000003', historyEvent: 'b1000000-0000-4000-8000-000000000004',
  openNcr: 'c0000000-0000-4000-8000-000000000001', capaNcr: 'c0000000-0000-4000-8000-000000000002', reviewNcr: 'c0000000-0000-4000-8000-000000000003', closedNcr: 'c0000000-0000-4000-8000-000000000004',
  openCapa: 'd0000000-0000-4000-8000-000000000001', progressCapa: 'd0000000-0000-4000-8000-000000000002', verifiedCapa: 'd0000000-0000-4000-8000-000000000003', closedCapa: 'd0000000-0000-4000-8000-000000000004',
};

const vi = (viText: string, enText: string, jaText: string, koText: string) => JSON.stringify({ vi: viText, en: enText, ja: jaText, ko: koText });

async function seedInspection(pool: Pool): Promise<void> {
  const defectCodes = [
    ['SURF-CRACK', vi('Nứt bề mặt', 'Surface crack', '表面クラック', '표면 균열'), 'Critical'],
    ['DIM-OUT', vi('Sai kích thước', 'Out of dimension', '寸法不良', '치수 불량'), 'Major'],
    ['VIS-MARK', vi('Vết ngoại quan', 'Visual mark', '外観痕', '외관 자국'), 'Minor'],
    ['HARDNESS-LOW', vi('Độ cứng thấp', 'Low hardness', '硬度不足', '경도 부족'), 'Major'],
    ['TORQUE-LOW', vi('Mô-men xoắn thấp', 'Low torque', 'トルク不足', '토크 부족'), 'Critical'],
    ['BURR', vi('Ba via', 'Burr', 'バリ', '버'), 'Minor'],
  ] as const;
  for (const [code, name, category] of defectCodes) await pool.query(`INSERT INTO qms_defect_code (defect_code, defect_name, defect_category, status) VALUES ($1,$2::jsonb,$3,'Active') ON CONFLICT (defect_code) DO UPDATE SET defect_name=EXCLUDED.defect_name, defect_category=EXCLUDED.defect_category, status='Active', updated_at=NOW()`, [code, name, category]);
  const defects = Object.fromEntries((await pool.query<{ defect_code_id: string; defect_code: string }>('SELECT defect_code_id, defect_code FROM qms_defect_code WHERE defect_code = ANY($1::text[])', [defectCodes.map(([code]) => code)])).rows.map((row) => [row.defect_code, row.defect_code_id]));
  await pool.query(`INSERT INTO qms_rm_item_revision (item_revision_id,item_code,item_name,lifecycle_status) VALUES ($1,'FG-WS-CM01-R1',$2::jsonb,'Released') ON CONFLICT (item_revision_id) DO UPDATE SET item_name=EXCLUDED.item_name,lifecycle_status='Released',updated_at=NOW()`, [ITEM_REVISION_ID, vi('Cụm cao su kim loại CM01 R1', 'Rubber-metal mount CM01 R1', 'ゴム金属マウント CM01 R1', '고무 금속 마운트 CM01 R1')]);
  await pool.query(`INSERT INTO qms_rm_operation (operation_id,operation_code,operation_name,operation_type,site_id,lifecycle_status) VALUES ($1,'OP-QC',$2::jsonb,'Inspection',$3,'Active') ON CONFLICT (operation_id) DO UPDATE SET operation_name=EXCLUDED.operation_name,operation_type='Inspection',site_id=EXCLUDED.site_id,lifecycle_status='Active',updated_at=NOW()`, [OPERATION_ID, vi('Kiểm tra chất lượng', 'Quality inspection', '品質検査', '품질 검사'), SITE_ID]);
  await pool.query(`INSERT INTO qms_rm_site (site_id,site_code,site_name,lifecycle_status) VALUES ($1,'SITE-KZ3',$2::jsonb,'Active') ON CONFLICT (site_id) DO UPDATE SET site_name=EXCLUDED.site_name,lifecycle_status='Active',updated_at=NOW()`, [SITE_ID, vi('Nhà máy KZ3', 'KZ3 Factory', 'KZ3工場', 'KZ3 공장')]);
  await pool.query(`INSERT INTO qms_rm_uom (uom_id,uom_code,uom_name,lifecycle_status) VALUES ($1,'PCS',$2::jsonb,'Active') ON CONFLICT (uom_id) DO UPDATE SET uom_name=EXCLUDED.uom_name,lifecycle_status='Active',updated_at=NOW()`, [UOM_ID, vi('Cái', 'Piece', '個', '개')]);

  const plans = [
    [ids.releasedPlan, 'IP-DEMO-RELEASED', vi('Kế hoạch kiểm tra xuất xưởng', 'Final inspection plan', '出荷検査計画', '출하 검사 계획'), vi('Kế hoạch đầy đủ cho kiểm tra cuối chuyền.', 'Full plan for final line inspection.', '最終ライン検査の完全計画。', '최종 라인 검사의 전체 계획.'), 2, 'Released'],
    [ids.draftPlan, 'IP-DEMO-DRAFT', vi('Kế hoạch kiểm tra thử nghiệm', 'Pilot inspection plan', '試験検査計画', '파일럿 검사 계획'), vi('Bản nháp đang chờ kỹ thuật viên hoàn thiện.', 'Draft waiting for engineering completion.', '技術完了待ちのドラフト。', '기술 완료를 기다리는 초안.'), 3, 'Draft'],
    [ids.reviewPlan, 'IP-DEMO-REVIEW', vi('Kế hoạch kiểm tra xem xét', 'Inspection plan under review', 'レビュー中検査計画', '검토 중 검사 계획'), vi('Kế hoạch đang chờ quản lý chất lượng xem xét.', 'Plan waiting for quality manager review.', '品質管理者のレビュー待ち。', '품질 관리자 검토 대기.'), 4, 'InReview'],
    [ids.obsoletePlan, 'IP-DEMO-OBSOLETE', vi('Kế hoạch cũ', 'Retired inspection plan', '旧検査計画', '폐기 검사 계획'), vi('Kế hoạch đã được thay thế.', 'Plan replaced by a newer revision.', '新しい版に置き換え済み。', '새 버전으로 대체됨.'), 5, 'Obsolete'],
  ] as const;
  for (const [planId, code, name, description, version, status] of plans) await pool.query(`INSERT INTO qms_inspection_plan (plan_id,plan_code,plan_name,plan_description,item_revision_id,operation_id,site_id,plan_version,sampling_method,sample_size,status,effective_from,created_by) VALUES ($1,$2,$3::jsonb,$4::jsonb,$5,$6,$7,$8,'Full',1,$9::varchar,CASE WHEN $9::varchar='Released' THEN NOW()-INTERVAL '30 days' ELSE NULL END,$10) ON CONFLICT (plan_id) DO UPDATE SET plan_name=EXCLUDED.plan_name,plan_description=EXCLUDED.plan_description,status=EXCLUDED.status,updated_at=NOW()`, [planId, code, name, description, ITEM_REVISION_ID, OPERATION_ID, SITE_ID, version, status, SYSTEM_USER_ID]);
  const chars = [
    [ids.visual, ids.releasedPlan, 1, 'VISUAL-01', vi('Kiểm tra nứt bề mặt', 'Surface crack check', '表面クラック検査', '표면 균열 검사'), 'Attribute', null, null, null, defects['SURF-CRACK']],
    [ids.dimension, ids.releasedPlan, 2, 'DIM-01', vi('Đường kính ngoài', 'Outer diameter', '外径', '외경'), 'Variable', 48.8, 49.2, 49, defects['DIM-OUT']],
    [ids.hardness, ids.releasedPlan, 3, 'HARD-01', vi('Độ cứng cao su', 'Rubber hardness', 'ゴム硬度', '고무 경도'), 'Variable', 65, 75, 70, defects['HARDNESS-LOW']],
    ['a1000000-0000-4000-8000-000000000005', ids.draftPlan, 1, 'VISUAL-01', vi('Kiểm tra ngoại quan', 'Visual inspection', '外観検査', '외관 검사'), 'Attribute', null, null, null, defects['VIS-MARK']],
    ['a1000000-0000-4000-8000-000000000006', ids.reviewPlan, 1, 'TORQUE-01', vi('Mô-men siết', 'Fastener torque', '締付トルク', '체결 토크'), 'Variable', 22, 28, 25, defects['TORQUE-LOW']],
    ['a1000000-0000-4000-8000-000000000007', ids.obsoletePlan, 1, 'VISUAL-01', vi('Kiểm tra ngoại quan cũ', 'Legacy visual inspection', '旧外観検査', '기존 외관 검사'), 'Attribute', null, null, null, defects['VIS-MARK']],
  ] as const;
  for (const [characteristicId, planId, sequence, code, name, type, min, max, target, defectId] of chars) await pool.query(`INSERT INTO qms_inspection_characteristic (characteristic_id,plan_id,sequence_no,characteristic_code,characteristic_name,measurement_type,spec_min,spec_max,target_value,uom_id,default_defect_code_id,mandatory_flag) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,TRUE) ON CONFLICT (characteristic_id) DO UPDATE SET characteristic_name=EXCLUDED.characteristic_name,spec_min=EXCLUDED.spec_min,spec_max=EXCLUDED.spec_max,target_value=EXCLUDED.target_value,uom_id=EXCLUDED.uom_id,default_defect_code_id=EXCLUDED.default_defect_code_id`, [characteristicId, planId, sequence, code, name, type, min, max, target, type === 'Variable' ? UOM_ID : null, defectId]);
  const results = [
    [ids.pendingResult, ids.releasedPlan, '30000000-0000-4000-8000-000000000001', 'WO-QMS-DEMO-001', 'LOT-QMS-PENDING-001', 50, 0, 0, null, ids.pendingEvent],
    [ids.passResult, ids.releasedPlan, '30000000-0000-4000-8000-000000000002', 'WO-QMS-DEMO-002', 'LOT-QMS-PASS-001', 100, 100, 0, 'Pass', ids.passEvent],
    [ids.failResult, ids.releasedPlan, '30000000-0000-4000-8000-000000000003', 'WO-QMS-DEMO-003', 'LOT-QMS-FAIL-001', 98, 0, 98, 'Fail', ids.failEvent],
    [ids.historyResult, ids.releasedPlan, '30000000-0000-4000-8000-000000000004', 'WO-QMS-DEMO-004', 'LOT-QMS-HISTORY-001', 80, 79, 1, 'Fail', ids.historyEvent],
  ] as const;
  for (const [resultId, planId, workOrderId, workOrderLabel, lot, qty, passed, failed, outcome, sourceEventId] of results) await pool.query(`INSERT INTO qms_inspection_result (result_id,plan_id,work_order_id,work_center_id,item_revision_id,lot_or_label_ref,inspected_qty,passed_qty,failed_qty,overall_result,inspector_user_id,inspected_at,source_event_id,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::varchar,$11,CASE WHEN $10::varchar IS NULL THEN NULL ELSE NOW()-INTERVAL '1 day' END,$12,CASE WHEN $10::varchar IS NULL THEN NOW() ELSE NOW()-INTERVAL '30 days' END) ON CONFLICT (result_id) DO UPDATE SET lot_or_label_ref=EXCLUDED.lot_or_label_ref,inspected_qty=EXCLUDED.inspected_qty,passed_qty=EXCLUDED.passed_qty,failed_qty=EXCLUDED.failed_qty,overall_result=EXCLUDED.overall_result,inspector_user_id=EXCLUDED.inspector_user_id,inspected_at=EXCLUDED.inspected_at`, [resultId, planId, workOrderId, WORK_CENTER_ID, ITEM_REVISION_ID, `${workOrderLabel}-${lot}`, qty, passed, failed, outcome, outcome ? QC_USER_ID : null, sourceEventId]);
  const details = [[ids.passResult, ids.visual, 'Pass', null, 'Visual check passed'], [ids.passResult, ids.dimension, 'Pass', 49.0, 'Within specification'], [ids.passResult, ids.hardness, 'Pass', 70, 'Within specification'], [ids.failResult, ids.visual, 'Fail', null, 'Surface crack found during demo inspection'], [ids.failResult, ids.dimension, 'Pass', 49.1, 'Within specification'], [ids.failResult, ids.hardness, 'Fail', 61, 'Hardness below lower specification'], [ids.historyResult, ids.visual, 'Fail', null, 'Historical visual defect']];
  for (const [resultId, characteristicId, flag, value, comment] of details) { const defectId = flag === 'Fail' ? (characteristicId === ids.hardness ? defects['HARDNESS-LOW'] : defects['SURF-CRACK']) : null; await pool.query(`INSERT INTO qms_inspection_result_detail (result_id,characteristic_id,measured_value,result_flag,defect_code_id,comment) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (result_id,characteristic_id) DO UPDATE SET measured_value=EXCLUDED.measured_value,result_flag=EXCLUDED.result_flag,defect_code_id=EXCLUDED.defect_code_id,comment=EXCLUDED.comment`, [resultId, characteristicId, value, flag, defectId, comment]); }
}

async function seedNonconformance(pool: Pool): Promise<void> {
  const dateKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rules: string[] = [];
  for (const entity of ['NCR', 'CAPA']) { const rule = (await pool.query(`INSERT INTO qms_ncr_numbering_rule (entity_type,site_id,prefix,date_format,sequence_length) VALUES ($1,$2,$3,'YYYYMMDD',5) ON CONFLICT (entity_type,site_id) DO UPDATE SET prefix=EXCLUDED.prefix RETURNING rule_id`, [entity, SITE_ID, entity])).rows[0] as { rule_id: string }; rules.push(rule.rule_id); await pool.query(`INSERT INTO qms_ncr_numbering_sequence (rule_id,sequence_key,current_value) VALUES ($1,$2,100) ON CONFLICT (rule_id,sequence_key) DO UPDATE SET current_value=GREATEST(qms_ncr_numbering_sequence.current_value,100),updated_at=NOW()`, [rule.rule_id, dateKey]); }
  const ncrs = [
    [ids.openNcr, 'NCR-DEMO-OPEN-001', 'Manual', null, 'Critical', 'Open', vi('Phát hiện nứt trong kiểm tra ngoại quan tại kho.', 'Crack found during warehouse visual inspection.', '倉庫外観検査でクラックを発見。', '창고 외관 검사에서 균열 발견.')],
    [ids.capaNcr, 'NCR-DEMO-CAPA-001', 'InspectionFailure', ids.failResult, 'Critical', 'CAPARequired', vi('Lô lỗi từ kiểm tra cuối chuyền, cần hành động khắc phục.', 'Failed final-inspection lot requires corrective action.', '最終検査不合格ロットに是正処置が必要。', '최종 검사 불합격 로트에 시정 조치가 필요.')],
    [ids.reviewNcr, 'NCR-DEMO-REVIEW-001', 'Manual', null, 'Major', 'UnderReview', vi('Dấu ngoại quan đang chờ đánh giá chất lượng.', 'Visual mark awaiting quality review.', '品質レビュー待ちの外観痕。', '품질 검토 대기 중인 외관 자국.')],
    [ids.closedNcr, 'NCR-DEMO-CLOSED-001', 'InspectionFailure', ids.historyResult, 'Minor', 'Closed', vi('Hồ sơ lỗi lịch sử đã đóng.', 'Historical defect case closed.', '過去の不具合案件をクローズ。', '과거 결함 사례 종료.')],
  ] as const;
  for (const [ncrId, code, source, resultId, severity, status, description] of ncrs) await pool.query(`INSERT INTO qms_ncr (ncr_id,ncr_code,source,source_result_id,source_event_id,item_revision_id,work_order_id,work_center_id,lot_or_label_ref,site_id,severity,description,status,raised_by_user_id,raised_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,NOW()-INTERVAL '10 days') ON CONFLICT (ncr_id) DO UPDATE SET description=EXCLUDED.description,severity=EXCLUDED.severity,status=EXCLUDED.status,updated_at=NOW()`, [ncrId, code, source, resultId, `c1000000-0000-4000-8000-${ncrId.slice(-12)}`, ITEM_REVISION_ID, '30000000-0000-4000-8000-000000000003', WORK_CENTER_ID, `LOT-QMS-${code.slice(9, 14)}`, SITE_ID, severity, description, status, source === 'InspectionFailure' ? SYSTEM_USER_ID : MANAGER_USER_ID]);
  const dispositions = [[ids.capaNcr, 'Rework', true, vi('Tái gia công và kiểm tra lại toàn bộ lô.', 'Rework and reinspect the full lot.', '全ロットを再加工して再検査。', '전체 로트 재작업 후 재검사.')], [ids.closedNcr, 'Scrap', false, vi('Loại bỏ sản phẩm lỗi theo quy trình.', 'Scrap defective product per procedure.', '手順に従い不良品を廃棄。', '절차에 따라 불량품 폐기.')]] as const;
  for (const [ncrId, type, requiresCapa, reason] of dispositions) await pool.query(`INSERT INTO qms_ncr_disposition (ncr_id,disposition_type,reason,decided_by_user_id,requires_capa,active_flag,decided_at) VALUES ($1,$2,$3::jsonb,$4,$5,TRUE,NOW()-INTERVAL '5 days') ON CONFLICT DO NOTHING`, [ncrId, type, reason, MANAGER_USER_ID, requiresCapa]);
  const capas = [[ids.openCapa, 'CAPA-DEMO-OPEN-001', 'Open', '2026-08-15', vi('Chưa xác định nguyên nhân gốc.', 'Root cause analysis has not started.', '根本原因分析が未開始。', '근본 원인 분석 미착수.'), vi('Thu thập mẫu và mở điều tra.', 'Collect samples and open investigation.', 'サンプルを収集し調査を開始。', '샘플을 수집하고 조사를 시작.')], [ids.progressCapa, 'CAPA-DEMO-PROGRESS-001', 'InProgress', '2026-08-30', vi('Áp suất ép không ổn định.', 'Molding pressure was unstable.', '成形圧力が不安定。', '성형 압력이 불안정.') , vi('Hiệu chuẩn cảm biến và theo dõi ba lô.', 'Calibrate the sensor and monitor three lots.', 'センサーを校正し3ロットを監視。', '센서를 교정하고 3개 로트를 모니터링.')], [ids.verifiedCapa, 'CAPA-DEMO-VERIFIED-001', 'Verified', '2026-07-30', vi('Độ cứng thấp do thời gian lưu hóa thiếu.', 'Low hardness caused by insufficient cure time.', '加硫時間不足による硬度低下。', '경화 시간 부족으로 인한 경도 저하.'), vi('Điều chỉnh thời gian lưu hóa và kiểm chứng hiệu lực.', 'Adjust cure time and verify effectiveness.', '加硫時間を調整し有効性を確認。', '경화 시간을 조정하고 효과를 검증.')], [ids.closedCapa, 'CAPA-DEMO-CLOSED-001', 'Closed', '2026-06-30', vi('Thiếu hướng dẫn kiểm tra cuối chuyền.', 'Final inspection instruction was incomplete.', '最終検査手順が不完全。', '최종 검사 지침이 불완전.') , vi('Cập nhật hướng dẫn và đào tạo lại nhân viên.', 'Update the instruction and retrain staff.', '手順を更新しスタッフを再教育。', '지침을 업데이트하고 직원을 재교육.')]] as const;
  for (const [capaId, code, status, dueDate, rootCause, actionPlan] of capas) await pool.query(`INSERT INTO qms_capa (capa_id,capa_code,root_cause,action_plan,owner_user_id,due_date,status,verified_by_user_id,verified_at,same_person_verification_flag,created_by_user_id,created_at) VALUES ($1,$2,$3::jsonb,$4::jsonb,$5,$6,$7::varchar,$8,CASE WHEN $7::varchar IN ('Verified','Closed') THEN NOW()-INTERVAL '2 days' ELSE NULL END,FALSE,$9,NOW()-INTERVAL '12 days') ON CONFLICT (capa_id) DO UPDATE SET root_cause=EXCLUDED.root_cause,action_plan=EXCLUDED.action_plan,due_date=EXCLUDED.due_date,status=EXCLUDED.status,verified_by_user_id=EXCLUDED.verified_by_user_id,verified_at=EXCLUDED.verified_at,updated_at=NOW()`, [capaId, code, rootCause, actionPlan, QC_USER_ID, dueDate, status, status === 'Verified' || status === 'Closed' ? MANAGER_USER_ID : null, MANAGER_USER_ID]);
  const links = [[ids.openCapa, ids.openNcr], [ids.progressCapa, ids.reviewNcr], [ids.verifiedCapa, ids.capaNcr], [ids.closedCapa, ids.closedNcr]];
  for (const [capaId, ncrId] of links) await pool.query(`INSERT INTO qms_capa_ncr_link (capa_id,ncr_id,linked_by_user_id) VALUES ($1,$2,$3) ON CONFLICT (capa_id,ncr_id) DO NOTHING`, [capaId, ncrId, MANAGER_USER_ID]);
}

async function main(): Promise<void> {
  const inspection = new Pool({ connectionString: INSPECTION_URL }); const nonconformance = new Pool({ connectionString: NONCONFORMANCE_URL });
  try { await seedInspection(inspection); await seedNonconformance(nonconformance); console.info('[seed:qms:demo] seeded inspection plans/results, defects, NCRs, dispositions, CAPAs, and links'); }
  finally { await inspection.end(); await nonconformance.end(); }
}
main().catch((error) => { console.error('[seed:qms:demo] failed', error); process.exit(1); });
