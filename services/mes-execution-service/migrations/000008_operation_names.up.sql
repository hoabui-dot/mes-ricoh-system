ALTER TABLE wo_operation
  ADD COLUMN IF NOT EXISTS operation_name jsonb NOT NULL DEFAULT '{"vi":"","en":"","ja":"","ko":""}'::jsonb;

UPDATE wo_operation
SET operation_name = CASE operation_code
  WHEN 'OP-MIX' THEN jsonb_build_object('vi', 'Luyện cán cao su', 'en', 'Rubber Mixing', 'ja', 'ゴム混練', 'ko', '고무 혼련')
  WHEN 'OP-PREP' THEN jsonb_build_object('vi', 'Chuẩn bị lõi kim loại', 'en', 'Metal Core Preparation', 'ja', '金属コア準備', 'ko', '금속 코어 준비')
  WHEN 'OP-CUT' THEN jsonb_build_object('vi', 'Cắt phôi cao su', 'en', 'Rubber Blank Cutting', 'ja', 'ゴムブランク切断', 'ko', '고무 블랭크 절단')
  WHEN 'OP-MOLD' THEN jsonb_build_object('vi', 'Đúc lưu hóa', 'en', 'Compression Molding', 'ja', '圧縮成形', 'ko', '압축 성형')
  WHEN 'OP-TRIM' THEN jsonb_build_object('vi', 'Cắt via và hoàn thiện', 'en', 'Deflashing and Finishing', 'ja', 'バリ取り・仕上げ', 'ko', '버 제거 및 마감')
  WHEN 'OP-QC' THEN jsonb_build_object('vi', 'Kiểm tra chất lượng', 'en', 'Quality Inspection', 'ja', '品質検査', 'ko', '품질 검사')
  ELSE jsonb_build_object('vi', operation_code, 'en', operation_code, 'ja', operation_code, 'ko', operation_code)
END
WHERE operation_name->>'vi' IS NULL OR operation_name->>'vi' = '';
