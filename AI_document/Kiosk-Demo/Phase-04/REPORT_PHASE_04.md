# Kiosk Demo Job Card - Báo cáo Phase 04

Phase: `04`  
Run ID: `KIOSK-DEMO-PHASE04-20260803T095832Z`  
Ngày: `2026-08-03`  
Trạng thái cuối: `PASSED`

# 1. Executive Summary

Phase 04 đã hoàn thiện hai màn hình Kiosk chính: danh sách hiển thị đúng một card cho mỗi Work Order và detail hiển thị đồng thời mọi manual Job Card theo thứ tự routing. Mỗi card có line, Work Center, Workstation, resource, operator business identity, session, quantity, timestamp, failure, blocker và action eligibility do backend cung cấp.

Print Station nằm trong vùng read-only riêng và không có command thủ công. Realtime event chỉ làm invalidation/refetch dữ liệu authoritative. Offline cache có tuổi dữ liệu và khóa toàn bộ production action.

VI/EN/JA/KO, keyboard focus, touch target và tablet viewport đã pass bằng Chromium thật. Master Data, Execution và Kiosk UI đã rebuild/redeploy; database, outbox backfill, service health và exact cleanup đều pass.

# 2. Entry Gate

Gate Phase 03 được xác nhận:

```text
KIOSK_DEMO_PHASE_03_PASSED_READY_FOR_PHASE_04
```

# 3. Scope

Đã thực hiện:

- `/kiosk/:terminalId/wo-list` grouped theo WO;
- `/kiosk/:terminalId/wo/:woId` hiển thị đủ manual Job Cards;
- counts, progress, failure warning và last update;
- line, WC, WS, allocation, operator, session và quantity context;
- Print Station read-only tách biệt;
- loading, empty, error/retry, offline cache và realtime refetch;
- VI/EN/JA/KO, accessibility và tablet;
- UOM business code xuyên suốt Master Data event đến Kiosk API/UI;
- deterministic self-contained Playwright fixture và exact cleanup.

Không triển khai final Fail/Retry command behavior, manual Print Station command hoặc offline production command.

# 4. Sources Inspected

- `AI_document/kiosk-workstation/PROMPT_PHASE_04(1).md`
- `AI_document/kiosk-workstation/KIOSK_DEMO_JOB_CARD_IMPLEMENTATION_RULES.md`
- `AI_document/kiosk-workstation/REPORT_TEMPLATE(1).md`
- `AI_document/Kiosk-Demo/Phase-03/REPORT_PHASE_03.md`
- `AI_document/MOM_PLATFORM_KIOSK_OPERATOR_UI_SERVICE_FLOW.md`
- Kiosk UI routes, cache, socket context và i18n
- Execution Kiosk read model, session, confirmation, failure, allocation và print models
- Master Data Item Revision/UOM release contract, outbox và migration runner
- Gateway auth, Kafka consumer, reliable queue và WebSocket hub
- Docker Compose, PostgreSQL runtime, service logs và Playwright suites

# 5. Runtime Environment

| Thành phần | Kết quả cuối |
| --- | --- |
| `mes-master-data-service` | running, Docker healthy, HTTP 200 |
| `mes-execution-service` | running, Docker healthy, HTTP 200 |
| `mes-kiosk-gateway-service` | running, HTTP 200 |
| `kiosk-operator-ui` | running, HTTP 200 tại `http://localhost:13051` |
| Chromium | Playwright headless thật |
| Canonical DB | `2 WO / 8 operations / 0 demo WO` |

Final images:

- Master Data: `sha256:1cb7ad6911652e0585633cc6f6a2f610b365f67837a456b9a7a1848a30da991c`
- Execution: `sha256:fea5f0849f2180e8324624bb17a1d3c5bf1c01380383c0dbdec525948fb795c2`
- Gateway: `sha256:11f27943730869fda6910f0bedee0ad4b0f75b2601cde01fa9a78caf14a88c2f`
- Kiosk UI: `sha256:6dd10d1b86eda28c98c3ea15e33af0e9f69a02d66d9bdf9fafe3929c41956d0d`

# 6. Baseline

Phase 03 đã có grouped API nhưng UI chưa hoàn thiện toàn bộ projection, locale, state và tablet behavior của Phase 04. `uom_id` là UUID nội bộ duy nhất trong Kiosk response nên UI cũ giả định đơn vị `PCS`, không đúng với WO dùng `KG`, `M2` hoặc UOM khác.

# 7. Implementation

## 7.1 Frontend

- Một `<article>` cấp cao tương ứng đúng một WO.
- List hiển thị product, localized line, quantity + `uom_code`, WO state, đủ bảy count, failure warning, overall/manual progress và last update.
- Detail render mọi manual Job Card cùng lúc theo sequence; không cần chọn từng operation để thấy context.
- Mỗi card hiển thị localized operation, line, WC, WS, allocated resource, predecessor, operator code, terminal, session, quantity, planned/actual time, failure và backend-derived actions/blockers.
- UUID, raw enum, raw translation key và unknown technical blocker không được render.
- Print operation chỉ xuất hiện trong read-only band riêng.
- IndexedDB giữ nguyên grouped snapshot và `cached_at`; offline banner thể hiện tuổi dữ liệu và khóa command.
- Language selector hỗ trợ VI/EN/JA/KO; tất cả locale có `142/142` key explicit.
- Focus visible, labelled controls, keyboard Enter và touch target tối thiểu được kiểm tra.

