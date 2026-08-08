# MES Analytics Baseline and Metric Catalog

Version: `1.0`
Audit run: `20260808T092758Z`
Status: `READY_FOR_PHASE_01`

## 1. Phạm vi và nguyên tắc

Analytics đọc dữ liệu trực tiếp từ database/API của owner service. Không tạo data warehouse, CDC, ETL hoặc database analytics dùng chung. MES Console chỉ ghép kết quả từ các API owner service.

Work Order là trục phân tích chính. Mọi truy vấn phải có khoảng thời gian hữu hạn; mặc định đề xuất là `Today`, `Last 7 Days`, `Last 30 Days`, `Custom`.

## 2. Ownership baseline

| Owner | Dữ liệu được phép đọc | Không được làm |
|---|---|---|
| MES Execution | `wo_*`, `execution_session`, `operation_confirmation`, `material_consumption`, execution read models, allocations, reservations, print jobs | JOIN trực tiếp database Master Data/Traceability |
| MES Master Data | `md_*`: PV, line, work center, workstation, equipment/unit, capability, calendar, standard, employee/skill/shift, print-station runtime | Tính lại trạng thái runtime WO từ Execution |
| MES Traceability | `label_instance`, `genealogy_event`, traceability policies/templates/rules | Đọc database Execution trực tiếp |
| MES Console | Parallel API composition, shared filters, charts, tables, drill-down | Kết nối PostgreSQL hoặc định nghĩa lại KPI |
| WMS | Inventory on-hand/availability authority | MES tự tính tồn kho/WMS on-hand |

## 3. Metric catalog

Formula conventions: `NULLIF` is required for zero denominators. A metric with no matching rows returns numeric zero and a separate `has_data=false` or empty breakdown where useful. Date basis is explicit per row.

