import React, { createContext, useContext, useMemo, useState } from 'react';
import i18next, { type i18n } from 'i18next';
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  resolveLocalizedText,
  type LocalizedText,
  type SupportedLocale,
} from '@mom-platform/shared-kernel/i18n';

export { DEFAULT_LOCALE, SUPPORTED_LOCALES, type LocalizedText, type SupportedLocale };

type Params = Record<string, string | number | undefined>;
type Bundle = Record<string, string>;
type ResourceBundle = Record<SupportedLocale, Bundle>;

export const languageNames: Record<SupportedLocale, string> = {
  vi: 'Tiếng Việt',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
};

export const commonResources: ResourceBundle = {
  vi: {
    'common.save': 'Lưu',
    'common.cancel': 'Hủy',
    'common.retry': 'Thử lại',
    'common.reload': 'Tải lại',
    'common.refresh': 'Làm mới',
    'common.create': 'Tạo',
    'common.edit': 'Sửa',
    'common.release': 'Release',
    'common.actions': 'Thao tác',
    'common.status': 'Trạng thái',
    'common.code': 'Mã',
    'common.name': 'Tên',
    'common.type': 'Loại',
    'common.all': 'Tất cả',
    'common.active': 'Đang hoạt động',
    'common.inactive': 'Ngưng hoạt động',
    'nav.operations': 'Điều hành & Lệnh sản xuất',
    'nav.workOrders': 'Danh sách lệnh (WO)',
    'nav.createWorkOrder': 'Tạo lệnh sản xuất',
    'nav.masterDataTier1': 'Master Data - Tier 1',
    'nav.items': 'Sản phẩm & Revision',
    'nav.mbom': 'Định mức MBOM',
    'nav.routing': 'Quy trình Routing',
    'nav.productionVersion': 'Production Version',
    'nav.labor': 'Nguồn lực nhân sự',
    'nav.employees': 'Nhân công',
    'nav.shifts': 'Ca làm việc',
    'nav.workCalendar': 'Lịch làm việc',
    'nav.masterDataTier2': 'Master Data - Tier 2',
    'nav.workCenters': 'Trạm sản xuất (WorkCenter)',
    'nav.equipment': 'Thiết bị (Equipment)',
    'nav.productionStandards': 'Định mức năng suất',
    'nav.reasonCodes': 'Mã nguyên nhân phế',
    'nav.skills': 'Kỹ năng vận hành',
    'nav.i18nReview': 'Duyệt bản dịch',
    'navbar.subtitle': 'Quản trị Master Data & lập kế hoạch lệnh sản xuất',
    'navbar.logout': 'Đăng xuất',
    'navbar.language': 'Ngôn ngữ',
    'error.unauthorized.title': 'Không có quyền truy cập (401/403)',
    'error.unauthorized.body': 'Tài khoản của bạn không có đủ quyền thực hiện thao tác này.',
    'error.loginAgain': 'Đăng nhập lại',
    'error.busy.title': 'Dịch vụ đang bận (503 Circuit Breaker)',
    'error.busy.body': 'Hệ thống Master Data / Execution đang tạm gián đoạn response. Vui lòng nhấn thử lại.',
    'error.system.title': 'Đã có lỗi hệ thống',
    'error.system.body': 'Gặp sự cố ngoài dự kiến trong quá trình xử lý dữ liệu.',
    'error.incident': 'Mã sự cố: INC-{{incidentId}}',
    'status.wo.Draft': 'Nháp',
    'status.wo.Approved': 'Đã duyệt',
    'status.wo.InProgress': 'Đang sản xuất',
    'status.wo.Completed': 'Hoàn tất',
    'status.wo.Rejected': 'Từ chối',
    'status.master.Draft': 'Nháp',
    'status.master.InReview': 'Đang xem xét',
    'status.master.Released': 'Đã release',
    'status.master.Inactive': 'Ngưng hoạt động',
    'status.master.Obsolete': 'Hết hiệu lực',
    'role.OPERATOR': 'Công nhân',
    'role.PROD_MANAGER': 'Quản lý sản xuất',
    'role.PLANT_MANAGER': 'Quản lý nhà máy',
    'role.EXECUTIVE': 'Ban điều hành',
    'operation.OP-MIX': 'Luyện cán cao su',
    'operation.OP-PREP': 'Xử lý lõi kim loại',
    'operation.OP-CUT': 'Cắt tách phôi tấm mẹ-con',
    'operation.OP-MOLD': 'Ép dính và lưu hóa',
    'operation.OP-TRIM': 'Cắt bavia / định hình',
    'operation.OP-QC': 'Kiểm tra chất lượng',
    'validation.PRODUCTION_VERSION.NOT_FOUND': 'Không tìm thấy Production Version.',
    'validation.ITEM_REVISION.NOT_RELEASED': 'Item Revision phải được Release và còn hiệu lực.',
    'validation.MBOM.NO_LINES': 'MBOM phải có ít nhất một dòng.',
    'validation.MBOM.LINE_QTY_NON_POSITIVE': 'Dòng MBOM {{lineId}} phải có QuantityPer > 0.',
    'validation.MBOM.LINE_UOM_NOT_RELEASED': 'Dòng MBOM {{lineId}} phải dùng UOM hợp lệ đã Release.',
    'validation.MBOM.PHANTOM_MISSING_CHILD': 'Phantom component ở dòng {{lineId}} phải có child MBOM đã Release.',
    'validation.MBOM.CYCLE': 'Cây MBOM không được có vòng lặp.',
    'validation.ROUTING.NO_OPERATIONS': 'Routing phải có ít nhất một công đoạn.',
    'validation.ROUTING.SEQ_DUPLICATE': 'Routing operation sequence {{seq}} bị trùng.',
    'validation.ROUTING.PREDECESSOR_MISSING': 'Công đoạn {{seq}} tham chiếu predecessor không tồn tại.',
    'validation.ROUTING.CYCLE': 'Sơ đồ predecessor của Routing không được có vòng lặp.',
    'validation.WORK_CENTER.NOT_ACTIVE_FOR_SITE': 'WorkCenter trong routing phải active và thuộc đúng site.',
    'validation.RESOURCE_CAPABILITY.MISSING': 'Cần ít nhất một Resource Capability hợp lệ.',
    'validation.PRODUCTION_STANDARD.MISSING_TIME': 'Công đoạn schedulable cần setup/cycle time trong Production Standard.',
    'validation.RESOURCE_CALENDAR.MISSING': 'Resource Calendar phải có lịch khả dụng trong khoảng lập kế hoạch.',
    'validation.PERMISSION.APPROVER_MISSING': 'Cần ít nhất một vai trò được phép phê duyệt.',
    'validation.WORKSTATION.EXECUTOR_MISSING': 'Cần ít nhất một Workstation active cho thực thi.',
  },
  en: {
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.retry': 'Retry',
    'common.reload': 'Reload',
    'common.refresh': 'Refresh',
    'common.create': 'Create',
    'common.edit': 'Edit',
    'common.release': 'Release',
    'common.actions': 'Actions',
    'common.status': 'Status',
    'common.code': 'Code',
    'common.name': 'Name',
    'common.type': 'Type',
    'common.all': 'All',
    'common.active': 'Active',
    'common.inactive': 'Inactive',
    'nav.operations': 'Operations & Work Orders',
    'nav.workOrders': 'Work Orders',
    'nav.createWorkOrder': 'Create Work Order',
    'nav.masterDataTier1': 'Master Data - Tier 1',
    'nav.items': 'Items & Revisions',
    'nav.mbom': 'MBOM',
    'nav.routing': 'Routing',
    'nav.productionVersion': 'Production Version',
    'nav.labor': 'Labor Resource',
    'nav.employees': 'Employees',
    'nav.shifts': 'Shifts',
    'nav.workCalendar': 'Work Calendar',
    'nav.masterDataTier2': 'Master Data - Tier 2',
    'nav.workCenters': 'Work Centers',
    'nav.equipment': 'Equipment',
    'nav.productionStandards': 'Production Standards',
    'nav.reasonCodes': 'Reason Codes',
    'nav.skills': 'Skills',
    'nav.i18nReview': 'Translation Review',
    'navbar.subtitle': 'Master Data Admin & Work Order Planning',
    'navbar.logout': 'Log out',
    'navbar.language': 'Language',
    'error.unauthorized.title': 'Access denied (401/403)',
    'error.unauthorized.body': 'Your account does not have permission to perform this action.',
    'error.loginAgain': 'Log in again',
    'error.busy.title': 'Service busy (503 Circuit Breaker)',
    'error.busy.body': 'Master Data / Execution is temporarily unavailable. Please retry.',
    'error.system.title': 'System error',
    'error.system.body': 'An unexpected error occurred while processing data.',
    'error.incident': 'Incident ID: INC-{{incidentId}}',
    'status.wo.Draft': 'Draft',
    'status.wo.Approved': 'Approved',
    'status.wo.InProgress': 'In progress',
    'status.wo.Completed': 'Completed',
    'status.wo.Rejected': 'Rejected',
    'status.master.Draft': 'Draft',
    'status.master.InReview': 'In review',
    'status.master.Released': 'Released',
    'status.master.Inactive': 'Inactive',
    'status.master.Obsolete': 'Obsolete',
    'role.OPERATOR': 'Operator',
    'role.PROD_MANAGER': 'Production Manager',
    'role.PLANT_MANAGER': 'Plant Manager',
    'role.EXECUTIVE': 'Executive',
    'operation.OP-MIX': 'Rubber mixing',
    'operation.OP-PREP': 'Metal core preparation',
    'operation.OP-CUT': 'Parent-child cutting',
    'operation.OP-MOLD': 'Bonding and vulcanization',
    'operation.OP-TRIM': 'Trimming',
    'operation.OP-QC': 'Quality inspection',
    'validation.PRODUCTION_VERSION.NOT_FOUND': 'Production Version was not found.',
    'validation.ITEM_REVISION.NOT_RELEASED': 'Item Revision must be Released and effective.',
    'validation.MBOM.NO_LINES': 'MBOM must have at least one line.',
    'validation.MBOM.LINE_QTY_NON_POSITIVE': 'MBOM line {{lineId}} must have QuantityPer > 0.',
    'validation.MBOM.LINE_UOM_NOT_RELEASED': 'MBOM line {{lineId}} must use a valid Released UOM.',
    'validation.MBOM.PHANTOM_MISSING_CHILD': 'Phantom component on line {{lineId}} must have a Released child MBOM.',
    'validation.MBOM.CYCLE': 'MBOM hierarchy must not contain cycles.',
    'validation.ROUTING.NO_OPERATIONS': 'Routing must have at least one operation.',
    'validation.ROUTING.SEQ_DUPLICATE': 'Routing operation sequence {{seq}} is duplicated.',
    'validation.ROUTING.PREDECESSOR_MISSING': 'Operation {{seq}} references a missing predecessor.',
    'validation.ROUTING.CYCLE': 'Routing predecessor graph must not contain cycles.',
    'validation.WORK_CENTER.NOT_ACTIVE_FOR_SITE': 'Routing WorkCenter must be active and belong to the Production Version site.',
    'validation.RESOURCE_CAPABILITY.MISSING': 'At least one eligible Resource Capability is required.',
    'validation.PRODUCTION_STANDARD.MISSING_TIME': 'Schedulable operation needs setup and cycle time in Production Standard.',
    'validation.RESOURCE_CALENDAR.MISSING': 'Resource Calendar must have availability in the planning window.',
    'validation.PERMISSION.APPROVER_MISSING': 'At least one approver role must exist.',
    'validation.WORKSTATION.EXECUTOR_MISSING': 'At least one active Workstation executor must exist.',
  },
  ja: {
    'common.save': '保存',
    'common.cancel': 'キャンセル',
    'common.retry': '再試行',
    'common.reload': '再読み込み',
    'common.refresh': '更新',
    'common.create': '作成',
    'common.edit': '編集',
    'common.release': 'リリース',
    'common.actions': '操作',
    'common.status': 'ステータス',
    'common.code': 'コード',
    'common.name': '名称',
    'common.type': '種別',
    'common.all': 'すべて',
    'common.active': '有効',
    'common.inactive': '無効',
    'nav.operations': '作業指図管理',
    'nav.workOrders': '作業指図一覧',
    'nav.createWorkOrder': '作業指図作成',
    'nav.masterDataTier1': 'マスタデータ - Tier 1',
    'nav.items': '品目とリビジョン',
    'nav.mbom': 'MBOM',
    'nav.routing': 'ルーティング',
    'nav.productionVersion': '製造バージョン',
    'nav.labor': '労務リソース',
    'nav.employees': '従業員',
    'nav.shifts': 'シフト',
    'nav.workCalendar': '勤務カレンダー',
    'nav.masterDataTier2': 'マスタデータ - Tier 2',
    'nav.workCenters': 'ワークセンター',
    'nav.equipment': '設備',
    'nav.productionStandards': '生産標準',
    'nav.reasonCodes': '理由コード',
    'nav.skills': 'スキル',
    'nav.i18nReview': '翻訳レビュー',
    'navbar.subtitle': 'マスタデータ管理と作業指図計画',
    'navbar.logout': 'ログアウト',
    'navbar.language': '言語',
    'error.unauthorized.title': 'アクセス権限がありません (401/403)',
    'error.unauthorized.body': 'この操作を実行する権限がありません。',
    'error.loginAgain': '再ログイン',
    'error.busy.title': 'サービス混雑中 (503 Circuit Breaker)',
    'error.busy.body': 'Master Data / Execution が一時的に利用できません。再試行してください。',
    'error.system.title': 'システムエラー',
    'error.system.body': 'データ処理中に予期しないエラーが発生しました。',
    'error.incident': 'インシデントID: INC-{{incidentId}}',
    'status.wo.Draft': '下書き',
    'status.wo.Approved': '承認済み',
    'status.wo.InProgress': '進行中',
    'status.wo.Completed': '完了',
    'status.wo.Rejected': '却下',
    'status.master.Draft': '下書き',
    'status.master.InReview': 'レビュー中',
    'status.master.Released': 'リリース済み',
    'status.master.Inactive': '無効',
    'status.master.Obsolete': '廃止',
    'role.OPERATOR': 'オペレーター',
    'role.PROD_MANAGER': '生産管理者',
    'role.PLANT_MANAGER': '工場管理者',
    'role.EXECUTIVE': '経営層',
    'operation.OP-MIX': 'ゴム混練',
    'operation.OP-PREP': '金属芯準備',
    'operation.OP-CUT': '親子切断',
    'operation.OP-MOLD': '接着・加硫成形',
    'operation.OP-TRIM': 'バリ取り',
    'operation.OP-QC': '品質検査',
    'validation.PRODUCTION_VERSION.NOT_FOUND': '製造バージョンが見つかりません。',
    'validation.ITEM_REVISION.NOT_RELEASED': 'Item Revision はリリース済みかつ有効である必要があります。',
    'validation.MBOM.NO_LINES': 'MBOM には少なくとも1行が必要です。',
    'validation.MBOM.LINE_QTY_NON_POSITIVE': 'MBOM 行 {{lineId}} の QuantityPer は 0 より大きい必要があります。',
    'validation.MBOM.LINE_UOM_NOT_RELEASED': 'MBOM 行 {{lineId}} は有効でリリース済みの UOM を使用する必要があります。',
    'validation.MBOM.PHANTOM_MISSING_CHILD': '行 {{lineId}} の Phantom component にはリリース済みの子 MBOM が必要です。',
    'validation.MBOM.CYCLE': 'MBOM 階層に循環を含めることはできません。',
    'validation.ROUTING.NO_OPERATIONS': 'Routing には少なくとも1つの工程が必要です。',
    'validation.ROUTING.SEQ_DUPLICATE': 'Routing operation sequence {{seq}} が重複しています。',
    'validation.ROUTING.PREDECESSOR_MISSING': '工程 {{seq}} が存在しない predecessor を参照しています。',
    'validation.ROUTING.CYCLE': 'ルーティングの先行関係に循環を含めることはできません。',
    'validation.WORK_CENTER.NOT_ACTIVE_FOR_SITE': 'Routing の WorkCenter は有効で、Production Version の site に属している必要があります。',
    'validation.RESOURCE_CAPABILITY.MISSING': '少なくとも1つの有効な Resource Capability が必要です。',
    'validation.PRODUCTION_STANDARD.MISSING_TIME': 'スケジュール対象工程には Production Standard の setup/cycle time が必要です。',
    'validation.RESOURCE_CALENDAR.MISSING': '計画期間内に利用可能な Resource Calendar が必要です。',
    'validation.PERMISSION.APPROVER_MISSING': '少なくとも1つの承認者ロールが必要です。',
    'validation.WORKSTATION.EXECUTOR_MISSING': '少なくとも1つの有効な Workstation 実行端末が必要です。',
  },
  ko: {
    'common.save': '저장',
    'common.cancel': '취소',
    'common.retry': '다시 시도',
    'common.reload': '새로고침',
    'common.refresh': '갱신',
    'common.create': '생성',
    'common.edit': '편집',
    'common.release': '릴리스',
    'common.actions': '작업',
    'common.status': '상태',
    'common.code': '코드',
    'common.name': '이름',
    'common.type': '유형',
    'common.all': '전체',
    'common.active': '활성',
    'common.inactive': '비활성',
    'nav.operations': '운영 및 작업지시',
    'nav.workOrders': '작업지시 목록',
    'nav.createWorkOrder': '작업지시 생성',
    'nav.masterDataTier1': '마스터 데이터 - Tier 1',
    'nav.items': '품목 및 리비전',
    'nav.mbom': 'MBOM',
    'nav.routing': '라우팅',
    'nav.productionVersion': '생산 버전',
    'nav.labor': '인력 리소스',
    'nav.employees': '직원',
    'nav.shifts': '교대',
    'nav.workCalendar': '근무 캘린더',
    'nav.masterDataTier2': '마스터 데이터 - Tier 2',
    'nav.workCenters': '워크센터',
    'nav.equipment': '설비',
    'nav.productionStandards': '생산 표준',
    'nav.reasonCodes': '사유 코드',
    'nav.skills': '기술',
    'nav.i18nReview': '번역 검토',
    'navbar.subtitle': '마스터 데이터 관리 및 작업지시 계획',
    'navbar.logout': '로그아웃',
    'navbar.language': '언어',
    'error.unauthorized.title': '접근 권한 없음 (401/403)',
    'error.unauthorized.body': '이 작업을 수행할 권한이 없습니다.',
    'error.loginAgain': '다시 로그인',
    'error.busy.title': '서비스 사용 중 (503 Circuit Breaker)',
    'error.busy.body': 'Master Data / Execution 서비스를 일시적으로 사용할 수 없습니다. 다시 시도하세요.',
    'error.system.title': '시스템 오류',
    'error.system.body': '데이터 처리 중 예상치 못한 오류가 발생했습니다.',
    'error.incident': '사고 ID: INC-{{incidentId}}',
    'status.wo.Draft': '초안',
    'status.wo.Approved': '승인됨',
    'status.wo.InProgress': '진행 중',
    'status.wo.Completed': '완료',
    'status.wo.Rejected': '반려됨',
    'status.master.Draft': '초안',
    'status.master.InReview': '검토 중',
    'status.master.Released': '릴리스됨',
    'status.master.Inactive': '비활성',
    'status.master.Obsolete': '폐기됨',
    'role.OPERATOR': '작업자',
    'role.PROD_MANAGER': '생산 관리자',
    'role.PLANT_MANAGER': '공장 관리자',
    'role.EXECUTIVE': '임원',
    'operation.OP-MIX': '고무 혼련',
    'operation.OP-PREP': '금속 코어 준비',
    'operation.OP-CUT': '부모-자식 절단',
    'operation.OP-MOLD': '접착 및 가황 성형',
    'operation.OP-TRIM': '트리밍',
    'operation.OP-QC': '품질 검사',
    'validation.PRODUCTION_VERSION.NOT_FOUND': '생산 버전을 찾을 수 없습니다.',
    'validation.ITEM_REVISION.NOT_RELEASED': 'Item Revision은 릴리스되어 있고 유효해야 합니다.',
    'validation.MBOM.NO_LINES': 'MBOM에는 최소 한 개의 라인이 필요합니다.',
    'validation.MBOM.LINE_QTY_NON_POSITIVE': 'MBOM 라인 {{lineId}}의 QuantityPer는 0보다 커야 합니다.',
    'validation.MBOM.LINE_UOM_NOT_RELEASED': 'MBOM 라인 {{lineId}}는 유효하고 릴리스된 UOM을 사용해야 합니다.',
    'validation.MBOM.PHANTOM_MISSING_CHILD': '라인 {{lineId}}의 Phantom component에는 릴리스된 하위 MBOM이 필요합니다.',
    'validation.MBOM.CYCLE': 'MBOM 계층에는 순환이 있을 수 없습니다.',
    'validation.ROUTING.NO_OPERATIONS': 'Routing에는 최소 한 개의 공정이 필요합니다.',
    'validation.ROUTING.SEQ_DUPLICATE': 'Routing operation sequence {{seq}}가 중복되었습니다.',
    'validation.ROUTING.PREDECESSOR_MISSING': '공정 {{seq}}가 존재하지 않는 predecessor를 참조합니다.',
    'validation.ROUTING.CYCLE': '라우팅 선행 관계 그래프에는 순환이 있을 수 없습니다.',
    'validation.WORK_CENTER.NOT_ACTIVE_FOR_SITE': 'Routing WorkCenter는 활성 상태이고 Production Version site에 속해야 합니다.',
    'validation.RESOURCE_CAPABILITY.MISSING': '최소 한 개의 적합한 Resource Capability가 필요합니다.',
    'validation.PRODUCTION_STANDARD.MISSING_TIME': '스케줄 대상 공정에는 Production Standard의 setup/cycle time이 필요합니다.',
    'validation.RESOURCE_CALENDAR.MISSING': '계획 기간 내 가용 Resource Calendar가 필요합니다.',
    'validation.PERMISSION.APPROVER_MISSING': '최소 한 개의 승인자 역할이 필요합니다.',
    'validation.WORKSTATION.EXECUTOR_MISSING': '최소 한 개의 활성 Workstation 실행자가 필요합니다.',
  },
};

