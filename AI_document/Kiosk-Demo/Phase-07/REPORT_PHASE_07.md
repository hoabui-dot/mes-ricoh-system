# Kiosk Demo Job Card - Báo cáo Phase 07

Phase: `07`  
Run ID: `20260803T1706Z`  
Ngày: `2026-08-03`  
Trạng thái cuối: `PASSED`

# 1. Executive Summary

Phase 07 đã tạo bộ seed và lệnh chuẩn bị Demo Kiosk xác định, lặp lại an toàn. Hai kịch bản success và failure/retry được tạo hoàn toàn qua API Work Order, planning, allocation, strict approval và execution start. Mỗi Work Order xuất hiện đúng một card tổng hợp, có ba Job Card thủ công theo thứ tự và một công đoạn packing chỉ đọc do Print Station sở hữu.

Seed, prepare, verify và cleanup đều chạy hai lần thành công. Canonical ready-to-run certification hoàn tất `9/9` bước. Trạng thái cuối không còn Work Order, session, allocation, reservation, outbox, Gateway queue hoặc test event.

# 2. Entry Gate

Đã xác nhận [REPORT_PHASE_06.md](../Phase-06/REPORT_PHASE_06.md) chứa `KIOSK_DEMO_PHASE_06_PASSED_READY_FOR_PHASE_07`.

# 3. Scope

Đã thực hiện terminal/operator context, dispatch policy, reason catalog, production/resource prerequisites, success/failure fixtures, bốn repository commands, idempotency, cleanup, API verification và Playwright. Không mô phỏng thiết bị in vật lý và không lưu mutable Work Order trong canonical base seed.

# 4. Sources Inspected

- `PROMPT_PHASE_07(1).md`, master implementation rules, report Phase 06 và report template.
- Kiosk UI list/detail/auth/socket, Gateway terminal/session/queue/WebSocket, Execution creation/read model/state machine.
- Master Data production version/routing/resource/reason seed.
- Kong, Keycloak operator, Kafka/outbox, Print Station binding, Docker Compose, canonical certification và test suites.

# 5. Runtime Environment

| Thành phần | Trạng thái cuối | Image |
| --- | --- | --- |
| Master Data | healthy | `sha256:e40b094d...` |
| MES Execution | healthy | `sha256:63648638...` |
| Kiosk Gateway | running | `sha256:1fbe47a4...` |
| Kiosk UI | running, HTTP root OK | `sha256:4c3506eb...` |
| Kong | healthy | `sha256:8735a1e4...` |

# 6. Baseline

Canonical reset xác nhận `0` Work Order/session/allocation/reservation. `KIOSK-DEMO-01` trước đây có nguy cơ giữ site/work-center ID cũ sau reseed; async creation workflow cũng chưa chuyển `dispatch_mode`, nên Work Order có thể bị route theo `WORK_CENTER` thay vì shared demo kiosk.

# 7. Implementation

## 7.1 Frontend

Không đổi production UI trong Phase 07. Thêm Playwright kiểm tra UI thật hiển thị đúng hai card, ba manual Job Card mỗi WO và khu Print Station chỉ đọc.

## 7.2 Backend

Async creation workflow chuẩn hóa, allowlist và truyền `DEMO_SHARED_KIOSK` vào `CreateWOInput`; mode mặc định vẫn là `WORK_CENTER`. Thêm unit test cho mode hợp lệ và mode không hợp lệ.

## 7.3 API

Thêm `prepare:kiosk-demo:success`, `prepare:kiosk-demo:failure`, `verify:kiosk-demo`, `cleanup:kiosk-demo`. Prepare dùng API create workflow, candidates, allocation, revalidation, strict approval và start execution; không insert runtime WO trực tiếp.

## 7.4 Kafka and Outbox

Verifier kiểm tra Gateway queue có `2` message với `2` event ID duy nhất. Cleanup xóa chính xác queue/test event của fixture. Browser không publish Kafka và không có optimistic production success.

## 7.5 WebSocket and Gateway

Canonical seed upsert `KIOSK-DEMO-01` vào site `SITE-KZ3` và work center binding chuẩn. Login operator thật, bearer REST, gateway restart và WebSocket reconnect được regression bằng Phase 06.

## 7.6 Database and Migration

Không thêm hoặc sửa migration. Cleanup child-first bổ sung `wo_operation_execution_history`. Final cross-database audit bằng truy vấn read-only, ngoại trừ exact cleanup test event đã biết.

## 7.7 Seed and Fixtures

Seed thêm `KIOSK-DEMO-EXECUTION-FAIL` loại `ExecutionFailure` và `KIOSK-DEMO-ABORT` loại `Abort`; cả hai Released. Routing chuẩn giữ ba manual operation `BINDING -> TEST5IN1 -> AIRTEST`, sau đó `PACKING` thuộc Print Station.

# 8. Files Changed

- `scripts/kiosk-demo-phase07.mjs`
- `scripts/seed-mes-canonical-dataset.mjs`
- `scripts/verify-mes-canonical-seed.mjs`
- `scripts/cleanup-mes-resource-planning-e2e.mjs`
- `services/mes-master-data-service/src/infrastructure/db/seed.ts`
- `services/mes-execution-service/internal/infrastructure/http/creation_workflow.go`
- `services/mes-execution-service/internal/infrastructure/http/creation_workflow_dispatch_test.go`
- `e2e/kiosk/phase07-canonical-preparation.spec.ts`
- `package.json`

