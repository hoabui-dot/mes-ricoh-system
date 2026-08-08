# Báo cáo Phase 01 - Execution Analytics API

## Kết quả

- Trạng thái: `PASS — MES_ANALYTICS_PHASE_01_EXECUTION_APIS_READY`
- Phạm vi: bảy endpoint analytics thuộc `mes-execution-service`.
- Khoảng thời gian: mặc định 30 ngày gần nhất; tối đa 366 ngày; `date_from` và `date_to` dùng `YYYY-MM-DD`, trong đó ngày kết thúc là exclusive sau khi chuẩn hóa.
- Phân trang: endpoint work orders giới hạn `page_size` tối đa 200 và dùng allow-list cho sort column/direction.
- Bảo mật truy vấn: các giá trị người dùng đều là query parameters có bind variables; sort column dùng allow-list, không nối trực tiếp giá trị tự do.

## Endpoint đã triển khai

| Endpoint | Nội dung |
|---|---|
| `/api/mes/execution/analytics/overview` | KPI WO, sản lượng kế hoạch/good/scrap, fallback, resource hold, status distribution |
| `/api/mes/execution/analytics/work-orders` | Bảng WO có filter, search, sort, pagination |
| `/api/mes/execution/analytics/lines` | Tổng hợp theo production line |
| `/api/mes/execution/analytics/operations` | Tổng hợp theo operation |
| `/api/mes/execution/analytics/resources` | Tổng hợp allocation theo source và validation |
| `/api/mes/execution/analytics/materials` | Tổng hợp readiness vật tư |
| `/api/mes/execution/analytics/print` | Job, attempts và latency in |

## Kiểm thử

- `go test ./internal/infrastructure/http ./internal/application/usecase`: PASS.
- Smoke test sau rebuild Docker: cả 7 endpoint trả HTTP 200 với dataset hiện tại đang rỗng.
- Date range ngược trả HTTP 400 với `ANALYTICS_INVALID_DATE_RANGE`.
- Docker rebuild/redeploy MES: PASS; execution service khởi động bình thường.

## Hạn chế đã ghi nhận

Dataset seed hiện tại sau cleanup không có WO nên smoke test mới xác nhận contract và SQL runtime, chưa xác nhận số liệu khác 0. OEE, on-time delivery, machine availability percent và actual cycle time chưa được phát hành vì Phase 00 xác định owner schema hiện tại chưa đủ dữ liệu chuẩn.

## Artifact

Run ID: `20260808T093915Z`

- `artifacts/mes-analytics/phase-01/20260808T093915Z/execution-api-contract.json`
- `artifacts/mes-analytics/phase-01/20260808T093915Z/execution-metric-evidence.json`
- `artifacts/mes-analytics/phase-01/20260808T093915Z/query-plan-evidence.json`
- `artifacts/mes-analytics/phase-01/20260808T093915Z/test-results.json`
