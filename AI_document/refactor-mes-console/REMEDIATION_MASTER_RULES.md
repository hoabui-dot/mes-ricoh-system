# MES Console Remediation Master Rules

Version: 1.0  
Status: ACTIVE  
Target system: S-Factory MES Enterprise  
Applies to: Phase UI-00 through Phase UI-10  
Canonical blueprint: `AI_document/MES_CONSOLE_FULL_REMEDIATION_BLUEPRINT.md`

---

# 1. Purpose

This document is the mandatory execution rulebook for the MES Console remediation program.

Every phase prompt must be executed together with this file.

A phase prompt may narrow the work but may not weaken or override these rules. When a phase prompt conflicts with this file, stop, document the conflict, and mark the phase `BLOCKED`.

The remediation objective is to align the existing MES Console with the current MES backend, database schema, APIs, canonical seed, two-line Work Order model, resource-planning model, authorization model, and approved product decisions.

This is not a greenfield rewrite.

---

# 2. Mandatory Source Precedence

When evidence conflicts, use this order:

1. Current executable source code.
2. Current database schema and applied migrations.
3. Current API request, response, validation, and error contracts.
4. Current canonical reset and seed implementation.
5. Maintained automated integration tests.
6. Maintained browser E2E tests.
7. Approved Architecture Decision Records.
8. `AI_document/MES_CONSOLE_FULL_REMEDIATION_BLUEPRINT.md`.
9. Current AI context and UI context documents.
10. Historical reports and old documentation.

Do not implement obsolete documented behavior over current authoritative source.

Do not silently reconcile contradictions. Record them in the phase report.

---

# 3. Approved Product Decisions

Unless Phase UI-00 records a different explicit product approval, use these decisions:

| Decision | Approved value |
|---|---|
| Employee Skill assignment ownership | Employee Create/Edit is the only mutation authority |
| Worker Skill detail | Read-only assignment/dependency view with link to Employee edit |
| UAT Work Orders | Idempotent prepare, verify, and cleanup scripts |
| Canonical terminology and route | Machines at `/master-data/machines` |
| Legacy redirects | One release generally; two releases for Equipment/Machines aliases |
| Production Version line readiness | Compact list summary and full detail tab |
| Resource-planning model | Automatic whole-line selection plus manual exact resource allocation per operation |
| i18n review | Hidden from normal navigation and restricted to diagnostic/admin use |

Do not create duplicate mutation ownership.

Do not replace manual exact resource allocation with automatic exact allocation.

---

# 4. Canonical Phase Order

Execute one phase at a time:

```text
UI-00  Product decisions and readiness gate
UI-01  Worker Skill domain and canonical seed correction
UI-02  Deterministic two-line UAT fixtures
UI-03  Routes, navigation, and legacy redirects
UI-04  Shared UI and server-state standardization
UI-05  Product definition and Production Version UI
UI-06  Resource foundation and planning-constraint UI
UI-07  Labor, Worker Skill, and Employee Skill UX
UI-08  Work Order list and two-line diagnostics
UI-09  Resource Planning and lifecycle actions
UI-10  Authorization, i18n, accessibility, full regression, and final UAT
```

A phase may begin only when the previous phase report explicitly authorizes it.

Never implement multiple phases in one execution unless the user explicitly requests that exact combined scope.

---

# 5. Architecture Guardrails

## 5.1 Microservice ownership

Preserve database-per-service ownership.

- No cross-service database reads.
- No frontend direct database access.
- No bypassing service APIs.
- No duplicated business authority.
- No synchronous shortcut that breaks an existing Kafka/outbox boundary.
- No hidden coupling introduced for UI convenience.

## 5.2 Backend authority

The frontend may format and display backend results. It must not independently calculate:

- Production Line eligibility;
- Production Line readiness;
- fallback selection;
- Resource Hold;
- capacity;
- calendar availability;
- capability matching;
- labor readiness;
- skill qualification;
- resource-candidate validity;
- allocation freshness;
- approval eligibility;
- execution-start eligibility;
- authorization.

If required information is absent, add an additive backend read contract or document a blocker.

## 5.3 Compatibility

Changes must be backward compatible unless an approved phase explicitly authorizes a breaking change.

Prefer:

- additive response fields;
- additive query parameters;
- redirects;
- deprecation periods;
- versioned or effectivity-preserving records;
- non-destructive data correction.