# 9. Architecture Verification

| Guardrail | Kết quả |
| --- | --- |
| MES Execution authoritative | PASS |
| API-driven runtime preparation | PASS |
| Một list card cho một WO | PASS |
| Print Station ngoài manual Kiosk | PASS |
| Persist trước outbox publication | PASS |
| Demo routing không đổi production routing | PASS |
| Không sửa applied migration | PASS |
| Không mandatory skip | PASS |

# 10. Static and Build Results

Declared `7`, Executed `7`, Passed `7`, Failed `0`, Skipped `0`.

Docker build Master Data/Execution, Kiosk typecheck/build, Master Data `6/6` tests, Execution all-package tests, Gateway all-package tests và `git diff --check` đều pass. Một invocation Vitest ban đầu dùng nhầm flag Jest `--runInBand`; runner từ chối trước khi chạy test, sau đó native command pass `6/6`.

# 11. API Integration Results

Declared `12`, Executed `12`, Passed `12`, Failed `0`, Skipped `0`: seed `2/2`, prepare success `2/2`, prepare failure `2/2`, verify final `2/2`, cleanup `2/2`, post-cleanup verify `1/1`, certification `1/1`.

Hai prepare replay trả lại cùng workflow/WO. Hai verify đều pass `25/25` check: `2` grouped cards, `3` manual jobs mỗi card, Work Center/Workstation đầy đủ, predecessor `[[],[10],[20]]`, reason catalog đúng, `0` session, `8` allocation và `8` complete reservation sets.

# 12. Kafka and WebSocket Results

Declared `5`, Executed `5`, Passed `5`, Failed `0`, Skipped `0`. Queue uniqueness, exact cleanup, Phase 04 realtime, Phase 05 command synchronization và Phase 06 authenticated reconnect đều pass. Schema Registry vẫn có warning compatibility `409` đã biết; service, outbox và tests không lỗi.

# 13. Browser E2E Results

Declared `4`, Executed `4`, Passed `4`, Failed `0`, Skipped `0` trong final runs.

- Phase 07 canonical prepared UI: `1/1`, `7.2s`.
- Phase 04 grouped/realtime/locales: `1/1`, `7.3s`.
- Phase 05 authoritative commands/print exclusion: `1/1`, `35.5s`.
- Phase 06 auth/reconnect/logout: `1/1`, `9.3s`.

Hai lần chạy Phase 07 trung gian thất bại do selector strict-mode trùng text, không phải lỗi sản phẩm; test harness được sửa rồi pass trên cùng dữ liệu.

# 14. Manual Verification

Đã kiểm tra Docker image/health/log, API envelopes, DB reservation dimensions, operator login/logout, hai screenshot chi tiết WO, terminal canonical context và final cross-database counts.

# 15. Cleanup

Declared `8`, Executed `8`, Passed `8`, Failed `0`, Skipped `0`.

| Dữ liệu cuối | Count |
| --- | ---: |
| Work Orders | 0 |
| Execution sessions | 0 |
| Allocations | 0 |
| Reservations | 0 |
| Execution outbox | 0 |
| Active terminal sessions | 0 |
| Gateway queue | 0 |
| Generated test events | 0 |

# 16. Acceptance Criteria

Declared `8`, Executed `8`, Passed `8`, Failed `0`, Skipped `0`. Bốn command hoạt động, mỗi WO chỉ có một grouped card, manual operations đầy đủ, print bị loại khỏi manual actions, không cần setup tay, mọi bước idempotent và canonical certification pass.

# 17. Known Issues

- Kiosk Gateway và Kiosk UI chưa có Docker healthcheck; process chạy và UI root trả HTTP thành công.
- Schema Registry ghi warning `409` cho legacy schema compatibility; không ảnh hưởng Phase 07.

# 18. Risks

Canonical seed Phase 10 tái tạo một số resource ID; việc upsert terminal context sau mỗi seed là bắt buộc để tránh stale binding. Cleanup command chỉ được phép chạy với safety guard local/test và deterministic idempotency keys.

# 19. Rollback

Gỡ bốn package commands và script Phase 07, bỏ hai reason-code upsert/terminal reconciliation, rồi redeploy hai backend image trước Phase 07. Không cần rollback migration. Canonical reset/seed khôi phục base state.

# 20. Artifacts

Evidence root: `artifacts/kiosk-demo-job-card/phase-07/20260803T1706Z/`. Có baseline, changes, build, API, event/WebSocket, browser, cleanup, acceptance, JSON của từng repeat run, canonical certification và hai screenshot.

# 21. Next Phase Inputs

- Success fixture key: `KIOSK-DEMO-PHASE07-SUCCESS-V1`.
- Failure fixture key: `KIOSK-DEMO-PHASE07-FAILURE-V1`.
- Terminal/operator: `KIOSK-DEMO-01` / `operator01`.
- Phase 08 phải tự gọi prepare command; canonical final state hiện không chứa mutable WO.
- Không bắt đầu Phase 08 trong lần chạy này.

# 22. Final Gate

```text
KIOSK_DEMO_PHASE_07_PASSED_READY_FOR_PHASE_08
```
