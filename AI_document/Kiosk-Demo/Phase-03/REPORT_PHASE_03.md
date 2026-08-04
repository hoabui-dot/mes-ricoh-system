# Kiosk Demo Job Card - Báo cáo Phase 03

Phase: `03`  
Run ID: `KIOSK-DEMO-PHASE03-20260803T090534Z`  
Ngày: `2026-08-03`  
Trạng thái cuối: `PASSED`

# 1. Executive Summary

Phase 03 đã cung cấp read model gom nhóm dành riêng cho Demo Kiosk. Danh sách trả đúng một dòng cho mỗi Work Order; detail trả mỗi manual operation đúng một Job Card; Print Station chỉ xuất hiện trong vùng read-only riêng.

Backend là nguồn sự thật cho số lượng theo trạng thái, tiến độ, resource allocation, active/last session, failure context, blocker và action eligibility. Kiosk UI đã chuyển sang endpoint terminal-scoped, phục hồi active session đúng theo card đang chọn và không còn hiển thị production WO từ global list.

Execution, Gateway và Kiosk UI đã build/redeploy bằng Docker Compose. Unit/integration, API, compatibility, WebSocket, Playwright và cleanup đều pass.

# 2. Entry Gate

Gate Phase 02 được xác nhận:

```text
KIOSK_DEMO_PHASE_02_PASSED_READY_FOR_PHASE_03
```

# 3. Scope

Đã thực hiện:

- typed grouped list/detail contracts;
- terminal và `DEMO_SHARED_KIOSK` scope;
- pagination ổn định;
- mọi manual operation thành một Job Card duy nhất;
- Print Station tách khỏi manual cards;
- counts/progress có quy tắc loại trừ lẫn nhau;
- resource, active/last session, confirmation, failure, blocker và action eligibility;
- additive Kiosk endpoints và legacy MES Console regression;
- UI authoritative refetch, cache eviction, grouped list/detail rendering;
- Docker build/redeploy, browser thật và exact cleanup.

Không thay đổi command/state-machine hoặc Print Station command flow. Không thêm migration vì projection đọc trực tiếp state hiện có.

# 4. Sources Inspected

- `AI_document/kiosk-workstation/PROMPT_PHASE_03(1).md`
- `AI_document/kiosk-workstation/KIOSK_DEMO_JOB_CARD_IMPLEMENTATION_RULES.md`
- `AI_document/kiosk-workstation/REPORT_TEMPLATE(1).md`
- `AI_document/Kiosk-Demo/Phase-02/REPORT_PHASE_02.md`
- `AI_document/MOM_PLATFORM_KIOSK_OPERATOR_UI_SERVICE_FLOW.md`
- Execution router, Work Order/session/confirmation/failure/allocation/print models
- Kiosk list/detail/cache/socket consumers
- Gateway auth/WebSocket/event tests, Docker Compose và live PostgreSQL

# 5. Runtime Environment

| Thành phần | Kết quả cuối |
| --- | --- |
| `mes-execution-service` | running, Docker healthy, HTTP 200 |
| `mes-kiosk-gateway-service` | running, HTTP 200 |
| `kiosk-operator-ui` | running, HTTP 200 |
| Execution DB | canonical `2 WO / 8 operations`, không còn fixture |
| Chromium | Playwright headless thật, login qua Keycloak |

Final images:

- Execution: `sha256:841f6709bdf006ecc372ad4d2096773b26381491bf14e26474c5a2ea9325e31d`
- Gateway: `sha256:11f27943730869fda6910f0bedee0ad4b0f75b2601cde01fa9a78caf14a88c2f`
- Kiosk UI: `sha256:7851a8767f9b4655d51140cfeffbf6752a256e84f970751517ae17ffb1d8c17a`

# 6. Baseline

| Dữ liệu/hành vi | Baseline |
| --- | ---: |
| Work Orders | 2 |
| Operations | 8 |
| Demo Work Orders | 0 |
| Grouped Kiosk API | không có |
| Kiosk list source | global Work Order API |
| Print/manual detail separation | không có |

# 7. Implementation

## 7.1 Frontend