const STORAGE_KEY = 'mom.locale';

export function interpolate(template: string, params: Params = {}): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => String(params[key] ?? ''));
}

export function normalizeLocale(value?: string | null): SupportedLocale {
  return SUPPORTED_LOCALES.includes(value as SupportedLocale) ? (value as SupportedLocale) : DEFAULT_LOCALE;
}

export function createI18nConfig(appNamespace: string, appResources?: Partial<ResourceBundle>): i18n {
  const instance = i18next.createInstance();
  const resources = Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => [
      locale,
      {
        translation: {
          ...commonResources[locale],
          ...(appResources?.[locale] ?? {}),
        },
      },
    ]),
  );
  void instance.init({
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    ns: ['translation'],
    defaultNS: 'translation',
    resources,
    interpolation: { escapeValue: false },
    initImmediate: false,
    keySeparator: false,
    contextSeparator: false,
    nsSeparator: false,
    returnEmptyString: false,
    cleanCode: true,
    supportedLngs: [...SUPPORTED_LOCALES],
    metadata: { appNamespace },
  } as any);
  return instance;
}

interface I18nContextValue {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  t: (key: string, params?: Params) => string;
  formatDate: (value: string | number | Date) => string;
  formatNumber: (value: number) => string;
  resolveText: (value: LocalizedText | string | null | undefined) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function detectInitialLocale(keycloakLocale?: string | null, siteLocale?: string | null): SupportedLocale {
  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) return normalizeLocale(stored);
  }
  return normalizeLocale(keycloakLocale ?? siteLocale);
}

