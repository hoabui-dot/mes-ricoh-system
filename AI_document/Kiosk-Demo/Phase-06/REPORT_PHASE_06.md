# Kiosk Demo Job Card - Báo cáo Phase 06

Phase: `06`  
Run ID: `KIOSK-DEMO-PHASE06-20260803T125500Z`  
Ngày: `2026-08-03`  
Trạng thái cuối: `PASSED`

# 1. Executive Summary

Phase 06 đã hoàn tất lớp bảo vệ Kiosk theo terminal/operator session. Route danh sách và chi tiết yêu cầu phiên hợp lệ; REST Kiosk đi qua route Kong riêng, được Kong và MES Execution cùng xác minh JWT; backend lấy user/role từ token đã xác minh và ghi đè mọi header identity do browser gửi.

Gateway xác minh chữ ký RS256, issuer allowlist, client audience/`azp`, thời hạn, subject và role `OPERATOR` cho WebSocket/logout. Login chỉ giữ một session `ACTIVE` mới nhất cho mỗi terminal. Logout đóng server session, đóng socket và xóa token, operator, terminal, command attempt cùng IndexedDB cache.

Kiosk dùng runtime `config.js` được sinh từ environment khi container khởi động. Demo credential chỉ xuất hiện khi `KIOSK_DEMO_CREDENTIALS_ENABLED=true`. Reconnect giữ bounded exponential backoff, nhận `auth_ack`, drain FIFO, ACK/deduplicate event và refetch read model sau kết nối lại.

# 2. Entry Gate

Đã xác nhận report Phase 05 chứa:

```text
KIOSK_DEMO_PHASE_05_PASSED_READY_FOR_PHASE_06
```

# 3. Scope

Đã thực hiện protected routes, bearer REST, Kong/backend JWT validation, WebSocket trust validation, terminal-session policy, reconnect/refetch, queued-event reliability, server logout, browser cleanup, runtime URL và explicit demo credentials.

Không thay đổi business behavior Job Card, không thêm offline production command queue, không thay đổi Print Station authentication và không thực hiện enterprise-wide SSO redesign.

# 4. Sources Inspected

- `AI_document/kiosk-workstation/PROMPT_PHASE_06(1).md`
- `AI_document/kiosk-workstation/KIOSK_DEMO_JOB_CARD_IMPLEMENTATION_RULES.md`
- `AI_document/kiosk-workstation/REPORT_TEMPLATE(1).md`
- `AI_document/Kiosk-Demo/Phase-05/REPORT_PHASE_05.md`
- Kiosk UI routes, storage, IndexedDB, runtime build và socket context
- Kiosk Gateway auth, HTTP router, WebSocket hub, queue và terminal migrations
- MES Execution HTTP routes, command handlers, read model và integration tests
- MES Console shared command compatibility
- Kong declarative JWT consumers/routes, Keycloak live claims và Docker Compose
- Kafka/outbox consumers, canonical seed state và Phase 04/05 Playwright fixtures

# 5. Runtime Environment

| Thành phần | Kết quả cuối |
| --- | --- |
| Master Data | healthy, HTTP 200 |
| MES Execution | healthy, HTTP 200 |
| Kiosk Gateway | running, HTTP 200 |
| Kiosk UI | running, HTTP 200 tại `http://localhost:13051` |
| Kong | healthy, Admin HTTP 200, proxy JWT route hoạt động |
| Canonical DB | `2 WO / 8 operations` |

Final images:

- Master Data: `sha256:1cb7ad6911652e0585633cc6f6a2f610b365f67837a456b9a7a1848a30da991c`
- MES Execution: `sha256:775cef654a8f68e10612227ec41a047cf0fa79d70be7f1de7debc5f7720e03fd`
- Kiosk Gateway: `sha256:1fbe47a403a0b127050f80e54e8f661878923571bcddaec3cbf6e04b4f143aec`
- Kiosk UI: `sha256:4c3506eb657c23b1b31c69dad8f750310adc13bfa5c4a65868d1dc01627e567f`
- Kong: `sha256:8735a1e440dfc38ecde22829c9e3e6ea3b6c06eec2c7c08d987e7eb16489dfba`

