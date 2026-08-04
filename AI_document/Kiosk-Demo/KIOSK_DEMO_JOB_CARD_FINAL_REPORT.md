# Báo cáo chứng nhận cuối - Kiosk Demo Job Card

Ngày chứng nhận: `2026-08-04`  
Run ID cuối: `20260804T0207Z`  
Trạng thái: `KIOSK_DEMO_JOB_CARD_FLOW_CERTIFIED`

# 1. Kết luận

Luồng Kiosk Demo Job Card từ Phase 00 đến Phase 08 đã hoàn tất và được chứng nhận bằng source hiện tại, database thật, authenticated API, transactional outbox, Kafka, Kiosk Gateway, WebSocket, Kiosk UI và MES Console.

Luồng được chứng nhận:

```text
API prepare Work Order
-> một grouped card tại KIOSK-DEMO-01
-> ba manual Job Card đúng predecessor
-> Start / Complete / Fail / Retry / Abort
-> MES Execution persist authoritative state
-> outbox / Kafka / Gateway / WebSocket
-> Kiosk và MES Console hội tụ
-> Print Station vẫn là dependency bên ngoài
-> exact cleanup
```

# 2. Chuỗi Phase

| Phase | Kết quả |
| --- | --- |
| 00 - Audit và domain contract | PASS |
| 01 - Failure state machine | PASS |
| 02 - Dispatch, Kafka, realtime relay | PASS |
| 03 - Grouped read APIs | PASS |
| 04 - Grouped Kiosk UI | PASS |
| 05 - Manual commands và MES sync | PASS |
| 06 - Authentication/session/reliability | PASS |
| 07 - Canonical seed/preparation | PASS |
| 08 - Full E2E certification | CERTIFIED |

# 3. Business Flow Đã Chứng Nhận

Success WO có đúng một card, ba manual operations và một packing Print Station read-only. Ba manual operations Start/Complete tuần tự và MES Console hiển thị trạng thái tương ứng.

Failure WO thực hiện `Start -> Fail -> Paused`, successor bị chặn, reason/comment được persist, Retry mở lại operation và flow tiếp tục. Abort tạo history riêng, không tạo production confirmation và không bị đếm là Fail.

Refresh browser khi operation InProgress khôi phục active session thật. Khi Gateway ngừng hoạt động, event vẫn persist/publish; sau restart, Gateway consume event, WebSocket reconnect và Kiosk refetch về trạng thái authoritative.

# 4. Security

- Route/API không token trả `401`.
- Terminal ngoài demo scope trả `403`.
- Browser-forged user/role headers không thay verified token identity.
- REST và WebSocket dùng verified token/session.
- Logout đóng terminal session và xóa browser state.

# 5. Print Station Boundary

Packing operation không xuất hiện trong manual Job Cards và không có Start/Complete/Fail/Abort/Retry button. Sau manual completion, operation ở `DispatchQueued`, WO ở `InProgress` chờ authoritative Print Station result.

Không tạo fake print result. Vì Phase 08 quy định physical print nằm ngoài scope, dependency hold này không làm giảm chứng nhận của Demo Kiosk manual flow.

# 6. Test Summary

- Phase 08 mandatory acceptance: `19/19` pass, `0` failed, `0` skipped.
- Final Playwright regression: `5/5` pass.
- Canonical seed verification: `48/48` pass.
- Master Data tests: `6/6` pass.
- MES Execution unit/tagged integration: PASS.
- Gateway auth/event/WebSocket integration: PASS.
- Kiosk và MES Console production builds: PASS.

# 7. Final Cleanup

Final counts đều bằng `0`: Work Orders, sessions, confirmations, failure/retry/abort history, allocations, reservations, Execution outbox, active terminal sessions, Gateway queue và consumed test events. Canonical master/read-model seed vẫn được giữ và verify.

# 8. Evidence

- Phase 08 report: `AI_document/Kiosk-Demo/Phase-08/REPORT_PHASE_08.md`
- Final evidence: `artifacts/kiosk-demo-job-card/phase-08/20260804T0207Z/`
- Success screenshot: `canonical-success.png`
- Failure/retry/abort screenshot: `canonical-failure-retry-abort.png`

# 9. Operational Notes

- Luôn build MES Console với stable public Keycloak/API URL.
- Dùng Phase 07 commands để prepare/verify/cleanup demo data.
- Không chạy cleanup ngoài local/test safety guard.
- Không dùng Kiosk để hoàn tất Print Station operation.

# 10. Final Status

```text
KIOSK_DEMO_JOB_CARD_FLOW_CERTIFIED
```
