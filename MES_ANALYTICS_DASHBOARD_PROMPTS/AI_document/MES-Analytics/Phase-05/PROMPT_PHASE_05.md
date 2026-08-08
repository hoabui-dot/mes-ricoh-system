# Phase 05 — Query Performance, UX Hardening, i18n, and Accessibility

Version: 1.0  
Previous gate: `MES_ANALYTICS_PHASE_04_READY_FOR_PHASE_05`  
Required report language: Vietnamese  

---

# 1. Goal

Harden the dashboard for demo reliability without adding unnecessary architecture.

---

# 2. Performance

For each analytics endpoint:

- record representative query plan;
- verify bounded date predicate;
- verify indexes;
- verify pagination;
- verify no N+1;
- verify response size;
- verify empty-range behavior.

Add indexes only when query evidence justifies them.

Do not add Redis/backend caching unless measured latency requires it.

Use TanStack Query caching/stale-time appropriately.

---

# 3. Frontend Performance

Verify:

- charts do not reinitialize unnecessarily;
- filter changes debounce only when needed;
- large table pages remain server-side;
- no large raw dataset retained in browser;
- route transitions are responsive.

---

# 4. UX Hardening

Check every page for:

```text
clear business title
KPI definition tooltip/help
unit
time range
last refreshed time
loading
empty
error/retry
drill-down
filter reset
no raw enum
no raw UUID
no raw i18n key
```

Add concise metric-definition help for ambiguous KPIs such as:

```text
Fallback Rate
Resource Hold Rate
Capacity Utilization
Cycle Time Variance
Scrap Rate
```

---

# 5. i18n

Complete changed analytics UI for:

```text
VI
EN
JA
KO
```

VI default.

---

# 6. Accessibility

Verify:

- keyboard filters;
- visible focus;
- chart titles;
- accessible summary text;
- table headers;
- dialogs/drawers;
- status not represented only by color;
- tablet/desktop responsiveness.

---

# 7. Tests

Run focused:

```text
API performance/query tests
frontend typecheck/build
analytics Playwright regression
i18n smoke
accessibility smoke
```

Do not run unrelated full MES regression yet.

---

# 8. Report

Create:

```text
AI_document/MES-Analytics/Phase-05/REPORT_PHASE_05.md
```

Artifacts:

```text
query-plans.json
latency-summary.json
frontend-performance.json
i18n-results.json
accessibility-results.json
```

---

# 9. Acceptance

- no unbounded heavy query;
- no cross-service DB access;
- dashboard remains responsive;
- metric definitions are understandable;
- four-language smoke passes;
- accessibility smoke passes.

Success:

```text
MES_ANALYTICS_PHASE_05_READY_FOR_PHASE_06
```
