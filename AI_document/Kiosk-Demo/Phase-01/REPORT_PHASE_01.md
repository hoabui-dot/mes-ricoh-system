# Kiosk Demo Job Card - Phase 01 Report

Phase: `01`  
Run ID: `KIOSK-DEMO-PHASE01-20260803T073820Z`  
Date: `2026-08-03`  
Final status: `PASSED`

# 1. Executive Summary

Phase 01 đã triển khai state machine có thẩm quyền tại MES Execution cho Job Card thủ công:

```text
Start: Ready/DispatchQueued -> InProgress
Fail: InProgress -> ExecutionError; session -> FAILED; WO -> Paused
Retry: ExecutionError -> Ready; WO Paused -> InProgress
Abort: InProgress -> Ready; session -> ABORTED; WO giữ InProgress
Complete: InProgress -> Finished; session -> COMPLETED
```

Fail bắt buộc dùng reason code `ExecutionFailure` đã `Released` từ Master Data. Mọi Fail, Retry và Abort đều lưu lịch sử append-only, dùng idempotency, khóa pessimistic và ghi transactional outbox. Print Station bị từ chối trên các manual command.

Service đã được rebuild và redeploy bằng Docker Compose. Image cuối là `sha256:ee88c2e1229552377ab2ba60219055f91c1b272171b9eed2cf206f96c729d8a1`, container `running/healthy`.

# 2. Entry Gate

Report Phase 00 có gate bắt buộc:

```text
KIOSK_DEMO_PHASE_00_PASSED_READY_FOR_PHASE_01
```

Kết quả: `PASSED`.

# 3. Scope

Đã thực hiện:

- sửa Start và Complete/Confirm để giữ đúng authoritative session;
- thêm Fail, Retry và sửa Abort;
- thêm WO `Paused`, session `FAILED`, execution history append-only;
- thêm reason validation, outbox event, Kafka topic và schema registration;
- thêm unit, PostgreSQL domain integration và HTTP integration test;
- rebuild, redeploy, API/Kafka/WebSocket/browser regression và cleanup.

Không thực hiện theo đúng out-of-scope:

- grouped Kiosk read API;
- Kiosk UI command UX;
- relay bốn event mới qua Kiosk Gateway;
- Print Station command behavior;
- offline command handling.

# 4. Sources Inspected

- `AI_document/kiosk-workstation/KIOSK_DEMO_JOB_CARD_IMPLEMENTATION_RULES.md`
- `AI_document/kiosk-workstation/PROMPT_PHASE_01(1).md`
- `AI_document/Kiosk-Demo/Phase-00/REPORT_PHASE_00.md`
- `AI_document/kiosk-workstation/REPORT_TEMPLATE(1).md`
- MES Execution migrations, use cases, router, event registry và manifest
- Master Data reason schema, seed, generic API và runtime DB
- Kiosk Gateway auth, WebSocket hub, consumer và migrations
- Kiosk UI routes, scripts và production build
- Docker Compose, Kong, Keycloak, Kafka và Schema Registry runtime
- current Print Station consumer/producer integration

# 5. Runtime Environment

| Thành phần | Kết quả cuối |
| --- | --- |
| `mes-execution-service` | running, healthy |
| Execution health | HTTP 200 |
| `mes-execution-db` | healthy, migration 000024 applied một lần |
| `platform-kafka` | healthy |
| `platform-schema-registry` | healthy |
| `mes-kiosk-gateway-service` | healthy |
| `kiosk-operator-ui` | HTTP 200 |
| PostgreSQL integration DB | isolated schema per test, cleanup bằng `DROP SCHEMA CASCADE` |

# 6. Baseline

Trước Phase 01:

| Dữ liệu | Số lượng |
| --- | ---: |
| Schema migrations | 23 |
| Work Orders | 2 |
| Operations | 8 |
| Sessions | 0 |
| Confirmations | 0 |
| Outbox rows | 7 |
| Execution history table | chưa tồn tại |

Các user-owned file đang dirty đã được giữ nguyên, không revert hoặc ghi đè.

