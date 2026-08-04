# Kiosk Demo Job Card - Báo cáo Phase 08

Phase: `08`  
Run ID: `20260804T0207Z`  
Ngày: `2026-08-04`  
Trạng thái cuối: `KIOSK_DEMO_JOB_CARD_FLOW_CERTIFIED`

# 1. Executive Summary

Phase 08 đã chứng nhận luồng Demo Kiosk Job Card hoàn chỉnh bằng backend, Kafka/outbox, Kiosk Gateway, WebSocket, Kiosk UI và MES Console thật. Hai Work Order canonical được tạo qua API: success quantity `2` và failure/retry quantity `3`.

Success WO hoàn tất tuần tự ba manual Job Card. Failure WO chứng minh `Start -> Fail -> Paused -> successor blocked -> Retry -> Complete`, sau đó chứng minh Abort không tạo confirmation hoặc failure. Khi Gateway bị dừng, một operation được Start qua MES Execution đã xác thực; sau khi Gateway khởi động lại, Kafka event được consume, WebSocket reconnect và Kiosk khôi phục active session authoritative.

Packing thuộc Print Station vẫn chỉ đọc, không có manual action và dừng ở `DispatchQueued`. WO giữ `InProgress` chờ dependency bên ngoài; Kiosk không giả lập kết quả in hoặc báo thành công lạc quan. Cleanup cuối đưa toàn bộ runtime/test residue về `0`.

# 2. Entry Gate

[REPORT_PHASE_07.md](../Phase-07/REPORT_PHASE_07.md) chứa đúng:

```text
KIOSK_DEMO_PHASE_07_PASSED_READY_FOR_PHASE_08
```

# 3. Scope

Đã thực hiện full static/build regression, canonical success UAT, failure/retry, abort, session refresh, Gateway outage/reconnect/queue drain, security, MES Console sync, bốn ngôn ngữ, accessibility smoke, Print Station exclusion, prior-phase regression và exact cleanup.

Không phát triển feature production mới, không thao tác Print Station bằng Kiosk và không phát fake physical print result.

# 4. Sources Inspected

- Master rules, README, Phase 08 prompt, report template và report Phase 07.
- Kiosk list/detail/auth/socket/offline cache và command code.
- MES Execution state machine, read model, creation workflow, outbox, print consumer và migrations.
- Kiosk Gateway auth, queue, event consumer, WebSocket hub và terminal session.
- MES Console Work Order detail/refetch, Kong, Keycloak, Docker Compose và canonical seed.
- Playwright Phase 04-07, Go unit/integration và canonical verification.

# 5. Runtime Environment

| Thành phần | Trạng thái cuối | Image |
| --- | --- | --- |
| MES Console | running, local SSO/API | `sha256:b907347c...` |
| MES Execution | healthy | `sha256:63648638...` |
| Master Data | healthy | `sha256:e40b094d...` |
| Kiosk Gateway | running | `sha256:1fbe47a4...` |
| Kiosk UI | running | `sha256:4c3506eb...` |
| Kong | healthy | `sha256:8735a1e4...` |

MES Console được rebuild/recreate với `VITE_KEYCLOAK_URL=http://localhost:18080` và `VITE_API_BASE_URL=http://localhost:18000` vì running image cũ còn trỏ tới Cloudflare hostname đã hết hiệu lực.

# 6. Baseline

Canonical baseline có `0` Work Order và đầy đủ terminal/operator/reason/resource/routing. Phase 08 prepare tạo:

- Success: `WO-20260804-0003`, 3 manual operations, quantity `2`.
- Failure: `WO-20260804-0004`, 3 manual operations, quantity `3`.
- Mỗi WO có một packing operation thuộc Print Station, read-only.

# 7. Implementation

## 7.1 Frontend

Không đổi production frontend. Thêm `phase08-full-certification.spec.ts` chạy Kiosk và MES Console thật, kiểm tra touch/keyboard, VI/EN/JA/KO, không lộ translation key và không horizontal overflow.

