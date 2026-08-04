# Kiosk Demo Job Card - Phase 02 Report

Phase: `02`  
Run ID: `KIOSK-DEMO-PHASE02-20260803T082751Z`  
Date: `2026-08-03`  
Final status: `PASSED`

# 1. Executive Summary

Phase 02 đã hoàn thiện đường đi realtime có độ tin cậy cho Demo Shared Kiosk:

```text
MES Execution transactional outbox
-> Kafka v1 event
-> Kiosk Gateway idempotent receipt
-> terminal-scoped durable FIFO queue
-> authenticated WebSocket
-> browser event_ack
-> authoritative API refetch
```

`dispatch_mode` được persist trên Work Order. Chỉ `DEMO_SHARED_KIOSK` được relay tới `KIOSK-DEMO-01`; production vẫn theo Work Center và đã loại riêng Demo terminal khỏi nhánh này. `PRINT_STATION` dispatch không tạo manual Job Card.

Execution, Gateway và Kiosk UI đã build/redeploy bằng Docker Compose. Health, Kafka runtime, WebSocket FIFO/ACK, JWT thật, reconnect và Playwright đều pass.

# 2. Entry Gate

Report Phase 01 có gate bắt buộc:

```text
KIOSK_DEMO_PHASE_01_PASSED_READY_FOR_PHASE_02
```

Kết quả: `PASSED`.

# 3. Scope

Đã thực hiện:

- persist demo/production dispatch policy;
- mở rộng event routing context từ MES Execution;
- consume và relay tám execution topics;
- giữ offline queue theo FIFO và event identity;
- chỉ đánh dấu delivered sau browser ACK;
- xác minh JWT RS256 theo trusted Keycloak configuration;
- thêm `auth_ack`, reconnect, duplicate tolerance và full refetch;
- phục hồi canonical terminal rows bị full reset xóa;
- build, integration, Kafka, WebSocket, browser, Docker và cleanup verification.

Không thực hiện theo đúng out-of-scope:

- grouped Work Order API;
- Kiosk list/detail UI cuối cùng;
- thay đổi Print Station command flow;
- offline production command.

# 4. Sources Inspected

- `AI_document/kiosk-workstation/PROMPT_PHASE_02(1).md`
- `AI_document/kiosk-workstation/KIOSK_DEMO_JOB_CARD_IMPLEMENTATION_RULES.md`
- `AI_document/kiosk-workstation/REPORT_TEMPLATE(1).md`
- `AI_document/Kiosk-Demo/Phase-01/REPORT_PHASE_01.md`
- `AI_document/MOM_PLATFORM_KIOSK_OPERATOR_UI_SERVICE_FLOW.md`
- MES Execution dispatch/state machine/printer consumer/router/migrations/tests
- Kiosk Gateway consumer/auth/WebSocket/router/migrations/manifest
- Kiosk UI socket context, WO list và operation detail
- Docker Compose, Kong, Keycloak, Kafka, PostgreSQL và canonical runtime data

# 5. Runtime Environment

| Thành phần | Kết quả cuối |
| --- | --- |
| `mes-execution-service` | running, Docker healthy, HTTP 200 |
| `mes-kiosk-gateway-service` | running, HTTP 200 |
| `kiosk-operator-ui` | running, HTTP 200 |
| `platform-kafka` | 8 required execution topics tồn tại |
| `platform-keycloak` | login thật HTTP 200, RS256 token verified |
| Execution DB | migration 000025 applied |
| Gateway DB | migration 000003 và 000004 applied |
| Integration DB | schema cô lập theo test, drop cascade sau test |

Final images:

- Execution: `sha256:5860d119adbce3ca2ab669508aa19141d1a133e7bf6d76d0385a33377b595716`
- Gateway: `sha256:11f27943730869fda6910f0bedee0ad4b0f75b2601cde01fa9a78caf14a88c2f`
- Kiosk UI: `sha256:fe9b829efb60fa607c213f43e192dcdc9c8f1dacf7a36a7130992763da78adf8`

# 6. Baseline

Trước Phase 02:

