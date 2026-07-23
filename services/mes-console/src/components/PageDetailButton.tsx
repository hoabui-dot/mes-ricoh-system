import { useState } from 'react';
import { BookOpen, CheckCircle2, Info, ListChecks, Route, X, XCircle, type LucideIcon } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useI18n, type SupportedLocale } from '@mom-platform/i18n-ui-shared';
import { Button, Card } from './ui';

type Localized = Record<SupportedLocale, string>;
type Detail = {
  title: Localized;
  summary: Localized;
  howToUse: Localized[];
  data: Localized[];
  statuses: Localized[];
  notes: Localized[];
};

const l = (vi: string, en: string, ja: string, ko: string): Localized => ({ vi, en, ja, ko });

const baseMes: Detail = {
  title: l('Chi tiết màn hình MES', 'MES page details', 'MES画面の詳細', 'MES 화면 상세'),
  summary: l('MES Console demo dùng dữ liệu master, lệnh sản xuất và lịch nhân sự để minh họa luồng lập kế hoạch sản xuất cao su kỹ thuật.', 'The MES Console demo uses master data, work orders, and labor schedules to explain technical rubber production planning.', 'MES Consoleデモはマスタ、製造指図、労務スケジュールでゴム製品の生産計画を説明します。', 'MES Console 데모는 마스터 데이터, 작업 지시, 인력 일정을 사용해 고무 제품 생산 계획 흐름을 설명합니다.'),
  howToUse: [
    l('Bắt đầu bằng Item Revision, MBOM, Routing và Production Version; release dữ liệu trước khi tạo WO.', 'Start with Item Revision, MBOM, Routing, and Production Version; release master data before creating a WO.', 'Item Revision、MBOM、Routing、Production Versionから始め、WO作成前にリリースします。', 'Item Revision, MBOM, Routing, Production Version부터 시작하고 WO 생성 전에 릴리스합니다.'),
    l('Dùng các nút release, compute, approve/reject và bảng dữ liệu để theo dõi readiness và tiến độ.', 'Use release, compute, approve/reject actions and tables to track readiness and progress.', 'release、compute、approve/rejectと表で準備状況と進捗を追跡します。', 'release, compute, approve/reject 작업과 테이블로 준비 상태와 진행률을 추적합니다.'),
  ],
  data: [
    l('Dữ liệu demo gồm sản phẩm FG-WS-CM01, MBOM nhiều tầng, routing MIX/PREP/CUT/MOLD/TRIM/QC, WorkCenter, nhân sự, ca và lịch làm việc.', 'Demo data includes product FG-WS-CM01, multi-level MBOM, MIX/PREP/CUT/MOLD/TRIM/QC routing, work centers, employees, shifts, and calendars.', 'デモデータはFG-WS-CM01、多階層MBOM、MIX/PREP/CUT/MOLD/TRIM/QCルーティング、WorkCenter、従業員、シフト、カレンダーです。', '데모 데이터에는 FG-WS-CM01, 다단계 MBOM, MIX/PREP/CUT/MOLD/TRIM/QC 라우팅, WorkCenter, 직원, 교대, 캘린더가 포함됩니다.'),
  ],
  statuses: [
    l('Draft: mới tạo. InReview: đang kiểm tra. Released: dùng được cho WO. Inactive/Obsolete: không nên dùng cho tạo mới.', 'Draft is newly created. InReview is being checked. Released can be used for WO creation. Inactive/Obsolete should not be used for new records.', 'Draftは新規、InReviewは確認中、ReleasedはWO作成に使用可、Inactive/Obsoleteは新規使用不可です。', 'Draft는 신규, InReview는 검토 중, Released는 WO 생성 가능, Inactive/Obsolete는 신규 사용을 피합니다.'),
    l('WO Draft/Approved/InProgress/Completed/Rejected mô tả vòng đời lệnh sản xuất từ lập kế hoạch đến hoàn tất hoặc từ chối.', 'WO Draft/Approved/InProgress/Completed/Rejected describe the work order lifecycle from planning to completion or rejection.', 'WO Draft/Approved/InProgress/Completed/Rejectedは計画から完了または却下までの状態です。', 'WO Draft/Approved/InProgress/Completed/Rejected는 계획부터 완료 또는 반려까지의 상태입니다.'),
  ],
  notes: [
    l('Đây là bản demo: một số màn hình nhấn mạnh luồng nghiệp vụ và dữ liệu seed hơn là thao tác sản xuất thực tế ngoài hiện trường.', 'This is a demo: some screens emphasize business flow and seeded data more than real shop-floor execution.', 'これはデモ版であり、一部画面は実現場操作より業務フローとシードデータ説明を重視します。', '데모 버전이므로 일부 화면은 실제 현장 실행보다 업무 흐름과 시드 데이터 설명에 집중합니다.'),
  ],
};

