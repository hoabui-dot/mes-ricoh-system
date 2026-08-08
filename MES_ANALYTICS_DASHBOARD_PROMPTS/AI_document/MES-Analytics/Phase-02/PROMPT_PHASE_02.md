# Phase 02 — Master Data and Traceability Analytics APIs

Version: 1.0  
Previous gate: `MES_ANALYTICS_PHASE_01_READY_FOR_PHASE_02`  
Required report language: Vietnamese  

---

# 1. Goal

Implement the remaining owner-service analytics for:

```text
Master-data readiness
Traceability
```

Read only:

```text
GLOBAL_RULES.md
ANALYTICS_BASELINE_AND_METRIC_CATALOG.md
Phase-01 report
Master Data and Traceability files listed in source-map.json
```

---

# 2. Master Data Analytics

Implement source-supported metrics for:

```text
released Production Versions
released Production Lines
blocked/incomplete Lines
active Workstations
available Machine Units
expired Resource Assignments
missing Capabilities
missing Calendars
missing Production Standards
missing Worker Skills / skill readiness
```

Use existing readiness services/APIs where possible.

Do not duplicate readiness business logic in analytics SQL if an authoritative use case already exists.

---

# 3. Traceability Analytics

Implement source-supported metrics for:

```text
labels generated
active labels
consumed labels
scrapped labels
lots
serials
genealogy relation counts
genealogy event trend
labels by item
```

Add paginated traceability report endpoints if missing.

---

# 4. Boundaries

Do not:

- join Execution DB from Master Data;
- join Master Data DB from Traceability;
- calculate WMS inventory;
- invent QMS metrics.

---

# 5. Tests

Add focused tests for:

- readiness counts;
- lifecycle/effectivity filters;
- label states;
- lot/serial counts;
- genealogy grouping;
- date/site/item filters;
- empty data;
- pagination;
- authorization/site scope.

---

# 6. Report

Create:

```text
AI_document/MES-Analytics/Phase-02/REPORT_PHASE_02.md
```

Artifacts:

```text
master-data-api-contract.json
traceability-api-contract.json
metric-evidence.json
test-results.json
```

---

# 7. Acceptance

- all approved Master Data metrics have owner APIs;
- all approved Traceability metrics have owner APIs;
- no cross-service DB access;
- tests pass;
- contracts are ready for frontend composition.

Success:

```text
MES_ANALYTICS_PHASE_02_READY_FOR_PHASE_03
```