## 7.2 Backend

Không đổi production backend hoặc lifecycle contract. Tagged MES Execution integration kiểm tra start/confirm/fail/retry/abort, read API, security và event persistence.

## 7.3 API

Canonical WO được tạo bằng các command Phase 07. Mọi mutation đi qua authenticated Kiosk HTTP API. Test bảo mật xác nhận anonymous `401`, wrong terminal `403`; forged browser identity header không thay verified token identity.

## 7.4 Kafka and Outbox

Đã quan sát `39` event thuộc 11 loại trong hai WO, gồm Started `8`, Finished `6`, Failed `1`, RetryRequested `1`, Aborted `1` và WOStatusChanged `2`. Gateway đã consume `15` event liên quan trong thời gian UAT. Browser không publish Kafka.

## 7.5 WebSocket and Gateway

Test dừng Gateway khi browser vẫn mở, tạo OperationStarted qua MES Execution, sau đó restart Gateway. Kiosk chuyển offline, reconnect, nhận queued event/refetch và khôi phục đúng active session trước khi operator Abort.

## 7.6 Database and Migration

Không thêm hoặc sửa migration. Exact cleanup được tăng cường ở test fixture: capture Execution outbox event IDs trước khi xóa WO rồi xóa đúng consumed Gateway records kể cả queue message đã ACK.

## 7.7 Seed and Fixtures

Giữ nguyên canonical seed. Prepare/cleanup dùng deterministic idempotency keys và safety guards. Final canonical verification pass `48/48`.

# 8. Files Changed

Phase 08 chỉ thay test/evidence harness:

- `e2e/kiosk/phase08-full-certification.spec.ts`
- `scripts/kiosk-demo-phase07.mjs`
- `package.json`
- `AI_document/Kiosk-Demo/Phase-08/REPORT_PHASE_08.md`
- `AI_document/Kiosk-Demo/KIOSK_DEMO_JOB_CARD_FINAL_REPORT.md`
- `artifacts/kiosk-demo-job-card/phase-08/20260804T0207Z/`

# 9. Architecture Verification

| Guardrail | Kết quả |
| --- | --- |
| MES Execution authoritative | PASS |
| Browser không publish Kafka | PASS |
| Một card cho một Work Order | PASS |
| Detail có đủ manual Job Cards | PASS |
| Backend trả action eligibility/blockers | PASS |
| Print Station không có manual action | PASS |
| Persist trước outbox/Kafka | PASS |
| Kiosk và MES Console hội tụ | PASS |
| Không optimistic production success | PASS |
| Không sửa applied migration | PASS |

# 10. Static and Build Results

Declared `8`, Executed `8`, Passed `8`, Failed `0`, Skipped `0`.

- Kiosk typecheck/build: PASS, `1538` modules.
- MES Console typecheck/build: PASS, `2759` modules.
- MES Console local Docker rebuild: PASS.
- Master Data: `6/6` tests.
- MES Execution unit + tagged integration: PASS.
- Gateway auth/event/WebSocket tagged integration: PASS.
- Canonical verification: `48/48`.
- `git diff --check`: PASS.

# 11. API Integration Results

Declared `10`, Executed `10`, Passed `10`, Failed `0`, Skipped `0`.

API preparation, grouped read, start/complete, fail/pause, retry, abort, print exclusion, Console convergence và cleanup đều pass. Success có `3` confirmations; failure flow lưu đúng `1` FAILED history, `1` retry history, `1` failed session được bảo toàn và `1` ABORTED history.

# 12. Kafka and WebSocket Results

Event matrix: Declared `11`, Executed `11`, Passed `11`, Failed `0`, Skipped `0`.

WebSocket matrix: Declared `6`, Executed `6`, Passed `6`, Failed `0`, Skipped `0`. Authentication ack, outage detection, persisted event khi Gateway down, Kafka catch-up, reconnect/refetch và active-session recovery đều pass.