| Dữ liệu/hành vi | Baseline |
| --- | ---: |
| Work Orders | 2 |
| Operations | 8 |
| Sessions/confirmations | 0/0 |
| Execution outbox rows | 7 |
| Gateway terminals | 0 |
| Gateway execution topics | 4 |
| Explicit WebSocket auth ACK | không có |
| Queue delivery ACK | không có |
| Verified JWT signature | không có |

Full reset trước đó giữ `schema_migrations` nhưng truncate `terminal`, vì vậy migration seed cũ bị skip khi restart. User-owned rule và corrected prompt files được giữ nguyên.

# 7. Implementation

## 7.1 Frontend

- Socket chỉ chuyển `connected` sau server `auth_ack`, không phải TCP open.
- Reconnect dùng exponential backoff, tối đa 15 giây.
- Client giữ tối đa 500 `event_id` để loại duplicate.
- Mọi message có `message_id` được trả `event_ack`.
- `refreshVersion` tăng sau authenticated reconnect và event mới.
- WO list và operation detail refetch authoritative API theo `refreshVersion`.

## 7.2 Backend

- `wo_header.dispatch_mode` nhận `WORK_CENTER` hoặc `DEMO_SHARED_KIOSK`.
- Create WO validate/persist policy và trả policy qua list/detail API.
- Manual dispatch dùng policy đã persist, không hard-code Demo mode.
- Hai manual operation đồng thời đủ điều kiện đều được dispatch.
- Started, Finished, Failed, Aborted, Retry, WO status và WO completion chứa WO, line, Work Center, Workstation, target và dispatch mode.
- Automatic Print Station Finished/Failed event có đủ context để read-only refetch.
- Nullable print counters trên manual operation được normalize khi dispatch.

## 7.3 API

Không thêm grouped API trong Phase 02. Existing create/list/detail contract được mở rộng bằng `dispatch_mode`.

Terminal login thật:

```text
POST /api/mes/kiosk-gateway/terminals/KIOSK-DEMO-01/login -> HTTP 200
```

Token và secret không được lưu trong evidence.

## 7.4 Kafka and Outbox

Gateway subscribe:

- `MES.Execution.OperationDispatchQueued.v1`
- `MES.Execution.OperationStarted.v1`
- `MES.Execution.OperationFinished.v1`
- `MES.Execution.OperationFailed.v1`
- `MES.Execution.OperationAborted.v1`
- `MES.Execution.OperationRetryRequested.v1`
- `MES.Execution.WOStatusChanged.v1`
- `MES.Execution.WOCompleted.v1`

Consumer đổi từ `ReadMessage` sang `FetchMessage`; offset chỉ commit sau khi receipt và queue thành công. `consumed_execution_event` giữ trạng thái `PROCESSING/PROCESSED/FAILED`. Duplicate đã processed không relay lại.

Runtime Kafka probe xác nhận:

```text
DEMO_SHARED_KIOSK + MANUAL -> KIOSK-DEMO-01
WORK_CENTER + MANUAL -> KIOSK-CUT-01
DEMO_SHARED_KIOSK + PRINT_STATION dispatch -> NO_QUEUE
```

## 7.5 WebSocket and Gateway

- Chưa authenticated client không được register hoặc drain queue.
- JWT invalid/expired nhận `auth_error` và connection đóng.
- Auth thành công nhận `auth_ack` trước mọi queued event.
- Online và offline event đều đi qua cùng durable queue.
- Unique `(terminal_id,event_id)` ngăn queue duplicate.
- Queue drain theo `created_at,message_id`.
- Message giữ `PENDING` cho tới `event_ack`; ACK lặp là idempotent.
- Production Work Center query loại `KIOSK-DEMO-01`, kể cả Demo terminal có Work Center MOLD để hiển thị context.

## 7.6 Database and Migration

Migration additive `000025_work_order_dispatch_policy.up.sql`:

- thêm `dispatch_mode` default `WORK_CENTER`;
- check constraint hai policy hợp lệ;
- index theo policy/status.

Migration additive `000003_reliable_event_relay.up.sql`:

- thêm `event_id` bắt buộc vào outbound queue;
- unique terminal/event;
- thêm persistent consumed-event ledger.

Migration additive `000004_restore_canonical_terminals.up.sql` phục hồi idempotently sáu production terminal và `KIOSK-DEMO-01`. Không sửa migration đã apply.

## 7.7 Seed and Fixtures

Gateway final có 7 canonical terminal. Runtime probe và integration fixtures dùng deterministic phase prefix, sau đó xóa chính xác. Execution integration dùng isolated schema nên canonical WO không bị mutate.

# 8. Files Changed

Execution Phase 02:

- `migrations/000025_work_order_dispatch_policy.up.sql`
- `create_work_order.go`, `dispatch_execution.go`
- `start_operation.go`, `confirm_operation.go`, `complete_work_order.go`
- `operation_state_machine.go`
- `printer_result_consumer.go`
- `router.go`, `wo.go`, `cmd/server/main.go`
- execution integration tests

Gateway:

- `migrations/000003_reliable_event_relay.up.sql`
- `migrations/000004_restore_canonical_terminals.up.sql`
- `execution_consumer.go`, `hub.go`, `auth_service.go`, `terminal.go`
- `cmd/server/main.go`, `service.manifest.yaml`
- auth, routing, queue và WebSocket tests

Kiosk UI:

- `src/context/KioskSocketContext.tsx`
- `src/routes/WOListScreen.tsx`
- `src/routes/OperationScreen.tsx`

# 9. Architecture Verification

| Guardrail | Kết quả |
| --- | --- |
| Browser không publish Kafka | PASS |
| MES Execution là state owner | PASS |
| Demo route chỉ tới Demo terminal | PASS |
| Production route theo Work Center | PASS |
| Demo terminal không nhận production relay | PASS |
| Print dispatch không thành manual card | PASS |
| Event consumer idempotent | PASS |
| Queue durable và ACK-based | PASS |
| JWT signature/issuer/client/expiry verified | PASS |
| Không sửa migration đã apply | PASS |

# 10. Static and Build Results

Declared `9`, Executed `9`, Passed `9`, Failed `0`, Skipped `0`.

- Execution unit và tagged integration: PASS.
- Gateway unit và tagged integration: PASS.
- Kiosk UI typecheck và production build: PASS; 1532 modules.
- Ba final Docker images: PASS.
- `git diff --check`: PASS.

# 11. API Integration Results

Declared `6`, Executed `6`, Passed `6`, Failed `0`, Skipped `0`.

Execution/Gateway health, UI root, Keycloak-backed terminal login, terminal status và WO list/detail contract đều pass.

# 12. Kafka and WebSocket Results

Kafka/event: Declared `12`, Executed `12`, Passed `12`, Failed `0`, Skipped `0`.

WebSocket: Declared `9`, Executed `9`, Passed `9`, Failed `0`, Skipped `0`.

Runtime FIFO evidence:

```text
phase02-ws-fifo-01-1785745603321149866
phase02-ws-fifo-02-1785745603321149866
```

Browser nhận đúng thứ tự. DB chuyển đúng `2/2` message sang `DELIVERED` sau ACK.

# 13. Browser E2E Results

Declared `4`, Executed `4`, Passed `4`, Failed `0`, Skipped `0`.

Playwright Chromium xác nhận:

- login thật thành công;
- offline banner chỉ mất sau `auth_ack`;
- restart Gateway tạo disconnect/reconnect thật;
- `auth_ack_count=2`;
- WO fetch tăng từ `2` lên `3` sau reconnect.

Browser offline emulation ban đầu không đóng established WebSocket nên là probe không hợp lệ, không được tính là product test. Gateway-restart test thay thế đã pass.

Screenshot: `kiosk-authenticated-realtime.png`.

# 14. Manual Verification

- Kiểm tra migration apply một lần và skip an toàn sau restart.
- Kiểm tra 8 topics tồn tại và consumer startup đủ 8 topics.
- Kiểm tra production MOLD/CUT route không chọn Demo terminal.
- Kiểm tra token thật được RS256 validator chấp nhận.
- Kiểm tra final logs không có fatal, panic, relay failure hoặc migration error.