# 7. Implementation

## 7.1 Frontend

Không sửa source Kiosk UI trong Phase 01. Typecheck, production build và browser smoke đều pass.

## 7.2 Backend

- `FailOperation` xác thực state, manual target, operator, terminal, reason và idempotency.
- Fail cập nhật atomically session `FAILED`, operation `ExecutionError`, WO `Paused` và history.
- `RetryOperation` chỉ cho operator cùng terminal hoặc `PLANT_MANAGER` đúng site; giữ session cũ `FAILED`; chưa tạo session mới cho đến Start.
- `AbortOperation` cập nhật session `ABORTED`, operation `Ready`, giữ WO `InProgress` và ghi history/event riêng.
- Idempotency kiểm tra actor, WO, operation, session và recheck sau row lock để xử lý concurrent duplicate.
- Start chỉ nhận `Ready`/`DispatchQueued`, từ chối Print Station và competing active session; duplicate cùng actor/terminal trả session hiện tại.
- Confirm yêu cầu quantity hợp lệ, operation `InProgress`, session `IN_PROGRESS`, đúng operator; duplicate trả confirmation cũ.
- WO completion chỉ phát event khi update WO thực sự ảnh hưởng đúng một row.

## 7.3 API

Các endpoint authoritative:

```text
POST /api/mes/execution/work-orders/:id/operations/:opId/fail
POST /api/mes/execution/work-orders/:id/operations/:opId/retry
POST /api/mes/execution/work-orders/:id/operations/:opId/abort
```

Fail và Retry yêu cầu `Idempotency-Key`. Abort giữ tương thích client cũ bằng deterministic key theo session khi header chưa được gửi. Fail gọi Master Data trước khi mutate state.

## 7.4 Kafka and Outbox

Đã thêm:

- `MES.Execution.OperationFailed.v1`
- `MES.Execution.OperationAborted.v1`
- `MES.Execution.OperationRetryRequested.v1`
- `MES.Execution.WOStatusChanged.v1`

Payload thực tế có stable IDs, WO code, operation code/sequence, session, line, Work Center, Workstation, terminal, operator, transition, reason và trace ID.

Script `scripts/ensure-mes-execution-kafka-topics.sh` provision idempotently bốn topic, mỗi topic 3 partitions, replication factor 1.

Schema registration đã đổi sang attempt mọi subject và aggregate warning; một legacy 409 không còn ngăn subject mới được đăng ký.

## 7.5 WebSocket and Gateway

Không thêm relay event vì thuộc Phase 02. Regression runtime đã dùng temporary terminal và token thật từ Keycloak để chứng minh:

- WebSocket upgrade thành công;
- auth thành công;
- heartbeat nhận `heartbeat_ack`;
- `last_seen_at` được ghi;
- disconnect và cleanup thành công.

## 7.6 Database and Migration

Migration additive `000024_manual_operation_failure_state_machine.up.sql`:

- thêm enum WO `Paused`;
- mở rộng session check constraint với `FAILED`;
- tạo `wo_operation_execution_history` append-only;
- unique `(action, idempotency_key)`;
- index theo operation và session.

Migration đã apply đúng một lần và được skip an toàn trong hai restart tiếp theo.

## 7.7 Seed and Fixtures

Không sửa canonical seed trong Phase 01. Runtime probe dùng:

- 2 temporary Work Orders;
- 2 operations và 2 sessions;
- 1 temporary Released `ExecutionFailure` reason;
- 1 temporary Kiosk terminal cho WebSocket.

Tất cả mutable fixture rows đã bị xóa chính xác sau test.

# 8. Files Changed

Application và contract:

- `services/mes-execution-service/cmd/server/main.go`
- `services/mes-execution-service/internal/application/usecase/start_operation.go`
- `services/mes-execution-service/internal/application/usecase/confirm_operation.go`
- `services/mes-execution-service/internal/application/usecase/complete_work_order.go`
- `services/mes-execution-service/internal/application/usecase/operation_state_machine.go`
- xóa legacy `services/mes-execution-service/internal/application/usecase/abort_session.go`
- `services/mes-execution-service/internal/domain/wo.go`
- `services/mes-execution-service/internal/infrastructure/client/failure_reason_client.go`
- `services/mes-execution-service/internal/infrastructure/http/router.go`
- `services/mes-execution-service/internal/infrastructure/events/schema_registry.go`
- `services/mes-execution-service/service.manifest.yaml`
- `services/mes-execution-service/migrations/000024_manual_operation_failure_state_machine.up.sql`
- `scripts/ensure-mes-execution-kafka-topics.sh`

Tests:

- `failure_reason_client_test.go`
- `schema_registry_test.go`
- `operation_state_machine_integration_test.go`
- `operation_state_machine_integration_test.go` trong HTTP package

# 9. Architecture Verification

| Guardrail | Kết quả |
| --- | --- |
| MES Execution là state owner | PASS |
| Browser không publish Kafka | PASS |
| validate -> persist -> outbox -> Kafka | PASS |
| Abort khác Fail | PASS |
| Scrap không tự động Fail | PASS |
| Print Station không dùng manual command | PASS |
| Retry giữ failure history | PASS |
| Không sửa migration đã apply | PASS |
| Không reset hoặc thay canonical data | PASS |

# 10. Static and Build Results

Declared `8`, Executed `8`, Passed `8`, Failed `0`, Skipped `0`.

- Execution unit test: PASS
- Execution integration test với build tag: PASS
- Kiosk Gateway Go regression: PASS
- Kiosk UI typecheck: PASS
- Kiosk UI production build: PASS, 1532 modules
- Ba Docker builds trong chu kỳ implement/fix/final: PASS

Mandatory behavior cases: Declared `18`, Executed `18`, Passed `18`, Failed `0`, Skipped `0`.

# 11. API Integration Results

Declared `9`, Executed `9`, Passed `9`, Failed `0`, Skipped `0`.

Deployed runtime trả HTTP 200 cho Fail, duplicate Fail, Retry và Abort. Duplicate Fail trả cùng `history_id`. HTTP integration test xác nhận approved reason trả 200 và invalid reason trả 422.

# 12. Kafka and WebSocket Results

Kafka/Outbox: Declared `18`, Executed `18`, Passed `18`, Failed `0`, Skipped `0`.

- 4 Schema Registry subjects: PASS
- 4 Kafka topics: PASS
- 5 transactional outbox rows chuyển `PUBLISHED`, retry count 0: PASS
- 5 Kafka records đọc lại với payload đúng: PASS

WebSocket: Declared `5`, Executed `5`, Passed `5`, Failed `0`, Skipped `0`.

# 13. Browser E2E Results

Declared `5`, Executed `5`, Passed `5`, Failed `0`, Skipped `0`.

Playwright Chromium xác nhận Kiosk trả HTTP 200, title/body hiển thị, không có page error và browser gọi được execution health qua CORS. Screenshot: `kiosk-browser-smoke.png`.

# 14. Manual Verification

- Xác nhận Fail tạo đúng một history row dù request lặp.
- Xác nhận WO chuyển `Paused`, session `FAILED`, operation `ExecutionError`.
- Xác nhận Retry mở operation về `Ready`, WO về `InProgress`, không tạo session mới.
- Xác nhận Abort tạo `ABORTED`, không tạo failure reason/history action `FAILED`.
- Xác nhận Kafka payload chứa đúng transition và trace ID.
- Xác nhận container cuối không có fatal/panic/migration/server error.

# 15. Cleanup

Declared `5`, Executed `5`, Passed `5`, Failed `0`, Skipped `0`.

Sau cleanup:

| Dữ liệu | Baseline | Final |
| --- | ---: | ---: |
| Work Orders | 2 | 2 |
| Operations | 8 | 8 |
| Sessions | 0 | 0 |
| Confirmations | 0 | 0 |
| Outbox rows | 7 | 7 |
| Temporary history | 0 | 0 |
| Temporary reason | 0 | 0 |
| Temporary terminal/session | 0 | 0 |

