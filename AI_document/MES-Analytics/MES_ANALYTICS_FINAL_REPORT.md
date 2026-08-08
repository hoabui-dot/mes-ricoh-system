# MES Analytics - Final Report

## Trạng thái

Implementation của Phase 00-05 đã hoàn tất và Phase 06 đã chạy kiểm tra cuối, nhưng dashboard chưa được certify do regression two-line và browser smoke blocker.

## API inventory

- Execution: `/api/mes/execution/analytics/{overview,work-orders,lines,operations,resources,materials,print}`.
- Master Data: `/api/mes/master-data/analytics/readiness`.
- Traceability: `/api/mes/traceability/analytics/{overview,labels,genealogy}`.

## Dashboard inventory

- Overview: `/analytics`.
- Deep dive: `/analytics/work-orders`, `/analytics/resources`, `/analytics/operations`, `/analytics/materials`, `/analytics/print`, `/analytics/readiness`.
- Biểu đồ dùng Apache ECharts; filter URL gồm ngày, site, line, status; bảng report dùng pagination backend.

## Metric inventory

Đã hỗ trợ: WO lifecycle/status, planned/good/scrap, completion/scrap rate, fallback/resource hold, line/operation/resource grouping, material readiness, print jobs/attempts/latency, master readiness, labels/lots/serials/genealogy.

Chưa hỗ trợ hoặc chưa đủ nguồn chuẩn: OEE, on-time delivery, machine availability percentage, actual cycle time variance đầy đủ và WMS on-hand.

## Verification summary

Build và owner API gateway smoke pass. Seed with-print pass tạo master data gồm worker, skill, shift, schedule, production versions và hai line. Full two-line regression chỉ pass 4/5 scenario đầu được thực thi; dừng ở scenario 05. Vì vậy không được khẳng định công thức non-zero hoặc UI full-flow đã khớp.

## Future BI boundary

Khi cần lịch sử lớn/OEE/BI, đề xuất warehouse/read model riêng sau khi có owner contract, không đưa cross-service join hoặc cache vào MES analytics runtime.

## Final status

`MES_ANALYTICS_DASHBOARD_NOT_CERTIFIED`
