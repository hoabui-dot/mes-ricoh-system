# Kiosk Demo Job Card - Báo cáo Phase 00

Phase: `00`  
Run ID: `KIOSK-DEMO-PHASE00-20260803T070625Z`  
Ngày: `2026-08-03`  
Trạng thái cuối: `KIOSK_DEMO_PHASE_00_PASSED_READY_FOR_PHASE_01`

# 1. Executive Summary

Phase 00 đã hoàn tất audit trạng thái hiện tại và chốt domain contract cho luồng Kiosk Demo Job Card. Phase này chỉ đọc source/runtime và tạo tài liệu bằng chứng; không sửa application source, migration, seed hoặc dữ liệu runtime.

Quyết định chính:

- Job Card là projection của `wo_operation`, không tạo aggregate mới.
- Một card ở màn hình danh sách đại diện cho đúng một Work Order.
- Màn hình chi tiết trả về mọi manual Job Card đủ điều kiện; Print Station nằm trong khu vực chỉ đọc riêng.
- Manual Fail dùng operation state `ExecutionError`, session state mới `FAILED`, và Work Order state mới `Paused`.
- Abort trả operation về `Ready`, không phải Fail. Scrap hợp lệ vẫn là Complete, không tự động là Fail.
- Retry bảo toàn lịch sử, đưa operation về `Ready` và Work Order về `InProgress`.
- SSO của Kiosk phải dùng Keycloak Authorization Code + PKCE, bearer token cho REST, JWT được verify cho WebSocket và terminal session phía server.

# 2. Entry Gate

Authorization source: Direct user instruction to execute PROMPT_PHASE_00.md  
Authorization token: `USER_AUTHORIZED_PHASE_00`  
Entry gate: `PASSED`

Corrected prompt xác nhận Phase 00 là phase đầu tiên, không cần previous report và không được tìm token trong báo cáo trước.

# 3. Scope

Đã thực hiện:

- audit Kiosk UI, Kiosk Gateway, MES Execution, Traceability, MES Console;
- audit PostgreSQL schema/migration, Kafka/outbox/WebSocket, Kong/Keycloak;
- audit dispatch Demo Shared Kiosk và Print Station;
- audit seed/reset, tests và Docker Compose;
- chốt state machine, failure policy, route/API, event matrix và dependency Phase 01-08;
- chạy build/test và smoke chỉ đọc.

Không thực hiện source implementation, migration, seed, login runtime, Work Order mutation, print command hoặc reset dữ liệu.

# 4. Sources Inspected

Nguồn chính:

- `AI_document/kiosk-workstation/PROMPT_PHASE_00_CORRECTED.md`
- `AI_document/kiosk-workstation/KIOSK_DEMO_JOB_CARD_IMPLEMENTATION_RULES.md`
- `AI_document/kiosk-workstation/README(4).md`
- `AI_document/kiosk-workstation/REPORT_TEMPLATE(1).md`
- `AI_document/MOM_PLATFORM_KIOSK_OPERATOR_UI_SERVICE_FLOW.md`
- `services/kiosk-operator-ui`
- `services/mes-kiosk-gateway-service`
- `services/mes-execution-service`
- `services/mes-traceability-service`
- `services/mes-console`
- `services/qms-inspection-service`
- `services/mes-master-data-service`
- `libs/shared-kernel-go`
- `infra/kong/kong.yml`, Keycloak realm export và Docker Compose MES
- Print Station contracts dưới `print-marking/station-agent`
- canonical reset/seed/verification scripts và test inventory hiện tại.

# 5. Runtime Environment

Repository: `/home/neurosus/recoh-system/mes-system`  
Commit baseline: `b62b9fabfc4c59db2c62b4b7bd64678fc6c99767`

Các container Execution, Kiosk Gateway, Traceability, Kafka, Keycloak và Kong đang chạy; health endpoint của ba MES service trả `200`.

Runtime baseline có hai vấn đề sẵn có:

- Kiosk DB có `terminal=0`; `KIOSK-DEMO-01` trả `404` dù migration `000001` và `000002` vẫn được đánh dấu đã áp dụng.
- Execution outbox có 7 row: 3 `PUBLISHED`, 4 `FAILED`. Bốn row lỗi là `MES.Execution.WOResourceAllocated.v1` do topic chưa tồn tại tại thời điểm publish.

# 6. Baseline

## Kiosk UI

- Route list/detail không có route guard.
- Login dùng Keycloak password Direct Grant qua Kiosk Gateway.
- Token chỉ dùng cho WebSocket; REST không có bearer token.
- Browser tự gửi `X-User-ID` và `X-Role-Code`.
- Active session chỉ nằm trong React state và Confirm có fallback `MOCK-*`.
- Abort không kiểm tra `response.ok`.
- Print Station vẫn xuất hiện trong operation selector và form chung.
- WebSocket đánh dấu connected ngay sau TCP open, chưa có `auth_ack`, không reconnect.

## MES Execution

- WO states hiện có không bao gồm `Paused`.
- Operation states quan sát được: `Pending`, `Ready`, `DispatchQueued`, `InProgress`, `Finished`, `ExecutionError`.
- Session CHECK chỉ cho phép `IN_PROGRESS`, `COMPLETED`, `ABORTED`.
- Start ghi session + operation + `OperationStarted` trong transaction.
- Confirm hiện cho phép cả `InProgress` và `Pending`; đây là lỗi cần sửa ở Phase 01.
- Abort chỉ cập nhật session, không cập nhật operation và không ghi outbox.
- Không có manual Fail hoặc manual Retry. Print retry là flow riêng.

## Realtime và Console

Kiosk Gateway hiện consume DispatchQueued, Started, Finished và WOCompleted. Gateway chưa consume Failed, Aborted, Retry hoặc WOStatusChanged. MES Console Work Order Detail chỉ fetch lúc vào trang hoặc sau command, không theo dõi execution event.

# 7. Implementation

Phase 00 không triển khai application behavior. Phần implementation của phase là chốt contract và tạo sáu artifact thiết kế.

## 7.1 Frontend

Chốt route guard, grouped Work Order list, manual Job Card detail, khu vực Print Station chỉ đọc, i18n VI/EN/JA/KO và backend-derived action eligibility.

## 7.2 Backend

Chốt `ExecutionError` cho manual operation failure, thêm `FAILED` cho session, thêm `Paused` cho WO và bảng history append-only trong migration mới. Không chỉnh migration đã áp dụng.

## 7.3 API

Chốt hai read API additive theo terminal cho grouped list/detail. Giữ Start/Confirm/Abort path tương thích; thêm `/fail` và `/retry`. Mọi command phải xác thực principal, scope, state và idempotency ở backend.

## 7.4 Kafka and Outbox

Chốt thêm:

- `MES.Execution.OperationFailed.v1`
- `MES.Execution.OperationAborted.v1`
- `MES.Execution.OperationRetryRequested.v1`
- `MES.Execution.WOStatusChanged.v1`

Mọi mutation phải commit domain state, history và outbox trong cùng transaction.

## 7.5 WebSocket and Gateway

Chốt `auth_ack`, JWT signature/issuer/audience/expiry validation, FIFO queue, event-id dedupe, bounded reconnect và authoritative refetch. Chỉ `DEMO_SHARED_KIOSK` được route tới `KIOSK-DEMO-01`; production routing theo Work Center không thay đổi.

## 7.6 Database and Migration

Phase 01 phải dùng migration additive sau `000023`, thêm `Paused`, cho phép session `FAILED`, và thêm execution history. Phase 00 không chạy DDL.

## 7.7 Seed and Fixtures

Phase 07 phải sửa quy trình reset/seed để phục hồi terminal sau khi reset giữ `schema_migrations`; thêm demo operator, failure reason, dispatch policy và API-driven WO preparation. Phase 00 không seed.