# 6. Baseline

Kiosk list/detail chưa có route guard; read API không gửi bearer; command còn gửi `X-User-ID` và `X-Role-Code` từ browser. Login hardcode hostname, username/password; logout chỉ xóa token cục bộ. Gateway logout tin `X-User-ID`, query terminal code như UUID, login cho phép nhiều active sessions và bỏ qua token validation error. WebSocket đã có ack/backoff/FIFO/dedup nhưng chưa buộc token subject vào active terminal session.

# 7. Implementation

## 7.1 Frontend

- Thêm `ProtectedKioskRoute` kiểm tra token chưa hết hạn, operator và terminal binding trước list/detail.
- Thêm runtime config API cho Gateway/WebSocket URL và explicit demo credentials.
- Mọi Kiosk read/command request gửi bearer; không gửi browser identity/role headers.
- Kiosk command chuyển sang alias được bảo vệ `/api/mes/execution/kiosk/work-orders/...`.
- Logout gọi Gateway, đóng socket, xóa bốn auth/session keys, command attempts, active-work state và cả hai IndexedDB stores.
- `auth_ack` vẫn là điều kiện duy nhất để UI chuyển sang connected; reconnect tăng tối đa 15 giây và refetch sau ack/event.

## 7.2 Backend

- MES Execution thêm RS256/JWKS verifier kiểm tra issuer, `azp`/audience, expiry, subject và `OPERATOR`.
- Middleware Kiosk ghi đè `X-User-ID`/`X-Role-Code` từ verified claims.
- Giữ endpoint MES Console cũ để không phá compatibility; chỉ Kiosk aliases/read routes bắt bearer.
- Gateway login bắt buộc token hợp lệ, đóng session trước, khóa terminal row và tạo đúng một active session.
- WebSocket chỉ authenticate khi token subject có active session tại terminal đó.
- Logout derive subject từ bearer, resolve terminal code/UUID đúng, đóng session và disconnect socket server-side.

## 7.3 API

Protected API:

```text
GET  /api/mes/execution/kiosk/terminals/:terminal/work-orders
GET  /api/mes/execution/kiosk/terminals/:terminal/work-orders/:woId
POST /api/mes/execution/kiosk/work-orders/:woId/operations/:opId/{start|confirm|fail|abort|retry}
POST /api/mes/kiosk-gateway/terminals/:terminal/logout
```

Live verification: Kong/backend đều trả `401` khi thiếu token và `200` khi dùng bearer hợp lệ. Login và logout trả `200`.

## 7.4 Kafka and Outbox

Không thay đổi event contract hoặc ownership. MES Execution vẫn persist mutation trước outbox; browser không publish Kafka. Gateway queue tiếp tục dùng unique `(terminal_id,event_id)`, FIFO `created_at,message_id` và delivery ACK.

## 7.5 WebSocket and Gateway

- Xác minh signature, issuer, client, expiry, subject, role và active terminal session.
- Gửi `auth_ack` trước connected/drain.
- Một connection mới thay connection cũ của cùng terminal.
- Heartbeat cập nhật `last_seen_at`; unregister current connection mới chuyển terminal về `OFFLINE`.
- Reconnect test thực tế restart Gateway container, UI tự reconnect và refetch thành công.

## 7.6 Database and Migration

Thêm migration `000005_single_active_terminal_session.up.sql`. Migration đóng các session active lịch sử trừ session mới nhất rồi tạo partial unique index trên `terminal_session(terminal_id) WHERE status='ACTIVE'`. Migration mới được apply transactionally; không sửa migration cũ đã apply.

## 7.7 Seed and Fixtures

Không thay canonical seed. Phase 06 dùng login/operator/terminal thật và isolated schema cho backend integration. Phase 05/04 fixture được tạo và cleanup exact theo test hiện có.

