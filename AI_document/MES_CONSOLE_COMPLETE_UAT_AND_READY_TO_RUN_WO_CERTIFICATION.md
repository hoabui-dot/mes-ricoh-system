# MES Console Complete UAT and Ready-to-Run Work Order Certification

Date: 2026-08-02  
System: MES Console and MES execution/master-data services  
Certification ID: WO-CERT-001  
Run ID: WO-CERT-001-20260802194145

## 1. Final Result

Track B, the canonical seed and ready-to-run Work Order flow, passed end to end.
Track A, the strict page-by-page console UAT, is documented for every retained
screen family but is not yet complete because several page-level automation and
locale/accessibility gaps remain.

The final status of this document is therefore:

NOT_CERTIFIED

## 2. Governing Documents and Evidence

This implementation follows:

- AI_document/PROMPT_BUILD_MES_CONSOLE_COMPLETE_UAT_AND_READY_TO_RUN_WO_CERTIFICATION.md
- mes-system/AI_document/refactor-mes-console
- mes-system/process-expand/mes-enterprise/docs/23_PHASE_IMPLEMENTATION_GUARDRAILS.md
- mes-system/process-expand/mes-enterprise/docs/Perform-a-Safe-Full-MES-Data-Reset,-Rebuild-the-Canonical-Seed-Dataset,-and-Verify-All-Current-Full-Flows.md

Certification implementation:

- scripts/certify-mes-ready-to-run-wo.mjs
- package.json script: certify:mes:ready-to-run-wo

Evidence directory:

artifacts/mes-console-final-certification/WO-CERT-001-20260802194145/

Evidence files:

- certification-result.json
- route-inventory.json
- coverage-summary.json

## 3. Execution Safety

The one-command certification runner refuses production-like execution. It
requires all of the following:

- MES_ENV is development, local, test, or staging.
- ALLOW_MES_FULL_RESET=true.
- CONFIRM_MES_FULL_RESET=YES_RESET_ALL_MES_DATA.
- Master-data and execution database URLs resolve to localhost, 127.0.0.1, or ::1.

Run command:

~~~sh
MES_ENV=development \
ALLOW_MES_FULL_RESET=true \
CONFIRM_MES_FULL_RESET=YES_RESET_ALL_MES_DATA \
npm run certify:mes:ready-to-run-wo
~~~

The runner resets and reseeds the canonical dataset, verifies it, creates and
executes WO-CERT-001, then removes that certification Work Order and verifies
that no Work Order remains.

## 4. Route Inventory

The route inventory was generated from services/mes-console/src/App.tsx.

Important: canonical routes below are taken directly from App.tsx. Do not add
the /console/mes/master-data prefix. Some /console/mes/... paths are legacy
redirects only. Resource Planning is a tab inside Work Order Detail at
/work-orders/:id, not a standalone route.

| Category | Count |
|---|---:|
| Declared route entries | 96 |
| Retained canonical screen families | 30 |
| Redirect entries | 19 |
| Diagnostic route | 1 |
| Not-found wildcard | 1 |
| Strict page families fully complete | 0 |
| Page families with documented gaps | 30 |

The 30 retained page families are listed below. Redirects, the diagnostic
route, and the wildcard are not counted as business screens.

## 5. UAT Contract

Every retained page family is evaluated with the same A-M contract:

- A. Route and direct navigation
- B. Authentication, role, and authorization behavior
- C. Loading state
- D. Empty state
- E. Error and retry state
- F. List, search, filter, sort, and pagination behavior
- G. Create, edit, view, and lifecycle actions
- H. Validation, duplicate prevention, and conflict behavior
- I. Save, cancel, refresh, and idempotency behavior
- J. Localization and terminology
- K. Keyboard, focus, modal, and accessibility behavior
- L. API, persistence, audit, and refresh consistency
- M. Evidence, defect status, and exit decision

For each page below, implemented behavior and remaining evidence are recorded
against this contract. A page is not strict-complete unless all applicable
items A-M have executable evidence.

## 6. Track A: Page-by-Page UAT

### 6.1 Work Order List