export function I18nProvider({
  children,
  i18n,
  initialLocale,
  onLocaleChange,
}: {
  children: React.ReactNode;
  i18n: i18n;
  initialLocale?: string | null;
  onLocaleChange?: (locale: SupportedLocale) => void | Promise<void>;
}) {
  const [locale, setLocaleState] = useState<SupportedLocale>(() => detectInitialLocale(initialLocale));

  const value = useMemo<I18nContextValue>(() => {
    void i18n.changeLanguage(locale);
    return {
      locale,
      setLocale: (nextLocale) => {
        if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, nextLocale);
        setLocaleState(nextLocale);
        void onLocaleChange?.(nextLocale);
      },
      t: (key, params) => interpolate(i18n.t(key, { lng: locale, defaultValue: key }), params),
      formatDate: (input) => new Intl.DateTimeFormat(locale).format(new Date(input)),
      formatNumber: (input) => new Intl.NumberFormat(locale).format(input),
      resolveText: (input) => {
        if (!input) return '';
        if (typeof input === 'string') return input;
        return resolveLocalizedText(input, locale);
      },
    };
  }, [i18n, locale, onLocaleChange]);

  return React.createElement(I18nContext.Provider, { value }, children);
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider');
  return context;
}

export function useLocalizedText(): (value: LocalizedText | string | null | undefined) => string {
  return useI18n().resolveText;
}

export function validationMessage(error: { code?: string; params?: Params; message?: string } | string, t: I18nContextValue['t']): string {
  if (typeof error === 'string') return error;
  if (!error.code) return error.message ?? '';
  return t(`validation.${error.code}`, error.params);
}