# 8. Files Changed

Các file Phase 06 chính:

- `services/kiosk-operator-ui/src/components/ProtectedKioskRoute.tsx`
- `services/kiosk-operator-ui/src/lib/auth.ts`
- `services/kiosk-operator-ui/src/lib/runtimeConfig.ts`
- `services/kiosk-operator-ui/src/App.tsx`
- `services/kiosk-operator-ui/src/routes/LoginScreen.tsx`
- `services/kiosk-operator-ui/src/routes/WOListScreen.tsx`
- `services/kiosk-operator-ui/src/routes/OperationScreen.tsx`
- `services/kiosk-operator-ui/src/context/KioskSocketContext.tsx`
- `services/kiosk-operator-ui/src/lib/commands.ts`
- `services/kiosk-operator-ui/src/lib/db.ts`
- `services/kiosk-operator-ui/Dockerfile`
- `services/kiosk-operator-ui/docker-entrypoint.d/40-kiosk-runtime-config.sh`
- `services/mes-kiosk-gateway-service/internal/application/auth_service.go`
- `services/mes-kiosk-gateway-service/internal/infrastructure/http/router.go`
- `services/mes-kiosk-gateway-service/internal/websocket/hub.go`
- `services/mes-kiosk-gateway-service/migrations/000005_single_active_terminal_session.up.sql`
- `services/mes-execution-service/internal/infrastructure/auth/verifier.go`
- `services/mes-execution-service/internal/infrastructure/auth/verifier_test.go`
- `services/mes-execution-service/internal/infrastructure/http/router.go`
- `infra/kong/kong.yml`
- `infra/docker-compose.mes.yml`
- `e2e/kiosk/phase06-auth-reliability.spec.ts`
- `e2e/kiosk/phase05-manual-commands.spec.ts`

# 9. Architecture Verification

| Guardrail | Kết quả |
| --- | --- |
| MES Execution vẫn authoritative | PASS |
| Browser không publish Kafka | PASS |
| Browser identity headers không authoritative | PASS |
| REST được Kong và backend cùng kiểm tra | PASS |
| WebSocket buộc verified identity vào active terminal session | PASS |
| Không replay/offline queue production command | PASS |
| Print Station vẫn ngoài manual Kiosk flow | PASS |
| MES Console endpoints cũ vẫn tương thích | PASS |
| Không sửa migration đã apply | PASS |

# 10. Static and Build Results

Declared `8`, Executed `8`, Passed `8`, Failed `0`, Skipped `0`.

Kiosk typecheck/build, Gateway all-package tests, Execution all-package tests, combined Compose validation, `git diff --check`, Docker image build/recreate và runtime health/log check đều pass.

# 11. API Integration Results

Mandatory matrix: Declared `16`, Executed `16`, Passed `16`, Failed `0`, Skipped `0`.

| Test | Kết quả |
| --- | --- |
| Unauthenticated direct route | PASS |
| Missing bearer token | PASS |
| Invalid signature | PASS |
| Wrong issuer | PASS |
| Wrong audience/client | PASS |
| Expired token | PASS |
| Valid login | PASS |
| REST bearer authentication | PASS |
| WebSocket auth acknowledgement | PASS |
| Reconnect after socket loss | PASS |
| FIFO queued-event drain | PASS |
| Duplicate event tolerance | PASS |
| Logout server session | PASS |
| Browser storage cleanup | PASS |
| Runtime URL configuration | PASS |
| Phase 05 success/failure E2E regression | PASS |

# 12. Kafka and WebSocket Results

Declared `6`, Executed `6`, Passed `6`, Failed `0`, Skipped `0`.

Signature/session auth, explicit `auth_ack`, reconnect, FIFO delivery/ACK, duplicate tolerance và Kafka consumer integration đều pass. Tagged Gateway integration hoàn tất trong `0.724s` và `0.175s`; không còn isolated test schema sau run.

# 13. Browser E2E Results

Declared `3`, Executed `3`, Passed `3`, Failed `0`, Skipped `0`.

