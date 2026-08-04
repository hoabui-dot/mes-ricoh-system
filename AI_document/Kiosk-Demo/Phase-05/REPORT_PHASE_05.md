# Kiosk Demo Job Card - Báo cáo Phase 05

Phase: `05`  
Run ID: `KIOSK-DEMO-PHASE05-20260803T102400Z`  
Ngày: `2026-08-03`  
Trạng thái cuối: `PASSED`

# 1. Executive Summary

Phase 05 đã nối đầy đủ Job Card Kiosk với command authoritative Start, Complete, Fail, Abort và Retry. UI chỉ hiển thị action khi backend cho phép, gửi identity đã đăng nhập, chờ phản hồi thành công rồi mới refetch, giữ idempotency key ổn định khi retry cùng một thao tác và chặn double-click.

Fail dùng reason `ExecutionFailure` đã Released từ Master Data, hiển thị trước tác động `ExecutionError -> WO Paused -> successor blocked`; Retry giữ failure history. Complete dùng metadata backend cho quantity, material scan và scrap reason. Print Station vẫn chỉ đọc và không có command thủ công.

Kiosk khôi phục cả active execution session lẫn WebSocket sau browser refresh. MES Console tự refetch authoritative detail khi visible/focus và theo chu kỳ 3 giây, nên hai UI hội tụ sau từng transition. Runtime UAT cũng phát hiện và sửa lỗi Console silently truncate operations khi gặp nullable `label_count`.

# 2. Entry Gate

Đã xác nhận report Phase 04 chứa:

```text
KIOSK_DEMO_PHASE_04_PASSED_READY_FOR_PHASE_05
```

# 3. Scope

Đã thực hiện Start, Complete, Fail, Abort, Retry, quantity/reason/scan form, pessimistic feedback, stable idempotency, duplicate-click protection, active-session recovery, Kafka/WebSocket invalidation, MES Console convergence và Print Station exclusion.

Không triển khai offline command queue, behavior traceability mới, manual Print Station command hoặc final authentication hardening. Không gọi Print Station/third-party thật theo phạm vi loại trừ đã được yêu cầu.

# 4. Sources Inspected

- `AI_document/kiosk-workstation/PROMPT_PHASE_05(1).md`
- `AI_document/kiosk-workstation/KIOSK_DEMO_JOB_CARD_IMPLEMENTATION_RULES.md`
- `AI_document/Kiosk-Demo/Phase-04/REPORT_PHASE_04.md`
- `AI_document/Kiosk-Demo/REPORT_TEMPLATE.md`
- Kiosk UI routes, socket, cache, i18n và command paths
- MES Execution state machine, read models, reason client, outbox, migrations và integration tests
- Kiosk Gateway Keycloak, Kafka consumer, relay queue và WebSocket hub
- MES Console Work Order detail/API normalization
- Docker Compose, Kong, Keycloak, canonical seed và Playwright fixtures

# 5. Runtime Environment

| Thành phần | Kết quả cuối |
| --- | --- |
| Master Data | HTTP 200, Docker healthy |
| MES Execution | HTTP 200, Docker healthy |
| Kiosk Gateway | HTTP 200, running |
| Kiosk UI | HTTP 200 tại `http://localhost:13051` |
| MES Console | HTTP 200 tại `http://localhost:13052` |
| Canonical DB | `2 WO / 8 operations / 0 Phase 05 WO` |

Final images:

- Execution: `sha256:a57dc9977271df40315fe9b412409d40cdee14ae4763309d2b0e667cce853ac2`
- Kiosk UI: `sha256:7a05845035c54ccd9512e972214a85b2c024832056fa75cb21618afed4d4fc00`
- MES Console: `sha256:e367c3523d9d17200656089365d893049ce88bc250ff84a882a28b1a6b91e615`

# 6. Baseline

Backend đã có transactional Fail/Retry/Abort và integration coverage, nhưng Kiosk chỉ có Start/Complete/Abort, dùng reason tạm, hardcode operation behavior, tạo idempotency bằng thời gian và không khôi phục socket sau reload. MES Console không tự đồng bộ thay đổi từ Kiosk. Detail API Console còn bỏ qua `Scan` error và trả operation list bị cắt.

# 7. Implementation

## 7.1 Frontend

- Thêm đủ Start/Complete/Fail/Abort/Retry theo `action_eligibility`.
- Form quantity kiểm tra số không âm và tổng lớn hơn 0.
- Material scan và scrap reason render theo `behavior` backend.
- Failure modal dùng approved `ExecutionFailure` reason, bắt comment khi catalog yêu cầu và hiển thị impact trước confirm.
- Abort là destructive confirmation riêng, không dùng failure reason.
- Không optimistic success; action chỉ báo thành công sau `response.ok` và authoritative refetch.
- Stable key lưu trong `sessionStorage`, giữ nguyên sau lỗi retryable và xóa sau success; ref chặn request trùng.
- Command gửi Bearer token, operator ID, role, trace và idempotency headers; không còn fallback operator giả.
- Socket tự khôi phục terminal/token sau reload; active session lấy lại từ detail API.
- VI/EN/JA/KO có text cho form, command và backend error codes mới.

