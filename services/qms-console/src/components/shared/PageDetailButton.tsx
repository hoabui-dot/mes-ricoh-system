import { BookOpen, CheckCircle2, Info, ListChecks, Route, XCircle, type LucideIcon } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useI18n, type SupportedLocale } from '@mom-platform/i18n-ui-shared';
import { Button, Dialog, DialogContent, DialogTitle, DialogTrigger } from '../ui';

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

const baseWms: Detail = {
  title: l('Chi tiết màn hình WMS', 'WMS page details', 'WMS画面の詳細', 'WMS 화면 상세'),
  summary: l('Màn hình demo WMS dùng dữ liệu seed để minh họa kho, tồn kho, nhập kho và cấp phát vật tư.', 'This WMS demo screen uses seeded data to explain warehouse, inventory, inbound, and material staging flows.', 'このWMSデモ画面はシードデータで倉庫、在庫、入庫、工程供給を説明します。', '이 WMS 데모 화면은 시드 데이터로 창고, 재고, 입고, 자재 공급 흐름을 설명합니다.'),
  howToUse: [
    l('Dùng bộ lọc, tìm kiếm và phân trang để xem dữ liệu theo kho, vị trí, lô hoặc trạng thái.', 'Use filters, search, and pagination to inspect records by warehouse, location, lot, or status.', 'フィルター、検索、ページングで倉庫、ロケーション、ロット、状態別に確認します。', '필터, 검색, 페이지네이션으로 창고, 위치, 로트, 상태별 데이터를 확인합니다.'),
    l('Nhấn vào dòng hoặc thẻ có thể mở trang/detail drawer nếu màn hình hỗ trợ drill-down.', 'Click rows or cards to open detail pages or drawers when drill-down is available.', '行やカードをクリックすると詳細ページまたはドロワーを開けます。', '행이나 카드를 클릭하면 상세 페이지 또는 드로어를 열 수 있습니다.'),
  ],
  data: [
    l('Dữ liệu là dữ liệu demo lớn: kho Kizuna 3, zone, location, bin, lot, tồn kho, movement ledger, receipt và material request.', 'Data is large demo data: Kizuna 3 warehouses, zones, locations, bins, lots, stock balances, movement ledger, receipts, and material requests.', 'データはキズナ3倉庫、ゾーン、ロケーション、ビン、ロット、在庫、移動履歴、入庫、資材要求のデモデータです。', '데이터는 키즈나3 창고, 구역, 위치, 빈, 로트, 재고, 이동 이력, 입고, 자재 요청 데모 데이터입니다.'),
  ],
  statuses: [
    l('Active: đang sử dụng. Inactive: ngưng dùng. Draft: chưa xác nhận. Confirmed: đã ghi nhận nghiệp vụ. Staged: đã cấp về vị trí staging. Shortage: thiếu tồn khả dụng.', 'Active means usable. Inactive means disabled. Draft is not confirmed. Confirmed has posted the business action. Staged means material is staged. Shortage means available stock is insufficient.', 'Activeは使用中、Inactiveは停止、Draftは未確定、Confirmedは業務反映済み、Stagedは供給済み、Shortageは在庫不足です。', 'Active는 사용 중, Inactive는 비활성, Draft는 미확정, Confirmed는 업무 반영, Staged는 공급 완료, Shortage는 가용 재고 부족입니다.'),
    l('Quarantined: lô bị cách ly chất lượng. Expired: lô quá hạn và không nên cấp phát mới.', 'Quarantined means quality hold. Expired means the lot is past expiry and should not be newly allocated.', 'Quarantinedは品質保留、Expiredは期限切れで新規割当を避けます。', 'Quarantined는 품질 격리, Expired는 만료되어 신규 할당을 피해야 합니다.'),
  ],
  notes: [
    l('Đây là bản demo nên một số màn hình có empty-state nếu backend chưa có endpoint đọc đầy đủ.', 'This is a demo version; some screens may show an empty state when a backend read endpoint is not implemented yet.', 'デモ版のため、一部画面は読取API未実装時に空状態を表示します。', '데모 버전이므로 일부 화면은 조회 API가 없으면 빈 상태를 표시합니다.'),
  ],
};

