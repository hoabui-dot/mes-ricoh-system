# Báo cáo redesign MES Analytics UI

## 1. Tóm tắt
Đã chuyển Production Analytics từ một màn hình KPI phẳng sang workspace nhiều tab theo câu hỏi nghiệp vụ. UI dùng ECharts làm thư viện biểu đồ duy nhất, truy vấn các analytics API hiện hữu và giữ filter trong URL để chuyển tab không mất ngữ cảnh.

## 2. Vấn đề UI cũ
Màn hình cũ đặt quá nhiều KPI ngang hàng, thiếu xu hướng, ranking, composition và đường điều tra. Deep-dive là một route generic nên người dùng không phân biệt được sản xuất, nguồn lực, chất lượng, vật tư và hệ thống.

## 3. Business questions
Người quản lý có thể trả lời: đang sản xuất hay bị chặn, xu hướng Good/Scrap ra sao, line nào dùng Backup, nguyên nhân blocking nào đứng đầu, công đoạn nào cần điều tra, vật tư đang Ready/Waiting/Shortage và print station nào có lỗi.

## 4. Chart-selection rules
Line chart dùng cho dữ liệu theo thời gian; column/bar dùng cho so sánh nhóm; horizontal bar dùng cho ranking và nhãn dài; donut chỉ dùng cho composition snapshot; heatmap và funnel chỉ được dùng khi owner API có đủ hai chiều dữ liệu hoặc lifecycle tuần tự. Không dùng gauge và không dùng pie cho trend/ranking.

## 5. Information architecture mới
Workspace gồm: `Overview`, `Production & Work Orders`, `Lines & Resources`, `Execution & Quality`, `Materials & Traceability`, `Print & System`. Các child route là `/analytics/production`, `/analytics/lines-resources`, `/analytics/execution-quality`, `/analytics/materials-traceability`, `/analytics/print-system`.

## 6. Overview
Giữ 6 KPI trọng tâm: WO đang hoạt động, WO hoàn thành, WO bị chặn, Good Quantity, Scrap Rate và Fallback Rate proxy. Biểu đồ chính là Planned/Good/Scrap theo thời gian; biểu đồ phụ là Primary/Backup/Resource Hold; Top blocking reasons dùng horizontal bar và mở tab Production khi click.

## 7. Production & Work Orders
Tab này tải overview, work-order report và line aggregate. Có KPI vòng đời, trend line và bảng Work Order để mở chi tiết exact record. Query `page_size` được ghép qua `URLSearchParams`, không nối chuỗi endpoint sai.

## 8. Lines & Resources
Tab hiển thị KPI fallback/resource hold, ranking line bằng bar chart và báo cáo resource aggregate. Dữ liệu capacity/utilization chỉ hiển thị khi owner API trả về; không dựng heatmap giả từ dữ liệu chưa có contract.

## 9. Execution & Quality
Tab hiển thị Good, Scrap và Scrap Rate, dùng trend backend `production_trend` và bảng operation aggregate. Không gọi operation count là cycle-time variance khi backend chưa trả công thức cycle-time variance.

## 10. Materials & Traceability
Tab tách readiness vật tư khỏi traceability. Các trạng thái Ready/Waiting/Shortage được lấy từ materials API; traceability overview giữ KPI nhãn/genealogy. Không hiển thị authoritative WMS on-hand và không tính shortage ở React.

## 11. Print & System
Tab hiển thị print jobs/failure và readiness master data trong panel riêng. Released Lines, Released Production Versions, Missing Capabilities, Missing Calendars và Missing Standards không bị trộn vào KPI sản xuất.

## 12. Filter UX
Date range, site, line và WO status là filter chính; search WO/Item nằm trong More filters. Filter được lưu trong query string, có active-filter count và Reset. Date range bounded theo contract backend. Site và production line hiện được tải từ master-data API bằng `SelectBase`; option hiển thị tên bản địa hóa ở dòng đầu và code ở dòng phụ nhỏ, nghiêng, có màu. Production line được lọc theo site đã chọn; người dùng không nhập UUID thô.

## 13. Drill-down
Overview problem chart và report action mở Production tab; Work Order row mở Work Order Detail. Work Order cần theo dõi và các báo cáo điều tra aggregate đều dùng `BaseDataTable` với pagination chung 10/25/50 dòng, sorting framework và empty state. Drill-down theo reason/resource cell còn phụ thuộc report endpoint có filter tương ứng; không tạo dataset frontend mới.