## 7.2 Backend

- `OperationBehaviorRule` bổ sung `requires_scrap_reason` và helper default an toàn.
- Confirmation validation dùng behavior metadata, không hardcode `OP-QC` trong use case.
- Kiosk Job Card trả `behavior` và `failure_impact` authoritative.
- Console WO detail query cast nullable UUID/numeric rõ ràng, `COALESCE` print counts và không còn bỏ qua row scan error.

## 7.3 API

Command thực tế đã pass:

```text
POST /work-orders/:woId/operations/:opId/start
POST /work-orders/:woId/operations/:opId/confirm
POST /work-orders/:woId/operations/:opId/fail
POST /work-orders/:woId/operations/:opId/abort
POST /work-orders/:woId/operations/:opId/retry
```

Kiosk detail phục hồi active session và metadata. Console detail trả đủ bốn fixture operations trước và sau transition.

## 7.4 Kafka and Outbox

Mỗi mutation persist trước khi ghi transactional outbox. Final browser flow xác nhận tối thiểu 9 event thuộc Started, Finished, Failed, RetryRequested và Aborted. Browser không publish Kafka.

## 7.5 WebSocket and Gateway

Gateway consume event thật, tạo outbound message và Kiosk nhận invalidation để refetch. Reload khôi phục authenticated socket. MES Console dùng bounded authoritative refetch vì Gateway WebSocket hiện terminal-scoped cho Kiosk.

## 7.6 Database and Migration

Không cần migration mới và không sửa migration đã apply. Failure history, retry history, confirmation và outbox tiếp tục dùng schema hiện tại.

## 7.7 Seed and Fixtures

- `phase05-fixture.sql`: deterministic WO với `OP-PREP`, `OP-QC`, `OP-TRIM` và `OP-PRINT`.
- Master Data fixture: một approved ExecutionFailure reason bắt comment và một Quality scrap reason.
- Operator UUID lấy từ login Keycloak thật rồi inject vào fixture.
- Cleanup child-first và xóa exact Gateway messages theo WO ID trong payload.

# 8. Files Changed

Các file Phase 05 chính:

- `services/kiosk-operator-ui/src/routes/OperationScreen.tsx`
- `services/kiosk-operator-ui/src/lib/commands.ts`
- `services/kiosk-operator-ui/src/context/KioskSocketContext.tsx`
- `services/kiosk-operator-ui/src/types/kiosk.ts`
- `services/kiosk-operator-ui/src/i18n.ts`
- `services/mes-execution-service/internal/domain/wo.go`
- `services/mes-execution-service/internal/domain/kiosk_read_model.go`
- `services/mes-execution-service/internal/application/usecase/confirm_operation.go`
- `services/mes-execution-service/internal/application/usecase/kiosk_read_model.go`
- `services/mes-execution-service/internal/infrastructure/http/router.go`
- `services/mes-console/src/routes/work-orders/WODetailScreen.tsx`
- `services/mes-console/src/lib/i18nLabels.ts`
- `services/mes-console/src/i18n.ts`
- `e2e/kiosk/phase05-manual-commands.spec.ts`
- `e2e/kiosk/phase05-fixture.sql`
- `e2e/kiosk/phase05-cleanup.sql`
- `e2e/kiosk/phase05-master-data-fixture.sql`
- `e2e/kiosk/phase05-master-data-cleanup.sql`

# 9. Architecture Verification

| Guardrail | Kết quả |
| --- | --- |
| MES Execution là authoritative state owner | PASS |
| Browser không publish Kafka | PASS |
| Command persist trước outbox | PASS |
| UI dùng backend state/blocker/eligibility | PASS |
| Không optimistic production success | PASS |
| Stable retry idempotency và duplicate guard | PASS |
| Fail khác Abort, scrap không tự thành failure | PASS |
| Successor obey predecessor/WO pause | PASS |
| Print Station không có manual controls | PASS |
| Không sửa applied migration | PASS |

# 10. Static and Build Results

Declared `9`, Executed `9`, Passed `9`, Failed `0`, Skipped `0`.

Execution unit/all-package, Execution tagged integration, Gateway unit/all-package, Gateway tagged Kafka/WebSocket integration, Kiosk typecheck/build, Console typecheck/build và `git diff --check` đều pass. Docker build/recreate ba service thay đổi đều pass.