## 7.2 Backend

- Bổ sung typed Kiosk list/detail contracts và presentation mapping.
- Session projection join `rm_employee` để trả `operator_code` và localized operator name; UI không dùng user UUID làm identity.
- Work Order projection join `rm_item_revision` để trả `uom_code` business-safe.
- Counts, progress, display state, blockers và action eligibility vẫn do MES Execution quyết định.

## 7.3 API

```text
GET /api/mes/execution/kiosk/terminals/:terminalRef/work-orders
GET /api/mes/execution/kiosk/terminals/:terminalRef/work-orders/:woId
```

Runtime response xác nhận `quantity=100`, `uom_code=PCS`, `5` manual cards, `1` print operation, counts `1 completed / 1 in_progress / 1 failed / 2 blocked`, overall `16.67%`, manual `20%`.

## 7.4 Kafka and Outbox

- `MES.MasterData.ItemRevisionReleased.v2` bổ sung `base_uom_id` và `base_uom_code` snapshot.
- Migration Master Data `0063_republish_item_revision_uom_snapshots` phát lại một lần các released Item Revision qua transactional outbox.
- `8/8` backfill events được publish; Execution projection có đủ `PCS`, `KG`, `M2` cho tám canonical revisions.
- Browser không publish Kafka. Playwright chỉ dùng Kafka test harness để phát event thật; UI nhận WebSocket rồi refetch API.

## 7.5 WebSocket and Gateway

- Socket giữ terminal scope và authenticated session flow của các phase trước.
- Dispatch/start/complete/fail/abort/WO-state events chỉ tăng refresh version; list/detail được tải lại từ Execution.
- Reliable receipt/queue được dọn exact theo prefix `phase04-ui-refresh-`.

## 7.6 Database and Migration

- Execution migration additive `000026_item_revision_uom_code_projection.up.sql` thêm nullable `rm_item_revision.base_uom_code`.
- Migration được đăng ký trong bootstrap runner và xác nhận có record trong `schema_migrations`.
- Master Data migration `0063` chỉ tạo outbox snapshot, không sửa history hoặc ownership.
- Không sửa migration đã apply và không có destructive schema operation.

## 7.7 Seed and Fixtures

- `e2e/kiosk/phase04-fixture.sql` tạo deterministic `WO-PHASE04-RUNTIME-01`, năm manual operations, một print operation, allocations, sessions, confirmation và failure history.
- Playwright `beforeAll/afterAll` tự setup/cleanup child-first.
- Fixture dùng business code `PCS`, `OPERATOR-PHASE04`, `WC-PHASE04-RUNTIME`, `WS-PHASE04-RUNTIME`, `EQ-PHASE04-RUNTIME`.

# 8. Files Changed

Các file Phase 04 chính:

- `services/kiosk-operator-ui/src/routes/WOListScreen.tsx`
- `services/kiosk-operator-ui/src/routes/OperationScreen.tsx`
- `services/kiosk-operator-ui/src/types/kiosk.ts`
- `services/kiosk-operator-ui/src/lib/db.ts`
- `services/kiosk-operator-ui/src/lib/presentation.ts`
- `services/kiosk-operator-ui/src/i18n.ts`
- `services/kiosk-operator-ui/src/components/LanguageSelect.tsx`
- `services/mes-execution-service/internal/application/usecase/kiosk_read_model.go`
- `services/mes-execution-service/internal/domain/kiosk_read_model.go`
- `services/mes-execution-service/internal/infrastructure/events/masterdata_consumer.go`
- `services/mes-execution-service/migrations/000026_item_revision_uom_code_projection.up.sql`
- `services/mes-master-data-service/src/infrastructure/http/master-data.router.ts`
- `services/mes-master-data-service/src/infrastructure/db/migrate.ts`
- `e2e/kiosk/phase04-grouped-ui.spec.ts`
- `e2e/kiosk/phase04-fixture.sql`
- `e2e/kiosk/phase04-cleanup.sql`

# 9. Architecture Verification

| Guardrail | Kết quả |
| --- | --- |
| MES Execution vẫn là authoritative state | PASS |
| Browser không đọc DB hoặc publish Kafka | PASS |
| Một list card là một WO | PASS |
| Detail chứa mọi non-print manual card | PASS |
| Print Station không actionable | PASS |
| Event payload không thay final authority | PASS |
| Demo routing không thay production routing | PASS |
| Không optimistic production success | PASS |
| Chỉ additive migration | PASS |
| Không mandatory test bị skip | PASS |

# 10. Static and Build Results

Declared `13`, Executed `13`, Passed `13`, Failed `0`, Skipped `0`.

