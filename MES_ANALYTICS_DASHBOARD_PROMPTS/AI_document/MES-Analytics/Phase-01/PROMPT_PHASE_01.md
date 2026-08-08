# Phase 01 — MES Execution Analytics APIs

Version: 1.0  
Target: `mes-ricoh-system`  
Previous gate: `MES_ANALYTICS_PHASE_00_READY_FOR_PHASE_01`  
Required report language: Vietnamese  

---

# 1. Goal

Implement the high-value analytics APIs owned by MES Execution.

This phase should cover most dashboard data so later frontend work uses stable contracts.

Read only:

```text
GLOBAL_RULES.md
ANALYTICS_BASELINE_AND_METRIC_CATALOG.md
Phase-00 report
Execution files listed in source-map.json
```

Broaden inspection only when required by a failing assumption.

---

# 2. API Scope

Implement source-compatible endpoints for:

```text
Overview
Work Order analytics
Two-Line / line-selection analytics
Operation performance
Resource / capacity analytics
Material-readiness projection
Print performance
```

Use current API naming conventions.

Recommended shape only:

```text
GET /api/mes/execution/analytics/overview
GET /api/mes/execution/analytics/work-orders
GET /api/mes/execution/analytics/lines
GET /api/mes/execution/analytics/operations
GET /api/mes/execution/analytics/resources
GET /api/mes/execution/analytics/materials
GET /api/mes/execution/analytics/print
```

---

# 3. Required Behavior

All endpoints:

- accept bounded date range;
- accept source-supported filters;
- use parameterized SQL;
- aggregate server-side;
- return deterministic schemas;
- handle empty datasets;
- expose business codes/names where already owned or snapshotted;
- avoid cross-service database reads.

Report endpoints require server pagination/sorting/filtering.

---

# 4. Required Execution Metrics

Implement approved catalog metrics for:

```text
WO counts/status distribution
planned/good/scrap
production trend
WO lifecycle funnel
Primary/Backup/ResourceHold
fallback reasons
line load
allocation state
reallocation
capacity/reservation conflicts
operation duration
cycle-time variance
failure/retry/abort
material readiness projection
print jobs/success/failure/latency
```

Use only source-supported fields.

---

# 5. SQL / Query Quality

Inspect query plans for the largest expected demo filters.

Add indexes only when justified.

Prefer owner-DB views when they materially simplify repeated analytics queries.

Do not introduce materialized analytics storage.

---

# 6. Tests

Add focused tests for:

- metric formulas;
- date filtering;
- site/line/shift/status filters;
- empty data;
- NULL/zero division;
- Primary/Backup classification;
- ResourceHold classification;
- scrap rate;
- cycle-time calculations;
- print latency;
- pagination;
- authorization/site scope;
- invalid date range.

Run affected Execution build/tests.

---

# 7. Artifacts and Report

Create:

```text
AI_document/MES-Analytics/Phase-01/REPORT_PHASE_01.md
```

Artifacts include:

```text
execution-api-contract.json
execution-metric-evidence.json
query-plan-evidence.json
test-results.json
```

---

# 8. Acceptance

- all P0 Execution metrics from catalog have APIs;
- formulas match Phase 00;
- no cross-service DB access;
- bounded queries pass;
- focused tests pass;
- no mandatory phase test skipped.

Success:

```text
MES_ANALYTICS_PHASE_01_READY_FOR_PHASE_02
```
