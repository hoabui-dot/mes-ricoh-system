# Báo cáo chẩn đoán và sửa trạng thái đánh giá dây chuyền trên chi tiết Work Order

## 1. Executive Summary

Run ID: `20260804T042956Z`.

Nguyên nhân là lỗi nhiều lớp. Bộ chọn dây chuyền backend đã kiểm tra các điều kiện bắt buộc nhưng chỉ lưu kết quả tổng và blocker; HTTP adapter sau đó tự tạo ma trận cố định 13 dòng với trạng thái `NotPersisted`; MES Console lại hiển thị các dòng tổng hợp này thành `Chưa đánh giá`. Vì vậy `Primary = READY` và `Final Result = READY` có thể đúng theo logic cũ, nhưng bằng chứng trên UI không phản ánh những kiểm tra backend thực sự đã chạy.

Giải pháp đã chuyển bằng chứng đánh giá thành contract có cấu trúc, lưu cùng snapshot/audit, áp dụng quy tắc tổng hợp fail-closed, loại bỏ ma trận giả trên frontend, tách riêng các gate và giải thích rõ năm chiều được hoãn đến bước phân bổ nguồn lực cụ thể.

## 2. Scope

Phạm vi gồm luồng tạo WO, Production Version, Line Eligibility, lựa chọn Primary/Backup, đánh giá khả thi, persistence/audit, Work Order Detail API, mapping MES Console, i18n VI/EN/JA/KO, ba PV UAT, replan, resource planning, approval, execution, seed, Docker và cleanup. Không thay đổi kết quả nghiệp vụ dự kiến của ba PV.

## 3. Sources Inspected

Đã đọc prompt, master rules tại `AI_document/refactor-mes-console/REMEDIATION_MASTER_RULES.md`, remediation blueprint/final report, WO certification, auto-resource-allocation report, `AI_CONTEXT.md`, `UI_AI_CONTEXT.md`, báo cáo Phase 00-10, source của MES Console/Master Data/Execution/Traceability, scripts, E2E, package scripts và Docker Compose.

Đường dẫn bắt buộc `AI_document/REMEDIATION_MASTER_RULES.md` không tồn tại; bản hiện hành nằm trong `AI_document/refactor-mes-console/`. Tài liệu `AI_document/MES_WO_DETAIL_TWO_LINE_AUDIT_AND_THREE_PV_SEED_REPORT.md` không tồn tại trong repository tại thời điểm kiểm tra. Thiếu tài liệu này được ghi nhận, nhưng không cản trở truy vết vì source, runtime, báo cáo Phase 08-10 và artifact ba PV cung cấp đầy đủ bằng chứng.

## 4. Target Work Order and Runtime

Baseline dùng WO `WO-20260804-0005`, ID `ac305617-410c-49d6-9b22-a3002d568bd6`, PV `WST-SEED-PV-SEAL-ASM-01`, item revision `WST-SEED-FG-SEAL-ASM-01-A`, MBOM `WST-SEED-MBOM-SEAL-ASM-01`, routing `WST-SEED-ROUTING-SEAL-ASM-01`, số lượng 2, ngày kế hoạch `2026-08-04`, ca `SHIFT-A`.

Baseline chọn `WST-SEED-LINE-1`, role `PRIMARY`, reason `PRIMARY_LINE_READY`, WO `Draft`, allocation `NotEvaluated`, approval `Pending`, execution `NotStarted`. Chi tiết đầy đủ tại `artifacts/mes-wo-line-dimension-fix/20260804T042956Z/target-work-order.json`.

Sau sửa, Docker đã rebuild/recreate Master Data, Execution và Console; bản cuối của Execution được rebuild lại sau khi bổ sung guard thiếu dimension. Health HTTP: Master Data `200`, Execution `200`, Console `200`.

## 5. Baseline UI Evidence

UI baseline hiển thị Primary và Final Result là Ready, nhưng 12/13 dòng còn lại là `Chưa đánh giá`. Ảnh tại `ui-before-primary-ready.png`. Đây không phải dữ liệu đánh giá thật từ backend: UI đang hiển thị ma trận do adapter tạo ra.