# 8. Files Changed

Application source/migration/seed: không thay đổi.

Tài liệu và evidence được tạo:

- `AI_document/Kiosk-Demo/Phase-00/REPORT_PHASE_00.md`
- `artifacts/kiosk-demo-job-card/phase-00/KIOSK-DEMO-PHASE00-20260803T070625Z/`

Các thay đổi có sẵn của người dùng trong master rules và corrected prompt được giữ nguyên.

# 9. Architecture Verification

| Quy tắc | Kết quả |
| --- | --- |
| MES Execution sở hữu production state | PASS |
| Job Card chỉ là projection của `wo_operation` | PASS |
| Browser không publish Kafka | PASS |
| Một list card bằng một Work Order | PASS |
| Print Station không có manual command tại Demo Kiosk | PASS |
| Demo routing không broadcast production operations | PASS |
| Abort khác Fail | PASS |
| Scrap không tự động là Fail | PASS |
| UI dùng backend state/blocker/eligibility | PASS |
| SSO/REST/WebSocket dùng verified identity | CONTRACT APPROVED |

# 10. Static and Build Results

Command summary: Declared `5`, Executed `5`, Passed `5`, Failed `0`, Skipped `0`.

| Command | Kết quả |
| --- | --- |
| Kiosk UI typecheck | PASS |
| Kiosk UI production build, 1532 modules | PASS |
| Execution `go test ./...`, 13 test/subtest pass | PASS |
| Gateway `go test ./...`, 1 test pass | PASS |
| Traceability `go test ./...`, không có test case | PASS |

Test-case summary: Declared `14`, Executed `14`, Passed `14`, Failed `0`, Skipped `0`.

# 11. API Integration Results

Classification: read-only runtime API.  
Declared `7`, Executed `7`, Passed `7`, Failed `0`, Skipped `0`.

Đã kiểm tra ba health endpoint, Work Order list/detail qua Kong, terminal list và phản hồi `404` có chủ đích cho demo terminal đang thiếu. Không gọi endpoint mutation. Không tìm thấy maintained operation API integration test hiện tại để chạy thêm.

# 12. Kafka and WebSocket Results

Kafka/outbox: Declared `19`, Executed `19`, Passed `19`, Failed `0`, Skipped `0`.

- 12 source-only assertions cho producer, consumer, demo dispatch và outbox.
- 7 read-only runtime inventory assertions cho topic hiện có, lazy print topic source declaration và outbox status.

WebSocket: Declared `7`, Executed `7`, Passed `7`, Failed `0`, Skipped `0`.

- 6 source-only assertions.
- 1 negative runtime assertion: terminal thiếu bị từ chối `404` trước WebSocket upgrade.

Không claim authenticated delivery runtime. Login/WebSocket thành công sẽ cập nhật terminal/last_seen/queue và vi phạm phạm vi không mutation của Phase 00. Repository hiện không có maintained Kafka/WebSocket integration test cho Kiosk.

# 13. Browser E2E Results

Classification: real Playwright Chromium, read-only.  
Declared `8`, Executed `8`, Passed `8`, Failed `0`, Skipped `0`.

Smoke xác nhận root redirect, Vietnamese login UI, terminal identity, login fields/button và chứng minh route Work Order hiện truy cập trực tiếp khi chưa authenticated. Không submit login hoặc production command.

# 14. Manual Verification

Đã đối chiếu source với `MOM_PLATFORM_KIOSK_OPERATOR_UI_SERVICE_FLOW.md`, current migrations, runtime schema, Kong route, Keycloak client/realm roles, Kafka topics, outbox rows và reset script.

Phát hiện reset quan trọng: full reset giữ `schema_migrations` nhưng truncate bảng `terminal`; lần restart sau đó skip migration seed, làm `KIOSK-DEMO-01` không được phục hồi.

# 15. Cleanup

