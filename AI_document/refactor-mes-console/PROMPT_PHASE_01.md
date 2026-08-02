# Phase UI-01 — Worker Skill Domain and Canonical Seed Correction

Version: 1.0  
Status: READY_FOR_EXECUTION_AFTER_ENTRY_GATE  
Target system: S-Factory MES Enterprise  
Master rules: `AI_document/REMEDIATION_MASTER_RULES.md`  
Blueprint: `AI_document/MES_CONSOLE_FULL_REMEDIATION_BLUEPRINT.md`  
Previous report: `AI_document/Phase-00/REPORT_PHASE_00.md`

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
PHASE_UI_00_PASSED_READY_FOR_UI_01
```

If the report is absent, contradictory, or blocked, stop and create only the current phase report with:

```text
PHASE_UI_01_BLOCKED
```

Do not bypass the entry gate.

---

# 3. Objective


Correct the canonical Worker Skill domain mismatch so all employee qualifications, operation skill requirements, seed data, APIs, and readiness logic use the same Employee-scoped skill identity.

The final canonical seed must reset, seed, and verify without manual database repair.


---

# 4. In Scope


- Audit existing skill definitions, Employee Skill rows, and Operation Skill Requirement rows.
- Correct canonical Worker Skills to `scope=Employee`.
- Decide whether misleading `SK-WC-*` business codes are replaced by Employee-oriented codes.
- Relink canonical Employee Skill rows.
- Relink canonical Operation Skill Requirement rows.
- Correct seed scripts and seed verification.
- Add a bounded data migration only when a persistent non-disposable environment requires one.
- Add Worker Skill, Employee Skill, Operation Skill Requirement, and labor-readiness integration coverage.
- Run focused browser verification that canonical Employee-scoped skills are visible through current screens.


---

# 5. Out of Scope


- Broad Employee or Skill UI redesign.
- Worker Skill assignment mutations from Worker Skill Detail.
- Route cleanup.
- UAT Work Order creation.
- Production Version UI changes.
- Work Order diagnostics.
- Authorization redesign.


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


## 7.1 Baseline inventory

Produce an exact inventory containing:

- skill ID, code, name, and scope;
- employee ID and Employee Skill references;
- Operation Skill Requirement references;
- API validation behavior;
- seed source location;
- readiness consumers.

Classify every affected row as:

```text
VALID_EMPLOYEE_SCOPE
INVALID_WORKCENTER_SCOPE
UNRELATED_RESOURCE_SKILL
ORPHAN_REFERENCE
DUPLICATE_BUSINESS_IDENTITY
```

Do not convert machine, workstation, or Work Center skills that are valid for those domains.

## 7.2 Canonical Employee-scoped definitions

Create or correct exactly the Employee-scoped definitions required by canonical employees and routing operations.

Use business codes that match domain meaning. When replacing old codes:

- preserve unrelated valid resource skills;
- avoid duplicate skill identity;
- relink every canonical consumer;
- document compatibility impact;
- do not leave ambiguous duplicate active definitions.

## 7.3 Employee Skill correction

Ensure every canonical `md_employee_skill` row:

- references an Employee-scoped skill;
- references an active employee;
- has valid level and qualification fields supported by the schema;
- has valid effectivity;
- passes current API validation.

## 7.4 Operation Skill Requirement correction

Ensure every canonical operation requirement:

- references an Employee-scoped skill;
- targets the correct operation or routing operation;
- has valid required level and required-person count;
- is effective on the canonical UAT date;
- is consumed by readiness.

## 7.5 Seed behavior

Update canonical seed in dependency order.

Requirements:

- deterministic IDs or stable business lookups;
- idempotent rerun;
- no duplicate skills;
- no manual SQL;
- exact expected counts;
- verification through both database-safe scripts and public/service APIs.

## 7.6 Persistent data

Inspect the target environment classification.

For disposable development seed data, correct seed and reset.

For persistent data, use an additive data migration only after proving:

- target rows are unambiguously canonical-invalid records;
- historical records are preserved;
- rollback or compensating migration exists;
- no unrelated customer data is rewritten.

## 7.7 Readiness proof

Prove that the corrected skill identity is used by:

```text
Worker Skill API
Employee Skill API
Operation Skill Requirement API
labor readiness
line evaluation or compute-check where applicable
```


---

# 8. Domain and Architecture Guardrails


- Employee qualifications must use `scope=Employee`.
- Do not turn all skill scopes into Employee.
- Do not weaken API scope validation.
- Do not bypass readiness.
- Do not delete historical skill records without an approved migration strategy.
- Employee Create/Edit remains the only planned UI mutation authority.


Also apply every invariant from `REMEDIATION_MASTER_RULES.md`.

---

# 9. API and Data Contract Rules


- Preserve existing Worker Skill and Employee Skill endpoint semantics.
- Keep scope validation strict.
- Return stable business code, localized name, scope, level, effectivity, and assignment data required by current UI.
- Add no speculative certification fields.
- Use existing error-code conventions for invalid scope and dependency conflicts.


All API changes must be additive unless the approved phase explicitly says otherwise.

Do not let React calculate backend business decisions.

---

# 10. UI Rules


No broad UI implementation is allowed.

Only make the smallest compatibility correction when the current UI cannot load valid Employee-scoped options due to a proven source defect. Such a change must be documented and tested.

Current Employee and Worker Skill screens must at least display the corrected canonical data without raw UUIDs or runtime errors.


Preserve the current dense enterprise MES visual identity.

---

# 11. Database, Migration, Seed, and Fixture Rules


- Canonical base seed must contain at least the Employee-scoped Worker Skills, Employee Skills, schedules, and Operation Skill Requirements required by the blueprint.
- Base seed must not create the three mutable UAT Work Orders.
- Reset only the approved disposable environment.
- Verify no canonical Employee Skill or Operation Skill Requirement references a non-Employee skill.


Never edit applied migrations.

Never use manual SQL as a hidden prerequisite.

---

# 12. Mandatory Test Work

## 12.1 Tests to add or update


Add or update tests for:

- Worker Skill list returns Employee-scoped definitions;
- Worker Skill create rejects invalid scope input where applicable;
- Employee Skill assignment accepts Employee scope;
- Employee Skill assignment rejects WorkCenter scope;
- Operation Skill Requirement accepts Employee scope;
- Operation Skill Requirement rejects WorkCenter scope;
- level and effectivity validation;
- labor readiness with sufficient skill;
- labor readiness with insufficient level;
- labor readiness with missing or expired qualification;
- deterministic reset/reseed;
- duplicate-free rerun.


## 12.2 Static and build checks

Run actual repository commands. At minimum where applicable:

```bash
npm --prefix services/mes-console run typecheck
npm --prefix services/mes-console run build
```

Run build/test commands for every affected backend service.

## 12.3 API integration


Run:

- canonical seed verification;
- focused Worker Skill API flow;
- focused Employee Skill assignment flow;
- focused Operation Skill Requirement flow;
- affected resource-planning and two-line readiness suites.

Also run maintained suites required by the master rules when the correction affects their fixtures.


## 12.4 Browser E2E


Add or run focused Playwright coverage that proves:

- Worker Skills page loads canonical Employee-scoped definitions;
- Employee Create/Edit loads the same definitions;
- an existing canonical employee shows valid skill assignments;
- Operation Skill Requirement options use Employee-scoped definitions;
- refresh preserves server state.

Do not implement future Phase UI-07 behavior here.


Do not turn failures into skips.

## 12.5 Required regression


Run canonical seed verification and all maintained readiness/resource-planning suites affected by Worker Skill data.

A test failure caused by old fixture expectations must be corrected to the approved domain contract, not skipped.


Record exact declared, executed, passed, failed, and skipped counts.

---

# 13. Artifacts

Create:

```text
artifacts/mes-console-remediation/phase-01/<run-id>/
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
skill-inventory.json
seed-before.json
seed-after.json
scope-reference-verification.json
```


Do not store secrets.

---

# 14. Required Report

Create:

```text
AI_document/Phase-01/REPORT_PHASE_01.md
```

Use `AI_document/REPORT_TEMPLATE.md`.

The report must include exact command evidence, files changed, APIs changed, seed/migration impact, test counts, cleanup, known issues, rollback, and the final gate.

---

# 15. Acceptance Criteria


- All approved canonical Worker Skills used by employees have `scope=Employee`.
- Every canonical Employee Skill references an Employee-scoped definition.
- Every canonical Operation Skill Requirement references an Employee-scoped definition.
- Unrelated resource-scoped skills remain valid and unchanged.
- Reset and seed are deterministic and idempotent.
- Public/service APIs return internally consistent data.
- Labor readiness consumes the corrected identity.
- Focused browser checks pass.
- No manual SQL is required.
- No mandatory test is skipped.
- Report authorizes UI-02.


Every mandatory criterion must pass.

---

# 16. Stop Conditions

In addition to the master rules, stop when:


- source proves Employee qualifications are intentionally modeled with another scope;
- invalid rows cannot be distinguished from legitimate production data;
- correction requires destructive history removal;
- canonical reset safety cannot be verified;
- readiness still consumes a different skill identity after correction.


Do not continue into the next phase.

---

# 17. Completion Gate

On success, the report and completion response must state:

```text
PHASE_UI_01_PASSED_READY_FOR_UI_02
```

On failure:

```text
PHASE_UI_01_BLOCKED
```

Do not start Phase UI-02 in the same execution.
