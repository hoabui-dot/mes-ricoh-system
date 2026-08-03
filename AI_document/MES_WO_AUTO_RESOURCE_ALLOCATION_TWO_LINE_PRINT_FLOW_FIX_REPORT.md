# Báo cáo sửa luồng phân bổ nguồn lực WO, hai dây chuyền và in thành phẩm

Run ID: `MES-WO-RP-FIX-20260803T0333Z`

## 1. Executive Summary

Đã sửa luồng Work Order để Console lấy đề xuất nguồn lực chính xác từ backend, tự điền ứng viên cho mọi công đoạn bắt buộc nhưng không ghi allocation/reservation khi chỉ hiển thị. Người dùng được xem, đổi ứng viên và xác nhận commit rõ ràng. Ba Production Version UAT cùng tồn tại và cho kết quả Primary, Backup và Resource Hold đúng thiết kế. Việc in chỉ nằm ở công đoạn đóng gói cuối.

## 2. Scope

Phạm vi gồm MES Console, MES Execution API, canonical seed và projection, trình chạy full-flow, kiểm thử Playwright, logic hai dây chuyền, worker skill/schedule, capacity/reservation, Print Station phía MES, cleanup và Docker Compose. Thiết bị in vật lý hoặc tích hợp bên thứ ba được loại khỏi phạm vi theo yêu cầu; kiểm tra binding và runtime projection phía MES vẫn được thực hiện.

## 3. Sources Inspected

Đã đối chiếu các quy tắc và báo cáo trong `AI_document`, gồm remediation rules, blueprint, final report, chứng nhận Ready-to-Run WO, báo cáo hai dây chuyền, báo cáo Phase 00-10, `AI_CONTEXT.md`, `UI_AI_CONTEXT.md`; đồng thời đọc mã hiện hành trong `services/mes-console`, `services/mes-master-data-service`, `services/mes-execution-service`, `services/mes-traceability-service`, `services/mes-kiosk-gateway`, `scripts`, `e2e`, `package.json` và các Docker Compose.

## 4. Baseline Browser Reproduction

Baseline cho thấy Resource Planning yêu cầu người dùng mở từng công đoạn và tự chọn ứng viên ban đầu. UI và full-flow runner không đi cùng một đường nghiệp vụ. Trace và kết quả baseline được giữ trong `artifacts/playwright`; bản so sánh cô đọng nằm ở `full-flow-test-vs-ui-comparison.json`.

## 5. Baseline Full-Flow Runner Reproduction

Runner cũ dò nhiều Production Version, kiểm tra ứng viên trước, có thể chuyển sang PV khác và sửa trực tiếp Print Station fixture. Vì vậy một lệnh có thể báo pass dù PV mà UI đang dùng bị chặn. Trong lần xác minh cuối, yêu cầu PV-03 ban đầu đã bị thay bằng một `PV-*` khác và runner báo pass; lỗi này được tái hiện trước khi sửa exact-match.

## 6. Why the Previous Full-Flow Test Passed

Nguyên nhân là ba hành vi ẩn: tìm PV thay thế, chỉ nhận context đã có ứng viên Ready và tự sửa dữ liệu Print Station trong runner. Những hành vi này làm mất blocker thật của UI. Tất cả đã bị loại bỏ; runner hiện chỉ dùng đúng `MES_RESOURCE_PLANNING_PV_CODE` và không sửa fixture nguồn lực.

## 7. Browser/Test Parity Root Cause

Backend trước đây chỉ cung cấp danh sách candidate theo từng operation, trong khi UI tự điều phối chọn tay và test tự chọn candidate bằng vòng lặp riêng. Không có contract đề xuất chung. Contract mới đặt ranking và blocker ở backend; Console và runner đều gọi cùng endpoint proposal, dùng cùng PV, ngày, shift và readiness rules.

## 8. Resource Allocation UX Before and After

Trước: chọn tay từng operation và việc đã chọn/đã ghi khó phân biệt. Sau: đề xuất được tự tải cho WO Draft có line `READY`, mỗi operation hiển thị ứng viên đề xuất và alternatives; trạng thái đề xuất chưa phải allocation đã lưu; nút commit tất cả là thao tác riêng có xác nhận.

## 9. Automatic Proposal Contract

Endpoint mới là `GET /api/mes/execution/work-orders/{id}/resource-allocation-proposals`. Response chứa `recommended_candidate`, `alternatives`, `blocking_errors`, `selection_reasons`, `requested_window`, `freshness_token`, `proposal_version`, selected line và trạng thái complete. Backend không đề xuất candidate Blocked, có blocker operation/candidate hoặc conflict capacity/reservation.

## 10. User Adjustment and Commit Behavior