- WO list gọi terminal-scoped grouped API và xóa cache cũ trước khi lưu snapshot mới.
- Một card UI tương ứng một WO; hiển thị counts và overall progress.
- Detail dùng `job_cards`; chọn card đồng thời chuyển đúng `active_session` của card đó.
- Complete/abort/start tuân theo `action_eligibility`; không còn session giả.
- Hiển thị resource, active session, failure, blocker đã Việt hóa và read-only print context.
- Realtime event/reconnect chỉ kích hoạt authoritative refetch.

## 7.2 Backend

- `KioskWorkOrderSummary`, `KioskJobCard`, `KioskPrintOperation` và các context typed rõ ràng.
- Read-only repeatable-read transaction tạo snapshot nhất quán.
- Manual counts dùng một trạng thái hiển thị loại trừ lẫn nhau: waiting, ready, in progress, completed, failed hoặc blocked.
- Overall progress tính cả automatic print operation; manual progress được trả riêng nên không báo hoàn thành toàn WO khi print còn chờ.
- Active session chỉ phục hồi theo đúng terminal; failure gần nhất lấy từ execution history.
- Eligibility dựa trên WO/operation state, predecessor, committed allocation và session hiện hành.

## 7.3 API

```text
GET /api/mes/execution/kiosk/terminals/:terminalRef/work-orders
GET /api/mes/execution/kiosk/terminals/:terminalRef/work-orders/:id
```

Sai terminal trả `403`. Production WO hoặc WO ngoài demo scope trả `404`. Existing `/api/mes/execution/work-orders` list/detail giữ nguyên cho MES Console.

## 7.4 Kafka and Outbox

Phase 03 là read-only projection, không thêm event/topic/outbox write. Execution event/outbox regression và Gateway consumer integration đều pass. Probe Kafka mutation mới được skip có chủ đích vì không có event contract mới.

## 7.5 WebSocket and Gateway

Không thay đổi relay contract Phase 02. Gateway WebSocket integration pass; Playwright login thật nhận `auth_ack`, banner connecting/offline biến mất và UI refetch terminal-scoped API.

## 7.6 Database and Migration

Không cần migration. Không sửa migration đã apply và không thay đổi history.

## 7.7 Seed and Fixtures

Canonical DB không có Demo WO. Runtime dùng deterministic `WO-PHASE03-RUNTIME-01`, ba manual operations, một print operation, allocation, confirmation và active session. Tất cả được xóa child-first bằng exact IDs sau browser test.

# 8. Files Changed

Phase 03 chính:

- `services/mes-execution-service/internal/domain/kiosk_read_model.go`
- `services/mes-execution-service/internal/application/usecase/kiosk_read_model.go`
- `services/mes-execution-service/internal/application/usecase/kiosk_read_model_integration_test.go`
- `services/mes-execution-service/internal/infrastructure/http/router.go`
- `services/mes-execution-service/internal/infrastructure/http/operation_state_machine_integration_test.go`
- `services/mes-execution-service/service.manifest.yaml`
- `services/kiosk-operator-ui/src/routes/WOListScreen.tsx`
- `services/kiosk-operator-ui/src/routes/OperationScreen.tsx`
- `services/kiosk-operator-ui/src/lib/db.ts`

# 9. Architecture Verification

| Guardrail | Kết quả |
| --- | --- |
| MES Execution vẫn sở hữu authoritative state | PASS |
| Kiosk không đọc trực tiếp database | PASS |
| Browser không publish Kafka | PASS |
| Chỉ exact Demo terminal được đọc projection | PASS |
| Chỉ `DEMO_SHARED_KIOSK` được hiển thị | PASS |
| Print không thành manual Job Card | PASS |
| Event payload không thay thế API refetch | PASS |
| Legacy MES Console API không bị thay đổi | PASS |
| Không migration/destructive schema change | PASS |

# 10. Static and Build Results

Declared `10`, Executed `10`, Passed `10`, Failed `0`, Skipped `0`.

Execution unit/integration, Gateway unit/integration, UI typecheck/build, ba Docker builds và `git diff --check` đều pass. Vite build `1532` modules.

# 11. API Integration Results

Declared `13`, Executed `13`, Passed `13`, Failed `0`, Skipped `0`.

