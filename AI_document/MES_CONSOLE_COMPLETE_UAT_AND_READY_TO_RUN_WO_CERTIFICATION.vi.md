# UAT đầy đủ MES Console và chứng nhận Work Order sẵn sàng chạy

Ngày: 2026-08-02  
Hệ thống: MES Console và các service MES execution/master-data  
Mã chứng nhận: WO-CERT-001  
Run ID: WO-CERT-001-20260802194145

## 1. Kết quả cuối cùng

Track B, gồm canonical seed và full flow Work Order sẵn sàng chạy, đã pass end
to end. Track A, gồm UAT nghiêm ngặt theo từng page của console, đã được lập
tài liệu cho mọi screen family được giữ lại nhưng chưa hoàn tất vì còn thiếu
một số bằng chứng automation, locale và accessibility ở cấp page.

Trạng thái cuối cùng của tài liệu này là:

NOT_CERTIFIED

## 2. Tài liệu điều hành và bằng chứng

Implementation này tuân theo:

- AI_document/PROMPT_BUILD_MES_CONSOLE_COMPLETE_UAT_AND_READY_TO_RUN_WO_CERTIFICATION.md
- mes-system/AI_document/refactor-mes-console
- mes-system/process-expand/mes-enterprise/docs/23_PHASE_IMPLEMENTATION_GUARDRAILS.md
- mes-system/process-expand/mes-enterprise/docs/Perform-a-Safe-Full-MES-Data-Reset,-Rebuild-the-Canonical-Seed-Dataset,-and-Verify-All-Current-Full-Flows.md

Implementation chứng nhận:

- scripts/certify-mes-ready-to-run-wo.mjs
- package.json script: certify:mes:ready-to-run-wo

Thư mục bằng chứng:

artifacts/mes-console-final-certification/WO-CERT-001-20260802194145/

Các file bằng chứng:

- certification-result.json
- route-inventory.json
- coverage-summary.json

## 3. An toàn khi thực thi

Certification runner một command từ chối chạy trong môi trường giống
production. Nó yêu cầu tất cả điều kiện sau:

- MES_ENV là development, local, test hoặc staging.
- ALLOW_MES_FULL_RESET=true.
- CONFIRM_MES_FULL_RESET=YES_RESET_ALL_MES_DATA.
- URL database master-data và execution phải trỏ tới localhost, 127.0.0.1 hoặc ::1.

Lệnh chạy:

~~~sh
MES_ENV=development \
ALLOW_MES_FULL_RESET=true \
CONFIRM_MES_FULL_RESET=YES_RESET_ALL_MES_DATA \
npm run certify:mes:ready-to-run-wo
~~~

Runner reset và seed lại canonical dataset, xác minh dataset, tạo và thực thi
WO-CERT-001, sau đó xóa Work Order chứng nhận và xác minh không còn Work Order
nào.

## 4. Inventory route

Route inventory được tạo từ services/mes-console/src/App.tsx.

Lưu ý: các route canonical lấy trực tiếp từ App.tsx. Không thêm tiền tố
/console/mes/master-data. Một số /console/mes/... chỉ là legacy redirect.
Resource Planning là tab trong Work Order Detail tại /work-orders/:id, không
phải route độc lập.

| Nhóm | Số lượng |
|---|---:|
| Route entry được khai báo | 96 |
| Canonical screen family được giữ lại | 30 |
| Redirect entry | 19 |
| Diagnostic route | 1 |
| Wildcard Not Found | 1 |
| Page family hoàn tất strict | 0 |
| Page family có gap đã ghi nhận | 30 |

30 page family được giữ lại được liệt kê bên dưới. Redirect, diagnostic route
và wildcard không được tính là business screen.

## 5. Hợp đồng UAT

Mọi retained page family được đánh giá theo cùng hợp đồng A-M:

- A. Route và điều hướng trực tiếp
- B. Authentication, role và behavior authorization
- C. Trạng thái loading
- D. Trạng thái empty
- E. Trạng thái error và retry
- F. List, search, filter, sort và pagination
- G. Action create, edit, view và lifecycle
- H. Validation, ngăn duplicate và xử lý conflict
- I. Save, cancel, refresh và idempotency
- J. Localization và thuật ngữ
- K. Keyboard, focus, modal và accessibility
- L. API, persistence, audit và consistency sau refresh
- M. Evidence, trạng thái defect và quyết định kết thúc

Với mỗi page bên dưới, behavior đã implement và evidence còn thiếu được ghi
theo hợp đồng này. Page không được xem là strict-complete nếu mọi mục A-M áp
dụng được chưa có executable evidence.