Người dùng có thể đổi sang alternative Ready trước commit hoặc khôi phục đề xuất. Commit hàng loạt dùng API allocation được hỗ trợ, theo thứ tự operation và có xác nhận. Nếu commit một WO chưa có allocation bị lỗi giữa chừng, Console bù trừ các allocation vừa tạo. Allocation đã tồn tại không bị ghi đè âm thầm; reallocation vẫn yêu cầu xác nhận riêng.

## 11. Capacity and Reservation Fixes

Proposal gọi candidate evaluation hiện hành nên cùng dùng calendar, standard, duration, overlap và reservation rules với commit/revalidate. Kiểm chứng PV-01 và PV-02 cho thấy trước/sau proposal đều có `0` allocation và `0` reservation. Sau cleanup toàn hệ thống còn `0` allocation và `0` reservation.

## 12. Canonical Seed Changes

Seed hiện có 2 line, 8 work center, 8 workstation, 8 equipment, 8 machine unit, 8 assignment, 12 capability, 8 calendar, 6 operation và 12 routing operation. Dữ liệu lao động gồm 3 skill, 4 worker, 4 skill assignment, 4 shift schedule và không có labor candidate gap.

## 13. PV-01 Primary-Ready Scenario

`WST-UAT-PV-01-PRIMARY-READY` chọn `WST-SEED-LINE-1`. Proposal complete cho 4/4 operation; full-flow `PHASE2-RP-1785727911813-IOYJ2` hoàn thành create, compute/check, proposal, commit, revalidate, approve, start, persistence và cleanup.

## 14. PV-02 Backup-Fallback Scenario

`WST-UAT-PV-02-BACKUP-FALLBACK` làm Primary bị chặn có chủ đích bởi `LINE_PRODUCTION_STANDARD_MISSING`, sau đó chọn `WST-SEED-LINE-2`. Candidate đề xuất chỉ thuộc Backup. Full-flow `PHASE2-RP-1785727920977-JOSJB` pass toàn bộ.

## 15. PV-03 Both-Lines-Hold Scenario

`WST-UAT-PV-03-BOTH-LINES-HOLD` làm cả hai line thiếu production standard cho operation đóng gói hold. Kết quả line là `RESOURCE_HOLD`, không có selected line. Proposal trả `complete=false`, `operations=[]`, blocker `WO_LINE_RESOURCE_HOLD`; runner dừng đúng tại gate proposal và cleanup sạch trong `PHASE2-RP-1785727932964-LEKRP`.

## 16. Two-Line Runtime Evidence

Ba PV tồn tại đồng thời với 6 eligibility. Phase 7: declared 19, executed 19, passed 19, failed 0, skipped 0. Phase 9: declared 19, executed 19, passed 19, failed 0, skipped 0. Evidence tổng hợp ở `three-pv-scenario-evidence.json`.

## 17. Print Station and Product Label Logic

Ba operation sản xuất đầu dùng `KIOSK_DEMO`; chỉ operation đóng gói cuối dùng `PRINT_STATION` và `requires_output_label=true`. WO quantity 2, base quantity 1 tạo 2 chu kỳ, 2 tem, 1 bản/tem và 2 bản in. `PS-CANONICAL-01` được bind tới workstation đóng gói của cả hai line; runtime `ONLINE`, Kafka `CONNECTED`, có 1 printer Ready. Không thực thi lệnh in vật lý bên thứ ba.

## 18. Work Order Detail Status Fixes

UI tách rõ các gate: Work Order, Execution, Line, Allocation, Capacity và Approval. Dimension backend chưa lưu riêng được hiển thị là `Chưa đánh giá`, không còn chuỗi kỹ thuật “Backend chưa lưu riêng” hoặc raw i18n key. Số allocation và capacity lấy từ trạng thái đã commit/revalidate, không lấy từ proposal đang xem.

## 19. Operation Quantity Fix

Bảng operation hiển thị base quantity, số chu kỳ, số tem và số bản in theo snapshot backend. Operation không in hiển thị không áp dụng cho tem/bản in; số tem không bị nhân theo mọi routing operation. Snapshot cuối xác nhận chỉ packing có `label_count=2`, `print_copies=2`.

## 20. Backend/API Changes

Đã thêm use case proposal side-effect-free và route HTTP tương ứng trong MES Execution. Proposal duyệt các operation bắt buộc theo thứ tự, gọi candidate evaluation hiện hữu, giới hạn selected line, lấy candidate Ready đầu tiên theo thứ tự authoritative và chặn cả blocker cấp operation. Không thay đổi commit/reallocate audit contract.

## 21. Frontend Changes

`WODetailScreen.tsx` quản lý proposal selection tách khỏi persisted allocation, tự tải proposal đúng trạng thái, hỗ trợ alternative/reset và explicit bulk commit. Các nhãn gate và bản dịch vi/en/ja/ko được bổ sung. Playwright dùng các test ID ổn định cho proposal và commit.

