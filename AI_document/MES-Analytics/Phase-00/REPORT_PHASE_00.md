# MES Analytics — Báo cáo Phase 00

Phase: `00`  
Run ID: `20260808T092758Z`  
Ngày: `2026-08-08`  
Status: `PASS — MES_ANALYTICS_PHASE_00_READY_FOR_PHASE_01`

# 1. Tóm tắt

Đã hoàn tất source audit và tạo baseline dùng chung cho các phase sau. Phase này chỉ audit/thiết kế, không thêm API, SQL runtime hoặc UI dashboard.

Kết luận chính:

- Execution đã có dữ liệu nguồn đủ cho phần lớn WO, sản lượng, scrap, operation, failure/retry/abort, allocation, reservation, labor, material projection và print job analytics.
- Master Data có dữ liệu readiness/configuration nhưng chưa có analytics aggregation API riêng.
- Traceability có label/genealogy detail API và bảng nguồn, nhưng chưa có aggregate analytics API có bounded date range.
- MES Console chưa có route analytics. TanStack Query và TanStack Table đã có; Apache ECharts chưa có trong dependency.
- OEE, on-time delivery, machine availability phần trăm và một số cycle/capacity KPI chưa có nguồn authoritative đầy đủ; đã đánh dấu unsupported/proxy, không được hiển thị như KPI chính thức.

# 2. Entry Gate

| Kiểm tra | Declared | Executed | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|---:|
| Đọc GLOBAL_RULES/README/Phase 00 prompt/report template | 1 | 1 | 1 | 0 | 0 |
| Đọc architecture/UI context | 1 | 1 | 1 | 0 | 0 |
| Audit Execution routes/schema/use cases | 1 | 1 | 1 | 0 | 0 |
| Audit Master Data routes/schema | 1 | 1 | 1 | 0 | 0 |
| Audit Traceability routes/schema | 1 | 1 | 1 | 0 | 0 |
| Audit MES Console routes/dependencies/query client | 1 | 1 | 1 | 0 | 0 |

# 3. Phạm vi

Đã kiểm tra đúng scope: MES Execution, MES Master Data, MES Traceability, MES Console, migrations/schema, API routes, seed/test entry points và frontend dependencies. Không quét WMS/PDA/QMS implementation ngoài các boundary đã được architecture context xác định.

# 4. Source đã kiểm tra

Source map đầy đủ nằm tại:

`artifacts/mes-analytics/phase-00/20260808T092758Z/source-map.json`

Các nguồn quan trọng gồm `AI_CONTEXT.md`, `UI_AI_CONTEXT.md`, Execution router/use cases/migrations, Master Data router/schema, Traceability router/migration, `mes-console/src/App.tsx`, `Sidebar.tsx`, `queryClient.ts`, `masterDataApi.ts`, `package.json`, seed và regression scripts.

# 5. Baseline dữ liệu

| Owner | Bảng/nguồn chính | Kết quả audit |
|---|---|---|
| Execution | `wo_header`, `wo_operation`, `operation_confirmation`, `execution_session`, `wo_operation_execution_history` | Có thể triển khai WO/operation/execution KPI server-side |
| Execution | `wo_resource_allocation`, `wo_capacity_reservation`, audit/idempotency | Có thể triển khai allocation/resource audit; capacity denominator cần contract |
| Execution | `wo_material_requirement`, `wo_material_inventory_state`, `material_consumption` | Có thể hiển thị MES/WMS-projected readiness, không tính WMS on-hand |
| Execution | `wo_print_job`, attempts/events | Có thể triển khai print status/success/latency/failure |
| Master Data | PV/line/WC/workstation/equipment/unit/capability/calendar/standard/skill/employee/shift | Có thể kiểm tra readiness aggregate sau khi thêm owner API |
| Traceability | `label_instance`, `genealogy_event`, policies/templates/rules | Có nguồn dữ liệu; thiếu aggregate API |

# 6. Metric decisions

Catalog đầy đủ nằm tại:

`AI_document/MES-Analytics/ANALYTICS_BASELINE_AND_METRIC_CATALOG.md`

Artifact machine-readable:

`artifacts/mes-analytics/phase-00/20260808T092758Z/metric-catalog.json`

Các công thức đã chốt tối thiểu:

- `Scrap Rate = Scrap / NULLIF(Good + Scrap, 0)`.
- `Completion Rate = SUM(Good) / NULLIF(SUM(Planned), 0)`; cần ghi rõ đây là sản lượng xác nhận so với sản lượng kế hoạch.
- `Execution Duration = ended_at - started_at` trên execution session hoàn tất.
- `Print Success Rate = completed jobs / total jobs`.
- Fallback/Primary/Backup chỉ được công bố chính thức sau khi API có contract role từ line evaluation persisted data; không suy đoán role bằng tên/code ở frontend.

# 7. API/Data contract decisions

Gap map: `artifacts/mes-analytics/phase-00/20260808T092758Z/api-gap-map.json`.

Phase 01 cần thêm bounded owner endpoints:

```text
GET /api/mes/execution/analytics/overview
GET /api/mes/execution/analytics/work-orders
GET /api/mes/execution/analytics/lines
GET /api/mes/execution/analytics/operations
GET /api/mes/execution/analytics/resources
GET /api/mes/execution/analytics/materials
GET /api/mes/execution/analytics/print
```

Phase 02 cần owner endpoints cho Master Data readiness và Traceability labels/genealogy. Không có endpoint nào được phép JOIN database khác service.

# 8. UI route contract

Route plan: `artifacts/mes-analytics/phase-00/ui-route-plan.json`.

Đã chốt các route:

```text
/analytics
/analytics/production
/analytics/lines-resources
/analytics/execution-quality
/analytics/materials-traceability
/analytics/print-system
```

Overview sẽ compose nhiều owner API ở MES Console. Charts chỉ tóm tắt; report tables là nơi điều tra và phải có pagination, sorting, filter, loading, empty, error và drill-down.

# 9. Unsupported/proxy metrics

Artifact: `artifacts/mes-analytics/phase-00/20260808T092758Z/unsupported-metrics.json`.

Đã xác định:

- `OEE`: unsupported, vì chưa có đủ authoritative Availability/Performance/Quality inputs.
- `ON_TIME_DELIVERY`: unsupported, vì chưa có committed promised delivery và finish timestamp authoritative.
- Machine availability percentage: unsupported với semantics hiện tại.
- Capacity utilization: proxy only, vì có reservation numerator nhưng chưa có denominator availability được phê duyệt.
- Actual cycle time variance: proxy/gap, cần contract về session-to-operation duration.
- Traceability aggregate và Master Data readiness aggregate: API gap.

# 10. Frontend/dependency evidence

`services/mes-console/package.json` đã có React, TypeScript, TanStack Query và TanStack Table. Chưa có Apache ECharts. Phase 03 được phép thêm `echarts` và một wrapper React được phê duyệt, bọc trong `AnalyticsChartCard`; không thêm chart library thứ hai.

# 11. Tests và verification

| Test/evidence | Declared | Executed | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|---:|
| Node/JSON artifact validation | 4 | 4 | 4 | 0 | 0 |
| Source route/schema inspection | 4 | 4 | 4 | 0 | 0 |
| Dashboard code implementation tests | 0 | 0 | 0 | 0 | 0 |
| Browser analytics E2E | 0 | 0 | 0 | 0 | 0 |

Phase 00 không yêu cầu dashboard implementation hoặc browser test. Không có mandatory test bị bỏ qua trong scope audit; các test UI/backend analytics chưa declared ở phase này vì chưa có implementation.

# 12. Query/performance evidence

Chưa chạy analytics query vì chưa có analytics endpoint. Contract đã yêu cầu bounded date predicates, server aggregation, pagination và tránh N+1. Phase 01 phải bổ sung query plan evidence cho endpoint mới.

# 13. i18n/accessibility evidence

Đã chốt VI là default, hỗ trợ EN/JA/KO. Raw enum/key không được render. Chart phải có title, legend, tooltip, unit, empty state và table fallback/accessibility text.

# 14. Regression

Không chạy full MES regression vì Phase 00 là audit/design-only và global rule yêu cầu targeted tests trước. Các regression entry points đã được đưa vào source map cho phase triển khai.

# 15. Known issues và risks

- Line role Primary/Backup chưa có endpoint aggregate ổn định cho dashboard; Phase 01 cần chốt response contract dựa trên persisted evaluation.
- Capacity denominator chưa authoritative; không được gọi reservation load là Capacity Utilization nếu chưa ghi rõ proxy.
- Traceability detail API chưa đủ cho report pagination/aggregate.
- Print Station có thể offline; print dashboard phải phân biệt không có job, station offline và job failed.

# 16. Artifacts

```text
AI_document/MES-Analytics/ANALYTICS_BASELINE_AND_METRIC_CATALOG.md
AI_document/MES-Analytics/Phase-00/REPORT_PHASE_00.md
artifacts/mes-analytics/phase-00/20260808T092758Z/source-map.json
artifacts/mes-analytics/phase-00/20260808T092758Z/metric-catalog.json
artifacts/mes-analytics/phase-00/20260808T092758Z/api-gap-map.json
artifacts/mes-analytics/phase-00/20260808T092758Z/ui-route-plan.json
artifacts/mes-analytics/phase-00/20260808T092758Z/unsupported-metrics.json
```

# 17. Next Phase Inputs

Phase 01 chỉ đọc `GLOBAL_RULES.md`, baseline catalog này, report này và source-map. Phase 01 triển khai Execution analytics APIs trước, bắt đầu từ `overview`, `work-orders`, `lines`, `operations`, `resources`, `materials`, `print`; không tự động bắt đầu Phase 02.

# 18. Final Gate

Đạt tất cả acceptance criteria của Phase 00:

- `all core metrics have source ownership`: PASS;
- `formulas are explicit`: PASS;
- `no cross-service DB query proposed`: PASS;
- `unsupported metrics identified`: PASS;
- `final API ownership defined`: PASS;
- `dashboard/report contract defined`: PASS;
- `source-map sufficient for later phases`: PASS.

Success token: `MES_ANALYTICS_PHASE_00_READY_FOR_PHASE_01`