Declared `3`, Executed `3`, Passed `3`, Failed `0`, Skipped `0`.

- Execution DB fingerprint trước/sau giống nhau.
- Kiosk DB fingerprint trước/sau giống nhau.
- Git guard xác nhận không có application source, migration hoặc seed phát sinh từ phase.

Không có fixture runtime cần xóa.

# 16. Acceptance Criteria

Declared `10`, Executed `10`, Passed `10`, Failed `0`, Skipped `0`.

| Tiêu chí | Kết quả |
| --- | --- |
| Job Card ownership rõ ràng | PASS |
| Work Order grouping/progress rõ ràng | PASS |
| Print Station exclusion rõ ràng | PASS |
| Manual failure và WO impact rõ ràng | PASS |
| Fail/Abort/Scrap tách biệt | PASS |
| Retry policy rõ ràng | PASS |
| Event additions đầy đủ | PASS |
| Security và recovery contract đầy đủ | PASS |
| Không sửa source/data | PASS |
| Report cho phép Phase 01 | PASS |

# 17. Known Issues

- Kiosk terminal table rỗng dù migration markers còn nguyên.
- 4 historical `WOResourceAllocated` outbox rows đang `FAILED` vì topic không tồn tại.
- `command.printer.print.batch` chưa materialize trong Kafka ở idle baseline.
- Current Confirm cho phép `Pending`; session ownership chưa được validate đầy đủ.
- Current Abort không đổi operation, không có event.
- Kiosk JWT chỉ ParseUnverified; REST command không dùng bearer.
- MES Console detail chưa tự refresh theo execution event.
- Không có Kiosk browser E2E, Kafka integration hoặc WebSocket integration test được maintain sẵn.

# 18. Risks

- Nếu dùng browser-controlled headers trước Phase 06, người dùng có thể giả mạo role/user.
- Nếu không persist `dispatch_mode`, grouped API có thể vô tình hiển thị production operations ở Demo Kiosk.
- Nếu chỉ đổi session khi Abort, operation bị kẹt `InProgress`.
- Nếu retry ghi đè failure row, audit history mất.
- Nếu manual progress bị dùng làm WO completion, final Print Station operation có thể bị bỏ qua.
- Nếu reset tiếp tục giữ migration marker nhưng xóa terminal, canonical Kiosk UAT không thể chạy.

# 19. Rollback

Không có application/data change để rollback. Có thể xóa riêng report và evidence directory của run này mà không ảnh hưởng runtime. Không được rollback các file corrected prompt/master rules của người dùng.

# 20. Artifacts

Evidence root:

`artifacts/kiosk-demo-job-card/phase-00/KIOSK-DEMO-PHASE00-20260803T070625Z/`

Ngoài 10 artifact bắt buộc, run có:

- `current-state-map.json`
- `approved-state-machine.json`
- `event-inventory.json`
- `route-screen-contract.json`
- `failure-policy-decision.json`
- `phase-dependency-map.json`
- `login-readonly-smoke.png`

# 21. Next Phase Inputs

Phase 01 được phép bắt đầu và phải dùng trực tiếp:

- operation failure state `ExecutionError`;
- session failure state `FAILED`;
- Work Order failure state `Paused`;
- append-only execution history;
- exact Fail/Abort/Retry transition trong `approved-state-machine.json`;
- exact events trong `event-inventory.json`;
- manual endpoint phải từ chối `PRINT_STATION`;
- Start/Confirm phải yêu cầu đúng state và active session;
- quantity, reason, idempotency, scope và outbox phải được test bằng integration test thật.

Không tự động bắt đầu Phase 01 trong run này.

# 22. Final Gate

Entry Gate: `PASSED`  
Audit và final domain contract: `PASSED`  
No source/data mutation: `PASSED`  
Phase 01 authorization: `GRANTED`

KIOSK_DEMO_PHASE_00_PASSED_READY_FOR_PHASE_01