Gate cũ ghép các enum không cùng cấp, khiến người dùng dễ hiểu nhầm rằng line `READY` đồng nghĩa đã phân bổ resource, đã kiểm tra capacity, có thể approve hoặc start.

## 6. Baseline API Evidence

`api-response-before.json` chứng minh API trả một `evaluated_line_results` có line status `Ready`, nhưng adapter thêm 13 dimensions, trong đó chỉ `final_result=Ready`; 12 dòng còn lại là `NotPersisted`. `gate_summary` đồng thời cho thấy `active_allocation_count=0`, `valid_allocation_count=0`, approval và execution đều false.

Vì vậy API cũ tự mâu thuẫn về mức chi tiết trình bày, không mâu thuẫn về gate nghiệp vụ: line có thể được chọn trước khi resource theo operation được commit.

## 7. Baseline Database Evidence

`database-evaluation-before.json` cho thấy `wo_header.evaluated_line_results` và `wo_line_selection_audit.evaluated_line_results` chỉ lưu line ID/code, role, priority, status và blockers. DB có selected line, final reason và audit attempt, nhưng không có evidence theo dimension, timestamp đánh giá hay policy version bên trong line result.

Sau sửa, `database-evaluation-after.json` chứa 13 dimension records cho từng line cùng `evaluated_at`, `policy_version=MES_LINE_SELECTION_V2`, blocker details, selection/fallback reason. Dữ liệu được lưu trong JSON snapshot hiện hữu nên không cần migration phá vỡ schema.

## 8. Backend Line-Selection Policy

Selector đọc Line Eligibility đang active, Released, effective tại planned date; bắt buộc site khớp; sắp thứ tự Primary trước Backup, sau đó priority/code/ID. Với từng line, selector kiểm tra:

| Kiểm tra | Phân loại gate |
|---|---|
| Released/effective eligibility, site, Primary/Backup priority | `LINE_SELECTION_BLOCKING` |
| Work Center coverage và one-line consistency | `LINE_SELECTION_BLOCKING` |
| Capability theo operation | `LINE_SELECTION_BLOCKING` |
| Production Standard | `LINE_SELECTION_BLOCKING` |
| Calendar/shift tại planning window | `LINE_SELECTION_BLOCKING` |
| Coarse capacity/reservation conflict theo Work Center | `LINE_SELECTION_BLOCKING` |
| Workstation, machine requirement, equipment/unit, assignment | `RESOURCE_PLANNING_BLOCKING` |
| Worker skill/labor cụ thể | `RESOURCE_PLANNING_BLOCKING` |
| Capacity trên resource đã commit và revalidation | `APPROVAL_BLOCKING` |
| Allocation hợp lệ, approval state | `EXECUTION_START_BLOCKING` |

Backend `READY` nay có nghĩa: có một line eligible với đủ Work Center, capability, standard, calendar/shift và coarse reservation feasibility tại thời điểm chọn. Nó không có nghĩa resource theo operation đã commit, capacity cuối đã revalidate, WO đã được approve, hoặc execution được phép start.

## 9. Dimension-by-Dimension Root Cause