Execution unit/integration, Gateway unit/integration, Master Data typecheck + `6/6` unit, Kiosk typecheck/build, ba Docker builds, locale parity và `git diff --check` đều pass. Vite build `1534` modules.

# 11. API Integration Results

Declared `9`, Executed `9`, Passed `9`, Failed `0`, Skipped `0`.

Grouping, counts, UOM code, năm manual cards, resource/operator identity, print separation, progress và post-cleanup empty response đều pass. Grouped API sau cleanup trả HTTP `200` với `data=[]`.

# 12. Kafka and WebSocket Results

Kafka/event: Declared `4`, Executed `4`, Passed `4`, Failed `0`, Skipped `0`.  
WebSocket: Declared `4`, Executed `4`, Passed `4`, Failed `0`, Skipped `0`.

Real Kafka event làm số request list tăng qua WebSocket invalidation. UOM backfill có `8 PUBLISHED`, Execution có `8` projection rows đã enrich.

# 13. Browser E2E Results

Declared `16`, Executed `16`, Passed `16`, Failed `0`, Skipped `0`.

Final Playwright Chromium pass `1/1` trong `7.6s`: one-card grouping, counts, five cards, WC/WS/resource/operator/failure, print read-only, loading, empty, error/retry, offline cache age, realtime, browser refresh, bốn locale, keyboard/focus/touch, tablet và không raw enum/UUID/key.

# 14. Manual Verification

- Kiểm tra trực quan hai screenshot: không overlap hoặc horizontal overflow; năm card và print band rõ ràng.
- List hiển thị đúng `100 PCS`, không dùng translated generic piece label.
- `000026` có trong Execution migration history.
- `0063` có trong Master Data migration history; `8/8` event đã publish.
- Final logs không có fatal/panic/migration error sau successful redeploy.
- Master Data và Execution HTTP health đều `200`.

# 15. Cleanup

Declared `8`, Executed `8`, Passed `8`, Failed `0`, Skipped `0`.

| Dữ liệu | Final |
| --- | ---: |
| Work Orders | 2 |
| Operations | 8 |
| Demo Work Orders | 0 |
| Phase 04 Work Orders | 0 |
| Phase 04 sessions/resources | 0 |
| Gateway Phase 04 receipts | 0 |
| Gateway Phase 04 queue rows | 0 |
| Grouped API | HTTP 200, empty |

# 16. Acceptance Criteria

Declared `7`, Executed `7`, Passed `7`, Failed `0`, Skipped `0`.

Tất cả tiêu chí one-WO card, full manual detail, non-actionable print, complete context, realtime/offline, four-language/accessibility và Phase 05 authorization đều pass.

# 17. Known Issues

- Kiosk UI và Gateway chưa khai báo Docker `HEALTHCHECK`; HTTP root/health đều pass.
- UI list dùng `page_size=50` và chưa có pagination control trực quan.
- Schema Registry vẫn ghi warning compatibility `409` cho một số schema legacy đã tồn tại; service tiếp tục healthy và event JSON/outbox flows đều pass.
- Một pre-final diagnostic run bị fail tại cleanup vì dùng tên bảng Gateway thiết kế cũ; test body đã pass. Tên bảng được sửa theo runtime schema và final acceptance run pass đầy đủ.

# 18. Risks

- Nếu thêm UOM mới nhưng release event producer bỏ `base_uom_code`, UI sẽ hiển thị localized `Not available` thay vì đoán sai đơn vị; contract test cần được giữ khi mở rộng event.
- Unknown backend enum/blocker được map sang safe localized unknown state; dictionary phải được cập nhật cùng state-machine contract mới.

# 19. Rollback

Rollback bằng cách redeploy images trước Phase 04. Cột nullable `base_uom_code` có thể giữ lại khi rollback vì additive và backward-compatible. Không xóa outbox/history đã publish; consumer cũ bỏ qua field mới. UI cũ không phụ thuộc field này.

# 20. Artifacts

Evidence root:

`artifacts/kiosk-demo-job-card/phase-04/KIOSK-DEMO-PHASE04-20260803T095832Z/`

Có đủ `baseline`, `changes`, `build`, `api`, `event`, `websocket`, `browser`, `cleanup`, `acceptance`, `manifest` và hai screenshot. Artifact không chứa token, PIN hoặc secret.

# 21. Next Phase Inputs

Phase 05 có thể dùng trực tiếp typed `action_eligibility`, active session, failure context và authoritative refetch đã hoàn thiện. Không được thêm command cho Print Station hoặc cho phép offline mutation. Final Fail/Retry command phải persist trước outbox và có idempotency/concurrency tests riêng.

# 22. Final Gate

Entry Gate: `PASSED`  
Implementation: `PASSED`  
Mandatory browser acceptance: `16/16 PASSED`  
Build/API/Kafka/WebSocket/Browser/Cleanup: `PASSED`  
Mandatory skips: `0`  
Phase 05 authorization: `GRANTED`

KIOSK_DEMO_PHASE_04_PASSED_READY_FOR_PHASE_05
