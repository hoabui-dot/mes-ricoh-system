# Task — Audit MES Console UI Against the Completed 11-Phase MES Implementation and Produce a Full UI Gap Report

You are working inside the existing S-Factory MES enterprise microservice repository.

The MES backend, database migrations, Resource Planning model, two-production-line model, canonical seed, API verification, and browser E2E preparation have already gone through eleven implementation phases.

However, the current MES Console UI may not fully reflect the completed backend and domain changes.

The current concerns include:

- some obsolete or unnecessary pages may still remain;
- some screens may still expose legacy behavior;
- some fields may be missing, duplicated, misleading, or mapped to obsolete APIs;
- worker skill management appears incomplete;
- employee forms do not appear to support assigning skills;
- current seed scripts may not create employee skill data;
- the Work Order detail screen may still expose only manual Resource Planning;
- the Work Order detail screen may not expose automatic Production Line evaluation;
- the UI may not show Primary Line, Backup Line, fallback reasons, line readiness, or automatic line switching;
- the current Work Order may have been created from seed data that does not contain two eligible Production Lines.

Your task is to perform a complete source-based UI audit and produce a detailed Markdown report.

Do not immediately modify the UI.

First, inspect, compare, document, and classify all findings.

The report must become the authoritative basis for a later MES Console remediation phase.

---

# Main Objectives

The audit must answer the following questions:

1. Does the MES Console currently expose all backend capabilities delivered during the eleven phases?
2. Which MES Console pages are still relevant?
3. Which pages are obsolete, duplicated, compatibility-only, or no longer aligned with the current domain?
4. Which tables display incomplete, incorrect, or obsolete columns?
5. Which CRUD forms are missing required fields?
6. Which fields are present in the UI but no longer belong to the current business model?
7. Which backend capabilities are implemented but not exposed in the UI?
8. Which UI actions still use legacy APIs or legacy concepts?
9. Does worker skill management operate correctly end to end?
10. Does the Employee UI allow skills to be created or assigned?
11. Do current seed scripts generate Worker Skill and Employee Skill data?
12. Does the current Work Order detail UI support the complete two-production-line feature?
13. Does the UI automatically display line evaluation, Primary Line, Backup Line, fallback, and `RESOURCE_HOLD` behavior?
14. Is the observed missing two-line behavior caused by:
    - missing frontend implementation;
    - missing backend response mapping;
    - old API usage;
    - missing seed data;
    - an old Work Order snapshot;
    - a Production Version without two-line eligibility;
    - a Routing or resource hierarchy that was seeded incorrectly?
15. What must be changed before MES Console can be considered aligned with the completed MES architecture?

---

# Required Output

Create:

```text
implementation-fix/mes-console-post-phase11-ui-audit-YYYYMMDD.md
```

Also create:

```text
docs/testing/mes-console-ui-feature-field-matrix.md
docs/testing/mes-console-ui-backend-traceability-matrix.md
docs/testing/mes-console-two-line-work-order-ui-gap-report.md
docs/testing/mes-console-worker-skill-gap-report.md
```

Create machine-readable artifacts when useful:

```text
artifacts/mes-console-ui-audit/<run-id>/route-inventory.json
artifacts/mes-console-ui-audit/<run-id>/field-matrix.json
artifacts/mes-console-ui-audit/<run-id>/api-traceability.json
artifacts/mes-console-ui-audit/<run-id>/work-order-two-line-evidence.json
artifacts/mes-console-ui-audit/<run-id>/worker-skill-evidence.json
```

Do not create placeholder-only documents.

---

# Source Precedence

Use this order:

1. Running MES Console source code.
2. MES Console route definitions.
3. MES Console screen components.
4. MES Console API clients and query hooks.
5. Current backend APIs and use cases.
6. Database migrations and schemas.
7. Current canonical seed and reset scripts.
8. Browser E2E tests.
9. API integration tests.
10. Eleven phase reports.
11. `AI_CONTEXT.md`.
12. `UI_AI_CONTEXT.md`.
13. `AI_document/`.
14. ADRs.
15. Product documents.

When source code and documentation conflict, the current source code and migrations are authoritative.

Do not describe a feature as implemented only because it appears in a phase report.

Verify it in the current repository.

---

# Mandatory Inspection Scope