| Dimension | UI trước | API trước | DB trước | Evaluator | Classification | Hành vi đúng sau sửa |
|---|---|---|---|---|---|---|
| Production Version eligibility | Chưa đánh giá | `NotPersisted` giả | Không có dimension | Có | `BACKEND_CALCULATED_NOT_RETURNED` | `READY/BLOCKED`, stage `LINE_SELECTION` |
| Work Center coverage | Chưa đánh giá | `NotPersisted` giả | Không có dimension | Có | `BACKEND_CALCULATED_NOT_RETURNED` | Evidence và blocker theo operation |
| Workstation availability | Chưa đánh giá | `NotPersisted` giả | Không có dimension | Chưa ở stage này | `DEFERRED_BY_DESIGN` | `DEFERRED`, stage `RESOURCE_ALLOCATION` |
| Machine requirements | Chưa đánh giá | `NotPersisted` giả | Không có dimension | Chưa ở stage này | `DEFERRED_BY_DESIGN` | `DEFERRED`, có reason |
| Equipment/Machine Unit | Chưa đánh giá | `NotPersisted` giả | Không có dimension | Chưa ở stage này | `DEFERRED_BY_DESIGN` | `DEFERRED`, có reason |
| Resource Assignment | Chưa đánh giá | `NotPersisted` giả | Không có dimension | Chưa ở stage này | `DEFERRED_BY_DESIGN` | `DEFERRED`, có reason |
| Capability | Chưa đánh giá | `NotPersisted` giả | Không có dimension | Có | `BACKEND_CALCULATED_NOT_RETURNED` | `READY/BLOCKED` với source |
| Calendar and Shift | Chưa đánh giá | `NotPersisted` giả | Không có dimension | Có | `BACKEND_CALCULATED_NOT_RETURNED` | `READY/BLOCKED` với timestamp |
| Production Standard | Chưa đánh giá | `NotPersisted` giả | Không có dimension | Có | `BACKEND_CALCULATED_NOT_RETURNED` | `READY/BLOCKED` với operation detail |
| Capacity | Chưa đánh giá | `NotPersisted` giả | Không có dimension | Có ở mức coarse | `BACKEND_CALCULATED_NOT_RETURNED` | Coarse line capacity ở selection; final capacity là gate revalidation riêng |
| Worker Skill and Labor | Chưa đánh giá | `NotPersisted` giả | Không có dimension | Chưa ở stage này | `DEFERRED_BY_DESIGN` | `DEFERRED`, stage `RESOURCE_ALLOCATION` |
| Final Result | Đạt | `Ready` | Có | Có, nhưng aggregation cũ không có evidence contract | `DOMAIN_EVALUATION_BUG` | Aggregation fail-closed từ sáu dimension bắt buộc |
| Selection Reason | Chưa đánh giá | `NotPersisted` giả | Có ở header/audit | Có | `BACKEND_PERSISTED_NOT_RETURNED` | Dimension rõ ràng; line không được chọn dùng `NOT_APPLICABLE` và reason |

Lớp frontend chung của 13 dòng cũ được phân loại `FRONTEND_STATIC_MATRIX_WITHOUT_EVIDENCE`; việc dịch `NotPersisted` thành `Chưa đánh giá` là biểu hiện, không phải nguồn dữ liệu thật.

## 10. Final-Result Aggregation Rule

Sáu dimension bắt buộc là `eligibility`, `work_centers`, `capability`, `production_standard`, `calendar_shift`, `capacity`. Final `READY` chỉ xuất hiện khi cả sáu đều tồn tại và đều là `READY` hoặc `NOT_APPLICABLE`. Thiếu dimension, `BLOCKED`, `UNKNOWN` hoặc `NOT_EVALUATED` đều fail-closed thành `Blocked`.

`DEFERRED` chỉ hợp lệ cho dimension không thuộc line selection và phải chỉ rõ later stage. `WARNING` ở dimension không bắt buộc không chặn lựa chọn line. Không biến missing evidence thành `DEFERRED`.

Final line `READY` có thể đồng thời với capacity/revalidation gate chưa chạy và zero committed operation resources, vì đây là các stage sau. UI nay trình bày riêng các trạng thái đó.

## 11. Backend Fixes

`line_selection.go` bổ sung model dimension chuẩn, policy version, mapping blocker-to-dimension, timestamp/source/reason và hàm aggregation xác định. Guard cuối cùng xác nhận đủ cả sáu dimension bắt buộc, không chỉ kiểm tra các phần tử được truyền vào.

Các line Ready, Blocked, Primary, Backup và Resource Hold đều được tạo từ cùng builder evidence. API vẫn giữ top-level `Ready/Blocked` để tương thích consumer cũ.

## 12. API Contract Changes

Mỗi dimension nay có `dimension_code`, `status`, `blocking`, `evaluation_stage`, `reason_code`, `localized_message_key`, `details`, `evaluated_at`, `source`; giữ thêm `key` tương thích. Status contract là `READY`, `BLOCKED`, `NOT_EVALUATED`, `NOT_APPLICABLE`, `DEFERRED`, `WARNING`, `UNKNOWN`.

HTTP router không còn gọi normalizer tạo ma trận cố định. `gate_summary` thêm `capacity_state`; allocation và capacity được tính như hai gate khác nhau. Contract đầy đủ tại `dimension-contract.json`.

## 13. Persistence and Audit Changes

