Toàn bộ use case Resource Planning
Nhóm A — Work Order creation
RP-E2E-001 — Create Work Order từ Released Production Version

Preconditions

Production Version ở trạng thái Released.
Item Revision, MBOM và Routing hợp lệ.
Shift còn hiệu lực.
Routing có các operation hợp lệ.

Steps

Open Work Order list
→ Create Work Order
→ Select Production Version
→ Select Shift
→ Enter quantity
→ Submit

Expect

Work Order được tạo.
Business code được hiển thị.
Production Version đúng.
Planned quantity đúng.
Work Order Operations được tạo đúng số lượng.
Mỗi operation có sequence đúng.
Mỗi operation trỏ đến Work Center đúng.
Không sinh duplicate operation.
Refresh browser vẫn còn Work Order.
RP-E2E-002 — Production Version chưa Released

Steps

Chọn Draft Production Version hoặc gọi create với Draft version.

Expect

Create bị từ chối.
Không tạo Work Order.
UI hiển thị lỗi có ý nghĩa.
Không xuất hiện raw enum hoặc raw error object.
RP-E2E-003 — Production Version thiếu Routing

Expect

Work Order không được tạo hoặc planning bị Blocked theo policy hiện tại.
Lỗi phải chỉ rõ Routing không hợp lệ hoặc chưa được cấu hình.
Không tạo Work Order Operations không đầy đủ.
RP-E2E-004 — Planned quantity không hợp lệ

Các giá trị:

0
-1
empty
decimal không được hỗ trợ
vượt giới hạn

Expect

Form validation chặn submit hoặc backend từ chối.
Không tạo Work Order.
Error hiển thị tại đúng field.
Không gửi duplicate request.
RP-E2E-005 — Shift không hợp lệ

Các trường hợp:

Shift inactive.
Shift không thuộc Site.
Shift không áp dụng cho ngày đã chọn.

Expect

Không cho create hoặc Compute & Check bị chặn.
Lỗi chỉ rõ vấn đề của Shift.
Không tạo partial operation data.
RP-E2E-006 — Double submit Create Work Order

Steps

Double click Save hoặc gửi request lặp.

Expect

Chỉ có một Work Order hoặc controlled idempotent result.
Không tạo duplicate operation.
Button bị disable trong lúc submit.
Nhóm B — Candidate resolution
RP-E2E-010 — Ready và Blocked candidates cùng xuất hiện

Preconditions

Một Work Center có:

một Workstation đáp ứng đủ requirement;
một Workstation thiếu resource.

Expect

Tổng số candidate đúng.
Ready count đúng.
Blocked count đúng.
Ready candidate có thể chọn.
Blocked candidate không thể chọn.
Candidate sắp xếp ổn định.
Workstation code và name hiển thị, không dùng UUID.
RP-E2E-011 — Work Center không có Workstation

Expect

Candidate list rỗng.
Hiển thị empty state có ý nghĩa.
Không hiển thị Commit.
Không crash hoặc loading vô hạn.
RP-E2E-012 — Workstation inactive

Expect

Tùy policy hiện tại:

Workstation xuất hiện dưới dạng Blocked với reason WORKSTATION_INACTIVE; hoặc
bị loại khỏi candidate result nhưng response phải có summary phù hợp.

UI không được cho chọn.

RP-E2E-013 — Workstation không planning eligible

Expect

Candidate Blocked.
Reason chỉ rõ planning không được bật.
Không thể commit qua UI.
Direct API commit cũng bị backend từ chối.
RP-E2E-014 — Routing Operation thiếu Work Center

Expect

Compute & Check bị chặn.
Operation hiển thị Blocked.
Reason chỉ rõ thiếu Work Center.
Không cố tìm Workstation toàn Site.
RP-E2E-015 — Workstation thuộc Work Center khác

Steps

Dùng API hoặc tamper request để gửi Workstation từ Work Center khác.

Expect

Validate thất bại.
Commit thất bại.
Không tạo allocation.
UI hiển thị lỗi tương thích Work Center.
Nhóm C — Machine Requirement validation
RP-E2E-020 — Requirement quantity được đáp ứng đầy đủ

Ví dụ:

Required = 2
Assigned = 2
Available = 2

Expect

Candidate Ready.
UI hiển thị đúng required, assigned, available.
Có đúng hai selectable Machine Units.
RP-E2E-021 — Thiếu effective Resource Assignment
Required = 1
Assigned = 0

Expect

Candidate Blocked.
Reason chỉ rõ missing effective assignment.
Không cho chọn Workstation.
Không có allocation được tạo.
RP-E2E-022 — Assigned quantity nhỏ hơn required quantity
Required = 2
Assigned = 1
Available = 1

Expect

Candidate Blocked.
UI hiển thị:
Required: 2
Assigned: 1
Available: 1
Reason không được chỉ ghi chung chung “Not ready”.
RP-E2E-023 — Assignment đã hết hiệu lực

Preconditions

Assignment có effective_to trước thời điểm planning.

Expect

Assignment không được tính là current.
Candidate Blocked.
Assignment history vẫn còn.
Không được dùng Machine Unit đã hết assignment để commit.
RP-E2E-024 — Assignment chưa bắt đầu hiệu lực

Expect

Không tính vào available resource.
Candidate Blocked cho khoảng thời gian hiện tại.
Có blocking reason rõ ràng.
RP-E2E-025 — Machine Unit Pending Identification

Expect

Machine Unit không selectable.
Candidate Blocked nếu không còn unit hợp lệ khác.
Reason chỉ rõ physical identity chưa hoàn chỉnh.
RP-E2E-026 — Machine Unit không planning eligible

Expect

Unit không được tính vào available quantity.
Candidate Blocked nếu requirement không còn được đáp ứng.
Direct allocation API phải từ chối.
RP-E2E-027 — Machine Unit Maintenance