Migration 000024, Kafka topics và Schema Registry subjects là infrastructure additions của phase nên được giữ lại. Kafka giữ 5 immutable run-tagged evidence records theo retention policy.

# 16. Acceptance Criteria

Declared `9`, Executed `9`, Passed `9`, Failed `0`, Skipped `0`.

| Tiêu chí | Kết quả |
| --- | --- |
| Manual failure authoritative và persisted | PASS |
| WO impact đúng `Paused` | PASS |
| Successor bị block | PASS |
| Retry giữ history | PASS |
| Abort khác Fail | PASS |
| Print Station từ chối manual command | PASS |
| Start/Complete/WO completion regression | PASS |
| Outbox và Kafka delivery | PASS |
| Cleanup và deployed health | PASS |

# 17. Known Issues

- Canonical Kiosk DB vẫn thiếu `KIOSK-DEMO-01`, nên UI hiện banner realtime offline. Đây là known issue từ Phase 00 và cần được xử lý ở seed/preparation phase.
- Canonical Master Data hiện chỉ có reason loại `Quality`, chưa có `ExecutionFailure`; Phase 01 đã chứng minh contract bằng temporary Released reason. Canonical reason seed thuộc phase seed/readiness sau.
- Kiosk Gateway chưa subscribe bốn event Phase 01; relay thuộc Phase 02.
- Kiosk REST/WS identity vẫn dựa vào current Phase 00 security implementation; verified SSO enforcement thuộc Phase 06.
- Sáu legacy execution Schema Registry subjects vẫn trả 409 với generic schema hiện tại. Registrar đã không còn fail-fast nên subject mới vẫn đăng ký thành công.
- Bốn historical `WOResourceAllocated` outbox rows vẫn `FAILED`; Phase 01 không sửa dữ liệu lịch sử ngoài scope.

# 18. Risks

- Trước khi canonical ExecutionFailure reasons được seed, deployed Fail API sẽ trả `FAILURE_REASON_NOT_APPROVED`, không mutate state.
- Trước Phase 02, Kiosk UI không nhận realtime notification cho Fail/Abort/Retry; client phải refetch bằng flow hiện tại.
- Trước Phase 06, browser-controlled identity headers vẫn là security risk đã được ghi nhận.
- Kafka test records là immutable và chỉ biến mất theo retention, nhưng dùng deterministic WO code/run trace nên không nhầm với production transaction.

# 19. Rollback

Application rollback có thể redeploy image trước Phase 01 và ngừng dùng ba endpoint mới. Không sửa hoặc xóa migration 000024 đã apply. Schema additive và history table phải được giữ để không làm mất audit data. Kafka topics và subjects có thể được giữ vì không ảnh hưởng consumer cũ.

# 20. Artifacts

Evidence root:

`artifacts/kiosk-demo-job-card/phase-01/KIOSK-DEMO-PHASE01-20260803T073820Z/`

Có đủ 10 JSON bắt buộc và screenshot browser smoke. Không lưu token, password hoặc secret.

# 21. Next Phase Inputs

Phase 02 phải dùng trực tiếp:

- ba endpoint Fail/Abort/Retry hiện tại;
- state `ExecutionError`, `FAILED`, `ABORTED`, `Paused`;
- `wo_operation_execution_history` làm authoritative audit source;
- bốn Kafka event v1 đã provision và publish thành công;
- Gateway relay phải idempotent và WebSocket chỉ trigger authoritative refetch;
- Print Station tiếp tục bị loại khỏi manual Kiosk action;
- không thay đổi policy Retry hoặc ghi đè failure history.

Không tự động bắt đầu Phase 02 trong run này.

# 22. Final Gate

Entry Gate: `PASSED`  
Implementation: `PASSED`  
Mandatory tests: `18/18 PASSED`  
Build/API/Kafka/WebSocket/Browser/Cleanup: `PASSED`  
Phase 02 authorization: `GRANTED`

KIOSK_DEMO_PHASE_01_PASSED_READY_FOR_PHASE_02
