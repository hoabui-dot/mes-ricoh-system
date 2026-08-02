# Phase UI-08 — Work Order List and Two-Line Detail Diagnostics

Version: 1.0  
Status: READY_FOR_EXECUTION_AFTER_ENTRY_GATE  
Target system: S-Factory MES Enterprise  
Master rules: `AI_document/REMEDIATION_MASTER_RULES.md`  
Blueprint: `AI_document/MES_CONSOLE_FULL_REMEDIATION_BLUEPRINT.md`  
Previous report: `AI_document/Phase-07/REPORT_PHASE_07.md`

---

# 1. Role

You are working inside the existing S-Factory MES enterprise repository.

Act as a Senior MES Domain Engineer, Senior Full-Stack Engineer, Database and Integration Engineer, and QA Automation Engineer.

Current source is authoritative. Do not invent behavior.

Read the master rules, blueprint, previous phase report, current source, current migrations, current seed, and current tests before modifying anything.

---

# 2. Entry Gate

This phase may begin only when the previous report contains:

```text
PHASE_UI_07_PASSED_READY_FOR_UI_08
```

If the report is absent, contradictory, or blocked, stop and create only the current phase report with:

```text
PHASE_UI_08_BLOCKED
```

Do not bypass the entry gate.

---

# 3. Objective


Complete Work Order triage and two-line diagnostics.

The Work Order list must identify Primary READY, Backup fallback READY, and Resource Hold without opening detail. Work Order Detail must explain backend line evaluation through a complete dimension matrix without recomputing readiness.


---

# 4. In Scope


- Work Order list API fields and server filters.
- Work Order list columns and badges.
- Typed Work Order and line-evaluation contracts.
- Work Order detail summary.
- Selected line, lock state, fallback, and hold.
- Backend-driven evaluated-line matrix.
- Operation-line consistency.
- Blocker links.
- Allocation history display.
- Approval/execution gate summary.
- Three UAT Work Order E2E.


---

# 5. Out of Scope


- Changing line-selection algorithm.
- Automatic exact resource allocation.
- Final action workflow redesign, which belongs to UI-09.
- New scheduling engine.
- Frontend readiness calculation.


---

# 6. Mandatory Source Inspection

Inspect, as applicable:

- `AI_document/REMEDIATION_MASTER_RULES.md`;
- `AI_document/MES_CONSOLE_FULL_REMEDIATION_BLUEPRINT.md`;
- the previous phase report and artifacts;
- current MES Console routes, screens, components, hooks, API clients, types, query keys, and i18n;
- current MES Master Data and MES Execution handlers, services, repositories, models, migrations, seed, and validation;
- current package scripts;
- maintained API integration tests;
- maintained Playwright specs;
- Docker and test-environment health.

Search the repository for every modified business object, route, endpoint, type, and error code.

Do not assume filenames from this prompt are complete. Use the current repository inventory.

---

# 7. Mandatory Implementation Work


## 7.1 Work Order list API

Verify and add additive response fields where missing:

- Work Order code;
- item name/code;
- quantity/UOM;
- planned/target date;
- status;
- selected Production Line name/code;
- line-selection mode/status;
- selected role or Primary/Backup result;
- fallback summary;
- Resource Hold summary;
- approval state;
- execution state;
- Production Version;
- site.

Add server-backed filters where missing:

- selected line;
- line-selection status;
- hold;
- fallback used;
- Work Order status;
- Production Version;
- site;
- date range;
- search.

Do not use browser-only filtering for authoritative triage.

## 7.2 Work Order list UI

Required columns:

```text
Work Order
Item
Quantity/UOM
Planned Date
Status
Selected Line
Line Selection
Primary/Backup Result
Fallback
Resource Hold
Approval
Execution
Actions
```

Use responsive column behavior appropriate for dense MES use without hiding critical line status.

## 7.3 Typed contracts

Define explicit types for:

- Work Order list row;
- Work Order header/detail;
- Production Line reference;
- Line Evaluation Result;
- readiness dimension;
- blocker;
- allocation history;
- approval/execution gate.

Eliminate modified-path `any`.

## 7.4 Work Order detail

Show:

- Work Order identity and snapshot;
- Production Version;
- item and quantity;
- lifecycle;
- selected line;
- selection mode/status;
- lock state;
- Primary evaluation;
- Backup evaluation;
- fallback reason;
- Resource Hold reason;
- operation-line consistency;
- allocation history;
- gate summary.

## 7.5 Evaluated-line matrix

Render backend-provided dimensions for Primary and Backup:

```text
Eligibility
Work Centers
Workstations
Machine Requirements
Equipment/Machine Units
Assignments
Capability
Calendar/Shift
Production Standard
Capacity
Worker Skill/Labor
Final Result
Selection Reason
```

When a dimension is missing, extend the backend response or add a read-only diagnostic endpoint.

Do not infer missing dimensions in React.

## 7.6 Blocker navigation

