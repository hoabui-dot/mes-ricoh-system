export type LocalizedSeedText = { vi: string; en: string; ja: string; ko: string };

export const LOCALIZED_COLUMNS_BY_TABLE = new Map<string, string[]>([
  ['md_site', ['name']],
  ['md_item', ['name']],
  ['md_item_revision', ['name']],
  ['md_work_center', ['name']],
  ['md_production_area', ['name', 'description']],
  ['md_workstation', ['name', 'description']],
  ['md_resource_assignment', ['name']],
  ['md_equipment', ['name']],
  ['md_skill', ['name']],
  ['md_reason_code', ['name']],
  ['md_operation', ['name']],
  ['md_mbom_header', ['name', 'description', 'change_reason', 'engineering_note']],
  ['md_routing_header', ['name', 'description', 'production_purpose', 'change_reason', 'engineering_note']],
  ['md_work_instruction', ['instruction_text']],
]);

const localized = (vi: string, en: string, ja: string, ko: string): LocalizedSeedText => ({ vi, en, ja, ko });

export const SEED_LOCALIZED_TEXT: Record<string, Record<string, Record<string, LocalizedSeedText>>> = {
  md_site: {
    'SITE-KZ3': {
      name: localized('S-Factory - Kizuna 3', 'S-Factory - Kizuna 3', 'S-Factory - キズナ3', 'S-Factory - 키즈나 3'),
    },
  },
  md_reason_code: {
    'QC-BOND-FAIL': {
      name: localized('Lỗi bám dính', 'Bonding Failure', '接着不良', '접착 불량'),
    },
  },
  md_item: {
    'FG-WS-CM01': {
      name: localized('Cao su chân máy ô tô', 'Automotive engine mount rubber', '自動車エンジンマウントゴム', '자동차 엔진 마운트 고무'),
    },
    'SFG-MET-CM01': {
      name: localized('Lõi thép đã xử lý keo dính', 'Treated metal core', '接着処理済み金属芯', '접착 처리 금속 코어'),
    },
    'SFG-RUB-CM01': {
      name: localized('Phôi cao su định lượng', 'Metered rubber blank', '計量済みゴムブランク', '정량 고무 블랭크'),
    },
    'SFG-ROLL-EPDM': {
      name: localized('Tấm cao su mẹ EPDM dạng cuộn', 'EPDM parent rubber roll', 'EPDM 親ゴムロール', 'EPDM 모 고무 롤'),
    },
    'RM-STL-05': {
      name: localized('Thép tấm định hình thô', 'Raw formed steel blank', '成形前鋼板ブランク', '원형 성형 강판 블랭크'),
    },
    'RM-CHEM-BOND': {
      name: localized('Keo lưu hóa đặc chủng', 'Special vulcanizing adhesive', '特殊加硫接着剤', '특수 가황 접착제'),
    },
  },
  md_item_revision: {
    'FG-WS-CM01-R1': {
      name: localized('FG-WS-CM01 phiên bản 1', 'FG-WS-CM01 Revision 1', 'FG-WS-CM01 リビジョン 1', 'FG-WS-CM01 개정 1'),
    },
    'SFG-MET-CM01-R1': {
      name: localized('Lõi kim loại đã xử lý phiên bản 1', 'Treated metal revision 1', '処理済み金属リビジョン 1', '처리 금속 개정 1'),
    },
    'SFG-RUB-CM01-R1': {
      name: localized('Phôi cao su con phiên bản 1', 'Rubber child blank revision 1', '子ゴムブランクリビジョン 1', '자식 고무 블랭크 개정 1'),
    },
    'SFG-ROLL-EPDM-R1': {
      name: localized('Cuộn EPDM mẹ phiên bản 1', 'EPDM parent roll revision 1', 'EPDM 親ロールリビジョン 1', 'EPDM 모 롤 개정 1'),
    },
    'RM-STL-05-R1': {
      name: localized('Nguyên liệu thép phiên bản 1', 'Steel raw material revision 1', '鋼材リビジョン 1', '강재 원자재 개정 1'),
    },
    'RM-CHEM-BOND-R1': {
      name: localized('Hóa chất kết dính phiên bản 1', 'Bonding chemical revision 1', '接着薬品リビジョン 1', '접착 화학품 개정 1'),
    },
  },
  md_operation: {
    'OP-MIX': {
      name: localized('Luyện cán cao su', 'Rubber mixing', 'ゴム混練', '고무 혼련'),
    },
    'OP-PREP': {
      name: localized('Xử lý lõi kim loại', 'Metal core preparation', '金属芯準備', '금속 코어 준비'),
    },
    'OP-CUT': {
      name: localized('Cắt tách phôi tấm mẹ-con', 'Parent-child rubber cutting', '親子ゴム切断', '모-자 고무 절단'),
    },
    'OP-MOLD': {
      name: localized('Ép dính và lưu hóa', 'Bonding and vulcanization molding', '接着・加硫成形', '접착 및 가황 성형'),
    },
    'OP-TRIM': {
      name: localized('Cắt bavia / định hình', 'Trimming and finishing', 'バリ取り・仕上げ', '트리밍 및 마감'),
    },
    'OP-QC': {
      name: localized('Kiểm tra chất lượng', 'Quality inspection', '品質検査', '품질 검사'),
    },
  },
  md_work_center: {
    'WC-MIXING': {
      name: localized('Trạm trộn Banbury', 'Banbury Mixing Work Center', 'バンバリー混練ワークセンター', '밴버리 혼련 워크센터'),
    },
    'WC-CUTTING': {
      name: localized('Trạm cắt cao su', 'Rubber Cutting Work Center', 'ゴム切断ワークセンター', '고무 절단 워크센터'),
    },
    'WC-VULCAN-MOLD': {
      name: localized('Cụm máy ép thủy lực gia nhiệt', 'Heated hydraulic molding work center', '加熱油圧成形ワークセンター', '가열 유압 성형 워크센터'),
    },
    'WC-QC': {
      name: localized('Trạm kiểm tra chất lượng', 'Quality Inspection', '品質検査ワークセンター', '품질 검사 워크센터'),
    },
  },
  md_production_area: {
    'AREA-RUBBER': {
      name: localized('Khu vực gia công cao su', 'Rubber Processing Area', 'ゴム加工エリア', '고무 가공 구역'),
      description: localized('Khu vực luyện, cắt và chuẩn bị cao su.', 'Mixing, cutting, and rubber preparation area.', '混練、切断、ゴム準備エリア。', '혼련, 절단 및 고무 준비 구역.'),
    },
    'AREA-MOLDING': {
      name: localized('Khu vực ép lưu hóa', 'Vulcanization Molding Area', '加硫成形エリア', '가황 성형 구역'),
      description: localized('Khu vực ép, lưu hóa và kiểm tra sản phẩm.', 'Molding, vulcanization, and product inspection area.', '成形、加硫、製品検査エリア。', '성형, 가황 및 제품 검사 구역.'),
    },
  },
  md_workstation: {
    'WS-MOLD-KIOSK01': {
      name: localized('Trạm kiosk máy ép 01', 'Molding Kiosk 01', '成形キオスク01', '성형 키오스크 01'),
      description: localized('Điểm thực thi cho máy ép thủy lực.', 'Execution point for hydraulic molding.', '油圧成形用の実行ポイント。', '유압 성형 실행 지점.'),
    },
  },
  md_resource_assignment: {
    'ASSIGN-MOLD-KIOSK01': {
      name: localized('Gán kiosk máy ép', 'Molding kiosk assignment', '成形キオスク割当', '성형 키오스크 할당'),
    },
  },
  md_equipment: {
    'EQ-MOLD-HYD01': {
      name: localized('Máy ép 500 tấn', '500-ton hydraulic press', '500トン油圧プレス', '500톤 유압 프레스'),
    },
    'EQ-MOLD-HYD02': {
      name: localized('Máy ép 300 tấn', '300-ton hydraulic press', '300トン油圧プレス', '300톤 유압 프레스'),
    },
  },
  md_skill: {
    'SK-WC-MIX-MASTER': {
      name: localized('Kỹ thuật luyện cán cao cấp', 'Advanced rubber mixing skill', '上級ゴム混練スキル', '고급 고무 혼련 기술'),
    },
    'SK-WC-VULCAN-OPERATOR': {
      name: localized('Vận hành máy ép lưu hóa áp lực cao', 'High-pressure vulcanizing press operation', '高圧加硫プレス操作', '고압 가황 프레스 운전'),
    },
    'SK-WC-INSPECTION': {
      name: localized('Kỹ thuật viên QC', 'QC technician skill', 'QC 技術者スキル', 'QC 기술자 역량'),
    },
  },
  md_work_instruction: {
    'WI-OP-MOLD-CURING': {
      instruction_text: localized(
        'Duy trì nhiệt độ lưu hóa trong khoảng 150°C - 180°C trước khi xác nhận.',
        'Maintain curing range 150°C - 180°C before confirmation.',
        '確定前に加硫温度を 150°C - 180°C の範囲で維持してください。',
        '확정 전 가황 온도를 150°C - 180°C 범위로 유지하세요.',
      ),
    },
  },
};

export function normalizeSeedValues(table: string, values: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...values };
  const localizedSeed = SEED_LOCALIZED_TEXT[table]?.[String(values['code'])];
  for (const column of LOCALIZED_COLUMNS_BY_TABLE.get(table) || []) {
    if (localizedSeed?.[column]) {
      normalized[column] = localizedSeed[column];
    } else if (typeof normalized[column] === 'string') {
      normalized[column] = { vi: normalized[column] };
    }
  }
  return normalized;
}