Route: /work-orders  
Scope: A-M. The list route, role-aware shell, loading, empty, error, refresh,
filter, status display, and navigation are implemented. Work Order lifecycle
actions are backed by execution-service APIs and covered by existing E2E/API
flows. Dedicated page-level evidence for every loading/error/empty permutation,
authorization denial, locale, keyboard focus, and accessibility assertion is
still missing.  
M: Incomplete; page family contributes to the 120 documented use-case slots.

### 6.2 Work Order Create

Route: /work-orders/new  
Scope: A-M. The supported creation workflow selects a released Production
Version, quantity, target date, and shift and uses an idempotency key. Backend
validation and workflow polling are covered by certification. Dedicated UI
matrix evidence for invalid combinations, duplicate submit, retry, all locales,
and keyboard/modal behavior is incomplete.  
M: Incomplete.

### 6.3 Work Order Detail

Route: /work-orders/:id  
Scope: A-M. Header, operations, line selection, resource allocations,
approval, execution state, refresh, and error handling are implemented.
WO-CERT-001 proved the detail lifecycle through InProgress. A complete
screen-level evidence set for every state and permission combination remains
outstanding.  
M: Incomplete.

### 6.4 Resource Planning

Route: /work-orders/:id, Resource Planning tab  
Scope: A-M. Candidate retrieval, readiness, exact workstation/equipment
allocation, revalidation, conflict reporting, and strict approval gating are
implemented and API-tested. Dedicated UI evidence for all empty/error/conflict
states and accessibility is incomplete.  
M: Incomplete.

### 6.5 Items

Route: /master-data/items  
Scope: A-M. Item listing and item selection are integrated with product
definition flows. Canonical WST item data is verified. Dedicated CRUD,
duplicate, lifecycle, authorization, locale, and accessibility evidence is
incomplete.  
M: Incomplete.

### 6.6 Units of Measure

Route: /master-data/uoms  
Scope: A-M. UOM master data is available to product-definition workflows and
canonical seed verification. Dedicated page-level CRUD and invalid-input
evidence is incomplete.  
M: Incomplete.

### 6.7 Material Groups

Route: /master-data/material-groups  
Scope: A-M. Material-group data is represented in the master-data contract.
Dedicated page CRUD, duplicate, lifecycle, error, locale, and accessibility
evidence is incomplete.  
M: Incomplete.

### 6.8 EBOMs

Route: /master-data/eboms  
Scope: A-M. EBOM structures are available to product-definition flows.
Dedicated versioning, component validation, duplicate, save/retry, and UI
state evidence is incomplete.  
M: Incomplete.

### 6.9 MBOMs

Route: /master-data/mboms  
Scope: A-M. MBOM structures and operation material relationships are used by
the canonical Production Version. Dedicated page-level structure editing,
validation, and accessibility evidence is incomplete.  
M: Incomplete.

### 6.10 Routings

Route: /master-data/routings  
Scope: A-M. Routing data is consumed by the ready-to-run Work Order flow.
Dedicated route editing, effective-date, duplicate, and permission evidence is
incomplete.  
M: Incomplete.

### 6.11 Operations

Route: /master-data/operations  
Scope: A-M. Four canonical WST operations are seeded and verified. Dedicated
CRUD, sequence, duration, skill-requirement, and invalid-input UI evidence is
incomplete.  
M: Incomplete.

### 6.12 Production Versions

Route: /master-data/production-versions  
Scope: A-M. Released effective WST-SEED-PV-SEAL-ASM-01 is selected by the
certification runner. Readiness, effective dates, line policy, and release
behavior are API-tested. Dedicated page-level lifecycle and authorization
evidence is incomplete.  
M: Incomplete.

### 6.13 Areas

Route: /master-data/production-areas  
Scope: A-M. SITE-KZ3, AREA-RUBBER, and AREA-MOLDING are seeded and verified.
Dedicated hierarchy, duplicate, lifecycle, empty/error, and accessibility
evidence is incomplete.  
M: Incomplete.

### 6.14 Production Lines

Route: /master-data/production-lines  
Scope: A-M. WST-SEED-LINE-1 is the canonical primary line and its backup line
is present. Line readiness and selection are proven in WO-CERT-001. Dedicated
UI evidence for line lifecycle and all blocked/hold states is incomplete.  
M: Incomplete.