# 11. API Integration Results

Mandatory behavior: Declared `19`, Executed `19`, Passed `19`, Failed `0`, Skipped `0`.

Đã cover Start success/rejection, Complete success, quantity validation, scrap/reason validation, Fail success/missing reason/invalid state, WO pause, successor blocking, Retry success/denial, Abort distinction, duplicate click, stable idempotency, refresh session, không `MOCK-*`, print no-control, Kiosk/Console convergence và real Playwright success/failure flows.

# 12. Kafka and WebSocket Results

Declared `6`, Executed `6`, Passed `6`, Failed `0`, Skipped `0`.

Năm nhóm state event authoritative và WebSocket invalidation/refetch đều pass. Gateway tagged consumer/hub integration pass; delivered queue/receipt được xác nhận trước exact cleanup.

# 13. Browser E2E Results

Declared `2`, Executed `2`, Passed `2`, Failed `0`, Skipped `0`.

- Phase 05 Chromium final: `1/1`, test body `29.8s`, total `32.4s`.
- Phase 04 grouped/read-only regression: `1/1`, test body `5.7s`, total `7.4s`.

Các diagnostic run trước final đã phát hiện ba lỗi thật: camel-case status không translate, socket không restore sau reload và Console operation list bị truncate. Cả ba đã được sửa; chỉ số final ở trên không tính diagnostic failures là acceptance result.

# 14. Manual Verification

- Kiểm tra screenshot Kiosk và Console cuối flow; không có Print Station command.
- Start transient `503` rồi retry dùng cùng idempotency key; double-click chỉ tạo một request.
- Refresh giữ active session và command trở lại sau socket reconnect.
- Fail chuyển operation sang ExecutionError, WO sang Paused và successor blocked.
- Retry đưa operation về Ready, giữ failed session/history; complete có scrap reason thành công.
- Abort đưa operation về Ready, tạo ABORTED history và không tạo FAILED history.
- Console hiển thị cùng state trong tối đa bounded refresh window.

# 15. Cleanup

Declared `8`, Executed `8`, Passed `8`, Failed `0`, Skipped `0`.

| Dữ liệu | Final |
| --- | ---: |
| Canonical Work Orders | 2 |
| Canonical operations | 8 |
| Phase 05 Work Orders | 0 |
| Phase 05 outbox events | 0 |
| Phase 05 reason fixtures | 0 |
| Phase 05 Gateway queue | 0 |
| Phase 05 Gateway receipts | 0 |
| Phase 05 terminal sessions | 0 |

# 16. Acceptance Criteria

Declared `7`, Executed `7`, Passed `7`, Failed `0`, Skipped `0`.

Start/Complete/Fail/Abort/Retry, active-session recovery, no mock fallback, duplicate prevention, predecessor rules, cross-UI convergence và Print Station exclusion đều pass.

# 17. Known Issues

- Kiosk UI, Gateway và MES Console chưa có Docker `HEALTHCHECK`; HTTP endpoints đều trả 200.
- MES Console convergence dùng polling 3 giây + focus/visibility refresh; chưa có Console-wide event subscription.
- Schema Registry vẫn log compatibility warning `409` cho một số schema legacy đã tồn tại; service healthy và event flow vẫn pass.
- Final authentication hardening được giữ đúng ngoài scope Phase 05.

# 18. Risks

- Stable idempotency key sống theo browser tab session; một thao tác bị bỏ dở không tự hết hạn trước khi tab đóng.
- Reason catalog unavailable sẽ khóa Fail confirmation an toàn, nhưng cần operational monitoring để phân biệt catalog outage với danh mục rỗng.
- Console polling tăng read traffic theo số detail tabs đang visible; Phase sau có thể thay bằng shared event invalidation.

# 19. Rollback

Rollback bằng cách redeploy ba image trước Phase 05. Không có schema rollback. Các event/history đã persist phải được giữ; không xóa production history. UI cũ sẽ bỏ qua field read-model mới.

# 20. Artifacts

Evidence root:

```text
artifacts/kiosk-demo-job-card/phase-05/KIOSK-DEMO-PHASE05-20260803T102400Z/
```

Gồm baseline, changes, build, API/event/WebSocket, browser/cleanup/acceptance và hai screenshot cuối flow.

# 21. Next Phase Inputs

- Dùng report này làm entry gate Phase 06.
- Giữ nguyên command/state ownership và event contracts đã xác nhận.
- Phase 06 có thể xử lý final authentication hardening và Console event subscription nếu prompt yêu cầu.
- Không khôi phục manual command cho Print Station.

# 22. Final Gate

```text
KIOSK_DEMO_PHASE_05_PASSED_READY_FOR_PHASE_06
```

Không tự động bắt đầu Phase 06.