## 14. ECharts integration
`AnalyticsChartCard` sở hữu lifecycle ECharts: init sau khi có dữ liệu, set option, resize theo window, đăng ký click, dispose khi unmount. Card có loading/empty/error state, tooltip/legend và `role=img` với aria label. Palette dùng semantic success/warning/danger/neutral/primary.

## 15. Backend contract gaps
Đã bổ sung `production_trend`, `selection_breakdown`, `blocking_reasons` và `fallback_rate_proxy` vào execution overview; đây là aggregate server-side, không phải frontend formula. Heatmap capacity, authoritative primary/backup selection, cycle-time variance, material shortage item ranking và full print Pareto chưa được thêm vì catalog/owner contract hiện tại chưa đủ. Không tạo Data Warehouse hoặc truy cập PostgreSQL từ browser.

## 16. Files changed
Các vùng chính: `services/mes-console/src/routes/analytics/AnalyticsPageShell.tsx`, `AnalyticsOverviewScreen.tsx`, `AnalyticsDeepDiveScreen.tsx`, `services/mes-console/src/components/analytics/AnalyticsComponents.tsx`, `services/mes-console/src/App.tsx`, `services/mes-console/src/lib/queryKeys.ts`, `services/mes-console/src/i18n.ts`, `services/mes-execution-service/internal/infrastructure/http/analytics.go` và `e2e/analytics/phase06-analytics.spec.ts`.

## 17. i18n
Đã thêm key analytics cho VI/EN/JA/KO gồm tab, filter, empty/error/loading, reset và navigation label. VI vẫn là ngôn ngữ mặc định. Enum status trong report Work Order được chuyển sang nhãn nghiệp vụ ở các trạng thái đã có trong catalog; aggregate field chưa có catalog cần bổ sung mapping trước khi mở rộng UI.

## 18. Accessibility
Tab navigation có `role=tablist`/`role=tab` và `aria-selected`; chart có accessible role/description; filter dùng label; status không chỉ dựa vào màu; bảng giữ fallback exact values. Playwright smoke đã kiểm tra keyboard-compatible controls và layout không tràn ngang.

## 19. Performance
TanStack Query dùng query key theo tab và filter, `staleTime=30s`, chỉ fetch tab hiện tại. ECharts không tạo instance khi empty/loading và dispose đầy đủ. Backend range tối đa 366 ngày; report list có page size bounded.

Khi filter làm chart chuyển giữa loading/empty/data, chart host DOM được giữ ổn định và chỉ overlay trạng thái; cách này tránh lifecycle race `NotFoundError/removeChild` giữa React và ECharts.

## 20. Browser UAT
Declared: 10 scenarios theo prompt.

Executed: 1 Playwright scenario bao phủ Overview, chọn Site/Production Line từ option thật, filter persistence/reset, 5 child routes, empty/structured state, 404 guard và responsive overflow; API smoke cho overview, lines, resources, operations, materials, print và master-data readiness.

Passed: Playwright `1/1`; analytics API smoke `7/7` HTTP 200 sau khi sửa trend parameter binding; MES Console typecheck/build pass.

Failed: 0 trong scope redesign.

Skipped: VI/EN/JA/KO visual snapshot riêng từng locale, vì repository chưa có analytics locale matrix test; heatmap/funnel UAT vì owner contract chưa cung cấp dữ liệu đủ chiều.

## 21. Regression
Passed: execution analytics Go tests, MES Console typecheck, MES Console production build, real backend API smoke và real browser Playwright trên container vừa rebuild.

Không chạy lại full MES two-line WO certification trong task này; regression đó thuộc Phase 06 trước đây và vẫn phải theo dõi độc lập, đặc biệt scenario backup selection đã được ghi nhận trong report phase trước.

## 22. Known issues
Một số deep-tab report headers vẫn được sinh từ field aggregate backend và cần bổ sung catalog mapping nếu muốn toàn bộ header dịch hoàn toàn theo ngôn ngữ. Heatmap, funnel và Pareto đầy đủ cần backend owner contracts tương ứng.

## Seed history analytics
`scripts/mes-phase10-reset-seed-verify.mjs --reset-seed --without-print` hiện cleanup prefix `ANL-SEED-*` trước khi seed lại. Mỗi lần seed tạo 366 Work Order execution-owned từ `2026-04-01` đến `2026-07-31` trên ba line, gồm Completed/Released/Paused/ResourceHold, Primary/Backup/Resource Hold và operation confirmation Good/Scrap. Audit trigger được bypass ở transaction fixture để giữ ngày lịch sử; dữ liệu production thật không dùng cơ chế này.

## 23. Final verdict
MES_ANALYTICS_UI_REDESIGN_COMPLETE