const details: Array<{ match: RegExp; detail: Detail }> = [
  {
    match: /^\/(console\/mes\/)?work-orders$/,
    detail: {
      ...baseMes,
      title: l('Danh sách lệnh sản xuất', 'Work order list', '製造指図一覧', '작업 지시 목록'),
      summary: l('Theo dõi WO, trạng thái phê duyệt, capacity/stock check và tiến độ sản xuất.', 'Track work orders, approval status, capacity/stock checks, and production progress.', 'WO、承認状態、能力/在庫確認、生産進捗を追跡します。', 'WO, 승인 상태, 능력/재고 확인, 생산 진행을 추적합니다.'),
    },
  },
  {
    match: /^\/(console\/mes\/)?work-orders\/new/,
    detail: {
      ...baseMes,
      title: l('Tạo lệnh sản xuất', 'Create work order', '製造指図作成', '작업 지시 생성'),
      summary: l('Nhập mã sản phẩm, số lượng và ngày mục tiêu; backend kiểm tra master-data readiness trước khi tạo WO.', 'Enter product code, quantity, and target date; the backend checks master-data readiness before creating a WO.', '品目コード、数量、目標日を入力し、バックエンドがマスタ準備状況を確認してWOを作成します。', '품목 코드, 수량, 목표일을 입력하면 백엔드가 마스터 데이터 준비 상태를 확인한 뒤 WO를 생성합니다.'),
    },
  },
  {
    match: /^\/(console\/mes\/)?work-orders\/[^/]+/,
    detail: {
      ...baseMes,
      title: l('Chi tiết lệnh sản xuất', 'Work order detail', '製造指図詳細', '작업 지시 상세'),
      summary: l('Xem WO, compute duration/capacity, kiểm tra tồn kho WMS và phê duyệt hoặc từ chối lệnh.', 'Review a WO, compute duration/capacity, check WMS stock, and approve or reject the order.', 'WOを確認し、時間/能力を計算し、WMS在庫を確認して承認または却下します。', 'WO를 검토하고 시간/능력을 계산하며 WMS 재고를 확인한 후 승인 또는 반려합니다.'),
    },
  },
  {
    match: /^\/(console\/mes\/)?(master-data\/)?items/,
    detail: {
      ...baseMes,
      title: l('Item & Revision', 'Item & Revision', '品目とリビジョン', '품목 및 리비전'),
      summary: l('Quản lý thành phẩm, bán thành phẩm, nguyên vật liệu và revision được release để dùng trong MBOM/PV/WO.', 'Manage finished goods, semi-finished goods, raw materials, and released revisions used by MBOM/PV/WO.', '完成品、半製品、原材料、MBOM/PV/WOで使用するリリース済みリビジョンを管理します。', '완제품, 반제품, 원자재와 MBOM/PV/WO에서 사용할 릴리스 리비전을 관리합니다.'),
    },
  },
  {
    match: /^\/(console\/mes\/)?master-data\/mboms/,
    detail: {
      ...baseMes,
      title: l('MBOM', 'MBOM', 'MBOM', 'MBOM'),
      summary: l('Mô tả cấu trúc vật tư sản xuất: component, quantity, scrap, operation issue, backflush, phantom và substitute.', 'Defines production material structure: components, quantity, scrap, issue operation, backflush, phantom, and substitutes.', '部品、数量、スクラップ、投入工程、backflush、phantom、代替品を定義します。', '구성품, 수량, 스크랩, 투입 공정, backflush, phantom, 대체품을 정의합니다.'),
    },
  },
  {
    match: /^\/(console\/mes\/)?(master-data\/)?routings/,
    detail: {
      ...baseMes,
      title: l('Routing', 'Routing', 'ルーティング', '라우팅'),
      summary: l('Chuỗi công đoạn MIX, PREP, CUT, MOLD, TRIM, QC và validation trước khi release.', 'Operation sequence MIX, PREP, CUT, MOLD, TRIM, QC and validation before release.', 'MIX、PREP、CUT、MOLD、TRIM、QCの工程順序とリリース前検証です。', 'MIX, PREP, CUT, MOLD, TRIM, QC 공정 순서와 릴리스 전 검증입니다.'),
    },
  },
  {
    match: /^\/(console\/mes\/)?(master-data\/)?production-versions/,
    detail: {
      ...baseMes,
      title: l('Production Version', 'Production Version', 'Production Version', 'Production Version'),
      summary: l('Khóa kết nối ItemRevision, MBOM và Routing để WO chọn đúng cấu hình sản xuất.', 'Binds ItemRevision, MBOM, and Routing so WOs use the correct production configuration.', 'WOが正しい生産構成を使うようItemRevision、MBOM、Routingを結合します。', 'WO가 올바른 생산 구성을 사용하도록 ItemRevision, MBOM, Routing을 연결합니다.'),
    },
  },
  {
    match: /^\/(console\/mes\/)?employees|^\/(console\/mes\/)?shifts|^\/(console\/mes\/)?work-calendar|^\/(console\/mes\/)?master-data\/work-centers/,
    detail: {
      ...baseMes,
      title: l('Nhân sự và năng lực', 'Labor and capacity', '労務と能力', '인력 및 능력'),
      summary: l('Quản lý WorkCenter, nhân sự, kỹ năng, ca và lịch làm việc để phục vụ capacity/readiness.', 'Manage work centers, employees, skills, shifts, and calendars for capacity/readiness checks.', '能力/準備確認のためWorkCenter、従業員、スキル、シフト、カレンダーを管理します。', '능력/준비 상태 확인을 위해 WorkCenter, 직원, 스킬, 교대, 캘린더를 관리합니다.'),
    },
  },
  {
    match: /^\/(console\/mes\/)?master-data\/equipment|^\/(console\/mes\/)?master-data\/production-standards|^\/(console\/mes\/)?master-data\/reason-codes|^\/(console\/mes\/)?master-data\/skills/,
    detail: {
      ...baseMes,
      title: l('Master Data Tier 2', 'Tier 2 master data', 'Tier 2マスタ', 'Tier 2 마스터 데이터'),
      summary: l('Danh mục hỗ trợ vận hành: equipment, production standards, reason codes và skills.', 'Operational support catalogs: equipment, production standards, reason codes, and skills.', '設備、生産標準、理由コード、スキルの運用支援マスタです。', '설비, 생산 표준, 사유 코드, 스킬 운영 지원 마스터입니다.'),
    },
  },
  {
    match: /^\/console\/mes\/i18n-review/,
    detail: {
      ...baseMes,
      title: l('Duyệt bản dịch', 'Translation review', '翻訳レビュー', '번역 검토'),
      summary: l('Hàng đợi các giá trị LocalizedText nghi ngờ sai ngôn ngữ cần data-owner kiểm tra.', 'Queue of LocalizedText values suspected to be in the wrong language and requiring data-owner review.', '言語が疑わしいLocalizedText値をデータ担当者が確認するキューです。', '언어가 의심되는 LocalizedText 값을 데이터 담당자가 검토하는 큐입니다.'),
    },
  },
];

