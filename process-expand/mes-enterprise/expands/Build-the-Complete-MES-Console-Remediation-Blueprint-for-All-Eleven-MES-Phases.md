# Task — Build the Complete MES Console Remediation Blueprint for All Eleven MES Phases

You are working inside the existing S-Factory MES enterprise microservice repository.

The MES backend, database schema, Resource Planning model, two-production-line model, canonical reset/seed workflow, API tests, and browser test foundation have already gone through eleven implementation phases.

A post-Phase-11 UI audit has identified that the MES backend is broadly ready while MES Console remains incomplete, partially misaligned, or difficult to verify.

This task is a mandatory discovery and design gate before making broad MES Console changes.

Do not modify frontend source code, backend source code, migrations, seed scripts, routes, or tests during this task.

Your task is to inspect the entire current implementation and produce one authoritative Markdown blueprint that defines exactly how MES Console must be remediated across all eleven phases.

---

# Required Output

Create exactly one canonical document:

```text
AI_document/MES_CONSOLE_FULL_REMEDIATION_BLUEPRINT.md
```

Do not split the authoritative result across multiple Markdown reports.

Supporting JSON artifacts may be created under:

```text
artifacts/mes-console-remediation-blueprint/<run-id>/
```

However, every conclusion, decision, matrix, issue, dependency, and implementation phase must be consolidated into the single Markdown file.

The document must be written in English.

---

# Objective

The blueprint must make it safe to perform a complete MES Console remediation covering:

- every MES Console page;
- every current route;
- every sidebar item;
- every legacy alias;
- every table and column;
- every CRUD form and field;
- every detail screen;
- every tab and panel;
- every action and button;
- every backend-to-UI mapping;
- every lifecycle/status display;
- every permission rule;
- every output introduced by the eleven MES phases;
- Worker Skills and Employee Skills;
- Production Line and Production Version Line Eligibility;
- Work Order automatic line selection;
- Primary and Backup Line evaluation;
- `RESOURCE_HOLD`;
- fallback explanation;
- manual per-operation Resource Planning;
- replan;
- allocation;
- approval;
- execution start;
- canonical seed dependencies;
- Playwright E2E coverage;
- removal, merging, redirecting, or retention of legacy pages.

The blueprint must answer whether implementation can proceed safely.

---

# Known Findings That Must Be Reverified

Do not accept these findings only because they appear in previous reports.

Confirm them against current source and runtime evidence.

## Overall status

Previous audit status:

```text
BACKEND_READY_UI_INCOMPLETE
```

## Known critical findings

### Worker Skill seed mismatch

Current canonical seed reportedly creates worker-related skills with:

```text
scope = WorkCenter
```

while the following contracts require:

```text
scope = Employee
```

Relevant APIs reportedly include:

```text
GET /worker-skills
POST /worker-skills
GET /employees/:id/skills
PUT /employees/:id/skills
POST /worker-skills/:id/assignments
POST /worker-skills/:id/assignments/:employeeId/end
```

Reverify the current schema, API validation, UI option queries, seed data, and database records.

### Two-line Work Order target

The Work Order:

```text
ad71bae7-0252-46db-a1f0-e9e0fad3c468
```

was previously reported as:

```text
status = ResourceHold
line_selection_mode = AUTO
line_selection_status = RESOURCE_HOLD
selected_production_line_id = NULL
```

Reverify its current state.

Determine whether it is:

- a valid Resource Hold UAT fixture;
- an old snapshot;
- affected by invalid seed data;
- affected by Worker Skill readiness;
- affected by missing resource data;
- unsuitable for Primary or Backup Line proof.

### Manual Resource Planning

The current intended flow is believed to be:

```text
Automatic whole-Work-Order line evaluation
→ automatic selection of one Production Line
→ manual per-operation selection of exact resource candidates inside the selected line
```

Verify whether this is the actual implemented architecture.

Do not incorrectly remove manual candidate allocation merely because automatic line selection exists.

---

# Source Precedence

Use this order:

1. Current running source code.
2. MES Console routes and components.
3. MES Console API clients, hooks, types, and query models.
4. Current backend handlers and use cases.
5. Database migrations and schema.
6. Current canonical reset and seed scripts.
7. Current database state in the approved disposable environment.
8. API integration tests.
9. Browser E2E tests.
10. Docker Compose and runtime configuration.
11. Eleven phase implementation reports.
12. Current AI context and AI documentation.
13. ADRs.
14. Product documentation.

When sources conflict, document the conflict and follow the current implementation.

Do not use a historical phase report as proof of current behavior.

---

# Mandatory Source Inspection

Inspect at minimum:

```text
services/mes-console/src/App.tsx
services/mes-console/src/routes/**
services/mes-console/src/components/**
services/mes-console/src/lib/**
services/mes-console/src/hooks/**
services/mes-console/src/context/**
services/mes-console/src/i18n.ts
services/mes-console/package.json
e2e/**
scripts/**
AI_CONTEXT.md
UI_AI_CONTEXT.md
AI_document/**
process-expand/mes-enterprise/**
```

Inspect MES backend source for:

- MES Master Data;
- MES Execution;
- MES Traceability;
- MES Kiosk Gateway;
- Production Lines;
- Work Center line ownership;
- Production Version Line Eligibility;
- line selection;
- line readiness;
- evaluated line results;
- fallback;
- Resource Hold;
- line replan;
- Resource Planning;
- allocation;
- reallocation;
- cancellation;
- approval;
- execution;
- Worker Skills;
- Employee Skills;
- Operation Skill Requirements;
- employee scheduling;
- resource readiness.

Inspect all current migrations and canonical seed scripts relevant to these concepts.

---

# Section 1 — Executive Readiness Assessment

At the start of the blueprint, provide:

```text
Overall MES Console alignment status
Current backend readiness
Current UI readiness
Current canonical seed readiness
Worker Skill readiness
Two-line Work Order readiness
Route cleanup readiness
E2E readiness
Number of Critical findings
Number of High findings
Implementation recommendation
```

Use one status:

```text
READY_FOR_IMPLEMENTATION
READY_WITH_PRODUCT_DECISIONS
NOT_READY_MISSING_SOURCE_EVIDENCE
NOT_READY_SEED_INVALID
NOT_READY_DOMAIN_CONFLICT
BLOCKED_BY_RUNTIME
```

---

# Section 2 — Complete Route and Navigation Inventory

Inventory every MES Console route.

Use:

| Route | Component | Sidebar entry | Parent navigation | Business object | API family | Role access | Current status | Final decision |
|---|---|---:|---|---|---|---|---|---|

Classify current status:

```text
CURRENT_AND_ALIGNED
CURRENT_BUT_INCOMPLETE
CURRENT_BUT_MISALIGNED
LEGACY_ALIAS
DUPLICATED
OBSOLETE
DEMO_ONLY
DIAGNOSTIC_ONLY
BROKEN
UNKNOWN
```

Final decision must be one of:

```text
KEEP
KEEP_AND_FIX
MERGE
REDIRECT
HIDE_FROM_NAVIGATION
DEPRECATE
REMOVE_AFTER_CONSUMER_MIGRATION
REPLACE
REQUIRES_PRODUCT_DECISION
```

For every route selected for merge, redirect, deprecation, or removal, document:

- replacement route;
- inbound references;
- sidebar references;
- internal links;
- external bookmark risk;
- user role impact;
- E2E impact;
- API impact;
- redirect period;
- deletion gate.

No route may be removed solely because it appears unused visually.

---

# Section 3 — Eleven-Phase Traceability Matrix

Create a complete matrix:

| Phase | Domain/backend requirement | Migration/schema | API | Seed data | Expected MES Console capability | Current UI | E2E | Gap | Required remediation |
|---:|---|---|---|---|---|---|---|---|---|

Cover all eleven phases.

Do not focus only on the latest two-line phase.

For each phase identify every UI impact, including:

- new screens;
- changed fields;
- changed actions;
- new statuses;
- removed legacy assumptions;
- new error codes;
- new validations;
- new evidence panels;
- new role rules;
- seed dependencies.

---

# Section 4 — Screen-by-Screen Functional Contract

For every current screen, create a detailed functional contract.

Use this structure:

```markdown
## <Route> — <Screen Name>

### Business purpose

### Domain owner

### Intended users and roles

### Position in the complete MES flow

### Upstream prerequisites

### Downstream consumers

### Current APIs

### Current UI behavior

### Required final UI behavior

### Current defects

### Final route decision

### Required implementation files

### Required tests

### Acceptance criteria
```

Every page must be covered.

---

# Section 5 — Complete Table Column Contract

For every table, document every column.

Use:

| Screen | Column label | Backend field | Business meaning | Required in final UI | Sort | Filter | Translation | Current state | Required change |
|---|---|---|---|---:|---:|---:|---:|---|---|

Verify:

- localized name first;
- business code second;
- UUID not used as primary identity;
- lifecycle visible;
- effectivity visible where required;
- parent hierarchy visible;
- Site/Area/Line context visible where required;
- selected line visible for Work Orders;
- line-selection status visible;
- Resource Hold and fallback visible;
- readiness visible where useful;
- no raw enum;
- no `[object Object]`;
- no obsolete columns;
- no hidden critical state.

Specify the final column order.

---

# Section 6 — Complete CRUD Form Contract

For every Create/Edit form, document every field.

Use:

| Screen | Mode | Field | Backend field | Input control | Required | Mutable | Option source | Dependency | Validation | Final requirement |
|---|---|---|---|---|---:|---:|---|---|---|---|

For each field determine:

- required or optional;
- editable or immutable;
- frontend-generated or backend-generated;
- source of dropdown options;
- dependent-field reset behavior;
- lifecycle rule;
- effectivity rule;
- payload mapping;
- response hydration;
- create behavior;
- edit behavior;
- error rendering.

Identify:

```text
MISSING_REQUIRED_FIELD
OBSOLETE_FIELD
FIELD_NOT_PERSISTED
FIELD_NOT_HYDRATED
WRONG_OPTION_SOURCE
BROKEN_DEPENDENCY
BACKEND_FIELD_NOT_EXPOSED
UI_FIELD_WITHOUT_BACKEND_OWNERSHIP
```

---

# Section 7 — Detail Screens, Tabs, Panels, and Actions

For every detail screen document:

- tabs;
- panels;
- cards;
- history sections;
- dependency sections;
- readiness sections;
- audit sections;
- action menus;
- lifecycle actions.

Use:

| Screen | Tab/panel/action | Business purpose | API | Permission | Current status | Required final behavior |
|---|---|---|---|---|---|---|

Document exact final behavior for:

- Create;
- Edit;
- Save;
- Release;
- Deactivate;
- Delete;
- Dependency Check;
- Compute & Check;
- Select Candidate;
- Commit;
- Cancel Allocation;
- Reallocate;
- Revalidate;
- Approve;
- Reject;
- Start Execution;
- Replan Line;
- Retry;
- Refresh.

---

# Section 8 — Permission and Resource-Scope Matrix

Create a complete role matrix based on Keycloak, Kong, backend route gates, and frontend visibility.

Use:

| Screen/action | Admin | Planner | Production Manager | Operator | Viewer | Executive | Cross-site user | Backend enforcement | UI enforcement |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|

Use only actual roles.

Document:

- hidden actions;
- disabled actions;
- forbidden API calls;
- cross-site restrictions;
- resource-scope filtering;
- forged-request behavior;
- missing negative tests.

---

# Section 9 — Worker Skill and Employee Skill Final Design

Resolve the current ownership ambiguity.

Inspect and document:

- Skill Definition;
- Worker Skill Definition;
- Employee Skill Assignment;
- Operation Skill Requirement;
- employee schedule;
- readiness use;
- seed creation;
- UI mutation paths;
- backend mutation paths.

Compare these UX options:

## Option A