| Code | Tên tiếng Việt / câu hỏi | Owner | Source tables/fields | Formula và date basis | Filters | Drill-down | Status |
|---|---|---|---|---|---|---|---|
| `WO_ACTIVE` | WO đang hoạt động | Execution | `wo_header.status`, `created_at` | `COUNT(*)` status in `Released,InProgress,Paused`; created date | site,line,shift,PV,status | WO report | READY |
| `WO_COMPLETED` | Đã hoàn tất bao nhiêu WO | Execution | `wo_header.status,updated_at` | `COUNT(*)` status `Completed`; finish proxy `updated_at` until explicit finish field exists | common | WO report | READY_WITH_PROXY |
| `WO_BLOCKED` | WO đang bị chặn | Execution | `wo_header.status,line_selection_status,resource_hold_reason` | count `Paused` or hold status/reason; `updated_at` | line,reason | WO detail | READY_WITH_PROXY |
| `WO_PLANNED_QTY` | Sản lượng kế hoạch | Execution | `wo_header.quantity,created_at` | `SUM(quantity)` | common | WO report | READY |
| `GOOD_QTY` | Sản lượng đạt | Execution | `operation_confirmation.qty_good,confirmed_at` | `SUM(qty_good)` | WO,operation,line | operation report | READY |
| `SCRAP_QTY` | Sản lượng phế | Execution | `operation_confirmation.qty_scrap,confirmed_at` | `SUM(qty_scrap)` | WO,operation,reason | operation report | READY |
| `COMPLETION_RATE` | Tỷ lệ hoàn tất sản lượng | Execution | `wo_header.quantity`, confirmations | `SUM(good) / NULLIF(SUM(planned),0)`; confirmed date for actual | common | WO report | READY |
| `SCRAP_RATE` | Tỷ lệ phế | Execution | confirmations | `scrap / NULLIF(good + scrap,0)`; confirmed date | common | operation/quality report | READY |
| `WO_STATUS_DISTRIBUTION` | Phân bố trạng thái WO | Execution | `wo_header.status,created_at` | count by status | common | WO report | READY |
| `PRIMARY_SELECTED` | Chọn line chính | Execution | `wo_header.line_selection_mode,selected_production_line_id,fallback_reason` | count where selected line equals primary role in snapshot/evaluated result | PV,line,site | line selection report | GAP |
| `BACKUP_SELECTED` | Chọn line phụ | Execution | `wo_header.fallback_reason,selected_production_line_id` | count selected backup; role must come from persisted line evaluation | common | line selection report | GAP |
| `FALLBACK_RATE` | Tỷ lệ fallback | Execution | `wo_header.fallback_reason,line_selection_status` | backup-selected WO / selected WO | line,reason | line selection report | GAP |
| `RESOURCE_HOLD_RATE` | Tỷ lệ giữ vì resource | Execution | `wo_header.resource_hold_reason,status` | resource-hold WO / WO | common | readiness/WO detail | READY_WITH_PROXY |
| `MATERIAL_BLOCKED` | WO bị chặn vật tư | Execution | `wo_material_requirement.stock_check_status`, `wo_material_inventory_state.status` | count blocked/shortage/waiting | item,WO,status | material report | READY_WITH_WMS_BOUNDARY |
| `OPERATION_COMPLETED` | Công đoạn hoàn tất | Execution | `wo_operation.status,planned_start_at` | count `Finished` by status | operation,line,WO | operation report | READY |
| `OPERATION_FAILED` | Công đoạn lỗi | Execution | `wo_operation_execution_history.action,occurred_at` | count action `FAILED` | reason,operation,WO | failure Pareto | READY |
| `RETRY_COUNT` | Số lần retry | Execution | history action `RETRY_REQUESTED` | count by occurred date | operation,reason | failure detail | READY |
| `ABORT_COUNT` | Số lần hủy phiên | Execution | history action `ABORTED` | count by occurred date | operation,terminal | execution report | READY |
| `EXECUTION_DURATION` | Thời gian thực thi | Execution | `execution_session.started_at,ended_at,status` | `SUM(ended_at-started_at)` completed sessions | WO,operation,terminal | operation report | READY |
| `ACTUAL_CYCLE_TIME` | Cycle time thực tế | Execution | session duration, confirmation | completed session duration / confirmed qty where qty > 0 | operation,WO | operation report | GAP |
| `CYCLE_TIME_VARIANCE` | Sai lệch cycle time | Execution | actual duration + `wo_operation.standard_cycle_time_sec` | actual seconds - standard seconds; standard snapshot authoritative | operation,PV,line | bottleneck report | GAP |
| `CAPACITY_UTILIZATION` | Mức sử dụng năng lực | Execution | `wo_capacity_reservation.capacity_units,start_at,end_at,status` | reserved capacity / bounded available capacity; authoritative capacity denominator still needs contract | resource,line,shift | capacity report | GAP |
| `ALLOCATION_STATUS` | Tình trạng phân bổ resource | Execution | `wo_resource_allocation.status,validation_status,source` | count/group by statuses | resource,line,WO | allocation detail | READY |
| `REALLOCATION_COUNT` | Số lần đổi resource | Execution | allocation audit action/new/previous | count actions indicating replace/reallocate | resource,operation | resource report | READY |
| `CONSTRAINED_RESOURCES` | Resource bị nghẽn nhiều nhất | Execution | allocations/reservations validation warnings | group warning/block codes by resource | line,resource,reason | capacity report | READY_WITH_PROXY |
| `PRINT_TOTAL` | Tổng print job | Execution | `wo_print_job.created_at,status` | count jobs | station,WO,status | print report | READY |
| `PRINT_SUCCESS_RATE` | Tỷ lệ in thành công | Execution | `wo_print_job.status` | completed / total jobs | station,template | print report | READY |
| `PRINT_ATTEMPTS` | Số lần thử in | Execution | `wo_print_job.attempt_count`, attempts | sum attempts | station,reason | print report | READY |
| `PRINT_LATENCY` | Độ trễ in | Execution | print job dispatched/started/completed | `completed_at-dispatched_at` | station,template | print report | READY |
| `PRINT_FAILURE_REASONS` | Lý do in lỗi | Execution | `last_error_code,last_error_message`, attempts | group failure code | station,WO | print detail | READY |
| `MATERIAL_READINESS` | Trạng thái sẵn sàng vật tư | Execution | material requirement/inventory state | count by `required,ready,waiting,shortage,staged,issued,consumed` where persisted | item,WO,status | material report | READY_WITH_WMS_BOUNDARY |
| `LABEL_STATUS` | Nhãn đang dùng/đã tiêu thụ/phế | Traceability | `label_instance.status,created_at,updated_at` | count by status | item,site,WO | traceability report | GAP_API |
| `GENEALOGY_EVENTS` | Sự kiện genealogy | Traceability | `genealogy_event.occurred_at,relationship_type,wo_id` | count/group by relationship | WO,label,operation | genealogy drill-down | GAP_API |
| `RELEASED_PV` | PV đã release | Master Data | `md_production_version.lifecycle_status,effective_from/to` | count Released/effective at date | site,item | readiness report | GAP_API |
| `RELEASED_LINES` | Line đã release | Master Data | `md_production_line.lifecycle_status,active_flag` | count active/effective Released | site,area | readiness report | GAP_API |
| `AVAILABLE_MACHINE_UNITS` | Machine unit có thể lập kế hoạch | Master Data | `md_machine_unit.execution_status,active_flag,planning_resource_flag,physical_identity_status` | count Available + active + planning eligible + identified | site,work center | resource readiness | GAP_API |
| `MISSING_CAPABILITIES` | Thiếu capability | Master Data | `md_resource_capability`, routing/read model IDs | count required operation/resource pairs without active eligible capability | site,line,operation | readiness detail | GAP_API |
| `MISSING_CALENDARS` | Thiếu lịch resource | Master Data | `md_resource_calendar` | count required resource/date/shift pairs without effective availability | site,line,shift,date | readiness detail | GAP_API |
| `MISSING_STANDARDS` | Thiếu production standard | Master Data | `md_production_standard` | count routing operation/resource pairs without effective standard | PV,operation,line | readiness detail | GAP_API |
| `MISSING_SKILLS` | Thiếu skill/worker | Master Data | `md_operation_skill_requirement,md_employee_skill,md_employee_shift_schedule` | count required skill/work center/date pairs without matching active worker | WC,shift,date | readiness detail | GAP_API |

