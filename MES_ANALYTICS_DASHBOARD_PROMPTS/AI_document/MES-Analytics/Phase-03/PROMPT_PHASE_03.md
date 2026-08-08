# Phase 03 — Analytics Frontend Foundation and Overview Dashboard

Version: 1.0  
Previous gate: `MES_ANALYTICS_PHASE_02_READY_FOR_PHASE_03`  
Required report language: Vietnamese  

---

# 1. Goal

Build the MES Console analytics shell and the complete Overview page.

Use:

```text
Apache ECharts
TanStack Query
TanStack Table/shared table components
existing MES Console UI system
```

Read only:

```text
GLOBAL_RULES.md
ANALYTICS_BASELINE_AND_METRIC_CATALOG.md
Phase-01/02 API contracts
MES Console source files listed in source-map.json
```

---

# 2. Dependencies

Add the approved ECharts package and minimal React wrapper strategy.

Avoid unnecessary dashboard libraries.

Do not add a second chart library.

---

# 3. Shared Analytics Components

Create reusable:

```text
AnalyticsFilterBar
AnalyticsKpiCard
AnalyticsChartCard
AnalyticsLegend
AnalyticsEmptyState
AnalyticsErrorState
AnalyticsDrilldownDrawer
AnalyticsReportTable
```

Use existing shared components when suitable.

---

# 4. Global Filter Model

Implement:

```text
date range
site
line
shift
work center
item/revision
WO status
Primary/Backup
```

Only expose filters supported by the active widget/API.

Use a bounded default range.

Synchronize important filters with URL/search params when consistent with current Console patterns.

---

# 5. Overview Page

Implement at minimum:

## KPI cards

```text
Active WO
Completed
Blocked
Planned Qty
Good Qty
Scrap Qty
Completion Rate
Scrap Rate
Backup Used
Resource Hold
Material Blocked
```

## Charts

```text
Planned vs Actual Production Trend
WO Status Distribution
Primary vs Backup vs ResourceHold
Top Blocking Reasons
Top Bottleneck Operations
```

## Primary report

Add the Work Order Performance Report preview/table with drill-down to Work Order Detail.

---

# 6. UX Rules

- chart summaries must be understandable by non-technical users;
- business labels first, raw codes second;
- no raw enums;
- tooltips show formula-relevant values;
- clear empty states;
- clear units;
- no misleading `0%` when denominator is absent;
- use responsive desktop/tablet layout.

---

# 7. Tests

Run:

- typecheck;
- build;
- component tests where available;
- query/filter tests;
- chart empty/error/loading tests;
- URL filter behavior;
- Work Order drill-down;
- VI/EN/JA/KO smoke;
- accessibility smoke;
- real Playwright Overview flow.

---

# 8. Report

Create:

```text
AI_document/MES-Analytics/Phase-03/REPORT_PHASE_03.md
```

Artifacts:

```text
overview-screenshots.json
frontend-contract-evidence.json
playwright-results.json
```

---

# 9. Acceptance

- ECharts integrated once;
- shared analytics foundation exists;
- Overview metrics match backend;
- filters work;
- drill-down works;
- no frontend KPI recomputation;
- build and Playwright pass.

Success:

```text
MES_ANALYTICS_PHASE_03_READY_FOR_PHASE_04
```