## 6. Track A: UAT theo từng page

### 6.1 Work Order List

Route: /work-orders  
Phạm vi A-M. Route list, shell theo role, loading, empty, error, refresh,
filter, status display và navigation đã implement. Các action lifecycle Work
Order được hỗ trợ bởi execution-service API và đã có trong flow E2E/API hiện
tại. Vẫn thiếu evidence riêng ở cấp page cho mọi permutation loading/error/
empty, authorization denial, locale, keyboard focus và accessibility.  
M: Chưa hoàn tất; page family đóng góp vào 120 documented use-case slot.

### 6.2 Work Order Create

Route: /work-orders/new  
Phạm vi A-M. Workflow tạo được hỗ trợ chọn Production Version đã release,
quantity, target date và shift, đồng thời dùng idempotency key. Backend
validation và workflow polling được certification bao phủ. Evidence UI riêng
cho tổ hợp invalid, duplicate submit, retry, mọi locale và keyboard/modal còn
thiếu.  
M: Chưa hoàn tất.

### 6.3 Work Order Detail

Route: /work-orders/:id  
Phạm vi A-M. Header, operations, line selection, resource allocation,
approval, execution state, refresh và error handling đã implement.
WO-CERT-001 chứng minh detail lifecycle tới InProgress. Evidence screen-level
đầy đủ cho mọi state và permission combination vẫn còn thiếu.  
M: Chưa hoàn tất.

### 6.4 Resource Planning

Route: /work-orders/:id, tab Resource Planning  
Phạm vi A-M. Candidate retrieval, readiness, exact workstation/equipment
allocation, revalidation, conflict reporting và strict approval gating đã
implement và được API test. Evidence UI riêng cho mọi empty/error/conflict
state và accessibility còn thiếu.  
M: Chưa hoàn tất.

### 6.5 Items

Route: /master-data/items  
Phạm vi A-M. Item list và item selection đã tích hợp với product-definition
flow. Canonical WST item data đã được xác minh. Evidence CRUD, duplicate,
lifecycle, authorization, locale và accessibility riêng còn thiếu.  
M: Chưa hoàn tất.

### 6.6 Units of Measure

Route: /master-data/uoms  
Phạm vi A-M. UOM master data được dùng trong product-definition workflow và
canonical seed verification. Evidence CRUD cấp page và input không hợp lệ còn
thiếu.  
M: Chưa hoàn tất.

### 6.7 Material Groups

Route: /master-data/material-groups  
Phạm vi A-M. Material-group data nằm trong master-data contract. Evidence CRUD
page, duplicate, lifecycle, error, locale và accessibility còn thiếu.  
M: Chưa hoàn tất.

### 6.8 EBOMs

Route: /master-data/eboms  
Phạm vi A-M. EBOM structure được dùng trong product-definition flow. Evidence
versioning, component validation, duplicate, save/retry và UI state còn thiếu.  
M: Chưa hoàn tất.

### 6.9 MBOMs

Route: /master-data/mboms  
Phạm vi A-M. MBOM structure và quan hệ material-operation được canonical
Production Version sử dụng. Evidence chỉnh sửa structure, validation và
accessibility cấp page còn thiếu.  
M: Chưa hoàn tất.

### 6.10 Routings

Route: /master-data/routings  
Phạm vi A-M. Routing data được flow Work Order sẵn sàng chạy sử dụng. Evidence
route editing, effective-date, duplicate và permission còn thiếu.  
M: Chưa hoàn tất.

### 6.11 Operations

Route: /master-data/operations  
Phạm vi A-M. Bốn WST operation canonical đã seed và verify. Evidence UI cho
CRUD, sequence, duration, skill requirement và invalid input còn thiếu.  
M: Chưa hoàn tất.

### 6.12 Production Versions

Route: /master-data/production-versions  
Phạm vi A-M. WST-SEED-PV-SEAL-ASM-01 đã release và effective, được certification
runner chọn. Readiness, effective date, line policy và release behavior đã API
test. Evidence lifecycle và authorization ở cấp page còn thiếu.  
M: Chưa hoàn tất.

### 6.13 Areas

Route: /master-data/production-areas  
Phạm vi A-M. SITE-KZ3, AREA-RUBBER và AREA-MOLDING đã seed và verify. Evidence
hierarchy, duplicate, lifecycle, empty/error và accessibility còn thiếu.  
M: Chưa hoàn tất.

### 6.14 Production Lines