Never silently change business semantics to fit the current UI.

---

# 6. MES Domain Invariants

## 6.1 Product definition

Keep these concepts distinct:

- Item;
- Item Revision;
- EBOM;
- MBOM;
- Routing;
- Routing Operation;
- Production Version.

A Work Order selects one released and effective Production Version.

The browser must not independently combine an MBOM and Routing when creating a Work Order.

Released product structures and Work Order snapshots must preserve historical truth.

## 6.2 Resource model

Keep these concepts distinct:

- Production Line;
- Work Center;
- Workstation;
- Machine Definition or Equipment Definition;
- Physical Machine Unit;
- Resource Assignment;
- Resource Capability;
- Resource Calendar;
- Capacity Reservation;
- Work Order Resource Allocation.

Do not collapse them into one generic "resource" concept in UI labels, forms, APIs, or types.

## 6.3 Two-line model

The canonical architecture is:

```text
one Production Version
+ one MBOM
+ one Routing
+ Primary and Backup Production Line eligibility
```

One Work Order selects exactly one complete Production Line.

A Work Order must never mix operation resources across different lines.

Routing remains line-independent.

The backend evaluates eligible lines and selects a complete line. The planner then manually commits exact resources per operation inside that selected line.

When no complete eligible line is ready, the Work Order enters `RESOURCE_HOLD`.

## 6.4 Worker Skill model

Canonical Worker Skills used by employees must use:

```text
scope = Employee
```

`md_employee_skill` and `md_operation_skill_requirement` must reference Employee-scoped skills.

Employee Skill assignment is owned by Employee Create/Edit in the current remediation.

## 6.5 Lifecycle and history

Do not destroy or rewrite historical records to simplify the UI.

Preserve:

- effectivity;
- release state;
- snapshots;
- allocation history;
- superseded/cancelled records;
- approval history;
- line-selection audit;
- outbox/event history.

---

# 7. Change-Control Rules

Before changing code:

1. inspect the current implementation;
2. identify all consumers;
3. identify API, DB, event, UI, seed, and test impacts;
4. run or record the relevant baseline;
5. create a bounded implementation plan;
6. implement only the active phase.

Do not:

- refactor unrelated modules;
- rename unrelated files;
- reformat the whole repository;
- upgrade dependencies without a phase requirement;
- replace libraries merely for preference;
- remove working APIs;
- delete routes immediately;
- hide defects by weakening validation;
- create broad "temporary" compatibility code without a deletion plan.

When an unrelated critical defect blocks the phase, stop and report it.

---

# 8. Database and Migration Rules

- Never edit or overwrite an already-applied migration.
- Use additive migrations when schema or persistent-data correction is truly required.
- Prefer seed correction when the defect exists only in disposable canonical data.
- Preserve foreign keys, uniqueness, effectivity, audit, and outbox behavior.
- Data migrations must be deterministic, bounded, idempotent where possible, and verifiable.
- Never delete user or production data merely to make tests pass.
- Destructive reset commands may run only against the approved disposable environment and must use existing safety guards.
- Record the target database and guard evidence in the report.
- Database writes performed by tests must have exact cleanup.

---

# 9. Canonical Seed Rules

Canonical seed is executable system documentation.

It must be:

- deterministic;
- idempotent;
- internally consistent;
- accepted by current APIs and validation;
- sufficient for maintained API integration tests;
- sufficient for browser UAT preparation;
- free of manual SQL repair steps.

Base seed must not permanently contain mutable UAT Work Orders unless explicitly approved.

Two-line UAT Work Orders must be produced by an idempotent preparation script and remain available until explicit cleanup.

Every seed-changing phase must provide:

- pre-reset evidence;
- reset command;
- seed command;
- verification command;
- expected counts and business codes;
- post-seed API verification;
- exact failure output;
- rollback or restoration path.

---

# 10. API Rules

- Use existing request and response conventions.
- Keep backend validation authoritative.
- Add fields and filters only when the UI contract needs them.
- Avoid `any` in new or modified TypeScript API contracts.
- Represent business identity using code and localized name; UUIDs may exist internally but must not be primary UI labels.
- Use stable machine-readable error codes.
- Translate known codes in the UI rather than displaying raw backend text.
- Preserve idempotency, row-version, stale-candidate, and concurrency behavior.
- Never forge authorization by trusting arbitrary browser headers outside the validated gateway path.
- Document every API change in the phase report, including compatibility impact.

