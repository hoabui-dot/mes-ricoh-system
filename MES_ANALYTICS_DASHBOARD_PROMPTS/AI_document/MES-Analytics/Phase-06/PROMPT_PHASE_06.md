# Phase 06 — Full MES Analytics Certification and Final Report

Version: 1.0  
Previous gate: `MES_ANALYTICS_PHASE_05_READY_FOR_PHASE_06`  
Required report language: Vietnamese  

---

# 1. Goal

Certify the complete operational analytics feature using real MES data and real browser flows.

This is the only phase that must run the complete maintained analytics regression plus affected MES regression.

---

# 2. Seed / Test Dataset

Use the current canonical MES seed and deterministic UAT Work Orders.

Ensure the dataset covers:

```text
Primary READY WO
Backup fallback WO
RESOURCE_HOLD WO
completed WO
in-progress WO
failed/retried operation
good and scrap confirmation
resource allocation/reallocation
material ready/shortage projection where current seed supports it
successful and failed print job
traceability labels/lots/serials
```

Do not directly insert analytics-only fake rows when an existing business flow can create them.

---

# 3. Business UAT Scenarios

## UAT-01 Overview

A non-technical user can identify:

```text
how many WO are active
how many are blocked
planned vs good/scrap
Primary vs Backup usage
top blocker
top bottleneck
```

## UAT-02 Work Order investigation

Click a WO report row and reach the correct Work Order Detail.

## UAT-03 Two-Line analysis

From Backup count:

```text
drill down
→ see fallback WO
→ see Primary blocker
→ see selected Backup line
```

## UAT-04 Resource/capacity

Identify the most constrained resource and inspect underlying WOs/allocations.

## UAT-05 Failure analysis

Use failure Pareto and open affected operations/WOs.

## UAT-06 Materials

See only MES material readiness/projection states, not fabricated warehouse inventory.

## UAT-07 Print

Identify failed print jobs and error reasons.

## UAT-08 Traceability

Inspect label/lot/serial/genealogy summary and drill-down.

## UAT-09 Master-data readiness

Identify a blocked/missing-readiness configuration from the dashboard.

## UAT-10 Filters

Change date/site/line/shift/item filters and verify every visible widget updates consistently.

---

# 4. Formula Certification

For each P0 metric:

```text
query API
→ independently verify against authoritative owner DB/test fixture
→ compare UI value
```

No mismatch allowed.

Certify at minimum:

```text
Active WO
Completed WO
Blocked WO
Planned Qty
Good Qty
Scrap Qty
Scrap Rate
Fallback Rate
Resource Hold Rate
Execution Duration
Capacity Utilization
Print Success Rate
```

---

# 5. Full Regression

Run:

```text
frontend typecheck/build
affected backend builds
analytics API integration
all analytics Playwright
three-PV/two-line regression
resource-planning regression
ready-to-run WO certification
traceability regression
print regression
```

Use actual repository command names.

Zero mandatory skipped tests.

---

# 6. Final Cleanup

Remove generated certification data according to current test cleanup.

Preserve canonical seed.

Verify no unintended:

```text
Work Orders
allocations
reservations
print jobs
traceability test records
temporary analytics fixtures
```

remain.

---

# 7. Final Documents

Create:

```text
AI_document/MES-Analytics/MES_ANALYTICS_FINAL_REPORT.md
AI_document/MES-Analytics/MES_ANALYTICS_USER_UAT_GUIDE.md
AI_document/MES-Analytics/Phase-06/REPORT_PHASE_06.md
```

Final report must include:

```text
metric inventory
API inventory
dashboard route inventory
chart inventory
report-table inventory
formula evidence
performance evidence
test totals
known limitations
unsupported metrics
future warehouse/BI recommendation
```

---

# 8. Final Status

Certify only when every mandatory gate passes.

End with exactly one:

```text
MES_ANALYTICS_DASHBOARD_CERTIFIED
```

or:

```text
MES_ANALYTICS_DASHBOARD_NOT_CERTIFIED
```