```text
Employee modal is the only authority for assigning skills to employees.
Worker Skill detail only shows assignments.
```

## Option B

```text
Employee modal and Worker Skill detail both allow assignment mutation.
```

## Option C

```text
Dedicated Employee Skill Assignment screen owns the relationship.
```

For each option evaluate:

- clarity;
- duplicate mutation paths;
- permission;
- audit;
- backend support;
- maintenance;
- testing.

Select one final UX design or mark it as:

```text
REQUIRES_PRODUCT_DECISION
```

Regardless of UX choice, the blueprint must require:

- canonical worker skills use `scope=Employee`;
- Employee Skill rows reference Employee-scoped skills;
- Operation Skill Requirements reference Employee-scoped skills;
- seed creates valid skills and assignments;
- Employee UI loads the same definitions;
- readiness consumes the same domain identity.

Define exact final Employee form behavior.

---

# Section 10 — Production Line and Line Eligibility UI Contract

Define the final UI for:

- Production Line list;
- Production Line detail;
- Work Center ownership;
- line readiness summary;
- Production Version Line Eligibility;
- Primary flag;
- priority;
- efficiency factor;
- effectivity;
- validation;
- readiness preview.

Specify where Line Eligibility belongs:

- Production Version Create/Edit;
- Production Version Detail;
- separate tab;
- list summary.

Define the exact final table columns, form fields, tabs, actions, and validation.

---

# Section 11 — Work Order List Final Contract

Define final required columns:

- Work Order code;
- Item;
- quantity;
- target date;
- status;
- selected Production Line;
- line-selection status;
- Primary/Backup result indicator;
- fallback badge;
- Resource Hold badge;
- approval state;
- execution state;
- actions.

Define filters for:

- selected line;
- line-selection status;
- Resource Hold;
- fallback used;
- Work Order status;
- Production Version;
- Site;
- date.

Use actual backend support.

If an API filter is missing, document the required API change instead of filtering only in the browser.

---

# Section 12 — Work Order Detail Final Two-Line Contract

Define the final screen contract for:

- summary;
- selected line;
- Primary Line;
- Backup Line;
- line-selection mode;
- line-selection status;
- fallback reason;
- Resource Hold reason;
- evaluated line results;
- line lock;
- replan eligibility;
- operation line consistency;
- resource candidates;
- allocation history;
- approval;
- execution.

Define a complete evaluated-line matrix:

| Dimension | Primary Line | Backup Line |
|---|---|---|
| Eligibility | | |
| Work Centers | | |
| Workstations | | |
| Machine Requirements | | |
| Equipment/Machine Units | | |
| Assignments | | |
| Capability | | |
| Calendar/Shift | | |
| Production Standard | | |
| Capacity | | |
| Worker Skill/Labor | | |
| Final result | | |
| Selection reason | | |

Use only dimensions returned or provably computable by backend.

Do not duplicate readiness logic in frontend.

If backend does not currently provide enough structured data, specify the API response extension required.

---

# Section 13 — Automatic Line Selection Versus Manual Resource Allocation

Document the final supported flow.

Explicitly determine whether it is:

```text
automatic whole-line selection
+ manual per-operation exact resource allocation
```

or:

```text
automatic whole-line selection
+ automatic exact resource allocation
```

For every step define:

- backend owner;
- UI owner;
- user decision;
- persisted state;
- audit;
- retry;
- lifecycle lock.

Prevent future AI agents from deleting valid manual Resource Planning based on a misunderstanding of automatic line selection.

---

# Section 14 — Canonical Seed Requirements

Define the final seed contract required for MES Console.

Include exact required counts and relationships for:

- Sites;
- Areas;
- Production Lines;
- Work Centers;
- Workstations;
- Equipment;
- Machine Units;
- Resource Assignments;
- Resource Capabilities;
- Calendars;
- Shifts;
- Production Standards;
- Employee-scoped Worker Skills;
- Employees;
- Employee Skills;
- Employee Schedules;
- Operation Skill Requirements;
- Items;
- Revisions;
- EBOMs;
- MBOMs;
- Routings;
- Routing Operations;
- Production Versions;
- Line Eligibility;
- UAT Work Orders.