Expect

Unit không selectable.
Available quantity giảm.
Candidate Blocked nếu thiếu quantity.
UI hiển thị trạng thái Maintenance đã dịch.
RP-E2E-028 — Machine Unit Out of Service

Expect

Giống Maintenance nhưng blocking reason phải phản ánh đúng lifecycle/execution status.

RP-E2E-029 — Machine Unit đã assigned sang Workstation khác

Expect

Không selectable cho Workstation hiện tại.
Commit bị từ chối nếu request bị sửa thủ công.
Không tạo cross-workstation allocation sai.
RP-E2E-030 — Duplicate Machine Unit IDs

Request:

{
  "machineUnitIds": ["unit-a", "unit-a"]
}

Expect

Validate thất bại.
Commit thất bại.
Không duplicate allocation row.
UI hiển thị validation error rõ ràng.
RP-E2E-031 — Machine Unit không thuộc Machine Definition requirement

Expect

Không thể satisfy requirement bằng Machine Definition khác.
Backend từ chối ngay cả khi unit Available.
Không tạo allocation.
Nhóm D — Manual selection và allocation
RP-E2E-040 — Validate selection thành công

Steps

Select Ready Workstation
→ Select exact Machine Units
→ Validate

Expect

Response valid: true.
UI hiển thị selection hợp lệ.
Chưa tạo committed allocation.
Refresh trước Commit không được hiển thị allocation đã commit.
RP-E2E-041 — Commit allocation thành công

Expect

Allocation status là Committed.
Workstation snapshot được lưu.
Exact Machine Unit snapshots được lưu.
Committed by và committed at tồn tại.
Sau refresh dữ liệu vẫn đúng.
Master Resource Assignment không bị sửa.
RP-E2E-042 — Commit từng operation theo predecessor window

Preconditions

Routing có ba operations nối tiếp.

Expect

Operation 20 không được có planned window trước Operation 10.
Các allocation được commit theo dependency hợp lệ.
Time windows không overlap sai nếu policy hiện tại không cho phép.
UI thể hiện đúng trạng thái từng operation.
RP-E2E-043 — Không chọn đủ Machine Units
Required = 2
Selected = 1

Expect

Validate invalid.
Commit button bị disable hoặc commit bị backend từ chối.
Error hiển thị required và selected quantity.
RP-E2E-044 — Chọn Machine Unit không còn Available

Expect

Validate hoặc commit bị từ chối.
Không tạo allocation.
Candidate được refresh hoặc đánh dấu stale.
RP-E2E-045 — Blocked candidate được gửi trực tiếp qua API

Expect

Backend từ chối.
Frontend restriction không phải lớp bảo vệ duy nhất.
Không tạo allocation.
RP-E2E-046 — Allocation persistence sau refresh

Expect

Sau full browser reload:

Operation vẫn Committed.
Workstation đúng.
Machine Units đúng.
Không lấy dữ liệu từ client state cũ.
Không hiển thị lại candidate selection như chưa commit.
RP-E2E-047 — Allocation persistence sau logout/login

Expect

Sau login lại, allocation vẫn tồn tại.
Dữ liệu committed được lấy từ backend.
Planner identity vẫn đúng.
Nhóm E — Idempotency và duplicate behavior
RP-E2E-050 — Replay cùng idempotency key

Expect

Trả lại allocation ban đầu.
Không tạo allocation mới.
Allocation ID không thay đổi.
Số machine snapshots không tăng.
RP-E2E-051 — Double click Commit

Expect

Button bị disable trong request.
Chỉ một API call hoặc backend xử lý idempotent.
Chỉ một allocation được tạo.
Không có duplicate toast bất thường.
RP-E2E-052 — Replay cùng key nhưng payload khác

Ví dụ cùng idempotency key nhưng đổi Machine Unit.

Expect

Backend trả conflict hoặc idempotency payload mismatch.
Allocation cũ không bị mutate.
Không tạo allocation thứ hai.
RP-E2E-053 — Commit lại operation đã Committed

Expect

Theo current policy:

trả existing allocation; hoặc
controlled conflict yêu cầu cancel/replan.

Không được silently overwrite resource snapshots.

Nhóm F — Stale data và concurrency
RP-E2E-060 — Ready candidate trở thành Maintenance trước commit

Flow:

Browser load Ready
→ API change unit to Maintenance
→ Browser Commit

Expect

Backend revalidation thất bại.
UI hiển thị stale candidate hoặc machine unavailable.
Không tạo allocation.
Candidate list refresh thành Blocked.
RP-E2E-061 — Assignment kết thúc trước commit

Expect

Commit bị từ chối.
History vẫn được giữ.
Candidate trở thành Blocked.
Không sử dụng assignment snapshot cũ để commit.
RP-E2E-062 — Hai Work Order tranh cùng Machine Unit

Flow

WO-A load Ready
WO-B load Ready
WO-A commit
WO-B commit

Expect

WO-A thành công.
WO-B bị capacity conflict.
Chỉ có một active exclusive allocation.
Không oversubscribe unit.
WO-B hiển thị reason capacity blocked.
RP-E2E-063 — Hai browser context commit đồng thời

Dùng hai Playwright browser contexts.

Expect

Transaction hoặc database constraint bảo vệ.
Chỉ một request thành công.
Request còn lại nhận controlled conflict.
Database không có duplicate active allocation.
RP-E2E-064 — Candidate cũ sau khi Workstation bị inactive

Expect

Commit từ stale page bị từ chối.
UI refresh và hiển thị Blocked.
Không tạo allocation.
RP-E2E-065 — Planned time window thay đổi trước commit

Expect

Capacity được re-evaluate theo time window mới.
Không dùng candidate result cũ.
Conflict hoặc candidate mới được trả đúng.
Nhóm G — Capacity validation
RP-E2E-070 — Không có capacity conflict