Map blocker codes to translated explanations and canonical master-data links when a stable target exists.

Do not expose raw UUID as link text.

## 7.7 UAT states

Use UI-02 fixture manifest.

Prove:

- Primary READY;
- Backup fallback READY;
- Resource Hold;
- refresh persistence;
- operation line consistency.


---

# 8. Domain and Architecture Guardrails


- One Work Order uses one whole line.
- Backend owns evaluation and selection.
- Candidate resources remain inside selected line.
- No selected line exists during Resource Hold.
- List-derived display may combine backend fields for presentation but may not invent business state.


Also apply every invariant from `REMEDIATION_MASTER_RULES.md`.

---

# 9. API and Data Contract Rules


Implement additive API-001/API-002 style changes only as required.

Filters must be server-backed.

The detail response must contain structured evaluated dimensions, status, blocker codes, and line references.

Preserve current detail and workflow consumers.


All API changes must be additive unless the approved phase explicitly says otherwise.

Do not let React calculate backend business decisions.

---

# 10. UI Rules


Use shared table, filter, badge, matrix, blocker, state, and audit components.

VI remains default.

Do not bury fallback or hold inside a generic status card.


Preserve the current dense enterprise MES visual identity.

---

# 11. Database, Migration, Seed, and Fixture Rules


Use prepared UAT Work Orders from UI-02.

Do not permanently change canonical line readiness in this phase.

E2E may prepare and clean fixtures through approved scripts.


Never edit applied migrations.

Never use manual SQL as a hidden prerequisite.

---

# 12. Mandatory Test Work

## 12.1 Tests to add or update


Add or update:

- list API field/filter integration tests;
- list table column and filter E2E;
- Primary READY detail;
- Backup fallback detail;
- Resource Hold detail;
- matrix dimension rendering;
- blocker translation/link;
- no frontend recomputation;
- operation-line consistency;
- mixed-line inconsistency warning or backend rejection visibility;
- allocation history rendering;
- refresh persistence;
- loading/error/empty.


## 12.2 Static and build checks

Run actual repository commands. At minimum where applicable:

```bash
npm --prefix services/mes-console run typecheck
npm --prefix services/mes-console run build
```

Run build/test commands for every affected backend service.

## 12.3 API integration


Run list filter integration, Work Order detail diagnostic integration, line-selection suites, full resource-planning flow, and canonical seed verification.

Verify old clients tolerate additive fields.


## 12.4 Browser E2E


Playwright must use all three fixture Work Orders.

Capture screenshots and traces for:

- Work Order list showing all three states;
- Primary detail matrix;
- fallback detail matrix;
- hold detail matrix;
- blocker link;
- refresh persistence.

No mocked browser response may replace persisted runtime evidence.


Do not turn failures into skips.

## 12.5 Required regression


Run product, resource, labor, route, shared-component, and fixture verification suites.

Run maintained two-line full regression.


Record exact declared, executed, passed, failed, and skipped counts.

---

# 13. Artifacts

Create:

```text
artifacts/mes-console-remediation/phase-08/<run-id>/
```

At minimum include:

```text
manifest.json
baseline.json
changes.json
build-results.json
api-integration-results.json
browser-e2e-results.json
cleanup-results.json
acceptance-results.json
```


Also create:

```text
work-order-list-api-contract.json
work-order-detail-api-contract.json
evaluated-line-dimension-map.json
three-uat-work-order-evidence.json
work-order-e2e-screenshot-index.json
```


Do not store secrets.

---

# 14. Required Report

Create:

```text
AI_document/Phase-08/REPORT_PHASE_08.md
```

Use `AI_document/REPORT_TEMPLATE.md`.

The report must include exact command evidence, files changed, APIs changed, seed/migration impact, test counts, cleanup, known issues, rollback, and the final gate.

---

# 15. Acceptance Criteria


- List identifies all three required states without opening detail.
- Filters are server-backed.
- Detail shows selected line, fallback, hold, and lock.
- Complete backend-driven matrix is visible.
- Missing dimensions are not computed in React.
- Operation-line consistency is proved.
- Blockers are translated and linked where possible.
- UAT E2E uses persisted runtime data.
- API integration and regression pass.
- No mandatory test is skipped.
- Report authorizes UI-09.


Every mandatory criterion must pass.

---

# 16. Stop Conditions

In addition to the master rules, stop when:


- required list or detail fields cannot be exposed compatibly;
- evaluated dimensions are unavailable and backend ownership is unclear;
- UAT fixtures no longer reproduce deterministic states;
- UI implementation would need to reimplement the line-selection algorithm;
- mixed-line data is observed without a backend rejection or documented data correction.


Do not continue into the next phase.

---

# 17. Completion Gate

On success, the report and completion response must state:

```text
PHASE_UI_08_PASSED_READY_FOR_UI_09
```

On failure:

```text
PHASE_UI_08_BLOCKED
```

Do not start Phase UI-09 in the same execution.
