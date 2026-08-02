# Phase UI-07 — Labor, Worker Skill, and Employee Skill UX

Version: 1.0  
Status: READY_FOR_EXECUTION_AFTER_ENTRY_GATE  
Target system: S-Factory MES Enterprise  
Master rules: `AI_document/REMEDIATION_MASTER_RULES.md`  
Blueprint: `AI_document/MES_CONSOLE_FULL_REMEDIATION_BLUEPRINT.md`  
Previous report: `AI_document/Phase-06/REPORT_PHASE_06.md`

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
PHASE_UI_06_PASSED_READY_FOR_UI_07
```

If the report is absent, contradictory, or blocked, stop and create only the current phase report with:

```text
PHASE_UI_07_BLOCKED
```

Do not bypass the entry gate.

---

# 3. Objective


Implement the approved employee-centric Worker Skill UX using the corrected Employee-scoped domain from UI-01.

Employees own skill assignment mutations. Worker Skill Detail remains a read-only definition, dependency, and assignment view.


---

# 4. In Scope


- Employees list and Create/Edit.
- Employee Skill assignment.
- Worker Skill definition list/detail.
- Read-only Worker Skill assignment/dependency view.
- Shifts.
- Work Calendar and Employee Schedules.
- Operation Skill Requirement UI.
- Qualification status and level supported by current backend.
- Labor-readiness visibility.
- Labor and skill API/E2E coverage.


---

# 5. Out of Scope


- Mutation from Worker Skill Detail.
- New dedicated bulk assignment screen.
- Invented certificate/expiry fields.
- Work Order diagnostic matrix.
- Authorization final polish.


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


## 7.1 Employee list

Show:

- localized employee name and business code;
- site;
- default Work Center;
- active/employment status;
- current skill summary;
- schedule summary where supported;
- actions.

## 7.2 Employee Create/Edit

Employee Create/Edit is the only assignment mutation authority.

Required behavior:

- load Employee-scoped Worker Skills from the canonical API;
- show current active and inactive assignments;
- select skill;
- assign level;
- show qualification status fields that exist in backend;
- support effectivity/end behavior according to current API;
- validate duplicate active assignment;
- preserve unsaved-state and backend errors;
- save through the approved Employee Skill endpoint;
- refetch and display persisted state.

Do not add certificate or expiry controls unless current backend response and validation support them.

## 7.3 Worker Skill definitions

Support definition CRUD and lifecycle according to current APIs.

Worker Skill detail must show:

- code/name;
- Employee scope;
- minimum level where supported;
- active assignment count;
- dependency count;
- read-only employee assignment list;
- link to Employee edit;
- deactivation/delete dependency behavior.

Do not expose assign/end mutations here.

## 7.4 Shifts and schedules

Align Shift and Work Calendar screens with current site, Work Center, employee, date, and effectivity contracts.

Support bulk schedule behavior only where current API supports it.

## 7.5 Operation Skill Requirements

Use the same Employee-scoped definitions.

Show:

- operation/routing operation;
- skill;
- required level;
- required persons;
- effectivity;
- lifecycle/status.

## 7.6 Labor readiness

Display backend labor readiness and translated blockers.

Do not calculate skill sufficiency in the browser.


---

# 8. Domain and Architecture Guardrails


- One mutation owner: Employee Create/Edit.
- Worker Skill Detail is read-only for assignments.
- All employee qualifications reference Employee-scoped definitions.
- Schedules and skills are separate readiness dimensions.
- Backend remains readiness authority.


Also apply every invariant from `REMEDIATION_MASTER_RULES.md`.

---

# 9. API and Data Contract Rules


Use current Worker Skill, Employee Skill, Employee Schedule, Shift, and Operation Skill Requirement APIs.

Add only additive fields required by the approved UI and supported domain.

Do not use the generic `/skills` response in a way that mixes scopes.


All API changes must be additive unless the approved phase explicitly says otherwise.

Do not let React calculate backend business decisions.

---

# 10. UI Rules


Use Phase UI-04 components.

Provide clear links between Employee, Skill, Operation Requirement, and readiness blocker.

Display scope badge explicitly.

Use translated qualification and dependency statuses.


Preserve the current dense enterprise MES visual identity.

---

# 11. Database, Migration, Seed, and Fixture Rules


Use UI-01 corrected canonical data.

Do not create duplicate Worker Skill definitions.

Test assignments and schedules must have exact cleanup and must not damage canonical employee availability.


Never edit applied migrations.

Never use manual SQL as a hidden prerequisite.

---

# 12. Mandatory Test Work

## 12.1 Tests to add or update


Add or update tests for:

- Employee create/edit/hydration;
- Employee Skill assignment create/update/end;
- duplicate assignment rejection;
- invalid scope rejection;
- insufficient level;
- expired/inactive assignment where supported;
- Worker Skill CRUD;
- Worker Skill dependency counts;
- read-only assignment list;
- absence of mutation controls in Worker Skill Detail;
- Employee edit link;
- Shift CRUD;
- schedule bulk behavior;
- Operation Skill Requirement CRUD;
- readiness consumption;
- refresh persistence.


## 12.2 Static and build checks

Run actual repository commands. At minimum where applicable:

```bash
npm --prefix services/mes-console run typecheck
npm --prefix services/mes-console run build
```

Run build/test commands for every affected backend service.

## 12.3 API integration


Run Worker Skill, Employee Skill, schedule, requirement, and labor-readiness integration flows.

Run maintained resource-planning and two-line suites because labor affects readiness.


## 12.4 Browser E2E


Playwright must prove:

- Employee modal is the mutation owner;
- Worker Skill Detail is read-only;
- assignment persists after refresh;
- invalid scope is not offered;
- dependency/deactivation behavior is visible;
- schedule change is visible;
- operation requirement uses the same skill identity;
- readiness reacts through backend result.

Capture skill and employee screenshots/traces.


Do not turn failures into skips.

## 12.5 Required regression


Run canonical seed verification, product/resource screen smoke, UAT fixture verification, and current Work Order smoke after labor changes.


Record exact declared, executed, passed, failed, and skipped counts.

---

# 13. Artifacts

Create:

```text
artifacts/mes-console-remediation/phase-07/<run-id>/
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
employee-skill-api-evidence.json
worker-skill-dependency-evidence.json
labor-readiness-evidence.json
labor-e2e-screenshot-index.json
```


Do not store secrets.

---

# 14. Required Report

Create:

```text
AI_document/Phase-07/REPORT_PHASE_07.md
```

Use `AI_document/REPORT_TEMPLATE.md`.

The report must include exact command evidence, files changed, APIs changed, seed/migration impact, test counts, cleanup, known issues, rollback, and the final gate.

---

# 15. Acceptance Criteria


- Employee Create/Edit is the only assignment mutation path.
- Worker Skill Detail is read-only for assignments.
- Employee and Operation Requirement use the same Employee-scoped identity.
- Skill assignment persists and is consumed by readiness.
- Shifts and schedules operate according to current backend.
- Dependency and deactivation errors are clear.
- API and E2E pass.
- UAT fixture verification still passes.
- No mandatory test is skipped.
- Report authorizes UI-08.


Every mandatory criterion must pass.

---

# 16. Stop Conditions

In addition to the master rules, stop when:


- UI-01 seed/domain correction is not present;
- current APIs expose conflicting mutation semantics that cannot be safely contained;
- Worker Skill and Employee Skill use different identities;
- labor readiness cannot be traced to current backend data;
- a requested field is not supported and would require speculative schema.


Do not continue into the next phase.

---

# 17. Completion Gate

On success, the report and completion response must state:

```text
PHASE_UI_07_PASSED_READY_FOR_UI_08
```

On failure:

```text
PHASE_UI_07_BLOCKED
```

Do not start Phase UI-08 in the same execution.