### 6.15 Sites

Route: /master-data/factories  
Scope: A-M. SITE-KZ3 is the canonical site and scopes shifts, resources, and
production versions. Dedicated page-level CRUD and permission evidence is
incomplete.  
M: Incomplete.

### 6.16 Shopfloors

Route: /master-data/shopfloors  
Scope: A-M. Shopfloor structure is represented in the master-data hierarchy.
Dedicated CRUD, hierarchy validation, and UI-state evidence is incomplete.  
M: Incomplete.

### 6.17 Work Centers

Route: /master-data/work-centers  
Scope: A-M. Eight canonical Work Centers are seeded, linked to the two lines,
and verified. Dedicated page-level assignment and lifecycle evidence is
incomplete.  
M: Incomplete.

### 6.18 Workstations

Route: /master-data/workstations  
Scope: A-M. Eight canonical Workstations are seeded and candidates are
selected for each operation. Dedicated CRUD, readiness, duplicate, and
accessibility evidence is incomplete.  
M: Incomplete.

### 6.19 Machines

Route: /master-data/machines  
Scope: A-M. Eight equipment and eight machine units are seeded and candidates
are verified. Dedicated machine lifecycle, status, conflict, and UI-state
evidence is incomplete.  
M: Incomplete.

### 6.20 Workstation Assignments

Route: /master-data/resource-assignments  
Scope: A-M. Eight assignments are seeded and used by candidate resolution.
Dedicated overlap, effective-date, duplicate, and page-level permission
evidence is incomplete.  
M: Incomplete.

### 6.21 Capabilities

Route: /master-data/resource-capabilities  
Scope: A-M. Eight capabilities are seeded and used in resource candidates.
Dedicated capability maintenance and negative matching evidence is incomplete.  
M: Incomplete.

### 6.22 Calendars

Route: /master-data/resource-calendars  
Scope: A-M. Eight resource calendars are seeded and verified. Dedicated
holiday, overlap, timezone, and empty/error UI evidence is incomplete.  
M: Incomplete.

### 6.23 Standards

Route: /master-data/production-standards  
Scope: A-M. Standard duration and resource planning contracts are consumed by
candidate calculation. Dedicated CRUD, effective-date, and invalid-value UI
evidence is incomplete.  
M: Incomplete.

### 6.24 Operation Skill Requirements

Route: /master-data/operation-skill-requirements  
Scope: A-M. Operation skill requirements participate in candidate readiness.
Dedicated maintenance, mismatch, and permission evidence is incomplete.  
M: Incomplete.

### 6.25 Employees

Route: /employees  
Scope: A-M. Four canonical employees are seeded and available to worker
assignment flows. Dedicated employee CRUD, lifecycle, duplicate, locale, and
accessibility evidence is incomplete.  
M: Incomplete.

### 6.26 Worker Skills

Route: /master-data/skills/workers  
Scope: A-M. Three worker skills are seeded and the worker-skill API suite
passes. Dedicated UI evidence for skill assignment, mismatch, and lifecycle
states is incomplete.  
M: Incomplete.

### 6.27 Shifts

Route: /shifts  
Scope: A-M. SHIFT-A is active, site-scoped, and selected by WO-CERT-001.
Dedicated overlap, inactive-shift, timezone, and page-level UI evidence is
incomplete.  
M: Incomplete.

### 6.28 Work Calendar

Route: /work-calendar  
Scope: A-M. Calendar schedules are seeded and used in resource readiness.
Dedicated date exception, holiday, timezone, retry, and accessibility evidence
is incomplete.  
M: Incomplete.

### 6.29 Print Stations

Route: /master-data/print-stations  
Scope: A-M. PS-CANONICAL-01 is seeded and MES-side print-station master-data
smoke coverage passes 5/5. Physical printer and third-party execution are
excluded because those runtimes are unavailable. Dedicated UI state and
authorization evidence is incomplete.  
M: Incomplete; exclusion is approved only for physical/third-party execution.

### 6.30 Reason Codes and Diagnostics