## 22. Migration Changes

Không có migration schema mới. Contract proposal và seed dùng các bảng/column hiện hành; tương thích dữ liệu cũ được giữ nguyên.

## 23. Seed Changes

Đã thêm ba PV UAT, operation packing riêng cho Backup/Hold, capability, standard và eligibility tương ứng, projection execution, Print Station binding cho hai packing workstation. Cleanup seed xóa cả projection line và binding trước workstation. Hai lần seed liên tiếp `wo-fix-idempotency-1b` và `wo-fix-idempotency-2` đều pass, chứng minh idempotency.

## 24. Tests Added or Updated

Full-flow runner được sửa để dùng proposal API, kiểm tra side effect bằng DB count, exact-match PV và bỏ toàn bộ helper sửa Print Station. Playwright phase 3 được sửa cho luồng stage proposal rồi explicit commit. Canonical verifier kiểm tra ba PV, 6 eligibility, worker skill/schedule, 12 capability và 12 routing operation.

## 25. Static and Build Results

- MES Console production build: declared 1, executed 1, passed 1, failed 0, skipped 0.
- Go affected package targets: declared 2, executed 2, passed 2, failed 0, skipped 0; package HTTP không có test case nhưng package build thành công.
- Node syntax checks: declared 4, executed 4, passed 4, failed 0, skipped 0.
- Docker rebuild: declared 6 images, executed 6, passed 6, failed 0, skipped 0; execution image cuối được rebuild/recreate thêm một lần sau hardening.

Vite có cảnh báo chunk lớn hơn 500 kB, không phải lỗi build.

## 26. API Integration Results

- Negative matrix: declared 20, executed 20, passed 20, failed 0, skipped 0.
- PV-01 full-flow: declared 14, executed 14, passed 14, failed 0, skipped 0.
- PV-02 full-flow: declared 14, executed 14, passed 14, failed 0, skipped 0.
- PV-03 expected-negative assertion: declared 1, executed 1, passed 1, failed 0, skipped 0; hệ thống từ chối đúng blocker và cleanup pass.

## 27. Playwright Results

Command cuối: `npx playwright test e2e/resource-planning/phase3-resource-planning.spec.ts --project=chromium --reporter=line`. Declared 6, executed 6, passed 6, failed 0, skipped 0; thời gian 44,2 giây. Mỗi test cleanup về 0 Work Order; trace/report nằm dưới `artifacts/playwright`.

## 28. Regression Results

- Two-line Phase 7: declared 19, executed 19, passed 19, failed 0, skipped 0.
- Two-line Phase 9: declared 19, executed 19, passed 19, failed 0, skipped 0.
- Canonical verifier: declared 44, executed 44, passed 44, failed 0, skipped 0.
- Mandatory skipped tests trên toàn bộ gate: 0.

## 29. Cleanup Results

Sau toàn bộ run: Work Order 0, resource allocation 0, capacity reservation 0, print job 0. Canonical seed vẫn còn đủ 3 PV và 2 packing Print Station binding. Cleanup là PASS.

## 30. Known Issues

Kiosk gateway có log `Demo kiosk broadcast error: no rows in result set` khi consumer nhận event ngay sau khi test đã cleanup WO. Đây là race cleanup không làm hỏng flow, không để lại dữ liệu và không ảnh hưởng health. Vite vẫn cảnh báo bundle lớn. Runtime máy in vật lý/bên thứ ba không được kiểm tra theo phạm vi đã loại trừ.

## 31. Risks and Compatibility

Bulk commit là chuỗi request nên không phải transaction xuyên nhiều operation; Console chỉ bù trừ allocation mới tạo khi lỗi giữa chừng. Backend vẫn là nguồn quyết định và revalidation bắt buộc trước approval. API mới chỉ bổ sung, không phá contract cũ. Các warning maintenance/calibration/heartbeat `Unknown` hiện không blocking theo policy đang triển khai; nếu policy đổi sang strict, seed cần nguồn trạng thái tương ứng.

## 32. Final Gate

Proposal side-effect-free: PASS. Review/adjust/explicit commit: PASS. Canonical seed Ready và idempotent: PASS. PV-01 Primary: PASS. PV-02 Backup: PASS. PV-03 Hold: PASS. Printing chỉ ở operation cuối: PASS. Build/API/browser/regression: PASS. Mandatory skip: 0. Cleanup: PASS. Docker health: master 200, execution 200, traceability 200, kiosk 200, console 200.

Evidence chính: `artifacts/mes-wo-resource-allocation-fix/MES-WO-RP-FIX-20260803T0333Z/`.

MES_WO_RESOURCE_ALLOCATION_FIX_COMPLETE