const details: Array<{ match: RegExp; detail: Detail }> = [
  {
    match: /^\/dashboard/,
    detail: {
      ...baseWms,
      title: l('Tổng quan kho', 'Warehouse dashboard', '倉庫ダッシュボード', '창고 대시보드'),
      summary: l('Tổng hợp KPI tồn kho, lô gần hết hạn, thiếu hàng và tồn tại vị trí staging.', 'Summarizes inventory KPIs, near-expiry lots, shortages, and staging stock.', '在庫KPI、期限間近ロット、不足、ステージング在庫を集約します。', '재고 KPI, 만료 임박 로트, 부족, 스테이징 재고를 요약합니다.'),
    },
  },
  {
    match: /^\/warehouse-map/,
    detail: {
      ...baseWms,
      title: l('Sơ đồ kho logic', 'Logical warehouse map', '論理倉庫マップ', '논리 창고 맵'),
      summary: l('Hiển thị Warehouse -> Zone -> Location -> Bin theo sơ đồ logic, tô màu theo tồn và hạn dùng.', 'Shows Warehouse -> Zone -> Location -> Bin as a logical schematic, colored by stock and expiry risk.', 'Warehouse -> Zone -> Location -> Binを論理図で表示し、在庫と期限リスクで色分けします。', 'Warehouse -> Zone -> Location -> Bin 논리 구조를 재고와 만료 위험 색상으로 표시합니다.'),
      howToUse: [
        l('Tìm location, bin hoặc lot; nhấn location để mở drawer tồn kho và di chuyển gần đây.', 'Search location, bin, or lot; click a location to open stock and recent movement details.', 'ロケーション、ビン、ロットを検索し、ロケーションを押すと在庫と最近の移動を確認できます。', '위치, 빈, 로트를 검색하고 위치를 클릭하면 재고와 최근 이동을 볼 수 있습니다.'),
        l('Icon thông tin cạnh mã kho hiển thị mô tả kho theo ngôn ngữ hiện tại.', 'The info icon beside a warehouse code shows the localized warehouse description.', '倉庫コード横の情報アイコンは現在言語の倉庫説明を表示します。', '창고 코드 옆 정보 아이콘은 현재 언어의 창고 설명을 표시합니다.'),
      ],
    },
  },
  {
    match: /^\/inventory\/balances/,
    detail: {
      ...baseWms,
      title: l('Số dư tồn kho', 'Inventory balances', '在庫残高', '재고 잔량'),
      summary: l('Danh sách tồn hiện tại theo lô và vị trí, gồm hạn dùng và trạng thái lô.', 'Current stock by lot and location, including expiry date and lot status.', 'ロットとロケーション別の現在在庫、期限、ロット状態を表示します。', '로트와 위치별 현재 재고, 만료일, 로트 상태를 표시합니다.'),
      howToUse: [l('Lọc theo Item Revision, Location hoặc lô gần hết hạn; nhấn mã lô để xem chi tiết lô.', 'Filter by item revision, location, or near expiry; click a lot code for lot detail.', '品目リビジョン、ロケーション、期限間近で絞り込み、ロットコードで詳細を開きます。', '품목 리비전, 위치, 만료 임박으로 필터하고 로트 코드를 눌러 상세를 봅니다.')],
    },
  },
  {
    match: /^\/inventory\/movements/,
    detail: {
      ...baseWms,
      title: l('Ledger nhập xuất', 'Inventory movement ledger', '入出庫履歴', '입출고 이력'),
      summary: l('Sổ cái bất biến của receipt, transfer staging, consumption và adjustment.', 'Append-only ledger for receipts, staging transfers, consumption, and adjustments.', '入庫、ステージング移動、消費、調整の追記型履歴です。', '입고, 스테이징 이동, 소비, 조정의 추가 전용 이력입니다.'),
    },
  },
  {
    match: /^\/master-data\/warehouses|^\/master-data\/zones|^\/master-data\/locations|^\/master-data\/bins|^\/master-data\/item-uom-mapping/,
    detail: {
      ...baseWms,
      title: l('Dữ liệu kho WMS', 'WMS warehouse master data', 'WMS倉庫マスタ', 'WMS 창고 마스터 데이터'),
      summary: l('Quản lý cấu trúc kho: Warehouse, Zone, Location, Bin và quy đổi UOM lưu kho.', 'Manages warehouse structure: warehouses, zones, locations, bins, and storage UOM mappings.', '倉庫、ゾーン、ロケーション、ビン、保管UOM変換を管理します。', '창고, 구역, 위치, 빈, 보관 UOM 매핑을 관리합니다.'),
      statuses: [
        l('Storage là vị trí kho trung tâm; WorkCenterStaging là vị trí cấp liệu gắn với WorkCenter MES.', 'Storage is central warehouse stock; WorkCenterStaging is material staged for an MES work center.', 'Storageは中央倉庫、WorkCenterStagingはMESワークセンター向け供給場所です。', 'Storage는 중앙 창고, WorkCenterStaging은 MES 워크센터 공급 위치입니다.'),
        ...baseWms.statuses,
      ],
    },
  },
  {
    match: /^\/inbound/,
    detail: {
      ...baseWms,
      title: l('Nhập kho', 'Inbound receipts', '入庫', '입고'),
      summary: l('Tạo phiếu nhập, nhập dòng vật tư vào Storage location, sau đó xác nhận để ghi tồn kho.', 'Create receipts, receive material lines into Storage locations, then confirm to post inventory.', '入庫伝票を作成しStorageへ資材行を入れ、確認で在庫反映します。', '입고 전표를 만들고 Storage 위치에 자재를 입고한 뒤 확정하여 재고 반영합니다.'),
    },
  },
  {
    match: /^\/outbound/,
    detail: {
      ...baseWms,
      title: l('Cấp phát vật tư', 'Material staging requests', '資材供給要求', '자재 공급 요청'),
      summary: l('Tạo yêu cầu cấp vật tư cho WO/WorkCenter. Hệ thống ưu tiên tồn đã staging, sau đó FEFO từ kho Storage.', 'Create material requests for a WO/work center. The system uses existing staged stock first, then FEFO from Storage.', 'WO/WorkCenter向け資材要求を作成します。既存ステージングを優先し、StorageからFEFOで補充します。', 'WO/WorkCenter용 자재 요청을 생성합니다. 기존 스테이징 재고를 우선 사용하고 Storage에서 FEFO로 보충합니다.'),
    },
  },
];