- Phase 06 auth/reliability: `1/1`, test body `8.6s`, total `9.7s`.
- Phase 05 manual-command regression: `1/1`, test body `29.7s`, total `32.1s`.
- Phase 04 grouped/realtime regression: `1/1`, test body `5.8s`, total `7.4s`.

# 14. Manual Verification

- Decode live token xác nhận issuer/client/subject/role đúng cấu hình.
- Gửi forged `X-User-ID`/`X-Role-Code` cùng bearer; Kong/backend vẫn derive identity từ token.
- Restart Gateway khi browser đang mở; banner offline xuất hiện rồi tự ẩn sau reconnect.
- Login hai lần chỉ còn một server session active; logout đưa active count về `0`.
- Runtime `config.js` trả đúng Gateway/WebSocket URL và explicit demo flag.
- Rebuild/recreate Execution, Gateway, Kiosk UI và Kong; health/log cuối không có fatal/panic/migration error.

# 15. Cleanup

Declared `8`, Executed `8`, Passed `8`, Failed `0`, Skipped `0`.

| Dữ liệu | Final |
| --- | ---: |
| Canonical Work Orders | 2 |
| Canonical operations | 8 |
| Phase 04 Work Orders | 0 |
| Phase 05 Work Orders | 0 |
| Active terminal sessions | 0 |
| Phase 04 Gateway queue | 0 |
| Phase 05 Gateway queue | 0 |
| Isolated Phase 06 schemas | 0 |

# 16. Acceptance Criteria

Declared `8`, Executed `8`, Passed `8`, Failed `0`, Skipped `0`.

Protected routes, verified REST/WebSocket identity, non-authoritative browser role headers, reconnect/refetch, reliable queue drain, server logout, configurable runtime URLs và Phase 05 regression đều pass.

# 17. Known Issues

- Kiosk Gateway và Kiosk UI chưa khai báo Docker `HEALTHCHECK`; HTTP health/root đều trả `200`.
- Schema Registry vẫn log compatibility warning `409` cho một số legacy schema; service, outbox và event integration đều pass.
- Demo credentials được expose trong static runtime config khi explicit demo flag bật; production deployment phải đặt flag `false` và bỏ username/password.

# 18. Risks

- Trusted issuer allowlist phải được cập nhật khi public Keycloak hostname đổi; issuer ngoài allowlist sẽ bị từ chối an toàn.
- RS256 public key trong Kong declarative consumer cần rotation/redeploy đồng bộ với Keycloak; backend JWKS tự refresh mỗi 5 phút.
- Client route guard chỉ phục vụ UX; security boundary thật nằm tại Kong/backend và không phụ thuộc browser decode.

# 19. Rollback

Redeploy image/config trước Phase 06 cho UI, Gateway, Execution và Kong. Unique active-session index tương thích với code mới; rollback Gateway về code cho phép parallel login có thể gặp constraint, vì vậy rollback phải giữ single-session behavior hoặc dùng migration rollback được phê duyệt. Không xóa session/event history.

# 20. Artifacts

Evidence root:

```text
artifacts/kiosk-demo-job-card/phase-06/KIOSK-DEMO-PHASE06-20260803T125500Z/
```

Gồm `baseline.txt`, `changes.txt`, `build.txt`, `api.txt`, `event-websocket.txt`, `browser.txt`, `cleanup.txt`, `acceptance.txt` và screenshot Phase 04/05/06.

# 21. Next Phase Inputs

- Dùng verified subject và terminal session hiện tại làm trust boundary cho Phase 07.
- Giữ Kiosk command aliases riêng để MES Console không phụ thuộc Kiosk session.
- Tắt explicit demo credentials trong mọi production profile.
- Không thay đổi Print Station/manual routing đã được xác nhận.

# 22. Final Gate

```text
KIOSK_DEMO_PHASE_06_PASSED_READY_FOR_PHASE_07
```

Không tự động bắt đầu Phase 07.