Routes: /master-data/reason-codes and
/console/mes/i18n-review  
Scope: A-M. Reason-code data and the diagnostic route are retained for
operations and translation review. The diagnostic route is not a production
business page. Dedicated reason-code CRUD and complete locale review evidence
is incomplete.  
M: Incomplete.

## 7. Track B: Canonical Seed Contract

The canonical dataset must contain:

- Site SITE-KZ3.
- Areas AREA-RUBBER and AREA-MOLDING.
- SHIFT-A active for the canonical site.
- Two production lines with one primary and one backup policy.
- Eight Work Centers, eight Workstations, eight equipment records, and eight machine units.
- Eight workstation assignments, eight capabilities, and eight calendars.
- Four WST operations with routing and MBOM relationships.
- Three worker skills and four employees.
- Traceability policies and schedules.
- Item, revision, EBOM/MBOM, routing, and released Production Version.
- Production Version WST-SEED-PV-SEAL-ASM-01.
- Canonical MES-side Print Station PS-CANONICAL-01.
- Zero Work Orders after certification cleanup.

The reset/seed/verify command enforces the destructive-operation guardrails and
checks orphan, count, relationship, readiness, and lifecycle invariants.

## 8. WO-CERT-001 Result

The certification runner completed all 10 gates:

| Gate | Result |
|---|---|
| Full reset, canonical seed, canonical verification | PASS |
| Released effective Production Version selected | PASS |
| Active SHIFT-A selected | PASS |
| Work Order created through supported workflow | PASS |
| Automatic primary line selected and READY | PASS |
| Four resource candidates committed | PASS |
| Four allocations revalidated valid | PASS |
| Strict approval reached Released | PASS |
| Start execution reached InProgress | PASS |
| Exact cleanup left zero Work Orders | PASS |

Observed certification values:

- Production Version: WST-SEED-PV-SEAL-ASM-01
- Primary line: WST-SEED-LINE-1
- Line-selection status: READY
- Line-selection mode: PRIMARY
- Line-selection reason: PRIMARY_LINE_READY
- Mandatory operations: 4
- Committed allocations: 4
- Final Work Order state: InProgress before cleanup
- Remaining Work Orders after cleanup: 0

Source-authoritative semantic note: the current execution-service
line-selection implementation stores PRIMARY for an automatic healthy primary
selection. It stores AUTO for an unresolved Resource Hold. The console presents
the healthy PRIMARY result as the automatic-primary outcome.

## 9. Validation Matrix

The implemented validation contract contains 32 rule groups:

| Area | Positive checks | Negative/conflict checks | API/E2E evidence |
|---|---:|---:|---:|
| Seed and referential integrity | 6 | 4 | PASS |
| Production Version readiness | 3 | 3 | PASS |
| Line selection and fallback | 3 | 4 | PASS |
| Candidate readiness and allocation | 4 | 4 | PASS |
| Approval and execution lifecycle | 3 | 2 | PASS |
| Worker skill and calendar constraints | 2 | 2 | PASS |
| Print station MES-side contract | 1 | 1 | PASS |
| UI state, locale, keyboard, authorization | 0 | 0 | GAP |

Backend and API validation gaps: none found in the executed certification path.
Console page-level validation gaps are listed in Section 12.

## 10. Automated Evidence Summary

| Suite | Result |
|---|---:|
| Console typecheck and build | 2/2 |
| Phase 1 API suite | 20/20 |
| Phase 2 API suite, approved print exclusion | 20/20 |
| Phase 7 API suite | 19/19 |
| Phase 9 API suite | 19/19 |
| Worker-skill suite | 8/8 |
| Product-definition suite | 13/13 |
| Phase 6 master-data suite | 8/8 |
| Machine-flow suite | 15/15 |
| Print-station master-data smoke | 5/5 |
| WO-CERT-001 runner | 10/10 |
| Browser regression suite | 25 passed, 0 failed, 0 skipped |

## 11. Manual UAT Order

Execute in this order for a complete certification rerun:

1. Confirm environment and safety variables.
2. Run the canonical reset/seed/verify command.
3. Verify site and area hierarchy.
4. Verify lines and line policies.
5. Verify Work Centers and Workstations.
6. Verify machines and machine units.
7. Verify assignments and capabilities.
8. Verify calendars, shifts, and schedules.
9. Verify employees and worker skills.
10. Verify Items, UOMs, and Material Groups.
11. Verify EBOMs and MBOMs.
12. Verify Operations and Routings.
13. Verify Production Version readiness.
14. Verify Standards and skill requirements.
15. Verify Print Station master data.
16. Verify Reason Codes.
17. Open Work Order List directly.
18. Open Work Order Create directly.
19. Create a Work Order with the canonical Production Version.
20. Confirm automatic primary line selection and READY status.
21. Open Resource Planning.
22. Inspect candidates for every operation.
23. Commit exact resources.
24. Revalidate allocations.
25. Approve with strict allocation policy.
26. Start execution.
27. Verify Work Order Detail and operation states.
28. Exercise empty, error, retry, and authorization paths.
29. Exercise locale and keyboard/focus paths.
30. Run browser and API suites.
31. Remove the certification Work Order.
32. Confirm zero residual Work Orders and record the artifact directory.

## 12. Known Gaps and Holds

These gaps prevent Track A strict completion:

- Dedicated CRUD and lifecycle suites are missing for multiple master-data pages.
- The full loading, empty, error, retry, and conflict matrix is not automated per page.
- Complete Vietnamese, English, Japanese, and Korean terminology evidence is not recorded per page.
- Dedicated keyboard, focus, modal, and accessibility automation is missing.
- Direct URL authorization coverage is incomplete for every route and role.

Physical printer and third-party print execution remain excluded because those
runtime dependencies are unavailable. MES-side Print Station master data is
implemented and smoke-tested; this exclusion does not waive page-level UAT
requirements.

No gap blocks the canonical ready-to-run Work Order flow. The gaps block only
the overall strict Track A plus Track B certification status.

## 13. Troubleshooting

| Symptom | Action |
|---|---|
| Safety guard rejects run | Set all required non-production variables exactly. |
| Seed verification fails | Stop, inspect reset output, and fix the invariant before creating a WO. |
| Production Version not ready | Verify release state, effective date, routing, MBOM, line policy, and canonical code. |
| No primary line selected | Verify primary line READY state and assignments, capability, calendar, and skill data. |
| Candidate is blocked | Inspect blocking_errors, capacity_conflicts, assignment, machine, calendar, and worker-skill records. |
| Revalidation is invalid | Do not approve; correct the exact allocation conflict and revalidate. |
| Strict approval rejects | Confirm every mandatory operation has an exact valid allocation. |
| Start execution rejects | Confirm status Released and all approval/allocation gates. |
| Cleanup leaves a WO | Inspect the cleanup output and database row before rerunning. |
| Print execution cannot complete | Record the third-party/physical dependency hold; keep MES-side master data evidence. |

## 14. Coverage Summary

| Track | Scope | Result |
|---|---|---|
| Track A | 30 retained page families, 120 documented use-case slots | 0 strict-complete, 30 incomplete |
| Track B | Canonical reset, seed, create, plan, approve, start, cleanup | Certified 10/10 |
| Overall | Track A plus Track B | Not certified |

## 15. Final Questions and Answers

1. Is the canonical dataset rebuilt and verified? Yes, by the certification runner.
2. Is the canonical Production Version released and effective? Yes.
3. Can the supported workflow create a Work Order? Yes.
4. Does automatic primary line selection work? Yes; current stored mode is PRIMARY with reason PRIMARY_LINE_READY.
5. Is the selected line READY? Yes, WST-SEED-LINE-1.
6. Are all mandatory operations allocatable? Yes, four of four.
7. Does revalidation pass? Yes.
8. Does strict approval pass? Yes, status Released.
9. Does execution start? Yes, status InProgress before cleanup.
10. Is the database clean after the test? Yes, zero Work Orders remain.
11. Is physical or third-party printing certified? No, it is excluded for unavailable runtime dependencies.
12. Is MES-side Print Station master data tested? Yes, 5/5 smoke checks.
13. Is every console page strict-complete? No, page-level evidence gaps remain.
14. What is the current overall certification result? NOT_CERTIFIED.

NOT_CERTIFIED