Expect

Candidate Ready.
Commit thành công.
Reservation window được persist chính xác.
RP-E2E-071 — Machine Unit bị allocate cùng khoảng thời gian

Expect

Candidate Blocked hoặc commit bị từ chối.
Reason chứa capacity/reservation conflict.
Existing allocation không bị thay đổi.
RP-E2E-072 — Allocation không overlap thời gian

Ví dụ:

WO-A: 08:00–09:00
WO-B: 09:00–10:00

Expect

Cả hai có thể commit nếu boundary policy cho phép.
Không báo false conflict.
RP-E2E-073 — Partial overlap
WO-A: 08:00–10:00
WO-B: 09:00–11:00

Expect

WO-B Blocked hoặc commit conflict.
Reason thể hiện resource và window xung đột.
RP-E2E-074 — Capacity giải phóng sau cancel

Steps

WO-A commit
→ WO-B blocked
→ Cancel WO-A allocation
→ Recompute WO-B

Expect

WO-B chuyển từ Blocked sang Ready.
Machine Unit được selectable lại.
Allocation history WO-A vẫn tồn tại.
Nhóm H — Cancel và replan
RP-E2E-080 — Cancel committed allocation

Expect

Confirmation dialog xuất hiện.
Cancellation reason được yêu cầu nếu policy quy định.
Status chuyển Cancelled hoặc Released.
Current allocation không còn hiệu lực.
History vẫn hiển thị.
Resource capacity được giải phóng.
RP-E2E-081 — Cancel allocation đã bắt đầu execution

Expect

Theo policy:

bị từ chối; hoặc
yêu cầu stop execution trước.

Không được cancel silently khi operation đang chạy.

RP-E2E-082 — Replan sau cancel

Expect

Có thể chọn Workstation khác.
Allocation mới được tạo.
Allocation cũ vẫn giữ history.
Execution sử dụng allocation mới nhất đang active.
RP-E2E-083 — Cancel hai lần

Expect

Idempotent hoặc controlled conflict.
Không tạo duplicate cancellation history.
Không crash UI.
Nhóm I — Execution integration
RP-E2E-090 — Execution dùng committed allocation

Expect

Execution hiển thị exact Workstation.
Execution hiển thị exact Machine Units.
IDs khớp allocation snapshots.
Không tự chọn resource khác.
RP-E2E-091 — Start execution khi chưa allocation

Expect

Start bị chặn.
Reason chỉ rõ Resource Allocation chưa hoàn thành.
Không tạo execution record.
RP-E2E-092 — Start execution với cancelled allocation

Expect

Start bị chặn.
Không dùng allocation history đã cancelled.
RP-E2E-093 — Machine Unit trở thành Maintenance sau commit nhưng trước start

Cần xác định business policy.

Hai khả năng hợp lệ:

Execution bị chặn và yêu cầu replan.
Warning nhưng cho phép override với quyền đặc biệt.

E2E phải xác nhận đúng policy thực tế, không tự phỏng đoán.

RP-E2E-094 — Execution snapshot không đổi khi master assignment thay đổi

Flow

Commit allocation
→ Move Machine Unit master assignment
→ Read existing allocation/execution

Expect

Historical committed snapshot không bị rewrite.
Hệ thống có thể chặn start nếu current physical state không còn hợp lệ, nhưng không được thay đổi allocation history.
Nhóm J — Authorization
RP-E2E-100 — Planner được phép commit

Expect

Resource Planning tab hiển thị.
Validate và Commit hoạt động.
Planner identity được ghi.
RP-E2E-101 — Viewer không được commit

Expect

Có thể xem nếu có read permission.
Commit button không xuất hiện hoặc disabled.
Direct API commit trả 403.
Không tạo allocation.
RP-E2E-102 — Operator không được replan

Expect

Không được cancel hoặc thay đổi allocation nếu role không có quyền.
API bảo vệ độc lập với UI.
RP-E2E-103 — User không có Site access

Expect

Work Order không hiển thị hoặc API trả access denied.
Không leak candidate hoặc Machine Unit từ Site khác.
Nhóm K — UI validation và presentation
RP-E2E-110 — Loading state

Expect

Candidate loading state xuất hiện.
Không hiển thị empty state trước khi request hoàn thành.
Buttons disabled khi mutation đang chạy.
RP-E2E-111 — Empty candidate state

Expect

Thông báo:

No candidate Workstations were found for this Work Center.

hoặc bản dịch tương ứng.

Không hiển thị blank screen.

RP-E2E-112 — All candidates blocked

Expect

Summary hiển thị 0 Ready.
Mỗi candidate có blocking reasons.
Commit không khả dụng.
Có hướng dẫn người dùng xử lý.
RP-E2E-113 — Structured backend error rendering

Expect

Không xuất hiện [object Object].
Không hiển thị raw JSON.
Error code được map sang message.
Details như required/available được hiển thị rõ.
RP-E2E-114 — Không hiển thị raw enum

Các raw value không được xuất hiện:

PLANNING_ELIGIBLE
MACHINE_REQUIREMENT_UNSATISFIED
RESOURCE_CAPACITY_CONFLICT

Phải được dịch sang label phù hợp.

RP-E2E-115 — Không hiển thị raw UUID làm identity

Expect

Primary UI identity phải là:

Work Order code;
Workstation code/name;
Machine asset code;
serial number.
RP-E2E-116 — Modal hoặc panel stale cache

Flow

Open candidate detail
→ Close
→ Change state through API
→ Reopen

Expect

Dữ liệu mới được load.
Không dùng stale cache cũ.
RP-E2E-117 — Browser refresh giữa flow

Các điểm refresh:

sau Work Order creation;
sau Compute & Check;
sau validation;
sau commit.

Expect

Hệ thống phục hồi đúng state ở từng điểm.