---

# 11. Frontend Rules

## 11.1 Visual and interaction style

Preserve the dense operational enterprise MES style.

Do not redesign the product into a consumer dashboard.

Prioritize:

- clarity;
- speed;
- information density;
- visible dependencies;
- visible lifecycle;
- visible effectivity;
- diagnostics;
- auditability.

Avoid oversized cards, decorative animation, and hidden operational data.

## 11.2 Shared components

Use approved common wrappers for:

- data tables;
- server-backed filters;
- pagination;
- modal/dialog;
- confirmation;
- tabs;
- detail headers and panels;
- status/readiness/line badges;
- loading, empty, and error states;
- blocker lists;
- dependency panels;
- audit timelines;
- field groups.

Do not create page-local duplicates when a shared component can satisfy the contract.

## 11.3 Server state

Use the established TanStack Query layer for server state.

Required behavior:

- stable query keys;
- scoped invalidation;
- mutation error handling;
- refetch after successful mutations;
- refresh persistence;
- no stale local shadow copy used as business authority.

## 11.4 Tables

Retained list screens must provide the columns required by the blueprint.

Global requirements:

- localized name first;
- business code second;
- no raw UUID as primary identity;
- no raw enum;
- no `[object Object]`;
- server-backed filtering for authoritative operational triage;
- loading, error, empty, pagination, and retry behavior;
- lifecycle/effectivity where relevant.

## 11.5 Forms

Forms must:

- use backend-compatible fields;
- use valid option sources;
- reset invalid dependent fields;
- hydrate edit values correctly;
- display backend validation;
- preserve immutable released fields;
- avoid free-form resource type values where constrained selectors exist;
- avoid inventing unsupported certificate or expiry fields.

---

# 12. Routing and Deprecation Rules

Before redirecting or removing a route:

1. inventory internal links;
2. inspect sidebar references;
3. inspect tests and documentation;
4. consider bookmarks and external consumers;
5. add redirect E2E;
6. preserve path parameters and query strings where applicable;
7. document the deprecation period;
8. define the physical-removal gate.

Do not immediately delete legacy routes.

`/master-data/product-recipes` remains an indefinite redirect to Production Versions unless separately approved.

---

# 13. Authorization and Scope Rules

The backend is the security authority.

The UI may hide or disable actions for usability, but backend denial must remain enforced.

Later phases must use the role matrix approved in UI-00.

Required coverage includes:

- role-positive behavior;
- role-negative behavior;
- forged-header rejection at the trusted boundary;
- cross-site denial;
- direct URL navigation;
- action visibility;
- disabled reason;
- API denial.

Do not assume a role name or permission from UI copy alone.

---

# 14. i18n and Accessibility Rules

Supported UI languages:

```text
VI (default)
EN
JA
KO
```

Translate:

- navigation;
- page titles;
- columns;
- fields;
- lifecycle;
- readiness;
- line roles;
- line-selection states;
- fallback and hold reasons;
- skill scope and qualification;
- validation;
- authorization;
- error and blocker codes.

Do not render raw backend codes when a translation exists.

Accessibility requirements include:

- keyboard reachability;
- visible focus;
- labelled controls;
- dialog focus management;
- semantic table headers;
- status text not communicated only by color;
- accessible validation summaries;
- no inaccessible hover-only actions.

---

# 15. Mandatory Phase Workflow

Every implementation phase must follow this order:

```text
1. Read rules and prior report
2. Verify phase entry gate
3. Inspect current source and consumers
4. Record baseline
5. Implement the smallest valid change
6. Run focused static checks
7. Run focused API integration tests
8. Run focused browser E2E
9. Fix failures caused by the phase
10. Run required regression
11. Verify cleanup and persistence
12. Generate artifacts
13. Generate phase report
14. Set one final gate status
```

Do not proceed to the next phase within the same execution.

---

# 16. Testing Rules

## 16.1 Evidence requirements

For each command record:

- exact command;
- working directory;
- environment;
- start and end time;
- exit code;
- declared tests;
- executed tests;
- passed tests;
- failed tests;
- skipped tests;
- artifact path.

A skipped test is not passed coverage.

Do not claim a test ran without command evidence.

## 16.2 Static checks

Run the actual repository commands. At minimum where applicable:

```bash
npm --prefix services/mes-console run typecheck
npm --prefix services/mes-console run build
```

Run backend build/test commands for every affected service.

## 16.3 Maintained API regression

Use the actual scripts in the repository. Expected maintained suites include, where present:

```bash
npm run test:mes:resource-planning-domain:phase1
npm run test:mes:resource-planning-full-flow:phase2
npm run test:mes:two-line-resource-planning:phase7
npm run test:mes:two-line-full-regression:phase9
npm run verify:mes:canonical-seed
```

Do not create fake pass wrappers around failing commands.

## 16.4 Browser E2E

Every phase with UI or routable behavior must add or update Playwright coverage.

Final retained-page coverage includes:

- route smoke;
- CRUD create/edit/hydration;
- columns and filters;
- dependent field reset;
- lifecycle/release/deactivate/delete;
- permission-negative cases;
- Worker Skills and Employee Skills;
- Production Line and Line Eligibility;
- Primary Line READY;
- Backup fallback READY;
- Resource Hold;
- mixed-line rejection;
- replan allowed and blocked;
- allocation lifecycle;
- approval;
- execution start;
- refresh persistence;
- legacy redirects.

Use traces and screenshots for high-value flows.

## 16.5 Cleanup

Every test-generated record must be:

- uniquely identifiable;
- cleaned exactly;
- verified absent after cleanup;
- restored if a temporary baseline record was mutated.

Never use broad deletion by date, prefix, or foreign-key disabling unless an approved test harness already guarantees safety.

---

# 17. Artifact Rules

Create one run folder per phase:

```text
artifacts/mes-console-remediation/phase-XX/<run-id>/
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

Add traces, screenshots, logs, and fixture manifests when relevant.

Artifacts must not contain:

- passwords;
- access tokens;
- refresh tokens;
- private keys;
- connection-string credentials;
- personal data not required for testing.

---

# 18. Report Rules

Each phase must create:

```text
AI_document/Phase-XX/REPORT_PHASE_XX.md
```

The report must follow `AI_document/REPORT_TEMPLATE.md`.

It must state exactly one final status:

```text
PHASE_UI_XX_PASSED_READY_FOR_UI_YY
PHASE_UI_XX_BLOCKED
```

For UI-10 use:

```text
MES_CONSOLE_REMEDIATION_COMPLETE
PHASE_UI_10_BLOCKED
```

A report is not a marketing summary. It must include failures, skips, uncertainty, and unverified behavior.

---

# 19. Rollback Rules

Every phase must identify a rollback strategy before implementation.

Rollback may include:

- reverting phase commits;
- restoring prior seed artifacts;
- disabling a new read-only panel through an existing feature mechanism;
- retaining legacy aliases;
- removing additive response fields only after consumers are reverted;
- cleaning UAT fixtures;
- restoring temporary resource state.

Do not describe destructive database rollback as the default strategy.

---

# 20. Definition of Ready

A phase is ready when:

- the previous phase passed;
- required product decisions are approved;
- dependencies are available;
- the environment is healthy;
- baseline commands can run;
- the scope is bounded;
- rollback is defined;
- expected tests are known.

---

# 21. Definition of Done

A phase is done only when:

- implementation matches scope;
- no unrelated code was changed;
- build/typecheck pass;
- focused API integration tests pass;
- focused browser E2E pass;
- required regression passes;
- mandatory tests have zero unexplained skips;
- cleanup passes;
- documentation and artifacts exist;
- acceptance criteria are evidenced;
- the report authorizes the next phase.

---

# 22. Mandatory Stop Conditions

Stop and mark the phase blocked when:

- source contradicts the approved domain contract;
- the previous phase did not pass;
- the target environment is not disposable for a destructive step;
- a migration would destroy history;
- a route removal lacks a redirect or consumer analysis;
- required API data is unavailable and cannot be added compatibly;
- an unrelated critical regression is discovered;
- test results are unreliable;
- secrets appear in artifacts;
- a mandatory test cannot run;
- implementation would require crossing the active phase boundary.

---

# 23. Completion Response

At the end of each phase, respond with:

- run ID;
- files changed;
- APIs changed;
- migrations or seed changes;
- build result;
- API integration result;
- browser E2E result;
- cleanup result;
- report path;
- artifact path;
- exact final status;
- next authorized phase.

Do not start the next phase automatically.