Inspect at minimum:

```text
services/mes-console/src/App.tsx
services/mes-console/src/routes/**
services/mes-console/src/components/**
services/mes-console/src/lib/**
services/mes-console/src/context/**
services/mes-console/src/hooks/**
services/mes-console/src/i18n.ts
```

Inspect all MES backend routes and use cases relevant to:

- Production Line;
- Production Version Line Eligibility;
- Work Order creation;
- Work Order detail;
- line selection;
- line readiness;
- Primary Line;
- Backup Line;
- fallback;
- `RESOURCE_HOLD`;
- Compute & Check;
- Resource Planning;
- candidates;
- allocation;
- revalidation;
- approval;
- execution start;
- replan;
- worker skills;
- employee skills;
- employee creation/update;
- skill assignment;
- seed generation.

Inspect current migrations and seed scripts for:

- `md_production_line`;
- Production Version Line Eligibility;
- Work Center to Production Line ownership;
- selected line snapshot fields;
- line evaluation result fields;
- Employee Skill tables;
- Worker Skill assignments;
- Operation Skill Requirements;
- skill seed data;
- employee seed data;
- two-line seed data;
- Work Order creation seed data.

Use actual table names from the repository.

---

# Audit Part 1 — Complete MES Console Route Inventory

Create a complete route inventory.

Use:

| Route | Screen component | Feature group | Business object | Current purpose | API used | Current status | Recommendation |
|---|---|---|---|---|---|---|---|

Classify every route as one of:

```text
CURRENT_AND_REQUIRED
CURRENT_BUT_INCOMPLETE
CURRENT_BUT_MISALIGNED
BACKEND_IMPLEMENTED_UI_MISSING
LEGACY_COMPATIBILITY
DUPLICATED_FEATURE
OBSOLETE
DEMO_ONLY
DIAGNOSTIC_ONLY
UNKNOWN_REQUIRES_CONFIRMATION
```

For every route answer:

- Is the route accessible from the sidebar?
- Is it reachable only by direct URL?
- Is it still referenced by another screen?
- Does it use current APIs?
- Does it use current domain terminology?
- Does it display stale or legacy fields?
- Is it covered by E2E?
- Should it remain, be merged, hidden, or removed?

Do not recommend deletion only because a page looks unused.

Verify references, API consumers, and domain ownership first.

---

# Audit Part 2 — Screen-by-Screen Feature Documentation

For every current MES Console screen, document the following:

```markdown
## <Route> — <Screen Name>

### Business purpose

### Domain owner

### User roles

### Current page layout

### Tabs and sections

### Table columns

### Filters

### Search

### Sorting

### Pagination

### Row actions

### Create form

### Edit form

### Detail view

### Delete/deactivate behavior

### APIs called

### Backend fields consumed

### Backend fields ignored by UI

### UI-only fields

### Validation

### Lifecycle behavior

### Dependencies

### E2E coverage

### Current defects

### Alignment with the eleven phases

### Recommendation
```

The audit must be based on source code, not screenshots alone.

---

# Audit Part 3 — Table Column Matrix

For every table in MES Console, create a detailed column matrix.

Use:

| Screen | Column label | Backend field | Business meaning | Required | Sortable | Filterable | Correctly translated | Current issue | Recommendation |
|---|---|---|---|---:|---:|---:|---:|---|---|

For every table verify:

- localized name is primary;
- business code is secondary;
- internal UUID is not used as the main label;
- current lifecycle/status is visible;
- Site/Area/Line context is shown where required;
- parent relationship is understandable;
- important readiness or ownership data is not missing;
- raw enums are not rendered;
- `[object Object]` is not rendered;
- deprecated columns are not displayed;
- columns match the current backend response;
- columns do not infer data that the backend does not provide.

At minimum inspect tables for:

- Items;
- Item Revisions;
- EBOM;
- MBOM;
- Routing;
- Routing Operations;
- Production Versions;
- Production Lines;
- Work Centers;
- Workstations;
- Equipment;
- Physical Machine Units;
- Resource Assignments;
- Resource Capabilities;
- Resource Calendars;
- Production Standards;
- Employees;
- Skills;
- Employee Skills;
- Operation Skill Requirements;
- Work Orders.

---

# Audit Part 4 — CRUD Form Field Matrix