Nhóm L — Cleanup và recovery
RP-E2E-120 — Cleanup happy-path fixture

Expect

Chỉ xóa exact Work Order IDs của test.
Allocation được cancel/delete đúng dependency order.
Không xóa seeded Work Order.
Không xóa Production Version hoặc Master Data dùng chung.
Sau cleanup không còn test allocation active.
RP-E2E-121 — Test fail giữa chừng vẫn cleanup

Steps

Chủ động làm một assertion fail sau khi Work Order đã được tạo.

Expect

afterEach hoặc global teardown vẫn chạy.
Disposable Work Order được cleanup.
Artifacts test failure vẫn được giữ.
RP-E2E-122 — Cleanup retry

Expect

Chạy cleanup lần thứ hai không gây lỗi nguy hiểm.
Trả already cleaned, not found hoặc success idempotent.
Không ảnh hưởng dữ liệu khác.
RP-E2E-123 — Cleanup không được dùng business code

Đặc biệt quan trọng vì đã phát hiện duplicate Work Order code.

Expect

Cleanup dùng exact database IDs.
Không xóa toàn bộ record có cùng business code.
Script từ chối cleanup không có exact ID.
Nhóm M — Work Order numbering issue

Đây là lỗi đã được phát hiện và cần suite riêng.

RP-E2E-130 — Sequential Work Order code uniqueness

Steps

Tạo hai Work Order liên tiếp.

Expect

Hai ID khác nhau.
Hai business code cũng phải khác nhau.
Code đúng format.
Sequence tăng đúng.

Hiện tại use case này có khả năng FAIL, đúng với known issue.

RP-E2E-131 — Concurrent Work Order code uniqueness

Dùng hai request hoặc hai browser context tạo đồng thời.

Expect

Hai Work Order có code khác nhau.
Không duplicate key.
Không reuse sequence.
Không mất transaction.
RP-E2E-132 — Rollback không làm sequence path hỏng

Steps

Một create thất bại giữa transaction, sau đó create lại.

Expect

Không duplicate code.
Có thể có gap nếu sequence engine cho phép.
Không được reuse một code đã commit.
Bộ test nên được chia thế nào?
Smoke suite

Chạy sau mỗi deploy:

RP-E2E-001
RP-E2E-010
RP-E2E-041
RP-E2E-046
RP-E2E-090
RP-E2E-120
Full functional suite

Chạy trước release:

Work Order creation
Candidate resolution
Machine Requirement
Allocation
Cancel
Execution
UI validations
Concurrency suite

Chạy riêng vì tốn thời gian và cần database isolation:

RP-E2E-060
RP-E2E-062
RP-E2E-063
RP-E2E-071
RP-E2E-073
RP-E2E-130
RP-E2E-131
Authorization suite

Cần nhiều account:

Planner
Viewer
Operator
Cross-Site user
English prompt để mở rộng Browser E2E thành full suite
# Expand MES Resource Planning Browser E2E into a Complete Functional, Validation, Edge-Case, Concurrency, and Authorization Suite

## Role

Act as a senior MES solution architect, senior QA automation engineer, backend integration engineer, frontend engineer, database validation engineer, and test reliability engineer.

The current Resource Planning happy-path implementation has already passed:

- API full-flow verification;
- Work Order creation;
- candidate readiness computation;
- three operation allocations;
- exact Machine Unit snapshot persistence;
- idempotency replay;
- capacity blocking;
- browser creation and allocation;
- browser refresh persistence;
- exact-ID cleanup;
- backend tests;
- MES Console build and typecheck;
- Machine Flow regression.

Do not replace or redesign the working Resource Planning architecture.

Your task is to inspect the current implementation and expand the existing Playwright Browser E2E suite from a single happy-path test into a complete Resource Planning E2E verification suite covering:

- full functional use cases;
- business validations;
- edge cases;
- stale-data behavior;
- concurrency;
- idempotency;
- capacity conflicts;
- authorization;
- execution integration;
- UI error rendering;
- persistence;
- cleanup safety;
- Work Order numbering concurrency.

Do not claim completion merely because test files were added.

Run the tests against the actual running MES environment and report the real results.

---

# 1. Preserve the current architecture

Preserve the verified ownership model:

```text
Released Production Version
  -> Work Order
  -> Work Order Operations
  -> Phase 2 Compute & Check
  -> Candidate Workstations
  -> Ready or Blocked
  -> Manual Planner Selection
  -> Phase 3 Resource Allocation
  -> Exact Machine Unit Snapshots
  -> Committed Allocation
  -> Execution

Preserve:

Routing Operation owns Work Center;
planning selects Workstation;
Machine Requirement is separate from Resource Assignment;
Resource Assignment is separate from Work Order Resource Allocation;
Work Order Resource Allocation persists exact Machine Unit snapshots;
committed allocation is authoritative for execution;
allocation commit revalidates current resource state;
cleanup uses exact Work Order IDs;
no scoring, APS, AI dispatch, optimizer, or alternate planning aggregate.

Reuse the existing endpoints and services unless a verified defect requires an additive repair.

2. Inspect the existing E2E implementation first

Inspect:

Playwright configuration;
authentication setup;
current Resource Planning E2E spec;
Machine Flow E2E conventions;
test fixtures;
exact-ID cleanup scripts;
current API verification script;
current stable selectors;
Work Order create page;
Work Order detail page;
Compute & Check UI;
candidate UI;
allocation UI;
execution UI;
authorization model;
service APIs;
database schema and constraints;
idempotency handling;
capacity reservation handling;
current Work Order number generation;
current test reports and artifacts.

Create an inspection section in:

implementation-fix/resource-planning-full-e2e-improvement-<YYYYMMDD>.md

Identify:

what the existing E2E verifies;
what it does not verify;
reusable fixtures and utilities;
missing selectors;
missing backend setup capabilities;
missing cleanup behavior;
test isolation risks;
known numbering issue;
infrastructure or credential requirements.

Do not duplicate an existing helper, fixture, page object, or API client.

3. Test strategy

Use a hybrid Browser E2E model.

The user-visible action and final assertion must occur through the browser where applicable.

Use APIs or direct test-only database helpers only to:

prepare prerequisites;
mutate state between browser actions;
create deterministic edge conditions;
verify persistence;
verify absence of duplicate rows;
perform exact-ID cleanup.

Examples:

Browser loads a Ready candidate
  -> API changes Machine Unit to Maintenance
  -> Browser commits stale selection
  -> Browser must display the rejection
  -> API or database verifies no allocation was created

This is still a Browser E2E test because the user workflow and error presentation are verified through the actual browser.

Do not create every prerequisite through the UI when that prerequisite is not the behavior under test.

4. Required suite structure

Organize the suite into focused groups.

Recommended structure:

e2e/
  resource-planning/
    smoke/
      resource-planning-happy-path.spec.ts

    work-order/
      work-order-creation.spec.ts
      work-order-validation.spec.ts
      work-order-numbering.spec.ts

    candidates/
      candidate-resolution.spec.ts
      candidate-machine-requirements.spec.ts
      candidate-edge-cases.spec.ts

    allocation/
      allocation-validation.spec.ts
      allocation-commit.spec.ts
      allocation-idempotency.spec.ts
      allocation-cancellation.spec.ts

    concurrency/
      stale-candidate.spec.ts
      capacity-conflict.spec.ts
      concurrent-commit.spec.ts

    execution/
      execution-allocation-integration.spec.ts

    authorization/
      resource-planning-authorization.spec.ts

    ui/
      resource-planning-ui-states.spec.ts
      resource-planning-i18n.spec.ts

    cleanup/
      resource-planning-cleanup.spec.ts

  fixtures/
    resource-planning.fixture.ts
    work-order.fixture.ts
    candidate.fixture.ts
    authorization.fixture.ts

  pages/
    WorkOrderListPage.ts
    WorkOrderCreatePage.ts
    WorkOrderDetailPage.ts
    ResourcePlanningPage.ts
    ExecutionPage.ts

  utils/
    exact-id-cleanup.ts
    resource-planning-api.ts
    database-assertions.ts
    concurrent-actions.ts

Adapt to current repository conventions.

Do not create unnecessary page objects or abstraction layers.

5. Test tags and execution modes

Use Playwright tags or equivalent annotations.

Required groups:

@smoke
@full
@validation
@edge
@concurrency
@authorization
@execution
@cleanup
@numbering

Add maintained package commands similar to:

{
  "scripts": {
    "test:e2e:resource-planning:smoke": "playwright test e2e/resource-planning --grep @smoke --project=chromium",
    "test:e2e:resource-planning:full": "playwright test e2e/resource-planning --grep @full --project=chromium",
    "test:e2e:resource-planning:validation": "playwright test e2e/resource-planning --grep @validation --project=chromium",
    "test:e2e:resource-planning:concurrency": "playwright test e2e/resource-planning --grep @concurrency --project=chromium",
    "test:e2e:resource-planning:authorization": "playwright test e2e/resource-planning --grep @authorization --project=chromium",
    "test:e2e:resource-planning:numbering": "playwright test e2e/resource-planning --grep @numbering --project=chromium",
    "test:e2e:resource-planning:all": "playwright test e2e/resource-planning --project=chromium"
  }
}

Reuse existing equivalent commands instead of duplicating them.

6. Mandatory use cases and assertions

Implement the following cases.

Every test must include:

preconditions;
deterministic fixture setup;
browser steps;
API or database validation where needed;
exact expected UI state;
exact expected backend state;
cleanup;
failure artifacts.
Group A — Work Order creation
RP-E2E-001 — Create Work Order from a Released Production Version

Steps:

Open Work Orders
  -> Create
  -> Select Released Production Version
  -> Select active Shift
  -> enter valid quantity
  -> Save
  -> open detail
  -> refresh

Expect:

one Work Order is created;
Work Order business code is visible;
selected Production Version is correct;
quantity is correct;
Work Order Operations are generated once;
operation count matches Routing;
sequences match Routing;
each operation resolves the expected Work Center;
browser refresh preserves all data;
no duplicate operation rows exist.
RP-E2E-002 — Reject non-Released Production Version

Expect:

create or planning is blocked according to current policy;
no Work Order is persisted;
translated error is shown;
no raw error object appears.
RP-E2E-003 — Reject invalid quantity

Test:

empty;
zero;
negative;
unsupported decimal;
over configured limit where supported.

Expect:

field validation or backend validation;
no Work Order created;
no duplicate request.
RP-E2E-004 — Reject invalid Shift

Test inactive, wrong-Site, or date-incompatible Shift according to supported current rules.

RP-E2E-005 — Prevent duplicate Work Order on double submit

Expect:

save button disables;
one Work Order only;
operations are not duplicated.
Group B — Candidate resolution
RP-E2E-010 — Show Ready and Blocked candidates

Expect:

correct candidate total;
correct Ready count;
correct Blocked count;
Ready candidate selectable;
Blocked candidate not selectable;
blocking reasons visible;
stable candidate ordering;
Workstation code and localized name shown;
UUID not used as primary identity.
RP-E2E-011 — Work Center has no Workstations

Expect:

empty candidate state;
no allocation controls;
no crash or infinite loading.
RP-E2E-012 — Inactive Workstation

Expect:

blocked or excluded according to the authoritative policy;
never allocatable;
backend direct commit rejected.
RP-E2E-013 — Workstation not planning eligible

Expect:

Blocked;
clear reason;
commit unavailable.
RP-E2E-014 — Routing Operation has no Work Center

Expect:

Compute & Check reports structured blocking reason;
no cross-Site fallback;
no candidates resolved from unrelated Work Centers.
RP-E2E-015 — Workstation belongs to another Work Center

Tamper the validate or commit payload.

Expect:

backend rejects;
no allocation persisted;
browser shows compatibility error.
Group C — Machine Requirement validation
RP-E2E-020 — Requirement fully satisfied

Example:

required = 2
assigned = 2
available = 2

Expect:

candidate Ready;
all quantities displayed correctly;
exactly two valid selectable Machine Units.
RP-E2E-021 — Missing effective Resource Assignment

Expect:

Blocked;
assigned quantity zero;
clear missing-assignment reason.
RP-E2E-022 — Assigned quantity below required quantity

Expect:

Blocked;
required, assigned, and available quantities shown accurately.
RP-E2E-023 — Assignment expired

Expect:

not counted as effective;
historical assignment remains;
candidate Blocked.
RP-E2E-024 — Assignment not yet effective

Expect:

not counted for current planning window;
candidate Blocked.
RP-E2E-025 — Machine Unit Pending Identification

Expect:

not selectable;
not counted as available;
candidate Blocked when insufficient valid units remain.
RP-E2E-026 — Machine Unit not planning eligible

Expect:

not selectable;
direct commit rejected.
RP-E2E-027 — Machine Unit in Maintenance

Expect:

not selectable;
available quantity reduced;
translated Maintenance status.
RP-E2E-028 — Machine Unit Out of Service

Expect:

not selectable;
correct lifecycle or execution blocking reason.
RP-E2E-029 — Machine Unit assigned to another Workstation

Expect:

not selectable for current Workstation;
tampered commit rejected.
RP-E2E-030 — Duplicate Machine Unit IDs

Expect:

validation rejected;
commit rejected;
no duplicate allocation snapshot rows.
RP-E2E-031 — Machine Unit does not match the required Machine Definition

Expect:

requirement remains unsatisfied;
validation rejected;
no allocation created.
Group D — Allocation validation and commit
RP-E2E-040 — Validate selection successfully

Expect:

validation returns valid;
UI indicates valid selection;
no committed allocation exists before commit.
RP-E2E-041 — Commit allocation successfully

Expect:

status Committed;
selected Workstation persisted;
exact Machine Unit snapshots persisted;
committed by and committed at persisted;
refresh preserves allocation;
Resource Assignment master data is unchanged.
RP-E2E-042 — Commit operation allocations in predecessor order

Expect:

operation time windows respect predecessor relationships;
later operation does not start before required predecessor completion;
all allocation statuses remain correct.
RP-E2E-043 — Insufficient selected Machine Units

Expect:

invalid selection;
commit blocked;
required and selected quantity displayed.
RP-E2E-044 — Selected unit is unavailable

Expect:

validation or commit rejected;
no allocation created;
candidate refresh shows latest state.
RP-E2E-045 — Direct commit of a Blocked candidate

Expect:

backend rejection independent of UI;
no allocation persisted.
RP-E2E-046 — Persistence after refresh

Expect:

allocation restored from backend;
exact Workstation and units preserved;
no stale client-only state.
RP-E2E-047 — Persistence after logout and login

Expect:

committed allocation remains;
planner identity remains correct.
Group E — Idempotency
RP-E2E-050 — Replay the same idempotency key

Expect:

original allocation response returned;
same allocation ID;
no duplicate allocation;
no duplicate Machine Unit snapshots.
RP-E2E-051 — Double-click Commit

Expect:

duplicate submission prevented;
one allocation only;
button disabled during request.
RP-E2E-052 — Same idempotency key with a different payload

Expect:

conflict or payload-mismatch rejection;
original allocation unchanged;
no second allocation.
RP-E2E-053 — Commit an already committed operation

Expect:

existing allocation returned or controlled conflict according to current policy;
never silently overwrite snapshots.
Group F — Stale state and concurrency
RP-E2E-060 — Ready unit becomes Maintenance before commit

Steps:

Browser loads Ready candidate
  -> API changes unit to Maintenance
  -> browser commits

Expect:

commit rejected by backend revalidation;
translated stale or unavailable error shown;
no allocation created;
candidate refreshes to Blocked.
RP-E2E-061 — Resource Assignment ends before commit

Expect:

commit rejected;
history preserved;
candidate becomes Blocked.
RP-E2E-062 — Two Work Orders compete for the same exclusive Machine Unit

Expect:

first commit succeeds;
second commit fails with capacity conflict;
only one active exclusive allocation exists.
RP-E2E-063 — Two browser contexts commit concurrently

Use two independent Playwright contexts.

Expect:

transaction or constraint protects allocation;
only one succeeds;
the other receives a controlled conflict;
no duplicate active allocation exists.
RP-E2E-064 — Workstation becomes inactive after candidate load

Expect:

stale commit rejected;
UI refreshes candidate to Blocked.
RP-E2E-065 — Planned window changes before commit

Expect:

capacity is re-evaluated using the latest window;
stale candidate result is not trusted.
Group G — Capacity
RP-E2E-070 — Non-conflicting allocation

Expect:

Ready;
commit succeeds;
reservation window persisted.
RP-E2E-071 — Full overlap conflict

Expect:

Blocked candidate or commit conflict;
existing allocation unchanged.
RP-E2E-072 — Non-overlapping boundary windows

Example:

WO-A: 08:00–09:00
WO-B: 09:00–10:00

Expect:

both can allocate when the authoritative boundary policy permits;
no false conflict.
RP-E2E-073 — Partial overlap conflict

Example:

WO-A: 08:00–10:00
WO-B: 09:00–11:00

Expect:

second allocation rejected;
reason includes conflicting resource and time range.
RP-E2E-074 — Capacity is released after cancellation

Expect:

second Work Order changes from Blocked to Ready after recompute;
allocation history of the first Work Order remains.
Group H — Cancellation and replanning
RP-E2E-080 — Cancel committed allocation

Expect:

confirmation dialog;
cancellation reason where required;
status updated;
history preserved;
capacity released.
RP-E2E-081 — Reject cancellation during active execution

Expect according to current policy:

cancellation rejected; or
operation must be stopped first.
RP-E2E-082 — Replan after cancellation

Expect:

another Ready Workstation can be selected;
a new allocation is created;
old allocation remains historical;
new active allocation is authoritative.
RP-E2E-083 — Cancel twice

Expect:

idempotent response or controlled conflict;
no duplicate cancellation history.
Group I — Execution integration
RP-E2E-090 — Execution uses committed allocation

Expect:

exact Workstation matches allocation;
exact Machine Units match allocation snapshots;
execution does not silently select alternatives.
RP-E2E-091 — Reject execution without mandatory allocation

Expect:

start blocked;
no execution record created.
RP-E2E-092 — Reject execution with cancelled allocation

Expect:

start blocked;
cancelled historical allocation is not used.
RP-E2E-093 — Machine becomes unavailable after commit but before start

Inspect and verify the authoritative business policy.

Do not invent a policy.

Possible accepted behavior:

execution blocked and replan required; or
controlled override with a permitted role.

Document and test the actual implemented rule.

RP-E2E-094 — Allocation snapshot survives master-assignment changes

Expect:

historical snapshot is not rewritten;
current physical validation may block execution, but allocation history remains unchanged.
Group J — Authorization

Use dedicated accounts when available.

RP-E2E-100 — Planner can commit

Expect:

planning controls visible;
commit succeeds;
planner identity recorded.
RP-E2E-101 — Viewer cannot commit

Expect:

read access according to current policy;
no commit control;
direct API returns 403;
no allocation created.
RP-E2E-102 — Operator cannot replan

Expect:

no cancel or reallocation permission unless explicitly granted.
RP-E2E-103 — Cross-Site user cannot access resources

Expect:

no Work Order, Workstation, candidate, or Machine Unit data leakage from another Site;
API access denied.

If required credentials are not available, mark these tests explicitly skipped with the missing credential reason. Do not fake authorization success.

Group K — UI quality and validation
RP-E2E-110 — Loading state

Expect:

loading state shown;
no premature empty state;
mutation controls disabled during requests.
RP-E2E-111 — Empty candidate state

Expect a meaningful translated message.

RP-E2E-112 — All candidates blocked

Expect:

zero Ready summary;
each candidate shows blocking reasons;
no Commit action.
RP-E2E-113 — Structured error rendering

Expect:

no [object Object];
no raw JSON;
error code mapped to translated message;
structured details rendered.
RP-E2E-114 — No raw enums

Ensure no raw backend enums or error keys appear.

RP-E2E-115 — No raw UUID primary identities

Use business code, localized name, asset code, and serial number.

RP-E2E-116 — Reopened panel refreshes stale data

Expect current backend data after reopen.

RP-E2E-117 — Browser refresh at intermediate states

Verify recoverability after refresh:

after creation;
after Compute & Check;
after validation;
after commit.
Group L — Cleanup and recovery
RP-E2E-120 — Exact-ID cleanup

Expect:

only test-owned Work Order IDs removed;
no shared Production Version or Master Data deleted;
no active test allocation remains.
RP-E2E-121 — Cleanup after mid-test failure

Intentionally fail after creating disposable data.

Expect:

teardown still cleans exact IDs;
failure artifacts remain.
RP-E2E-122 — Cleanup retry

Expect:

second cleanup is safe and idempotent;
unrelated data untouched.
RP-E2E-123 — Cleanup never uses Work Order business code

This is mandatory because duplicate business codes have already been observed.

Expect:

exact database IDs are required;
cleanup refuses ambiguous business-code-only deletion;
no unrelated Work Order is deleted.
Group M — Work Order numbering audit

The current implementation has observed two different Work Order IDs receiving the same business code.

Do not silently ignore this finding.

RP-E2E-130 — Sequential Work Order code uniqueness

Create two Work Orders sequentially.

Expect:

IDs are different;
business codes are also different;
format is valid;
sequence is monotonic according to current rules.

This test may initially fail and must report the defect accurately.

RP-E2E-131 — Concurrent Work Order code uniqueness

Create two Work Orders concurrently using two API requests or browser contexts.

Expect:

unique business codes;
no sequence reuse;
no duplicate committed code.
RP-E2E-132 — Failed transaction does not reuse a committed code

Expect:

rollback does not cause an already committed code to be reused;
gaps are acceptable only if consistent with the selected sequence strategy.

If these tests fail, perform a dedicated schema and transaction audit.

Do not patch numbering with frontend timestamps or in-memory process state.

A valid fix should use an atomic database-backed strategy such as the repository’s approved sequence, counter, advisory lock, or uniqueness constraint approach.

7. Assertions for every test

Each test must validate all applicable layers:

Browser
visible state;
translated messages;
button availability;
loading behavior;
refresh persistence;
no raw values.
API
expected HTTP status;
structured response;
exact IDs;
expected business status;
expected blocking reason codes.
Database

Where required:

allocation count;
exact Machine Unit snapshot count;
no duplicate active allocation;
no orphan rows;
no duplicate operation rows;
exact cleanup;
Work Order code uniqueness.

Do not use database verification as a replacement for browser assertions.

8. Test isolation

Every test must use a unique run ID:

E2E-RP-<timestamp>-<random>

Track all created IDs explicitly:

Work Order IDs;
operation IDs;
allocation IDs;
temporary assignment IDs;
temporary machine state mutations;
execution record IDs.

Restore shared fixture state after tests that modify:

Machine Unit execution status;
planning eligibility;
Resource Assignment effectivity;
Workstation lifecycle;
Workstation planning eligibility.

Do not leave shared demo data in a modified state.

Avoid test-order dependency.

Each test must pass when run alone.

9. Cleanup guarantees

Implement cleanup in finally, fixture teardown, or Playwright hooks.

Cleanup must:

stop or remove disposable execution records where safely supported;
cancel or remove test allocations;
remove test Work Order Operations;
remove exact Work Order IDs;
restore shared Machine Units;
restore shared assignments;
restore Workstations;
verify no active test-owned allocation remains.

Never clean by Work Order business code.

Never perform broad prefix deletion without exact run ownership verification.

If cleanup fails, the test run must not report full success.

10. Concurrency implementation requirements

For concurrency tests:

use separate browser contexts or independent API clients;
synchronize commit timing using a barrier;
capture both responses;
verify one success and one controlled failure where resources are exclusive;
query the database after both requests;
verify one active allocation only.

Do not simulate concurrency by executing sequential requests without overlap.

11. Playwright reliability

Requirements:

no arbitrary waitForTimeout;
use accessible locators and stable test IDs;
use response-aware waits;
use expect.poll only for legitimate asynchronous eventual consistency;
enable trace, screenshot, and video on failure;
avoid global shared mutable state;
control worker count for shared database suites;
run concurrency tests in an isolated project or serial describe block where appropriate;
print the run ID and created exact IDs in test annotations or attachments.
12. Reports

Generate:

implementation-fix/resource-planning-full-e2e-improvement-<YYYYMMDD>.md
docs/testing/mes-resource-planning-full-e2e-use-cases.md
docs/testing/mes-resource-planning-e2e-matrix.md

The matrix must include:

Case ID	Category	Browser	API	DB	Implemented	Passed	Skipped	Reason

Do not mark an unexecuted case as passed.

13. Execution order

Proceed step by step.

Phase 1 — Inspect
inspect existing E2E;
inspect fixtures;
inspect selectors;
inspect cleanup;
inspect APIs;
inspect database constraints;
inspect numbering generation.
Phase 2 — Refactor shared E2E infrastructure
reusable API fixture;
exact-ID cleanup;
deterministic state restoration;
database assertions;
multi-context helper;
tags and package commands.
Phase 3 — Implement smoke suite

Keep the current verified happy path and make it the @smoke suite.

Phase 4 — Implement functional and validation suites

Implement Groups A–E.

Run and repair until stable.

Phase 5 — Implement stale-state, concurrency, and capacity suites

Implement Groups F–G.

Use real overlapping requests.

Phase 6 — Implement cancellation and execution suites

Implement Groups H–I according to actual supported backend behavior.

Phase 7 — Implement authorization and UI suites

Implement Groups J–K.

Skip only when required credentials or roles are genuinely unavailable.

Phase 8 — Implement cleanup and numbering suites

Implement Groups L–M.

Do not hide the known numbering defect.

Phase 9 — Full execution

Run all applicable suites.

Repair failures caused by real product defects where the fix is safe and within scope.

Create a blocker report for unsafe or infrastructure-dependent blockers.

14. Required commands

Add or reuse maintained commands.

Run at minimum:

npm run test:e2e:resource-planning:smoke
npm run test:e2e:resource-planning:validation
npm run test:e2e:resource-planning:concurrency
npm run test:e2e:resource-planning:authorization
npm run test:e2e:resource-planning:numbering
npm run test:e2e:resource-planning:all

npm run test:mes:resource-planning-flow
npm run test:mes:machine-flow
npm run test:e2e:machine

go test ./...
npm run build --workspace=mes-console
npx tsc --noEmit -p services/mes-console/tsconfig.json
git diff --check

Use the correct service-local commands where required.

15. Blocker handling

Do not stop at the first failing test.

Classify failures as:

test defect;
selector defect;
fixture defect;
cleanup defect;
environment defect;
product validation defect;
concurrency defect;
data-integrity defect;
authorization configuration issue.

Attempt safe fixes.

Create:

implementation-fix/resource-planning-full-e2e-blocker-<YYYYMMDD-HHmm>.md

only when further implementation cannot safely continue.

The blocker report must include:

case ID;
exact failing step;
expected result;
actual result;
screenshots or trace path;
API response;
relevant database result;
logs;
attempted fixes;
root-cause assessment;
exact required next action.
16. Completion criteria

Report:

Resource Planning Full Browser E2E: COMPLETE

only when:

all mandatory applicable use cases are implemented;
all mandatory tests were actually executed;
all non-skipped mandatory tests pass;
skipped tests have legitimate documented infrastructure or credential reasons;
concurrency tests use real concurrent requests;
no duplicate active allocation exists;
exact-ID cleanup succeeds;
shared fixture state is restored;
build and typecheck pass;
regression tests pass;
browser artifacts are available for failures;
the use-case matrix is complete.

Use:

Resource Planning Full Browser E2E: PARTIALLY COMPLETE

when some cases remain unimplemented or skipped.

Use:

Resource Planning Full Browser E2E: BLOCKED

only when a real blocker prevents meaningful continuation.

17. Final report

Update:

implementation-fix/resource-planning-full-e2e-improvement-<YYYYMMDD>.md

with:

Final Status
Existing Happy-Path Coverage
Added Test Infrastructure
Implemented Use Cases
Implemented Validation Cases
Implemented Edge Cases
Concurrency Results
Capacity Results
Authorization Results
Execution Results
Cleanup Results
Work Order Numbering Audit
Product Defects Found
Product Defects Fixed
Skipped Cases
Files Changed
Package Commands
Test Results
Build and Regression Results
Remaining Limitations
Final Conclusion

Include exact counts:

Total use cases:
Implemented:
Passed:
Failed:
Skipped:
Not implemented:

Do not describe a one-test happy path as a full Resource Planning E2E suite.