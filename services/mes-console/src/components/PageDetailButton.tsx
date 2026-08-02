import { useState } from 'react';
import { BookOpen, Info, ListChecks, X, type LucideIcon } from 'lucide-react';
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
  process?: ProcessStep[];
};

type ProcessStep = { title: Localized; description: Localized; severity?: 'normal' | 'advisory' | 'blocking' | 'async' };

const l = (vi: string, en: string, ja: string, ko: string): Localized => ({ vi, en, ja, ko });

const workOrderCreationProcess: ProcessStep[] = [
  { title: l('Chọn sản phẩm sẵn sàng', 'Select a production-ready product revision', '製造可能な製品リビジョンを選択', '생산 가능한 제품 리비전 선택'), description: l('Chọn Item Revision đã release từ danh sách tìm kiếm; không nhập mã thủ công.', 'Select a released Item Revision from the searchable list instead of typing a code.', '検索リストからリリース済みItem Revisionを選択し、コードを手入力しません。', '검색 목록에서 릴리스된 Item Revision을 선택하고 코드를 직접 입력하지 않습니다.') },
  { title: l('Nhập số lượng và ngày mục tiêu', 'Enter quantity and target date', '数量と目標日を入力', '수량과 목표일 입력'), description: l('UOM được lấy theo sản phẩm đã chọn và ngày kết thúc phải hợp lệ.', 'The UOM comes from the selected product and the target date must be valid.', 'UOMは選択製品から取得し、目標日は有効である必要があります。', 'UOM은 선택한 제품에서 가져오며 목표일은 유효해야 합니다.') },
  { title: l('Kiểm tra yêu cầu', 'Validate the creation request', '作成リクエストを検証', '생성 요청 검증'), description: l('MES kiểm tra định danh, số lượng, thời gian và người dùng xác thực.', 'MES checks identifiers, quantity, dates, and authenticated user context.', 'MESは識別子、数量、日付、認証ユーザーを確認します。', 'MES는 식별자, 수량, 날짜 및 인증 사용자 컨텍스트를 확인합니다.'), severity: 'blocking' },
  { title: l('Kiểm tra Item Revision', 'Validate the Item Revision', 'Item Revisionを検証', 'Item Revision 검증'), description: l('Revision phải tồn tại, đã release và sẵn sàng cho site/ngày sản xuất.', 'The revision must exist, be released, and be ready for the site and production date.', 'リビジョンは存在し、リリース済みでサイトと製造日に有効である必要があります。', '리비전은 존재하고 릴리스되어 사이트와 생산일에 유효해야 합니다.'), severity: 'blocking' },
  { title: l('Resolve Production Version', 'Resolve the Production Version', 'Production Versionを解決', 'Production Version 확인'), description: l('MES resolve Production Version phù hợp với Item Revision và site.', 'MES resolves the matching Production Version for the revision and site.', 'MESはリビジョンとサイトに合うProduction Versionを解決します。', 'MES는 리비전과 사이트에 맞는 Production Version을 확인합니다.'), severity: 'blocking' },
  { title: l('Kiểm tra MBOM và nhu cầu vật tư', 'Validate MBOM and material demand', 'MBOMと資材需要を検証', 'MBOM 및 자재 소요량 검증'), description: l('MES kiểm tra MBOM đã release và tính nhu cầu theo số lượng cùng scrap rate.', 'MES verifies the released MBOM and calculates material demand from quantity and scrap rate.', 'MESはリリース済みMBOMを検証し、数量とスクラップ率から資材需要を計算します。', 'MES는 릴리스된 MBOM을 검증하고 수량과 스크랩률로 자재 소요량을 계산합니다.'), severity: 'blocking' },
  { title: l('Kiểm tra Routing', 'Validate the Routing', 'Routingを検証', 'Routing 검증'), description: l('MES kiểm tra routing đã release, công đoạn, thứ tự và WorkCenter liên kết.', 'MES verifies the released routing, operations, sequence, and linked Work Centers.', 'MESはリリース済みRouting、工程、順序、WorkCenterを検証します。', 'MES는 릴리스된 Routing, 공정, 순서 및 연결된 WorkCenter를 검증합니다.'), severity: 'blocking' },
  { title: l('Kiểm tra năng lực được hỗ trợ', 'Check supported resource readiness', '対応リソース準備を確認', '지원 리소스 준비 상태 확인'), description: l('WorkCenter, Production Standard, capability và lịch chỉ được kiểm tra khi backend hỗ trợ; capacity hiện là advisory.', 'Work Center, Production Standard, capability, and calendar checks run only where supported; capacity is currently advisory.', 'WorkCenter、Production Standard、capability、カレンダーは対応範囲で確認し、能力は現在アドバイザリです。', 'WorkCenter, Production Standard, capability, 캘린더는 지원 범위에서 확인하며 능력은 현재 참고용입니다.'), severity: 'advisory' },
  { title: l('Tạo Draft Work Order', 'Create the Draft Work Order', 'Draft Work Orderを作成', 'Draft 작업지시 생성'), description: l('MES commit header, operations và material requirements trong một transaction.', 'MES commits the header, operations, and material requirements in one transaction.', 'MESはヘッダー、工程、資材所要量を1つのトランザクションでコミットします。', 'MES는 헤더, 공정 및 자재 소요량을 하나의 트랜잭션으로 커밋합니다.') },
  { title: l('Xếp hàng sự kiện tích hợp', 'Queue the integration event', '統合イベントをキューに登録', '통합 이벤트 대기열 등록'), description: l('MES ghi MES.Execution.WOCreated.v1 vào transactional outbox; downstream xử lý bất đồng bộ và chưa được xem là hoàn tất.', 'MES records MES.Execution.WOCreated.v1 in the transactional outbox; downstream processing is asynchronous and is not claimed as completed.', 'MES.Execution.WOCreated.v1をトランザクション・アウトボックスに記録します。後続処理は非同期で完了扱いにしません。', 'MES.Execution.WOCreated.v1을 트랜잭션 아웃박스에 기록합니다. 다운스트림 처리는 비동기이며 완료로 간주하지 않습니다.'), severity: 'async' },
];

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
      data: [
        l('WO code là mã duy nhất do backend cấp cho mỗi lệnh sản xuất.', 'WO code is the unique backend-generated code for each Work Order.', 'WO codeはバックエンドが付与する製造指図の一意コードです。', 'WO code는 백엔드가 생성한 작업지시의 고유 코드입니다.'),
        l('Product và quantity cho biết sản phẩm/revision cần sản xuất và sản lượng cùng UOM.', 'Product and quantity show the product/revision to manufacture and requested quantity with UOM.', 'Productとquantityは製造する製品/リビジョンと数量・UOMを示します。', 'Product와 quantity는 생산할 제품/리비전과 UOM이 포함된 요청 수량을 보여줍니다.'),
        l('Status và planned period cho biết vòng đời WO và thời gian sản xuất dự kiến.', 'Status and planned period show the Work Order lifecycle and planned production window.', 'Statusとplanned periodは製造指図のライフサイクルと計画期間を示します。', 'Status와 planned period는 작업지시 수명주기와 계획 생산 기간을 보여줍니다.'),
      ],
      statuses: [
        l('Dùng bộ lọc trạng thái để thu hẹp Draft, Approved, InProgress hoặc Completed; mở chi tiết để Compute & Check và approve/reject.', 'Use the status filter for Draft, Approved, InProgress, or Completed; open details for Compute & Check and approve/reject actions.', 'ステータスフィルターでDraft、Approved、InProgress、Completedを絞り、詳細でCompute & Checkと承認/却下を実行します。', '상태 필터로 Draft, Approved, InProgress, Completed를 좁히고 상세에서 Compute & Check와 승인/반려를 실행합니다.'),
      ],
    },
  },
  {
    match: /^\/(console\/mes\/)?work-orders\/new/,
    detail: {
      ...baseMes,
      title: l('Tạo lệnh sản xuất', 'Create work order', '製造指図作成', '작업 지시 생성'),
      summary: l('Chọn revision sản phẩm đã sẵn sàng, nhập số lượng và ngày mục tiêu; backend kiểm tra master-data readiness trước khi tạo WO.', 'Select a production-ready item revision, enter quantity and target date; the backend checks master-data readiness before creating a WO.', '生産準備済みの品目リビジョンを選択し、数量と目標日を入力すると、バックエンドがマスタ準備状況を確認してWOを作成します。', '생산 준비가 완료된 품목 리비전을 선택하고 수량과 목표일을 입력하면 백엔드가 마스터 데이터 준비 상태를 확인한 뒤 WO를 생성합니다.'),
      process: workOrderCreationProcess,
      howToUse: [
        l('Chọn Item Revision đã release, nhập số lượng và ngày mục tiêu, sau đó bấm Khởi tạo WO & kiểm tra readiness.', 'Select a released Item Revision, enter quantity and target date, then create the WO and run readiness checks.', 'リリース済みItem Revision、数量、目標日を入力し、WO作成と準備確認を実行します。', '릴리스된 Item Revision, 수량, 목표일을 입력한 뒤 WO 생성과 준비 상태 확인을 실행합니다.'),
        l('MES tạo Demand từ MBOM/Production Version, kiểm tra Routing và các công đoạn có thể lập lịch trước khi lưu WO Draft.', 'MES derives demand from the MBOM/Production Version and checks Routing and schedulable operations before saving a WO Draft.', 'MESはMBOM/Production Versionから需要を計算し、Routingとスケジュール可能な工程を確認してWO Draftを保存します。', 'MES는 MBOM/Production Version에서 소요량을 계산하고 Routing과 일정 가능 공정을 확인한 후 WO Draft를 저장합니다.'),
        l('Sau khi tạo, mở chi tiết WO để Compute & Check, kiểm tra capacity/WMS stock, rồi chuyển sang phê duyệt.', 'Open the WO detail for Compute & Check, review capacity/WMS stock, then send it for approval.', '作成後にWO詳細でCompute & Checkを実行し、能力とWMS在庫を確認して承認します。', '생성 후 WO 상세에서 Compute & Check를 실행하고 능력과 WMS 재고를 확인한 뒤 승인합니다.'),
      ],
      data: [
        l('Item Revision liên kết tới Item, MBOM, Routing, Production Version và UOM; số lượng tạo ra nhu cầu nguyên liệu theo định mức.', 'The Item Revision links the Item, MBOM, Routing, Production Version, and UOM; quantity drives material demand from the BOM.', 'Item RevisionはItem、MBOM、Routing、Production Version、UOMを結び、数量からBOM需要を計算します。', 'Item Revision은 Item, MBOM, Routing, Production Version, UOM을 연결하며 수량으로 BOM 소요량을 계산합니다.'),
        l('WorkCenter, Equipment, Employee và Skill không được gán thủ công trong form này; chúng được kiểm tra qua readiness/capacity theo Routing và Production Standard.', 'WorkCenter, Equipment, Employee, and Skill are not manually assigned in this form; readiness/capacity checks resolve them from Routing and Production Standards.', 'このフォームでWorkCenter、設備、従業員、スキルを手動割当せず、RoutingとProduction Standardから準備/能力を確認します。', '이 폼에서 WorkCenter, 설비, 직원, 스킬을 직접 지정하지 않고 Routing과 Production Standard에서 준비/능력을 확인합니다.'),
        l('WMS không được gọi để tạo WO Draft; tồn kho được kiểm tra ở Compute & Check và material staging diễn ra khi execution yêu cầu.', 'WMS is not called to create the WO Draft; stock is checked during Compute & Check and staged when execution requests material.', 'WO Draft作成時にWMSを呼び出さず、Compute & Checkで在庫を確認し、実行時に資材をステージします。', 'WO Draft 생성 시 WMS를 호출하지 않으며 Compute & Check에서 재고를 확인하고 실행 시 자재를 스테이징합니다.'),
      ],
      statuses: [
        l('Readiness đạt: Item Revision, MBOM, Routing, Production Version đã release và có hiệu lực tại site.', 'Readiness passes when the Item Revision, MBOM, Routing, and Production Version are released and effective for the site.', 'Item Revision、MBOM、Routing、Production Versionがサイトでリリースされ有効なら準備確認に合格します。', 'Item Revision, MBOM, Routing, Production Version이 사이트에서 릴리스되고 유효하면 준비 확인에 통과합니다.'),
        l('Readiness không đạt: hệ thống trả danh sách prerequisite thiếu; sửa master data rồi tạo lại, không lưu WO không hợp lệ.', 'Readiness fails with a missing-prerequisite list; fix master data and retry instead of saving an invalid WO.', '準備確認に失敗すると不足項目を表示します。マスタを修正して再試行し、不正なWOは保存しません。', '준비 상태가 실패하면 누락 prerequisite 목록을 표시합니다. 마스터를 수정하고 다시 시도하며 잘못된 WO는 저장하지 않습니다.'),
        l('WO Draft chỉ là kế hoạch; Approved mới được phép đi vào execution, còn Rejected phải có lý do.', 'WO Draft is planning data; Approved can enter execution, while Rejected requires a reason.', 'WO Draftは計画データです。Approvedで実行可能になり、Rejectedには理由が必要です。', 'WO Draft는 계획 데이터이며 Approved 상태에서 실행할 수 있고 Rejected에는 사유가 필요합니다.'),
      ],
      notes: [
        l('Demo không tự động phân công một nhân viên cụ thể trong form tạo WO. Employee/Skill/WorkCenter là dữ liệu năng lực được kiểm tra theo ca và standard.', 'The demo does not automatically assign a named employee in this form. Employee/Skill/WorkCenter data is used for shift and standard capacity checks.', 'デモでは作成フォームから特定従業員を自動割当しません。従業員/スキル/WorkCenterはシフトと標準能力確認に使用します。', '데모에서는 생성 폼에서 특정 직원을 자동 배정하지 않습니다. 직원/스킬/WorkCenter는 교대와 표준 능력 확인에 사용됩니다.'),
      ],
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
    match: /^\/(console\/mes\/)?master-data\/workstations(?:\/|$)/,
    detail: {
      ...baseMes,
      title: l('Workstation và công đoạn được hỗ trợ', 'Workstation and supported operations', 'Workstationと対応工程', 'Workstation 및 지원 공정'),
      summary: l('Khai báo các công đoạn mà Workstation có thể thực hiện và thời gian kế hoạch riêng cho từng công đoạn.', 'Define the Operations a Workstation can execute and the planning times for each Operation.', 'Workstationが実行できる工程と、工程ごとの計画時間を定義します。', 'Workstation이 실행할 수 있는 공정과 공정별 계획 시간을 정의합니다.'),
      howToUse: [
        l('Tạo hoặc chọn Operation từ Danh mục công đoạn, sau đó thêm vào Supported operations.', 'Create or select an Operation from the Operation Catalog, then add it to Supported operations.', '工程カタログで工程を作成または選択し、対応工程に追加します。', '공정 카탈로그에서 공정을 생성하거나 선택한 뒤 지원 공정에 추가합니다.'),
        l('Nhập Cycle Time, Setup Time và Reference Quantity cho từng dòng; mỗi Operation có bộ giá trị độc lập.', 'Enter Cycle Time, Setup Time, and Reference Quantity for each row; every Operation has its own independent values.', '各行にサイクル時間、段取り時間、基準数量を入力します。工程ごとに独立した値を持ちます。', '각 행에 사이클 시간, 셋업 시간 및 참조 수량을 입력합니다. 공정마다 독립된 값을 가집니다.'),
        l('Gán Workstation vào Work Center. Routing chọn Work Center, còn planning tự động tìm Workstation đủ điều kiện.', 'Assign the Workstation to a Work Center. Routing selects the Work Center; planning resolves an eligible Workstation automatically.', 'WorkstationをWork Centerに割り当てます。RoutingはWork Centerを選び、計画が対象Workstationを自動解決します。', 'Workstation을 Work Center에 배정합니다. Routing은 Work Center를 선택하고 계획이 적합한 Workstation을 자동으로 결정합니다.'),
      ],
      data: [
        l('Cycle Time là thời gian xử lý ước tính của cặp Workstation + Operation cho Reference Quantity, không phải thời gian chung của Workstation.', 'Cycle Time is the estimated processing time for the Workstation + Operation pair for the Reference Quantity, not a generic Workstation property.', 'サイクル時間はWorkstation + 工程の組み合わせが基準数量を処理する推定時間であり、Workstation共通の値ではありません。', '사이클 시간은 Workstation + 공정 조합이 참조 수량을 처리하는 예상 시간이며 Workstation의 공통 속성이 아닙니다.'),
        l('Setup Time là thời gian chuẩn bị xảy ra một lần trước khi sản xuất: thay khuôn, lắp dụng cụ, vệ sinh, làm nóng máy hoặc kiểm tra an toàn.', 'Setup Time is preparation performed once before production: mold/tool change, cleaning, warm-up, or safety inspection.', '段取り時間は生産前に一度行う準備（治工具交換、清掃、暖機、安全点検など）です。', '셋업 시간은 생산 전에 한 번 수행하는 준비 시간으로 금형/공구 교체, 청소, 예열 및 안전 점검을 포함합니다.'),
        l('Reference Quantity là số lượng được Cycle Time biểu diễn; planning tự quy đổi thời lượng cho số lượng sản xuất khác.', 'Reference Quantity is the quantity represented by Cycle Time; planning scales the estimate for other production quantities.', '基準数量はサイクル時間が表す数量であり、計画は別の生産数量に合わせて時間を換算します。', '참조 수량은 사이클 시간이 나타내는 수량이며 계획은 다른 생산 수량에 맞춰 시간을 환산합니다.'),
      ],
      statuses: [
        l('Workstation phải có Operation capability hợp lệ, Cycle Time lớn hơn 0, Setup Time không âm và Reference Quantity lớn hơn 0.', 'A Workstation capability requires Cycle Time greater than 0, non-negative Setup Time, and Reference Quantity greater than 0.', 'Workstation能力にはサイクル時間>0、段取り時間>=0、基準数量>0が必要です。', 'Workstation 능력에는 사이클 시간 > 0, 셋업 시간 >= 0, 참조 수량 > 0이 필요합니다.'),
        l('Machine Groups là cấu hình thực thi tại Workstation; Routing không chọn trực tiếp Workstation.', 'Machine Groups execute at the Workstation; Routing does not select a Workstation directly.', 'Machine GroupがWorkstationで実行し、RoutingはWorkstationを直接選択しません。', 'Machine Group이 Workstation에서 실행하며 Routing은 Workstation을 직접 선택하지 않습니다.'),
      ],
      notes: [
        l('Tổng thời lượng kế hoạch gồm Setup Time + thời gian chạy theo Reference Quantity, sau đó có thể cộng queue/move time và các hệ số năng lực.', 'Planned duration includes Setup Time plus run time scaled from Reference Quantity, then may include queue/move time and capacity factors.', '計画時間は段取り時間と基準数量から換算した実行時間を含み、キュー/移動時間や能力係数が加算される場合があります。', '계획 시간은 셋업 시간과 참조 수량에서 환산한 실행 시간을 포함하며 대기/이동 시간과 능력 계수가 추가될 수 있습니다.'),
      ],
    },
  },
  {
    match: /^\/master-data\/machines|^\/master-data\/production-standards|^\/master-data\/reason-codes|^\/master-data\/skills/,
    detail: {
      ...baseMes,
      title: l('Master Data Tier 2', 'Tier 2 master data', 'Tier 2マスタ', 'Tier 2 마스터 데이터'),
      summary: l('Danh mục hỗ trợ vận hành: machines, production standards, reason codes và worker skills.', 'Operational support catalogs: machines, production standards, reason codes, and worker skills.', '機械、生産標準、理由コード、ワーカースキルの運用支援マスタです。', '머신, 생산 표준, 사유 코드, 작업자 스킬 운영 지원 마스터입니다.'),
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
    <section>
      <div className="mb-3 flex items-center gap-2 border-b border-border pb-2 font-bold text-foreground"><Icon className="h-4 w-4 text-action" />{text(title, locale)}</div>
      <ol className="space-y-3 text-sm leading-6 text-muted-foreground">
        {items.map((item, index) => <li key={index} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-action/40 bg-action/10 text-xs font-bold text-action">{index + 1}</span><span>{text(item, locale)}</span></li>)}
      </ol>
    </section>
  );
}

function ProcessSection({ steps, locale }: { steps: ProcessStep[]; locale: SupportedLocale }) {
  const severityLabel: Record<NonNullable<ProcessStep['severity']>, Localized> = {
    normal: l('Thông tin', 'Info', '情報', '정보'),
    advisory: l('Khuyến nghị', 'Advisory', 'アドバイザリ', '권고'),
    blocking: l('Có thể chặn tạo WO', 'Blocking', 'ブロッキング', '차단 가능'),
    async: l('Bất đồng bộ', 'Async', '非同期', '비동기'),
  };
  return <section><div className="mb-3 flex items-center gap-2 border-b border-border pb-2 font-bold text-foreground"><ListChecks className="h-4 w-4 text-action" />{text(l('Quy trình tạo lệnh sản xuất', 'How the Work Order is created', '作業指図の作成プロセス', '작업지시 생성 프로세스'), locale)}</div><ol className="space-y-3">{steps.map((step, index) => <li key={index} className="flex gap-3 border-b border-border/70 pb-3 last:border-0"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-action text-sm font-black text-action-foreground">{String(index + 1).padStart(2, '0')}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-foreground">{text(step.title, locale)}</h3>{step.severity && <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{text(severityLabel[step.severity], locale)}</span>}</div><p className="mt-1 text-sm leading-6 text-muted-foreground">{text(step.description, locale)}</p></div></li>)}</ol></section>;
}

export function PageDetailButton() {
  const [open, setOpen] = useState(false);
  const { locale } = useI18n();
  const { pathname } = useLocation();
  const detail = pick(pathname);
  return (
    <>
      <Button size="sm" variant="outline" className="bg-card text-foreground" onClick={() => setOpen(true)}>
        <Info className="h-4 w-4" />{text(l('Chi tiết trang', 'Page details', '画面詳細', '화면 상세'), locale)}
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true">
          <Card className="max-h-[88vh] w-full max-w-5xl overflow-hidden p-0">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card px-6 py-5">
              <div>
                <h2 className="flex items-center gap-3 text-xl font-semibold text-foreground"><BookOpen className="h-5 w-5 text-action" />{text(l('Hướng dẫn trang', 'Page guide', '画面ガイド', '페이지 가이드'), locale)}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{text(detail.title, locale)}</p>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-foreground">{text(detail.summary, locale)}</p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setOpen(false)} aria-label={text(l('Đóng', 'Close', '閉じる', '닫기'), locale)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="grid max-h-[calc(88vh-150px)] overflow-y-auto lg:grid-cols-[190px_minmax(0,1fr)]">
              <nav className="border-b border-border bg-muted/20 p-5 lg:border-b-0 lg:border-r" aria-label={text(l('Mục lục hướng dẫn', 'Guide navigation', 'ガイドナビゲーション', '가이드 탐색'), locale)}>
                <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">MES Console</p>
                <a href="#guide-how-to-use" className="block rounded-md border-l-2 border-action bg-action/10 px-3 py-2 text-sm font-semibold text-foreground">{text(l('Cách dùng', 'How to use', '使い方', '사용 방법'), locale)}</a>
                <a href="#guide-context" className="mt-1 block rounded-md border-l-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:bg-hover hover:text-foreground">{text(detail.process ? l('Quy trình tạo', 'Creation process', '作成プロセス', '생성 프로세스') : l('Giải thích trang', 'Understanding this page', '画面の説明', '페이지 설명'), locale)}</a>
              </nav>
              <div className="space-y-8 p-6">
                <div id="guide-how-to-use"><Section icon={BookOpen} title={l('Cách dùng', 'How to use', '使い方', '사용 방법')} items={detail.howToUse} locale={locale} /></div>
                <div id="guide-context">{detail.process ? <ProcessSection steps={detail.process} locale={locale} /> : <Section icon={ListChecks} title={l('Giải thích trang', 'Understanding this page', '画面の説明', '페이지 설명')} items={[...detail.data, ...detail.statuses, ...detail.notes]} locale={locale} />}</div>
              </div>
            </div>
          </Card>
        </div>
      ) : null}
    </>
  );
}