Đã pass toàn bộ mandatory cases: grouping, manual uniqueness, print separation, counts, progress, active session, failure, eligibility/blockers, scope, pagination, refresh consistency và MES Console compatibility.

Runtime fixture trả `3` manual cards, `1` read-only print context, counts `completed=1/in_progress=1/blocked=1`, overall progress `25%`, manual progress `33.33%`. Wrong terminal là `403`; production detail là `404`.

# 12. Kafka and WebSocket Results

Kafka/event: Declared `3`, Executed `2`, Passed `2`, Failed `0`, Skipped `1` read-only mutation probe.

WebSocket: Declared `3`, Executed `3`, Passed `3`, Failed `0`, Skipped `0`.

# 13. Browser E2E Results

Declared `9`, Executed `9`, Passed `9`, Failed `0`, Skipped `0`.

Playwright Chromium xác nhận login thật, một grouped row, counts/progress, production isolation, `3/3` manual cards, print context riêng, active session/resources, blocker Việt hóa, eligibility và terminal-scoped request.

Screenshot: `kiosk-grouped-job-cards.png`.

# 14. Manual Verification

- Kiểm tra trực quan screenshot: không overlap, card và action ổn định.
- Kiểm tra service manifest có hai endpoint mới.
- Kiểm tra repeated detail response giống nhau khi bỏ `projection_at`.
- Kiểm tra final logs không có fatal, panic hoặc migration startup error.
- Kiểm tra empty grouped list vẫn trả HTTP 200 sau cleanup.

# 15. Cleanup

Declared `6`, Executed `6`, Passed `6`, Failed `0`, Skipped `0`.

| Dữ liệu | Final |
| --- | ---: |
| Work Orders | 2 |
| Operations | 8 |
| Demo Work Orders | 0 |
| Phase 03 Work Orders | 0 |
| Phase 03 Sessions | 0 |
| Phase 03 read-model resources | 0 |

# 16. Acceptance Criteria

Declared `10`, Executed `10`, Passed `10`, Failed `0`, Skipped `0`.

Tất cả tiêu chí grouping, completeness, print isolation, session recovery, authoritative state/action, pagination/scope, compatibility, deploy/browser và cleanup đều pass.

# 17. Known Issues

- Canonical dataset hiện chưa có Demo Work Order; sau cleanup grouped list đúng contract nhưng rỗng. Seed/readiness phase phải tạo WO với explicit `DEMO_SHARED_KIOSK`.
- Gateway và Kiosk UI chưa khai báo Docker `HEALTHCHECK`; HTTP health/root đều pass.
- Operation screen cũ chưa được tái cấu trúc i18n toàn diện cho EN/JA/KO. Read model giữ nguyên localized maps và VI là mặc định; full visual localization thuộc phase UI tiếp theo.

# 18. Risks

- Unknown blocker code sẽ fallback về technical code để không che mất nguyên nhân; dictionary cần mở rộng khi state machine thêm blocker mới.
- List hiện lấy tối đa 50 WO trong UI dù backend hỗ trợ pagination đầy đủ; pagination control trực quan thuộc phase UI tiếp theo.

# 19. Rollback

Redeploy images trước Phase 03 và cho Kiosk UI quay lại legacy reads nếu cần. Không có migration để rollback. Hai endpoint mới là additive; rollback không được xóa dữ liệu Work Order/session/history.

# 20. Artifacts

Evidence root:

`artifacts/kiosk-demo-job-card/phase-03/KIOSK-DEMO-PHASE03-20260803T090534Z/`

Có đủ 10 JSON bắt buộc và screenshot; không chứa token, PIN hoặc secret.

# 21. Next Phase Inputs

Phase 04 phải dùng trực tiếp grouped list/detail contract, `display_state`, `action_eligibility`, localized resource maps, active/last session và read-only `print_operations`. Không quay lại global list hoặc suy diễn trạng thái từ event payload.

# 22. Final Gate

Entry Gate: `PASSED`  
Implementation: `PASSED`  
Mandatory API acceptance: `13/13 PASSED`  
Build/API/Kafka/WebSocket/Browser/Cleanup: `PASSED`  
Phase 04 authorization: `GRANTED`

KIOSK_DEMO_PHASE_03_PASSED_READY_FOR_PHASE_04