Structured dimensions, `evaluated_at`, `policy_version`, role, reason và blockers được lưu trong `wo_header.evaluated_line_results` và mỗi bản ghi `wo_line_selection_audit`. Replan tiếp tục `INSERT` audit attempt mới; không update đè attempt trước. Đây là thay đổi additive trong JSON contract, không xóa hay viết lại lịch sử cũ.

Record lịch sử cũ không được backfill bằng evidence không tồn tại. API trả đúng dữ liệu cũ; Console hiển thị một compatibility notice thay vì dựng hàng giả.

## 14. Frontend Mapping Fixes

`workOrderContracts.ts` bổ sung các field contract mới. `workOrderDetail.ts` chỉ normalize dimensions backend thực sự trả về và hỗ trợ cả `dimension_code` lẫn legacy `key`. Không còn fallback sang danh sách dimension cố định.

Nếu record cũ không có dimension evidence, Console hiển thị: `Backend chưa cung cấp dữ liệu chẩn đoán chi tiết cho lần chọn dây chuyền này.`

## 15. UX Improvements

Line card hiển thị code/name, Primary/Backup, selected/not-selected, feasibility, selection/fallback reason, thời điểm, policy version và số blocker/deferred/warning. Bảng evidence có cột Dimension, Status, Evaluation Stage và Conclusion.

Gate summary nay là bảng có nhãn Work Order, Line Selection, Resource Allocation, Capacity/Revalidation, Approval, Execution; mỗi gate có trạng thái, ý nghĩa và bước tiếp theo. Người dùng không còn thấy một badge `Sẵn sàng` đại diện cho mọi stage.

## 16. i18n Changes

Đã bổ sung VI/EN/JA/KO cho dimension, status, stage, reason, selection/fallback, gate meaning/action và compatibility notice. Nhãn tiếng Việt phân biệt `Đạt`, `Bị chặn`, `Chưa đánh giá`, `Không áp dụng`, `Hoãn đến bước phân bổ nguồn lực`, `Cảnh báo`, `Không xác định`.

Playwright kiểm tra toàn bộ body không chứa raw key dạng `woDetail.*` hoặc `lineSelection.*`; cả bốn test đều pass.

## 17. PV-01 Evidence

PV-01 chọn Primary, policy `MES_LINE_SELECTION_V2`, 13 dimensions: 8 `READY` gồm sáu mandatory + final + selection reason, 5 `DEFERRED`, không có `NOT_EVALUATED`. Fallback rỗng. Refresh giữ nguyên evidence. Ảnh `final-browser/pv-01-primary-ready.png`.

## 18. PV-02 Evidence

PV-02 có Primary `BLOCKED` với blocker cụ thể; Backup có đủ mandatory evidence và được chọn; mode `BACKUP`, fallback reason có giá trị. UI hiển thị cả hai bảng 13 dòng và phân biệt line được chọn/không được chọn. Ảnh `final-browser/pv-02-backup-fallback.png`.

## 19. PV-03 Evidence

PV-03 có cả Primary và Backup `BLOCKED`, selected line rỗng, status `RESOURCE_HOLD`. UI hiển thị blocker của cả hai line; nút auto-propose resource bị disable; approval/start bị gate chặn. Ảnh `final-browser/pv-03-resource-hold.png`.

Evidence API/DB tổng hợp của ba PV nằm tại `three-pv-dimension-evidence.json` và thư mục `after-fixtures/`.

## 20. Replan Evidence

`npm run test:mes:two-line-resource-planning:phase7` pass 19/19. Test `audited replan can change line before execution starts` xác nhận replan hợp lệ, test historical snapshot xác nhận lịch sử cũ không bị thay đổi, stale row version bị từ chối và line change sau execution start bị chặn. Log: `phase7-replan-regression.log`.

Phase 9 chạy lại cùng full regression contract và pass 19/19; log: `phase9-full-regression.log`.

## 21. Build Results

| Hạng mục | declared | executed | passed | failed | skipped |
|---|---:|---:|---:|---:|---:|
| Build/typecheck/source hygiene/deploy | 6 | 6 | 6 | 0 | 0 |

Console typecheck và production build pass. Go focused và `go test ./...` pass. Docker image được rebuild và service được recreate. Vite còn cảnh báo chunk JS lớn hơn 500 kB; đây không phải build failure.