# 15. Cleanup

Declared `4`, Executed `4`, Passed `4`, Failed `0`, Skipped `0`.

| Dữ liệu | Final |
| --- | ---: |
| Work Orders | 2 |
| Operations | 8 |
| Sessions | 0 |
| Confirmations | 0 |
| Phase 02 temporary queue rows | 0 |
| Phase 02 temporary receipts | 0 |
| Canonical terminals | 7 |

Migration, canonical terminal seed và Kafka topics là infrastructure additions nên được giữ lại.

# 16. Acceptance Criteria

Declared `9`, Executed `9`, Passed `9`, Failed `0`, Skipped `0`.

| Tiêu chí | Kết quả |
| --- | --- |
| Mọi eligible manual demo operation routable | PASS |
| Print Station excluded | PASS |
| Production routing unchanged và isolated | PASS |
| Failure/completion/status events tới Demo | PASS |
| Offline FIFO và ACK | PASS |
| Duplicate idempotency | PASS |
| JWT và explicit auth ACK | PASS |
| Reconnect và authoritative refetch | PASS |
| Build, deploy, health, cleanup | PASS |

# 17. Known Issues

- Grouped Kiosk API/UI thuộc Phase 03 chưa được triển khai. Existing `WOListScreen` vẫn gọi global WO list và có thể hiển thị production WO dù realtime production event đã được isolate đúng. Phase 03 phải filter authoritative `DEMO_SHARED_KIOSK`, group một card/WO và loại print operation.
- Canonical Execution DB hiện có 2 WO `WORK_CENTER` và chưa có canonical Demo WO. Phase seed/readiness phải tạo WO demo bằng explicit persisted policy.
- Gateway container chưa khai báo Docker `HEALTHCHECK`; HTTP `/health` đã pass.
- Sáu legacy Schema Registry subjects vẫn báo 409 đã tồn tại/không tương thích khi Execution restart; event relay mới không bị ảnh hưởng.

# 18. Risks

- Cho tới Phase 03, operator có thể mở production WO từ global REST list; realtime routing không broadcast production event tới Demo terminal nhưng read UX chưa phải contract cuối.
- Delivered queue rows chưa có retention/archival policy; không ảnh hưởng idempotency hiện tại nhưng cần vận hành dài hạn.
- WebSocket origin policy vẫn permissive; hardening rộng hơn thuộc security phase sau.

# 19. Rollback

Application rollback có thể redeploy images trước Phase 02. Không xóa/sửa migrations 000025, 000003 hoặc 000004 đã apply; các cột, receipt, queue identity và canonical terminal phải được giữ để bảo toàn dữ liệu. Consumer mới có thể dừng mà không làm MES Execution mất state.

# 20. Artifacts

Evidence root:

`artifacts/kiosk-demo-job-card/phase-02/KIOSK-DEMO-PHASE02-20260803T082751Z/`

Có đủ 10 JSON bắt buộc và screenshot. Không lưu token, PIN hoặc secret.

# 21. Next Phase Inputs

Phase 03 phải dùng trực tiếp:

- persisted `wo_header.dispatch_mode`;
- standard `wo_id/wo_code` trong dispatch event;
- Gateway `event_id/message_id/event_ack` contract;
- `refreshVersion` làm refetch trigger, không dùng event payload làm authoritative state;
- grouped list chỉ lấy `DEMO_SHARED_KIOSK`;
- một card cấp cao nhất cho mỗi WO;
- detail chứa mọi eligible manual operation và Print Station chỉ là read-only context;
- production WO đang thấy trong screenshot phải biến mất khỏi Demo grouped list.

Không tự động bắt đầu Phase 03 trong run này.

# 22. Final Gate

Entry Gate: `PASSED`  
Implementation: `PASSED`  
Mandatory acceptance: `9/9 PASSED`  
Build/API/Kafka/WebSocket/Browser/Cleanup: `PASSED`  
Phase 03 authorization: `GRANTED`

KIOSK_DEMO_PHASE_02_PASSED_READY_FOR_PHASE_03
