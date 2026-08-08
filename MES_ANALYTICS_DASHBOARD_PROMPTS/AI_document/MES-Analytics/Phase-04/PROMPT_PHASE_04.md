# Phase 04 — Deep-Dive Analytics Pages and Report Tables

Version: 1.0  
Previous gate: `MES_ANALYTICS_PHASE_03_READY_FOR_PHASE_04`  
Required report language: Vietnamese  

---

# 1. Goal

Implement the remaining business analysis pages using the stable APIs and shared components.

Do not redesign backend contracts unless a verified defect exists.

---

# 2. Production & Work Orders

Implement:

```text
WO status and lifecycle
planned vs actual
completion trend
WO lifecycle funnel
Work Order Performance Report
```

Support drill-down to Work Order Detail.

---

# 3. Lines & Resources

Implement:

```text
Primary selected
Backup selected
Fallback Rate
Resource Hold Rate
Fallback reason ranking
line load
capacity utilization
allocation source
reallocation
top constrained resources
Line Selection Report
Resource Capacity Report
```

Recommended charts:

```text
stacked bar
horizontal bar
line trend
heatmap
```

Use ECharts.

---

# 4. Execution & Quality

Implement:

```text
operation states
good/scrap
scrap rate
actual cycle time
standard vs actual variance
bottleneck ranking
failure Pareto
retry/abort
Operation Performance Report
```

Do not call these QMS metrics.

---

# 5. Materials & Traceability

Implement MES-visible material status only:

```text
required
waiting
ready
shortage
staged
issued
consumed
```

Add:

```text
Material Readiness Report
Traceability summary
labels/lots/serials
genealogy breakdown
Traceability Report
```

Do not display warehouse on-hand unless fetched from an approved WMS integration, which is outside this phase.

---

# 6. Print & System

Implement business print analytics:

```text
jobs
success/failure
success rate
attempts
latency
failure Pareto
station breakdown
Print Performance Report
```

Add Master Data Readiness as a separate admin/planner section.

Do not mix Kafka/outbox technical health into executive production KPIs.

A small technical/system section may show already-supported service health only.

---

# 7. Report Table Requirements

Every report table must support:

```text
server pagination
server sorting
server filtering
loading
empty
error/retry
business code/name
drill-down
CSV export only if current shared tooling already supports it
```

Do not add a large export framework solely for this demo.

---

# 8. Tests

Add Playwright coverage for:

- each analytics tab;
- filters;
- chart rendering;
- drill-down;
- report pagination/sort/filter;
- Primary→Backup report investigation;
- failure Pareto investigation;
- traceability drill-down;
- print report;
- master-data readiness;
- no-data state.

Run affected frontend and API regression only.

---

# 9. Report

Create:

```text
AI_document/MES-Analytics/Phase-04/REPORT_PHASE_04.md
```

Artifacts:

```text
deep-dive-screenshots.json
report-table-results.json
playwright-results.json
```

---

# 10. Acceptance

- all approved pages implemented;
- all core report tables implemented;
- filters remain consistent;
- no WMS/QMS boundary violation;
- drill-down works;
- tests pass.

Success:

```text
MES_ANALYTICS_PHASE_04_READY_FOR_PHASE_05
```