Route: /master-data/production-lines  
Phạm vi A-M. WST-SEED-LINE-1 là canonical primary line và backup line cũng tồn
tại. Readiness và selection của line được chứng minh trong WO-CERT-001.
Evidence UI cho line lifecycle và mọi blocked/hold state còn thiếu.  
M: Chưa hoàn tất.

### 6.15 Sites

Route: /master-data/factories  
Phạm vi A-M. SITE-KZ3 là canonical site và scope cho shift, resource,
Production Version. Evidence CRUD và permission cấp page còn thiếu.  
M: Chưa hoàn tất.

### 6.16 Shopfloors

Route: /master-data/shopfloors  
Phạm vi A-M. Shopfloor structure được thể hiện trong master-data hierarchy.
Evidence CRUD, hierarchy validation và UI state còn thiếu.  
M: Chưa hoàn tất.

### 6.17 Work Centers

Route: /master-data/work-centers  
Phạm vi A-M. Tám canonical Work Center đã seed, liên kết với hai line và
verified. Evidence assignment và lifecycle cấp page còn thiếu.  
M: Chưa hoàn tất.

### 6.18 Workstations

Route: /master-data/workstations  
Phạm vi A-M. Tám canonical Workstation đã seed và được chọn trong candidate
cho từng operation. Evidence CRUD, readiness, duplicate và accessibility còn
thiếu.  
M: Chưa hoàn tất.

### 6.19 Machines

Route: /master-data/machines  
Phạm vi A-M. Tám equipment và tám machine unit đã seed, candidate đã verify.
Evidence machine lifecycle, status, conflict và UI state còn thiếu.  
M: Chưa hoàn tất.

### 6.20 Workstation Assignments

Route: /master-data/resource-assignments  
Phạm vi A-M. Tám assignment đã seed và được candidate resolution sử dụng.
Evidence overlap, effective-date, duplicate và permission cấp page còn thiếu.  
M: Chưa hoàn tất.

### 6.21 Capabilities

Route: /master-data/resource-capabilities  
Phạm vi A-M. Tám capability đã seed và được resource candidate sử dụng.
Evidence maintenance capability và negative matching còn thiếu.  
M: Chưa hoàn tất.

### 6.22 Calendars

Route: /master-data/resource-calendars  
Phạm vi A-M. Tám resource calendar đã seed và verify. Evidence holiday,
overlap, timezone và empty/error UI còn thiếu.  
M: Chưa hoàn tất.

### 6.23 Standards

Route: /master-data/production-standards  
Phạm vi A-M. Standard duration và resource-planning contract được candidate
calculation sử dụng. Evidence CRUD, effective-date và invalid-value UI còn
thiếu.  
M: Chưa hoàn tất.

### 6.24 Operation Skill Requirements

Route: /master-data/operation-skill-requirements  
Phạm vi A-M. Operation skill requirement tham gia candidate readiness. Evidence
maintenance, mismatch và permission còn thiếu.  
M: Chưa hoàn tất.

### 6.25 Employees

Route: /employees  
Phạm vi A-M. Bốn canonical employee đã seed và có trong worker assignment
flow. Evidence CRUD, lifecycle, duplicate, locale và accessibility còn thiếu.  
M: Chưa hoàn tất.

### 6.26 Worker Skills

Route: /master-data/skills/workers  
Phạm vi A-M. Ba worker skill đã seed và worker-skill API suite pass. Evidence UI
cho skill assignment, mismatch và lifecycle state còn thiếu.  
M: Chưa hoàn tất.

### 6.27 Shifts

Route: /shifts  
Phạm vi A-M. SHIFT-A active, site-scoped và được WO-CERT-001 chọn. Evidence
overlap, inactive shift, timezone và UI cấp page còn thiếu.  
M: Chưa hoàn tất.

### 6.28 Work Calendar

Route: /work-calendar  
Phạm vi A-M. Calendar schedule đã seed và được resource readiness sử dụng.
Evidence date exception, holiday, timezone, retry và accessibility còn thiếu.  
M: Chưa hoàn tất.

### 6.29 Print Stations

Route: /master-data/print-stations  
Phạm vi A-M. PS-CANONICAL-01 đã seed và MES-side print-station master-data
smoke pass 5/5. Physical printer và third-party execution được loại trừ vì
runtime không khả dụng. Evidence UI state và authorization còn thiếu.  
M: Chưa hoàn tất; chỉ được loại trừ physical/third-party execution.

### 6.30 Reason Codes và Diagnostics

Route: /master-data/reason-codes và
/console/mes/i18n-review  
Phạm vi A-M. Reason-code data và diagnostic route được giữ lại cho operation
và translation review. Diagnostic route không phải business page production.
Evidence CRUD reason-code và locale review đầy đủ còn thiếu.  
M: Chưa hoàn tất.