function pick(pathname: string) {
  return details.find((item) => item.match.test(pathname))?.detail ?? baseMes;
}

function text(value: Localized, locale: SupportedLocale) {
  return value[locale] ?? value.vi;
}

function Section({ icon: Icon, title, items, locale }: { icon: LucideIcon; title: Localized; items: Localized[]; locale: SupportedLocale }) {
  return (
    <section className="rounded-md border border-slate-700 bg-slate-950/55 p-4">
      <div className="mb-3 flex items-center gap-2 font-bold text-slate-100"><Icon className="h-4 w-4 text-action" />{text(title, locale)}</div>
      <ul className="space-y-2 text-sm leading-6 text-slate-300">
        {items.map((item, index) => <li key={index} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-action" />{text(item, locale)}</li>)}
      </ul>
    </section>
  );
}

export function PageDetailButton() {
  const [open, setOpen] = useState(false);
  const { locale } = useI18n();
  const { pathname } = useLocation();
  const detail = pick(pathname);
  return (
    <>
      <Button size="sm" variant="outline" className="bg-slate-950/80" onClick={() => setOpen(true)}>
        <Info className="h-4 w-4" />{text(l('Chi tiết trang', 'Page details', '画面詳細', '화면 상세'), locale)}
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true">
          <Card className="max-h-[86vh] w-full max-w-4xl overflow-y-auto p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-3 text-xl font-black text-slate-100"><BookOpen className="h-5 w-5 text-action" />{text(detail.title, locale)}</h2>
                <p className="mt-3 rounded-md border border-action/30 bg-action/10 p-4 text-sm leading-6 text-slate-200">{text(detail.summary, locale)}</p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setOpen(false)} aria-label="Close"><X className="h-4 w-4" /></Button>
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <Section icon={Route} title={l('Cách dùng', 'How to use', '使い方', '사용 방법')} items={detail.howToUse} locale={locale} />
              <Section icon={ListChecks} title={l('Dữ liệu trên màn hình', 'Data shown here', '表示データ', '표시 데이터')} items={detail.data} locale={locale} />
              <Section icon={CheckCircle2} title={l('Trạng thái quan trọng', 'Important statuses', '重要な状態', '중요 상태')} items={detail.statuses} locale={locale} />
              <Section icon={XCircle} title={l('Lưu ý demo', 'Demo notes', 'デモ注意点', '데모 참고')} items={detail.notes} locale={locale} />
            </div>
          </Card>
        </div>
      ) : null}
    </>
  );
}