Require at least three deterministic UAT Work Orders:

```text
Primary Line READY
Backup Line fallback READY
Both Lines RESOURCE_HOLD
```

Determine whether these should be persistently seeded or generated by an idempotent UAT preparation script.

---

# Section 15 — Legacy Page Cleanup Plan

For every route proposed for removal or merge, define:

```text
current route
replacement route
consumer inventory
redirect
deprecation notice
E2E migration
removal version
rollback
```

At minimum resolve:

- `/console/mes/skills`;
- `/master-data/equipment`;
- `/master-data/machines`;
- `/master-data/production-areas`;
- `/master-data/product-recipes`;
- `/console/mes/*` aliases;
- legacy generic Tier 2 screens;
- duplicate Resource Planning surfaces;
- duplicate Skill surfaces.

---

# Section 16 — UI Design and Component Standardization

Define required shared components for:

- Data Table;
- filters;
- pagination;
- modal;
- confirmation;
- detail drawer;
- status badge;
- lifecycle badge;
- line-selection badge;
- readiness matrix;
- blocker list;
- warning panel;
- field group;
- tabs;
- empty state;
- loading state;
- error state;
- dependency panel;
- audit timeline.

Identify current duplicated implementations.

Specify which components should become canonical wrappers.

Do not redesign the entire visual identity unless required.

Preserve the operational, dense, enterprise MES style.

---

# Section 17 — API and TypeScript Contract Changes

List every required:

- API field addition;
- endpoint addition;
- query parameter;
- frontend type update;
- response mapping;
- query-key update;
- invalidation;
- mutation hook;
- error translation;
- feature flag removal;
- backward compatibility concern.

Use:

| Change ID | Service | API/type | Current behavior | Required behavior | Compatibility impact |
|---|---|---|---|---|---|

Do not propose frontend-calculated business authority.

---

# Section 18 — i18n Contract

Inventory all required VI, EN, JA, and KO keys.

Cover:

- pages;
- columns;
- form fields;
- statuses;
- lifecycle;
- line roles;
- fallback;
- hold;
- blockers;
- skill scope;
- assignment;
- validation;
- authorization;
- legacy redirect notices.

Identify:

- missing keys;
- raw enum rendering;
- duplicate keys;
- inconsistent terminology;
- backend messages rendered directly.

---

# Section 19 — Testing and Verification Plan

Define the complete remediation test strategy.

## Static checks

- typecheck;
- lint;
- build.

## API integration

- current Resource Planning Phase 1 suite;
- Phase 2 full flow;
- two-line full flow;
- Worker Skill API flow;
- Employee Skill assignment;
- canonical seed verification.

## Browser E2E

Cover:

- every retained page smoke;
- every CRUD form;
- table columns;
- dependent field reset;
- lifecycle;
- permission;
- Worker Skills;
- Employee Skills;
- Production Line;
- Line Eligibility;
- Primary Line WO;
- Backup Line fallback WO;
- Resource Hold WO;
- mixed-line rejection;
- replan;
- approval;
- execution;
- refresh persistence;
- legacy redirects.

## Visual evidence

Require screenshots and Playwright traces for critical flows.

## Cleanup

Require exact cleanup and fixture restoration.

No mandatory test may be skipped.

---

# Section 20 — Implementation Phase Plan

Break remediation into safe implementation phases.

Recommended structure:

```text
Phase UI-0 — Freeze and approve blueprint
Phase UI-1 — Fix canonical seed and Worker Skill domain consistency
Phase UI-2 — Route, navigation, and legacy redirect cleanup
Phase UI-3 — Shared table/form/detail component standardization
Phase UI-4 — Product definition and Production Version UI alignment
Phase UI-5 — Resource foundation UI alignment
Phase UI-6 — Worker Skill and Employee Skill UX
Phase UI-7 — Work Order list and two-line detail diagnostics
Phase UI-8 — Resource Planning and lifecycle action alignment
Phase UI-9 — Permission, i18n, loading, error, and accessibility
Phase UI-10 — Full regression, UAT fixtures, and final report
```

