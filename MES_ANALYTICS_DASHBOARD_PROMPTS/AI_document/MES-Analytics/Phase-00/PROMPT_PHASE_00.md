# Phase 00 — Source Audit, Metric Catalog, and Dashboard Contract

Version: 1.0  
Mode: Audit and design only  
Target: `mes-ricoh-system`  
Required report language: Vietnamese  

---

# 1. Goal

Create the reusable baseline for all later phases.

Do not implement dashboard code in this phase.

Inspect the current MES source and define exactly:

- which analytics are possible from current operational data;
- metric formulas;
- data owner for each metric;
- source tables/fields;
- current APIs that can be reused;
- new owner-service APIs required;
- dashboard information architecture;
- report-table contracts;
- filter semantics;
- unsupported or unsafe metrics.

This phase exists to prevent later phases from repeatedly scanning the repository.

---

# 2. Required Inputs

Read:

```text
AI_document/MES-Analytics/GLOBAL_RULES.md
AI_CONTEXT.md
UI_AI_CONTEXT.md
current MES architecture docs
current Work Order / resource planning / two-line / print / traceability docs
```

Inspect actual source only for:

```text
MES Execution schema and APIs
MES Master Data schema and APIs
MES Traceability schema and APIs
MES Console routes/components
current package.json dependencies
current tests
```

Do not scan unrelated WMS/PDA implementation.

---

# 3. Required Output

Create:

```text
AI_document/MES-Analytics/ANALYTICS_BASELINE_AND_METRIC_CATALOG.md
AI_document/MES-Analytics/Phase-00/REPORT_PHASE_00.md
```

Artifacts:

```text
artifacts/mes-analytics/phase-00/<run-id>/
├── source-map.json
├── metric-catalog.json
├── api-gap-map.json
├── ui-route-plan.json
└── unsupported-metrics.json
```

`source-map.json` must list exact files later phases should read.

---

# 4. Required Metric Catalog

For every metric document:

| Field | Required |
|---|---|
| Metric code | Stable technical code |
| Vietnamese name | User-facing |
| Business question | What decision it supports |
| Owner service | Execution / Master Data / Traceability |
| Source tables | Exact tables |
| Source fields | Exact fields |
| Formula | Exact formula |
| Date basis | created/start/finish/etc. |
| Filters | Supported filters |
| Zero/NULL behavior | Explicit |
| Unit | qty, %, min, etc. |
| Drill-down | Target report |
| API required | Existing/new |
| Status | READY / GAP / UNSUPPORTED |

At minimum catalog all metrics required by `GLOBAL_RULES.md`.

---

# 5. Validate Important Formulas

Source-verify:

```text
Active WO
Completed WO
Blocked WO
Planned Qty
Good Qty
Scrap Qty
Completion Rate
Scrap Rate
Primary/Backup counts
Fallback Rate
Resource Hold Rate
Execution Duration
Cycle Time
Cycle Time Variance
Capacity Utilization
Failure Rate
Print Success Rate
Print Latency
Material readiness counts
```

Do not define OEE unless all authoritative inputs exist.

If OEE is unsupported, explicitly mark:

```text
UNSUPPORTED_IN_CURRENT_DEMO_SCOPE
```

---

# 6. Dashboard Contract

Define final pages/tabs and widgets.

At minimum:

```text
Overview
Production & Work Orders
Lines & Resources
Execution & Quality
Materials & Traceability
Print & System
```

For every widget document:

```text
title
metric/query
chart type
filters
drill-down
empty state
error state
owner API
```

---

# 7. Chart Decision

Confirm Apache ECharts compatibility with the current MES Console.

Document the exact package to add and integration wrapper strategy.

Do not implement charts yet.

---

# 8. Acceptance

Pass only when:

- all core metrics have source ownership;
- formulas are explicit;
- no cross-service DB query is proposed;
- unsupported metrics are identified;
- final API ownership is defined;
- final dashboard/report contract is defined;
- source-map is sufficient for later phases.

Success token:

```text
MES_ANALYTICS_PHASE_00_READY_FOR_PHASE_01
```