# 13. Browser E2E Results

Final runs: Declared `5`, Executed `5`, Passed `5`, Failed `0`, Skipped `0`.

| Test | Kết quả |
| --- | --- |
| Phase 08 canonical full certification | `1/1`, `40.4s` |
| Phase 07 canonical preparation | `1/1`, `6.9s` |
| Phase 06 auth/reliability | `1/1`, `8.2s` |
| Phase 05 manual commands | `1/1`, `29.9s` |
| Phase 04 grouped/realtime/locales/accessibility | `1/1`, `5.8s` |

Một lần chạy Phase 08 trung gian dừng trước production command do Console image còn external Keycloak URL và cleanup cast sai `event_id`; runtime config, test SQL và abandoned fixture đã được sửa/cleanup trước final run.

# 14. Manual Verification

- Success: ba operation `Finished`, packing `DispatchQueued`, `3` confirmation.
- Failure: WO `Paused`, first operation `ExecutionError`, successor blocked.
- Retry: operation trở lại Ready, start/complete thành công, failure session vẫn tồn tại trong lúc chứng nhận.
- Abort: `ABORTED=1`, `FAILED=0`, confirmation của attempt bị abort bằng `0`.
- MES Console hiển thị InProgress/Finished/ExecutionError đồng bộ với Kiosk.
- Bốn locale và keyboard focus pass; không có raw `kiosk.*` key.

# 15. Cleanup

Declared `10`, Executed `10`, Passed `10`, Failed `0`, Skipped `0`.

| Runtime/test table | Final |
| --- | ---: |
| Work Orders | 0 |
| Execution sessions | 0 |
| Confirmations | 0 |
| Failure/retry/abort history | 0 |
| Allocations | 0 |
| Reservations | 0 |
| Execution outbox | 0 |
| Active terminal sessions | 0 |
| Gateway queue | 0 |
| Consumed test events | 0 |

# 16. Acceptance Criteria

Declared `19`, Executed `19`, Passed `19`, Failed `0`, Skipped `0`. Tất cả acceptance criteria và mandatory tests của Phase 08 đã pass.

# 17. Known Issues

- Physical Print Station result không được mô phỏng. Packing giữ `DispatchQueued`; đây là dependency hold được prompt cho phép, không phải manual Kiosk failure.
- Kiosk Gateway/Kiosk UI chưa có Docker healthcheck; process và HTTP/WebSocket tests pass.
- Schema Registry còn compatibility warning `409` cho legacy schemas; event matrix và consumers pass.
- MES Console bundle có warning chunk lớn hơn `500 kB`; build vẫn pass.

# 18. Risks

- Production deployment phải cung cấp Keycloak/API public URL ổn định, không dùng tunnel hostname ngắn hạn.
- Final WO completion phụ thuộc Print Station authoritative result; Kiosk không được phép thay thế dependency này.
- Exact cleanup dựa trên deterministic keys và captured event IDs, chỉ được chạy trong local/test safety guard.

# 19. Rollback

Phase 08 không đổi production feature hay migration. Có thể rollback bằng cách gỡ Playwright spec/package command và cleanup event-ID enhancement. MES Console runtime rollback phải vẫn giữ public Keycloak/API URL có thể truy cập.

# 20. Artifacts

Evidence root:

```text
artifacts/kiosk-demo-job-card/phase-08/20260804T0207Z/
```

Có manifest, baseline, changes, build/API/event/WebSocket/browser/cleanup/acceptance, bảy final evidence JSON, canonical verification, command artifacts và hai screenshot.

# 21. Next Phase Inputs

Không có phase tiếp theo. Bộ command Phase 07 tiếp tục là cách chuẩn bị UAT lặp lại. Muốn chứng nhận completion toàn WO phải kết nối Print Station thật và quan sát authoritative print result, không thực hiện từ Kiosk.

# 22. Final Gate

```text
KIOSK_DEMO_JOB_CARD_FLOW_CERTIFIED
```
