# Báo cáo Phase 06 - Full MES Analytics Certification

Phase: `06`  
Run ID: `20260808T101500Z`  
Date: `2026-08-08`  
Status: `NOT_CERTIFIED`

## 1. Executive Summary

Đã hoàn tất implementation và Docker redeploy cho analytics API/UI, nhưng chưa thể cấp chứng nhận cuối. Lý do là regression two-line hiện tại dừng ở scenario 05: sau khi test làm mất capability Primary, line selector vẫn trả Primary READY thay vì chọn Backup. Browser analytics smoke sau lần sửa strict locator cũng không kết thúc trong timeout của môi trường hiện tại.

## 2. Gates và Counts

| Gate | Declared | Executed | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|---:|
| Phase 06 UAT two-line regression | 12 | 5 | 4 | 1 | 7 |
| Analytics Playwright smoke | 1 | 1 | 0 | 1 timeout | 0 |
| Owner API gateway smoke | 3 | 3 | 3 | 0 | 0 |
| Backend/frontend build checks | 5 | 5 | 5 | 0 | 0 |

## 3. Inventory đã triển khai

- API Execution: overview, work orders, lines, operations, resources, materials, print.
- API Master Data: readiness aggregate.
- API Traceability: overview, labels phân trang, genealogy grouping.
- UI route `/analytics` và deep-dive routes `/analytics/work-orders`, `/analytics/resources`, `/analytics/operations`, `/analytics/materials`, `/analytics/print`, `/analytics/readiness`.
- ECharts, TanStack Query, shared filter/KPI/chart/empty/error/drawer/report components.

## 4. Formula và Data Evidence

Các KPI được lấy từ owner API, không tính lại từ raw data trong browser. Empty canonical dataset xác nhận các contract trả zero/array rỗng ổn định. Không thể hoàn tất đối chiếu non-zero cho Good/Scrap, Fallback, Resource Hold, Print Success Rate và traceability labels vì full UAT dừng trước khi tạo đủ fixture runtime.

## 5. Performance và Boundary

- Date range analytics bounded tối đa 366 ngày.
- Work Order và label report có server pagination.
- Đã thêm migration `000033_analytics_read_indexes.up.sql` và đăng ký bootstrap.
- Không có cross-service database join, WMS inventory hoặc QMS metric giả.

## 6. Blocker cần xử lý trước certification

1. Điều tra scenario 05 trong `test-mes-two-line-full-flow-phase11.mjs`: sau mutation capability Primary, line selector cần loại Primary hoặc phải cập nhật expectation nếu business rule cho phép candidate Primary còn lại.
2. Chạy lại đủ 12 scenario, tạo dataset non-zero, xác nhận cleanup không còn WO/allocation/reservation/print job tạm.
3. Chạy lại authenticated Playwright analytics với browser timeout đã xác định nguyên nhân.
4. Đối chiếu P0 metrics với owner DB trên dataset non-zero.

## 7. Final Gate

`MES_ANALYTICS_DASHBOARD_NOT_CERTIFIED`