For every Create/Edit form, document every field.

Use:

| Screen | Form mode | Field label | Backend field | Input type | Required | Read-only | Generated by backend | Option source | Dependency | Validation | Current issue |
|---|---|---|---|---|---:|---:|---:|---|---|---|---|

Verify:

- required backend fields are present;
- obsolete fields are removed or hidden;
- read-only generated codes are not editable;
- dependent selections reset correctly;
- Site filters Area;
- Area filters Production Line;
- Production Line filters Work Center;
- Work Center filters Workstation;
- Equipment filters Machine Unit;
- Item filters Item Revision;
- Production Version filters valid resources where applicable;
- form values map correctly into request payloads;
- no field is visually shown but omitted from the payload;
- no hidden default silently creates incorrect ownership;
- edit form hydrates current data;
- create form clears prior edit state;
- form submission uses current APIs.

For every mismatch, report:

```text
UI_MISSING_REQUIRED_FIELD
UI_SENDS_OBSOLETE_FIELD
UI_DOES_NOT_MAP_BACKEND_FIELD
UI_FIELD_NOT_PERSISTED
UI_FIELD_WRONG_OPTION_SOURCE
UI_FIELD_DEPENDENCY_BROKEN
UI_VALIDATION_WEAKER_THAN_BACKEND
```

---

# Audit Part 5 — Backend-to-UI Traceability

Create a traceability matrix from backend capability to MES Console exposure.

Use:

| Backend capability | Service | API | Response field | MES Console screen | UI element | Current coverage | Gap |
|---|---|---|---|---|---|---|---|

At minimum include:

- Production Line CRUD;
- Work Center line ownership;
- Production Version Line Eligibility;
- line readiness;
- Primary Line;
- Backup Line;
- line priority;
- line selection mode;
- selected line;
- fallback reason;
- evaluated line blockers;
- `RESOURCE_HOLD`;
- line lock;
- replan eligibility;
- selected line snapshot;
- operation line snapshot;
- candidate line filtering;
- mixed-line rejection;
- allocation revalidation;
- worker skill assignment;
- employee skill list;
- Operation Skill Requirement;
- labor readiness.

Classify each capability as:

```text
FULLY_EXPOSED
PARTIALLY_EXPOSED
BACKEND_ONLY
UI_ONLY_INVALID
NOT_MAPPED
MAPPED_TO_LEGACY_UI
UNKNOWN
```

---

# Audit Part 6 — Worker Skills and Employee Skill Management

This section is mandatory.

## Current problem to investigate

The current Employee Create form does not appear to allow skill assignment.

Opening an existing employee also does not appear to provide a complete Worker Skill assignment flow.

Current seed scripts may create employees but may not create Employee Skill records.

The audit must determine whether this is:

- intended design;
- missing UI implementation;
- missing API;
- missing seed data;
- hidden in another screen;
- partially implemented;
- broken mapping.

## Required inspection

Inspect:

- Employee list;
- Employee Create form;
- Employee Edit form;
- Employee detail;
- Skill Management screen;
- Worker Skills tab;
- Operation Skill Requirements;
- employee-related APIs;
- skill-related APIs;
- Employee Skill API;
- database schema;
- canonical seed scripts;
- E2E tests;
- i18n labels.

## Required report content

Document:

### Employee feature

- current employee fields;
- current employee CRUD behavior;
- whether skill assignment belongs in Employee Create;
- whether skill assignment belongs in Employee Detail;
- whether a separate Worker Skills screen is authoritative.

### Skill feature

- Skill Definition;
- Skill scope;
- Skill lifecycle;
- Worker Skill assignment;
- qualification level;
- effective date;
- expiry date;
- certificate where supported;
- deactivation/end behavior.

### Seed verification

Identify whether current seed scripts create:

- Skill Definitions;
- Employees;
- Employee Skills;
- Operation Skill Requirements;
- Employee Shift Schedules;
- headcount/readiness data.

Provide exact counts and business codes from the seeded environment.

## Required worker-skill matrix

| Capability | Backend | Database | UI | Seed | Test | Status | Required fix |
|---|---|---|---|---|---|---|---|

Include:

- create Skill;
- edit Skill;
- assign Skill to Employee;
- remove/end Skill assignment;
- display Worker Skills;
- filter by Skill;
- validate expired Skill;
- validate insufficient level;
- use Skill in Resource Planning;
- seed Employee Skill data.

## Required conclusion

Clearly answer:

1. Can an admin currently assign skills to a worker?
2. Which UI screen is intended to do this?
3. Is the Employee form missing an expected feature?
4. Is a separate Worker Skills screen present and functional?
5. Does the current canonical seed contain worker skills?
6. Can Resource Planning currently use seeded employee skills?
7. What UI, API, or seed fixes are required?

Do not assume Employee Create must contain skills if the current architecture owns assignments elsewhere.

Determine the correct ownership first.

---

# Audit Part 7 — Work Order Detail Two-Line Feature Verification

This section is mandatory and must focus on:

```text
/work-orders/ad71bae7-0252-46db-a1f0-e9e0fad3c468
```

Treat this ID as a test target only.

Do not assume the record exists in every environment.

If it does not exist, report that and locate the equivalent current seeded Work Order.

## Current concern

The Work Order detail page still appears to show a manual Resource Planning section where the user manually checks and commits resources.

The page does not visibly appear to:

- automatically evaluate the Primary Line;
- evaluate the Backup Line;
- display line readiness;
- display why the Primary Line failed;
- automatically select the Backup Line;
- display fallback reason;
- display `RESOURCE_HOLD`;
- restrict all operations to one selected line;
- expose line-wide planning behavior.

The audit must determine whether this is caused by frontend, backend, data, or snapshot issues.

## Required investigation order

### Step 1 — Inspect the target Work Order

Determine:

- Work Order code;
- status;
- Production Version;
- Item Revision;
- Routing;
- operation count;
- selected Production Line;
- line-selection mode;
- line-selection status;
- line snapshot;
- operation line snapshots;
- creation timestamp;
- whether it was created before or after two-line migrations;
- whether it is an old historical Work Order.

### Step 2 — Inspect Production Version

Determine whether its Production Version has:

- active Line 1 eligibility;
- active Line 2 eligibility;
- exactly one Primary Line;
- deterministic priorities;
- matching Site;
- valid effectivity;
- readiness-compatible Work Centers.

### Step 3 — Inspect Routing

Determine:

- whether Routing is shared;
- whether Routing Operations still point directly to only one physical line's Work Centers;
- whether line resolution is implemented through a new mapping layer;
- whether Routing was seeded using legacy one-line structure;
- whether this prevents automatic line selection.

### Step 4 — Inspect resource hierarchy

For each line determine whether it has:

- all required Work Centers;
- all required Workstations;
- Equipment;
- Machine Units;
- Resource Assignments;
- Capabilities;
- Calendars;
- Standards;
- sufficient capacity.

### Step 5 — Inspect backend response

Capture the Work Order detail and planning APIs.

Verify whether responses include:

- eligible lines;
- Primary Line;
- Backup Line;
- evaluated line results;
- selected line;
- fallback reason;
- blockers;
- hold status;
- line lock;
- operation line IDs;
- candidate line IDs.

### Step 6 — Inspect UI mapping

Verify whether MES Console:

- receives these fields;
- defines TypeScript types for them;
- renders them;
- ignores them;
- maps them into legacy manual planning structures;
- exposes line selection in another tab;
- incorrectly hides the data due to status or feature flag.

### Step 7 — Inspect seed scripts

Verify whether the current canonical seed creates:

- two Production Lines;
- eight required Work Centers if the route has four operations;
- Workstations for both lines;
- separate equipment resources;
- Production Version Line Eligibility;
- one Primary and one Backup;
- line-ready calendars and standards;
- a newly created Work Order after seed.

## Required root-cause classification

Classify the issue using one or more:

```text
UI_NOT_IMPLEMENTED
UI_PARTIALLY_IMPLEMENTED
UI_NOT_MAPPING_RESPONSE
UI_USES_LEGACY_API
BACKEND_NOT_RETURNING_LINE_DATA
BACKEND_LINE_SELECTION_NOT_TRIGGERED
SEED_MISSING_PRODUCTION_LINES
SEED_MISSING_LINE_ELIGIBILITY
SEED_MISSING_SECOND_LINE_RESOURCES
ROUTING_STILL_SINGLE_LINE_BOUND
WORK_ORDER_CREATED_BEFORE_TWO_LINE_CHANGE
WORK_ORDER_SNAPSHOT_LEGACY
FEATURE_FLAG_DISABLED
DATA_EFFECTIVITY_INVALID
RESOURCE_READINESS_BLOCKED
UNKNOWN_REQUIRES_RUNTIME_CONFIRMATION
```