### Explicitly unsupported in current baseline

`OEE`, true on-time delivery, machine availability percentage, authoritative capacity denominator, and actual cycle time variance are not fully source-backed. They must not be displayed under those names until a later contract adds authoritative planned/available/finish inputs. Use `Execution Utilization`, `Cycle Time Proxy`, or `Capacity Reservation Load` only when the API labels the proxy explicitly.

## 4. Filter semantics

| Filter | Applies to | Semantics |
|---|---|---|
| date range | all analytics | Required bounded range; use source-specific date basis documented per metric |
| site | all owner APIs where persisted/projected | Exact site ID/code; no cross-site inference |
| production line | Execution | selected line/snapshot line; line role requires persisted evaluation contract |
| shift | Execution/Master Data | `shift_id` or schedule date/shift; not WO creation shift unless endpoint says so |
| work center/workstation/resource | Execution and Master Data | Exact committed/planned resource ID, not frontend name matching |
| item/revision/PV | Execution/Master Data | Exact persisted snapshot or released master record |
| WO status | Execution | Exact enum mapping, translated only in UI |
| Primary/Backup | Execution | Only after line role is resolved from authoritative evaluation data |
| operation | Execution/Master Data | `operation_id` plus code for display |

## 5. Dashboard contract

| Route/tab | Widgets | Primary API owner | Required drill-down |
|---|---|---|---|
| `/analytics` Overview | KPI strip, WO status, good/scrap, fallback/resource hold, throughput trend | Execution + parallel Master Data | WO performance |
| `/analytics/production` Production & Work Orders | lifecycle funnel, planned vs actual proxy, WO performance table | Execution | WO detail |
| `/analytics/lines-resources` Lines & Resources | primary/backup/fallback, line load, allocation status, constrained resources | Execution + Master Data readiness | line selection, allocation |
| `/analytics/execution-quality` Execution & Quality | operation states, failures/retries/aborts, scrap, cycle-time proxy, Pareto | Execution | operation/WO detail |
| `/analytics/materials-traceability` Materials & Traceability | material readiness, consumption, label status, genealogy | Execution + Traceability | requirement/label genealogy |
| `/analytics/print-system` Print & System | print status/success/latency/station failures, system health | Execution + Master Data print runtime | print job/station |

Every widget requires loading, empty, error, bounded-range indication, translated labels, and a table fallback where a business count is charted.

## 6. Chart and frontend decision

MES Console already uses React/TypeScript, `@tanstack/react-query`, and `@tanstack/react-table`. Apache ECharts is not present in `services/mes-console/package.json`; Phase 03 should add `echarts` and `echarts-for-react` (or a single approved ECharts wrapper) and isolate it behind `AnalyticsChartCard`. No second chart library is approved.

## 7. Phase 01 inputs

Phase 01 may read this catalog plus the exact files listed in `artifacts/mes-analytics/phase-00/20260808T092758Z/source-map.json`. It should implement Execution owner APIs first, preserve bounded date ranges, and resolve GAP metrics with explicit response contracts rather than silently fabricating values.