For each phase define:

- objective;
- scope;
- files;
- migrations;
- seed changes;
- API changes;
- frontend changes;
- tests;
- completion gate;
- rollback;
- dependencies.

Do not combine all UI changes into one uncontrolled phase.

---

# Section 21 — Prioritized Remediation Backlog

Create:

| Priority | Issue ID | Area | Current defect | Root cause | Required change | Files/services | Seed | API | E2E |
|---:|---|---|---|---|---|---|---:|---:|---:|

Use:

```text
P0 Critical
P1 High
P2 Medium
P3 Low
```

At minimum include:

- Worker Skill seed scope;
- Employee Skill mapping;
- Operation Skill Requirement mapping;
- evaluated-line diagnostic matrix;
- Primary/Backup/ResourceHold UAT data;
- Work Order List line columns;
- Production Version Line Eligibility summary;
- Worker Skill assignment UX;
- legacy skills route;
- equipment/machines naming;
- Production Area navigation;
- route redirects;
- missing fields;
- missing table columns;
- missing API response mappings;
- missing E2E tests.

---

# Section 22 — Product Decisions Still Required

Create a concise decision list.

Use:

| Decision ID | Question | Options | Technical impact | Recommended option | Blocking? |
|---|---|---|---|---|---:|

Examples:

- Which screen owns Employee Skill assignment?
- Should Worker Skill detail allow assignment mutations?
- Should UAT Work Orders be permanently seeded?
- Should `/equipment` or `/machines` become canonical?
- How long should legacy aliases remain?
- Should line readiness be visible on Production Version list or only detail?
- Should exact resources remain manually committed?

Do not silently choose a product decision when evidence is insufficient.

---

# Section 23 — Implementation Readiness Gate

At the end, provide a checklist:

```text
[ ] All routes inventoried
[ ] All route consumers identified
[ ] All screens documented
[ ] All table columns defined
[ ] All CRUD fields defined
[ ] All backend capabilities mapped
[ ] All role permissions mapped
[ ] Worker Skill ownership resolved
[ ] Seed correction specified
[ ] Two-line Work Order contract specified
[ ] Legacy page replacement paths specified
[ ] API changes identified
[ ] E2E coverage defined
[ ] Product decisions resolved or explicitly accepted
```

Use one final status:

```text
READY_FOR_IMPLEMENTATION
READY_AFTER_PRODUCT_DECISIONS
NOT_READY_MISSING_EVIDENCE
NOT_READY_SEED_OR_DOMAIN_CONFLICT
BLOCKED_BY_RUNTIME
```

Implementation must not begin unless the status is:

```text
READY_FOR_IMPLEMENTATION
```

or the user explicitly accepts every blocking product decision.

---

# Mandatory Rules

- Do not modify code in this task.
- Do not remove routes.
- Do not update migrations.
- Do not update seed data.
- Do not treat backend availability as proof of UI exposure.
- Do not treat UI controls as proof of backend authority.
- Do not infer unused routes without reference analysis.
- Do not remove manual Resource Planning without proving it is obsolete.
- Do not duplicate domain ownership.
- Do not put Worker Skill assignments under two conflicting authorities without an explicit UX decision.
- Do not calculate line readiness in frontend.
- Do not expose UUIDs as primary identities.
- Do not preserve obsolete pages merely to avoid analysis.
- Do not recommend page removal without a replacement and migration path.
- Do not count skipped tests as coverage.
- Do not expose credentials.
- Use exact source paths and exact API paths.
- Record all uncertainties.

---

# Completion Response

After creating the blueprint, provide a short summary containing:

- output path;
- routes inventoried;
- screens documented;
- tables documented;
- forms documented;
- eleven phases mapped;
- Critical findings;
- High findings;
- product decisions required;
- seed corrections required;
- route removals proposed;
- route merges proposed;
- API changes required;
- final readiness status.

Do not implement the remediation in this task.