function pick(pathname: string) {
  return details.find((item) => item.match.test(pathname))?.detail ?? baseWms;
}

function text(value: Localized, locale: SupportedLocale) {
  return value[locale] ?? value.vi;
}

function Section({ icon: Icon, title, items, locale }: { icon: LucideIcon; title: Localized; items: Localized[]; locale: SupportedLocale }) {
  return (
    <section className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-center gap-2 font-bold text-slate-900"><Icon className="h-4 w-4 text-action" />{text(title, locale)}</div>
      <ul className="space-y-2 text-sm leading-6 text-slate-700">
        {items.map((item, index) => <li key={index} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-action" />{text(item, locale)}</li>)}
      </ul>
    </section>
  );
}

export function PageDetailButton() {
  const { locale } = useI18n();
  const { pathname } = useLocation();
  const detail = pick(pathname);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="bg-white/90"><Info className="h-4 w-4" />{text(l('Chi tiết trang', 'Page details', '画面詳細', '화면 상세'), locale)}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[86vh] max-w-4xl overflow-y-auto bg-white text-slate-900">
        <DialogTitle className="flex items-center gap-3 text-xl font-black"><BookOpen className="h-5 w-5 text-action" />{text(detail.title, locale)}</DialogTitle>
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-slate-800">{text(detail.summary, locale)}</p>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <Section icon={Route} title={l('Cách dùng', 'How to use', '使い方', '사용 방법')} items={detail.howToUse} locale={locale} />
          <Section icon={ListChecks} title={l('Dữ liệu trên màn hình', 'Data shown here', '表示データ', '표시 데이터')} items={detail.data} locale={locale} />
          <Section icon={CheckCircle2} title={l('Trạng thái quan trọng', 'Important statuses', '重要な状態', '중요 상태')} items={detail.statuses} locale={locale} />
          <Section icon={XCircle} title={l('Lưu ý demo', 'Demo notes', 'デモ注意点', '데모 참고')} items={detail.notes} locale={locale} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