## 7. Track B: Canonical Seed Contract

Canonical dataset phải có:

- Site SITE-KZ3.
- Area AREA-RUBBER và AREA-MOLDING.
- SHIFT-A active cho canonical site.
- Hai production line với một primary và một backup policy.
- Tám Work Center, tám Workstation, tám equipment record và tám machine unit.
- Tám workstation assignment, tám capability và tám calendar.
- Bốn WST operation với quan hệ routing và MBOM.
- Ba worker skill và bốn employee.
- Traceability policy và schedule.
- Item, revision, EBOM/MBOM, routing và Production Version đã release.
- Production Version WST-SEED-PV-SEAL-ASM-01.
- MES-side Print Station canonical PS-CANONICAL-01.
- Sau cleanup không còn Work Order.

Command reset/seed/verify thực thi guard cho destructive operation và kiểm tra
orphan, count, relationship, readiness và lifecycle invariant.

## 8. Kết quả WO-CERT-001

Certification runner đã hoàn tất cả 10 gate:

| Gate | Kết quả |
|---|---|
| Full reset, canonical seed, canonical verification | PASS |
| Chọn Production Version đã release và effective | PASS |
| Chọn SHIFT-A active | PASS |
| Tạo Work Order qua workflow được hỗ trợ | PASS |
| Chọn primary line tự động và đạt READY | PASS |
| Commit bốn resource candidate | PASS |
| Revalidate hợp lệ bốn allocation | PASS |
| Strict approval đạt Released | PASS |
| Start execution đạt InProgress | PASS |
| Cleanup chính xác, còn zero Work Order | PASS |

Giá trị thực tế:

- Production Version: WST-SEED-PV-SEAL-ASM-01
- Primary line: WST-SEED-LINE-1
- Line-selection status: READY
- Line-selection mode: PRIMARY
- Line-selection reason: PRIMARY_LINE_READY
- Mandatory operation: 4
- Allocation đã commit: 4
- State Work Order cuối: InProgress trước cleanup
- Work Order còn lại sau cleanup: 0

Lưu ý theo source có thẩm quyền: implementation line-selection hiện tại của
execution service lưu PRIMARY cho healthy primary selection tự động. Nó lưu
AUTO cho Resource Hold chưa được giải quyết. Console hiển thị kết quả PRIMARY
healthy này như automatic-primary outcome.

## 9. Ma trận validation

Validation contract đã implement có 32 nhóm rule:

| Khu vực | Positive checks | Negative/conflict checks | API/E2E evidence |
|---|---:|---:|---:|
| Seed và referential integrity | 6 | 4 | PASS |
| Production Version readiness | 3 | 3 | PASS |
| Line selection và fallback | 3 | 4 | PASS |
| Candidate readiness và allocation | 4 | 4 | PASS |
| Approval và execution lifecycle | 3 | 2 | PASS |
| Worker skill và calendar constraint | 2 | 2 | PASS |
| Print station MES-side contract | 1 | 1 | PASS |
| UI state, locale, keyboard, authorization | 0 | 0 | GAP |

Không phát hiện gap backend/API trong certification path đã chạy. Các gap
validation cấp page của console được liệt kê ở Section 12.

## 10. Tóm tắt automated evidence

| Suite | Kết quả |
|---|---:|
| Console typecheck và build | 2/2 |
| Phase 1 API suite | 20/20 |
| Phase 2 API suite, đã loại trừ print theo phê duyệt | 20/20 |
| Phase 7 API suite | 19/19 |
| Phase 9 API suite | 19/19 |
| Worker-skill suite | 8/8 |
| Product-definition suite | 13/13 |
| Phase 6 master-data suite | 8/8 |
| Machine-flow suite | 15/15 |
| Print-station master-data smoke | 5/5 |
| WO-CERT-001 runner | 10/10 |
| Browser regression suite | 25 passed, 0 failed, 0 skipped |

## 11. Thứ tự UAT thủ công

Thực hiện theo thứ tự sau khi chạy lại certification:

1. Xác nhận environment và safety variable.
2. Chạy canonical reset/seed/verify.
3. Xác minh site và area hierarchy.
4. Xác minh line và line policy.
5. Xác minh Work Center và Workstation.
6. Xác minh machine và machine unit.
7. Xác minh assignment và capability.
8. Xác minh calendar, shift và schedule.
9. Xác minh employee và worker skill.
10. Xác minh Item, UOM và Material Group.
11. Xác minh EBOM và MBOM.
12. Xác minh Operation và Routing.
13. Xác minh Production Version readiness.
14. Xác minh Standard và skill requirement.
15. Xác minh Print Station master data.
16. Xác minh Reason Code.
17. Mở trực tiếp Work Order List.
18. Mở trực tiếp Work Order Create.
19. Tạo Work Order bằng canonical Production Version.
20. Xác nhận automatic primary line selection và READY.
21. Mở Resource Planning.
22. Kiểm tra candidate cho mọi operation.
23. Commit exact resource.
24. Revalidate allocation.
25. Approve với strict allocation policy.
26. Start execution.
27. Xác minh Work Order Detail và operation state.
28. Thực hiện empty, error, retry và authorization path.
29. Thực hiện locale và keyboard/focus path.
30. Chạy browser và API suite.
31. Xóa certification Work Order.
32. Xác nhận zero Work Order còn lại và ghi artifact directory.

## 12. Gap và hold hiện tại

Các gap sau ngăn Track A hoàn tất strict:

- Thiếu CRUD và lifecycle suite riêng cho nhiều master-data page.
- Chưa tự động hóa đầy đủ ma trận loading, empty, error, retry và conflict cho từng page.
- Chưa ghi nhận evidence thuật ngữ đầy đủ bằng tiếng Việt, Anh, Nhật và Hàn cho từng page.
- Thiếu automation riêng cho keyboard, focus, modal và accessibility.
- Coverage authorization bằng direct URL chưa đầy đủ cho mọi route và role.

Physical printer và third-party print execution tiếp tục được loại trừ vì
runtime phụ thuộc không khả dụng. MES-side Print Station master data đã
implement và smoke-test; việc loại trừ này không miễn page khỏi yêu cầu UAT.

Không gap nào block canonical Work Order sẵn sàng chạy. Các gap chỉ block
overall strict certification của Track A cộng Track B.

## 13. Troubleshooting

| Triệu chứng | Hành động |
|---|---|
| Safety guard từ chối chạy | Đặt chính xác mọi biến non-production bắt buộc. |
| Seed verification fail | Dừng, kiểm tra reset output và sửa invariant trước khi tạo WO. |
| Production Version chưa ready | Kiểm tra release state, effective date, routing, MBOM, line policy và canonical code. |
| Không chọn được primary line | Kiểm tra primary line READY, assignment, capability, calendar và skill. |
| Candidate bị block | Kiểm tra blocking_errors, capacity_conflicts, assignment, machine, calendar và worker-skill. |
| Revalidation không hợp lệ | Không approve; sửa đúng allocation conflict rồi revalidate. |
| Strict approval bị từ chối | Xác nhận mọi mandatory operation có exact valid allocation. |
| Start execution bị từ chối | Xác nhận status Released và mọi approval/allocation gate. |
| Cleanup còn WO | Kiểm tra cleanup output và database row trước khi chạy lại. |
| Print execution không hoàn tất | Ghi nhận hold do dependency physical/third-party; vẫn giữ MES-side evidence. |

## 14. Tóm tắt coverage

| Track | Phạm vi | Kết quả |
|---|---|---|
| Track A | 30 retained page family, 120 documented use-case slot | 0 strict-complete, 30 incomplete |
| Track B | Canonical reset, seed, create, plan, approve, start, cleanup | Certified 10/10 |
| Overall | Track A cộng Track B | Chưa chứng nhận |

## 15. Câu hỏi và trả lời cuối

1. Canonical dataset đã rebuild và verify chưa? Có, bằng certification runner.
2. Canonical Production Version đã release và effective chưa? Có.
3. Supported workflow có tạo Work Order được không? Có.
4. Automatic primary line selection có hoạt động không? Có; mode hiện lưu là PRIMARY với reason PRIMARY_LINE_READY.
5. Line được chọn có READY không? Có, WST-SEED-LINE-1.
6. Mọi mandatory operation có thể allocate không? Có, bốn trên bốn.
7. Revalidation có pass không? Có.
8. Strict approval có pass không? Có, status Released.
9. Execution có start được không? Có, status InProgress trước cleanup.
10. Database sau test có sạch không? Có, còn zero Work Order.
11. Physical hoặc third-party printing đã được chứng nhận chưa? Chưa, bị loại trừ vì runtime dependency không khả dụng.
12. MES-side Print Station master data đã test chưa? Có, smoke check 5/5.
13. Mọi console page đã strict-complete chưa? Chưa, vẫn còn gap page-level evidence.
14. Overall certification result hiện tại là gì? NOT_CERTIFIED.

NOT_CERTIFIED