## 22. API Integration Results

| Suite | declared | executed | passed | failed | skipped |
|---|---:|---:|---:|---:|---:|
| Dimension unit/contract | 3 | 3 | 3 | 0 | 0 |
| Resource planning Phase 1 | 20 | 20 | 20 | 0 | 0 |
| Resource planning Phase 2 | 14 | 14 | 14 | 0 | 0 |
| Phase 2 negative matrix | 20 | 20 | 20 | 0 | 0 |
| Two-line Phase 7 | 19 | 19 | 19 | 0 | 0 |
| Two-line Phase 9 | 19 | 19 | 19 | 0 | 0 |
| Canonical verification | 50 | 50 | 50 | 0 | 0 |
| Ready-to-run certification | 10 | 10 | 10 | 0 | 0 |
| **Tổng** | **155** | **155** | **155** | **0** | **0** |

Focused tests bao phủ missing mandatory evidence, mandatory `UNKNOWN`, `NOT_EVALUATED`, explicit `DEFERRED`, warning-only, `NOT_APPLICABLE` có reason và blocked prerequisite ordering.

## 23. Playwright Results

| declared | executed | passed | failed | skipped |
|---:|---:|---:|---:|---:|
| 4 | 4 | 4 | 0 | 0 |

Các test dùng backend và dữ liệu persisted thật, không mock dimension response. Đã kiểm tra desktop, tablet, refresh persistence, exact row/status, raw i18n key, Resource Hold và allocation unavailable. Screenshots và bốn trace ZIP nằm trong `final-browser/`.

## 24. Regression Results

Phase 1 pass 20/20; Phase 2 pass 14/14 và negative matrix 20/20; Phase 7 pass 19/19; Phase 9 pass 19/19; canonical seed pass 50/50; certification pass 10/10 với status `CERTIFIED_MES_CONSOLE_AND_READY_TO_RUN_WO`.

Certification thực hiện reset/seed/verify, tạo WO qua supported workflow, chọn Primary tự động, commit 4/4 allocations, revalidate, strict approve, start và cleanup chính xác. Kết quả tại `artifacts/mes-console-final-certification/WO-CERT-001-20260804044837/certification-result.json`.

## 25. Cleanup Results

Cleanup cuối xóa đúng 3 WO của browser run. Query DB sau cleanup:

```text
wo_header=0
wo_resource_allocation=0
wo_capacity_reservation=0
wo_line_selection_audit=0
orphan_line_selection_audit=0
outbox_events=0
```

Canonical verifier sau cùng pass 50/50, giữ nguyên ba UAT PV, worker skills/labor seed và base dataset. Kết quả máy tại `cleanup-results.json`.

## 26. Known Issues

- Tài liệu `MES_WO_DETAIL_TWO_LINE_AUDIT_AND_THREE_PV_SEED_REPORT.md` được prompt tham chiếu nhưng không tồn tại.
- MES Master Data và Execution log cảnh báo Schema Registry `409` do schema compatibility đã tồn tại trước thay đổi này. Service vẫn healthy, Kafka connected và mọi flow bắt buộc pass.
- Vite cảnh báo bundle chính khoảng 1.6 MB; không liên quan logic dimension nhưng nên xử lý bằng code splitting ở backlog frontend.

## 27. Risks and Compatibility

Contract mới là additive, giữ `key`, top-level `Ready/Blocked` và các field cũ. Record lịch sử không có evidence được hiển thị bằng notice, không suy diễn dữ liệu. Không có migration DB.

Rủi ro còn lại là consumer ngoài MES Console có thể chưa sử dụng field mới; consumer cũ vẫn hoạt động. Exact capacity và labor readiness vẫn thuộc các stage sau, nên tích hợp mới không được diễn giải line `READY` là execution-ready.

## 28. Final Verdict

Đã chứng minh root cause tại backend persistence, HTTP adapter và frontend mapping; sáu mandatory dimensions được đánh giá và persist rõ ràng; năm dimension later-stage được đánh dấu `DEFERRED`; missing evidence fail-closed; ba PV có API/UI evidence; toàn bộ mandatory suites pass, skipped bằng 0; cleanup hoàn tất.

MES_WO_LINE_DIMENSION_STATUS_FIX_COMPLETE