## Required issue report

Create a dedicated issue section:

```markdown
## Critical Issue — Work Order Detail Does Not Demonstrate Two-Line Planning

### Observed behavior

### Expected behavior

### Target Work Order

### Frontend evidence

### API evidence

### Database evidence

### Seed evidence

### Root cause

### Business impact

### Severity

### Required fix

### Required migration/backfill

### Required seed correction

### Required E2E coverage

### Acceptance criteria
```

## Expected UI capabilities after remediation

The Work Order detail should expose, when implemented by backend:

- selected Production Line;
- Primary Line;
- Backup Line;
- selection mode;
- line evaluation state;
- Primary blockers;
- Backup blockers;
- fallback reason;
- `RESOURCE_HOLD`;
- line lock;
- operation line consistency;
- line-wide readiness summary;
- candidate filtering by selected line;
- replan/change-line action when allowed;
- audit/history.

Do not implement these in this audit task.

Document whether each capability exists.

---

# Audit Part 8 — Manual Resource Planning Versus Automatic Line Planning

Clarify the relationship between:

```text
Automatic line selection
```

and:

```text
Manual per-operation resource allocation
```

The report must explain whether the intended flow is:

```text
1. Backend evaluates complete Production Lines.
2. Backend selects one line.
3. MES Console displays the selected line and reasons.
4. Resource Planning shows only candidates inside that line.
5. User manually commits a candidate for each operation.
```

or:

```text
1. Backend automatically selects both line and exact resources.
2. No manual resource selection is required.
```

Use current implementation evidence.

Do not assume automatic line selection means automatic Workstation and Machine Unit allocation.

The report must explicitly distinguish:

- automatic line evaluation;
- automatic line selection;
- manual candidate commit;
- automatic resource allocation;
- planner override;
- replan.

This distinction is critical.

---

# Audit Part 9 — Seed Data Audit

Inspect all current reset and seed scripts.

Create:

| Script | Purpose | Creates two lines | Creates line eligibility | Creates workers | Creates worker skills | Creates route | Creates WO | Current issue |
|---|---|---:|---:|---:|---:|---:|---:|---|

Verify exact seeded counts for:

- Sites;
- Areas;
- Production Lines;
- Work Centers;
- Workstations;
- Equipment;
- Machine Units;
- Resource Assignments;
- Skills;
- Employees;
- Employee Skills;
- Items;
- Revisions;
- EBOMs;
- MBOMs;
- Routings;
- Routing Operations;
- Production Versions;
- Line Eligibility records;
- Work Orders.

## Seed acceptance requirements

The canonical seed must create:

- one complete Primary Line;
- one complete Backup Line;
- valid line eligibility;
- one shared Routing;
- valid resources for every mandatory operation;
- worker skills if current Resource Planning uses them;
- a newly created Work Order or sufficient data to create one through UI;
- no dependency on historical database rows.

Report any seed gap as a first-class issue.

---

# Audit Part 10 — UI Pages to Remove, Merge, or Retain

Create a recommendation matrix:

| Page | Current use | Current owner | Duplicate of | Backend dependency | Recommendation | Risk |
|---|---|---|---|---|---|---|

Recommendations:

```text
KEEP
KEEP_AND_FIX
MERGE
HIDE_FROM_NAVIGATION
DEPRECATE
REMOVE_AFTER_CONSUMER_AUDIT
REPLACE_WITH_NEW_SCREEN
```

Examples of pages to inspect carefully:

- legacy Workstation Supported Operations;
- duplicate Resource Capability pages;
- generic Tier 2 screens;
- old Resource Planning panels;
- duplicate Skill screens;
- standalone Line pages versus embedded line management;
- obsolete Work Order actions;
- diagnostic screens shown to normal users.

Do not delete pages during this task.

---

# Audit Part 11 — UI Alignment With Each of the Eleven Phases

Create a phase traceability table.

Use:

| Phase | Backend/domain output | Expected MES Console change | Current UI evidence | Status | Gap |
|---:|---|---|---|---|---|

For every completed phase determine:

- what changed in backend/domain;
- whether UI was expected to change;
- whether UI changed;
- whether tests cover it;
- whether seed supports it.

The audit must make it possible to trace why the backend is complete while UI may still be stale.

---

# Required Issue Severity

Classify findings:

```text
CRITICAL
HIGH
MEDIUM
LOW
INFORMATIONAL
```

The following are automatically Critical or High:

## Critical

- UI allows mixed-line allocation;
- Work Order detail hides backend-selected line and allows inconsistent planning;
- fallback is implemented in backend but not visible to user;
- UI sends legacy payload that bypasses line selection;
- Production Version UI cannot configure line eligibility;
- seed does not create two-line data, preventing validation;
- UI reports Ready while backend reports Blocked.

## High

- Employee Skill cannot be assigned anywhere;
- seed omits Employee Skills required by readiness;
- required CRUD fields are missing;
- UI uses obsolete API;
- backend field is ignored;
- line blockers are not translated;
- old pages create duplicate ownership.

---

# Required Remediation Backlog

At the end, create a prioritized backlog.

Use:

| Priority | Issue ID | Area | Problem | Root cause | Required change | Services/files | Migration | Seed change | Tests |
|---:|---|---|---|---|---|---|---:|---:|---|

Group backlog into:

1. Critical two-line Work Order UI;
2. Production Line and Line Eligibility UI;
3. Resource Planning UI;
4. Worker Skill and Employee Skill UI;
5. Seed corrections;
6. Legacy page cleanup;
7. CRUD field mapping;
8. i18n;
9. E2E coverage;
10. documentation.

Do not implement the backlog in this task.

---

# Required Acceptance Criteria for the Audit

The audit passes only when:

- every MES Console route is inventoried;
- every table column is documented;
- every CRUD form field is documented;
- every backend capability is traced to UI;
- Worker Skill behavior is conclusively classified;
- Employee Skill seed data is verified;
- the target Work Order is inspected;
- its Production Version and Routing are inspected;
- two-line seed data is inspected;
- the root cause of missing two-line behavior is identified or explicitly marked unknown;
- obsolete pages are classified;
- a remediation backlog is produced;
- no planned feature is described as current;
- evidence paths and source files are included.

---

# Required Final Report Summary

At the beginning of the main report, include an executive summary with:

```text
MES Console overall alignment status
Two-line Work Order UI status
Production Line UI status
Line Eligibility UI status
Worker Skill UI status
Employee Skill seed status
Legacy page status
Critical issue count
High issue count
Recommended next implementation phase
```

Use one overall status:

```text
ALIGNED
PARTIALLY_ALIGNED
BACKEND_READY_UI_INCOMPLETE
UI_BLOCKS_TWO_LINE_UAT
SEED_BLOCKS_TWO_LINE_UAT
NOT_READY
```

---

# Mandatory Rules

- Do not modify code during the audit.
- Do not modify migrations.
- Do not modify seed data.
- Do not remove pages.
- Do not infer UI behavior from backend alone.
- Do not infer backend behavior from UI alone.
- Do not treat phase reports as proof without source verification.
- Do not assume the target Work Order is current.
- Do not assume the target Production Version has two-line eligibility.
- Do not assume missing UI behavior is a frontend defect before checking seed and snapshots.
- Do not assume Worker Skills belong inside Employee Create without checking domain ownership.
- Do not hide legacy behavior.
- Do not describe manual Resource Planning as wrong until comparing it with the intended line-selection design.
- Do not expose credentials or access tokens.
- Use exact source paths and API paths.
- Record every important uncertainty.

---

# Completion Response

After creating all reports, provide a short English completion summary containing:

- files created;
- routes inspected;
- tables inspected;
- forms inspected;
- backend capabilities traced;
- Worker Skill conclusion;
- Employee Skill seed conclusion;
- target Work Order conclusion;
- two-line UI root cause;
- obsolete page count;
- Critical issue count;
- High issue count;
- recommended next phase;
- final report path.

Do not claim that the MES Console has been fixed.

This task only performs the complete post-Phase-11 UI audit and produces the remediation basis.