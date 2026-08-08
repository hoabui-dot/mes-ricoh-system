# MES Analytics Dashboard — Global Execution Rules

Version: 1.0  
Target repository: `mes-ricoh-system`  
Mode: Operational analytics directly from current owner-service databases  
Primary UI: MES Console  
Chart library: Apache ECharts  
Server state: TanStack Query  
Tables: existing TanStack Table / shared MES Console table components  
Default language: VI; also support EN/JA/KO  
No Data Warehouse for this demo phase  

---

# 1. Final Goal

Build a production-grade demo analytics module without introducing a warehouse:

```text
MES operational databases
→ owner-service analytics APIs
→ MES Console analytics routes
→ ECharts + report tables + drill-down
```

The final user must be able to analyze:

```text
Work Orders
Production throughput
Primary/Backup line behavior
Resource and capacity
Operation bottlenecks
Good/Scrap
Failures and retries
Material readiness projection
Print performance
Traceability
Master-data readiness
```

The Work Order is the primary analytical axis.

---

# 2. Architecture Rules

## 2.1 Database ownership

Never:

```text
MES Console → PostgreSQL directly
Execution service → JOIN Master Data database
Analytics endpoint → cross-service database JOIN
Traceability service → read Execution database directly
```

Each service may aggregate only the database it owns.

Cross-domain dashboard composition happens in MES Console through parallel owner-service APIs.

## 2.2 No warehouse / CDC analytics

Do not introduce:

```text
Data Warehouse
ClickHouse
Elasticsearch analytics
ETL pipeline
CDC analytics
materialized cross-service analytics DB
```

unless a later approved phase explicitly changes scope.

This is an operational analytics demo.

## 2.3 Server-side aggregation

Do not fetch thousands of raw rows and calculate KPIs in React.

Prefer backend aggregation using:

```text
COUNT
SUM
AVG
FILTER
GROUP BY
date_trunc
CTE
owner-DB SQL views where useful
```

Frontend renders authoritative metric results.

## 2.4 KPI authority

Every KPI must have one documented formula, owner service, source table/field, filter semantics, and zero/NULL behavior.

Frontend must not redefine formulas.

## 2.5 Time range

Every analytics API must require or apply a bounded time range.

Recommended defaults:

```text
Today
Last 7 Days
Last 30 Days
Custom
```

Never default to unbounded `All Time`.

## 2.6 Demo accuracy

Do not label a metric `OEE` unless current source can prove authoritative inputs for Availability, Performance, and Quality.

Use explicit alternatives such as:

```text
Capacity Utilization
Execution Utilization
Cycle Time Variance
```

when OEE is not source-supported.

---

# 3. Token and Quota Efficiency Rules

This package is intentionally phased to avoid repeatedly scanning the entire repository.

## 3.1 Phase 00 creates the reusable source map

Phase 00 must create:

```text
AI_document/MES-Analytics/ANALYTICS_BASELINE_AND_METRIC_CATALOG.md
artifacts/mes-analytics/phase-00/<run-id>/source-map.json
```

Every later phase must read:

```text
GLOBAL_RULES.md
ANALYTICS_BASELINE_AND_METRIC_CATALOG.md
previous phase report
only the source files listed for the active scope
```

Do not re-read the full repository unless:

- source paths changed;
- documented assumptions fail;
- tests reveal a contract mismatch;
- a blocker requires broader tracing.

## 3.2 Reuse evidence

Do not regenerate the same inventories or source maps in every phase.

Reference earlier artifacts.

## 3.3 Targeted tests first

Use:

```text
focused unit/integration tests
→ affected build/typecheck
→ affected regression
```

Do not run the entire repository test suite after every minor edit.

The full suite is mandatory only in the final certification phase.

## 3.4 Compact reports

Reports must contain evidence and decisions, not repeated prompt text.

Use tables and exact file paths.

---

# 4. UI Scope

Create an Analytics module with a route structure compatible with the current MES Console.

Recommended information architecture:

```text
/analytics
/analytics/production
/analytics/lines-resources
/analytics/execution-quality
/analytics/materials-traceability
/analytics/print-system
```

Use current routing conventions rather than forcing these exact paths.

Primary tabs/screens:

```text
Overview
Production & Work Orders
Lines & Resources
Execution & Quality
Materials & Traceability
Print & System
```

---

# 5. Global Filters

Use a shared filter model:

```text
date range
site
production line
shift
work center
workstation
item/revision
production version
WO status
Primary/Backup
operation
machine/resource
```

Not every endpoint needs every filter.

Unsupported filters must not silently change metric meaning.

---

# 6. Required Core Metrics

At minimum certify:

## Overview

```text
Active Work Orders
Completed Work Orders
Blocked Work Orders
Planned Quantity
Good Quantity
Scrap Quantity
Completion Rate
Scrap Rate
Backup Line Used
Resource Hold Work Orders
Material Blocked Work Orders
```

## Production / WO

```text
WO status distribution
planned vs actual trend
WO lifecycle funnel
on-time/late where source-supported
WO performance report
```

## Lines / Resources

```text
Primary selected
Backup selected
Fallback rate
Resource Hold rate
Fallback reasons
Line load
Capacity utilization
Allocation source
Reallocation count
Top constrained resources
```

## Execution / Quality

```text
operations completed/in-progress/failed
retry count
abort count
good/scrap
scrap rate
actual cycle time
standard vs actual variance
failure Pareto
operation bottlenecks
```

## Materials

Only MES-owned or WMS-projected statuses:

```text
required
ready
waiting
shortage
staged
issued
consumed
```

Do not calculate warehouse on-hand from MES.

## Traceability

```text
labels
lots
serials
active/consumed/scrapped labels
genealogy events
```

## Print

```text
print jobs
completed
failed
pending
success rate
attempt count
print latency
failure reasons
jobs by station
```

## Master-data readiness

```text
released PVs
released lines
blocked lines
active workstations
available machine units
expired assignments
missing capabilities
missing calendars
missing standards
missing skills
```

---

# 7. Required Report Tables

The primary report table is:

```text
Work Order Performance Report
```

Required columns where source-supported:

```text
WO Code
Item / Revision
Production Version
Site
Selected Line
Line Role
Fallback Reason
WO Status
Shift
Planned Start / End
Actual Start / Finish
Planned Qty
Good Qty
Scrap Qty
Completion %
Scrap %
Total Operations
Completed Operations
Failed Operations
Allocation Status
Resource Blocker
Material Status
Print Status
Execution Time
Delay
Last Updated
```

Also provide:

```text
Line Selection Report
Operation Performance Report
Resource Capacity Report
Material Readiness Report
Print Performance Report
Traceability Report
```

All tables require server pagination, sorting, filtering, loading, empty, error, and drill-down.

---

# 8. KPI Formula Rules

At minimum define and test:

```text
Scrap Rate = Scrap / (Good + Scrap)
```

unless the approved metric catalog states otherwise.

Define:

```text
Fallback Rate
Resource Hold Rate
Completion Rate
Execution Duration
Cycle Time Variance
Capacity Utilization
Print Success Rate
```

Do not leave formulas implicit.

---

# 9. Frontend Rules

Use:

```text
React
TypeScript
TanStack Query
TanStack Table
Apache ECharts
existing shared MES Console UI components
```

Do not add a second competing chart library unless required.

Create reusable components such as:

```text
AnalyticsFilterBar
AnalyticsKpiCard
AnalyticsChartCard
AnalyticsEmptyState
AnalyticsErrorState
AnalyticsLegend
AnalyticsDrilldownDrawer
AnalyticsReportTable
```

Charts summarize.

Tables investigate.

Every chart with a business count must support drill-down when feasible.

---

# 10. Performance Rules

Analytics APIs must:

- use indexed predicates;
- bound date ranges;
- paginate tables;
- avoid N+1 queries;
- return aggregated payloads;
- expose stable response contracts;
- handle empty data;
- avoid expensive cross-product grouping.

Add indexes only when query plans prove they are needed.

For demo operational data, prefer simple queries or owner-DB views over premature caching.

TanStack Query may cache frontend responses.

Add backend cache only when measured need exists.

---

# 11. i18n and Accessibility

Support:

```text
VI default
EN
JA
KO
```

No raw enums or translation keys.

Charts must have:

- readable titles;
- legend;
- tooltip;
- unit labels;
- empty state;
- accessible text/table fallback where practical.

Do not communicate status only by color.

---

# 12. Phase Execution Rules

Every phase:

```text
read this rule file
→ verify previous gate
→ read baseline catalog
→ inspect only active source scope
→ record baseline
→ implement
→ run focused tests
→ fix failures
→ run affected regression
→ create artifacts
→ create Vietnamese phase report
```

Do not start the next phase automatically.

Only stop for a genuine blocker.

A genuine blocker must be documented with:

```text
root cause
evidence
affected metric/API/UI
attempted fixes
required decision
```

---

# 13. Reports and Artifacts

Every phase creates:

```text
AI_document/MES-Analytics/Phase-XX/REPORT_PHASE_XX.md
artifacts/mes-analytics/phase-XX/<run-id>/
```

Use exact:

```text
declared
executed
passed
failed
skipped
```

test counts.

Zero mandatory skipped tests in final certification.

---

# 14. Final Certification

The final phase may certify only when:

- metric catalog is complete;
- KPI formulas are source-backed;
- no cross-service DB access exists;
- all owner-service analytics APIs pass;
- Overview and deep-dive UI pass;
- report tables pass;
- filters and drill-down pass;
- bounded query performance is acceptable;
- i18n/accessibility smoke passes;
- real browser E2E passes;
- no mandatory test is skipped.

Final status:

```text
MES_ANALYTICS_DASHBOARD_CERTIFIED
```

or:

```text
MES_ANALYTICS_DASHBOARD_NOT_CERTIFIED
```
