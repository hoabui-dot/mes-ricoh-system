# Phase UI-02 — Deterministic Two-Line UAT Work Order Fixtures

Version: 1.0  
Status: READY_FOR_EXECUTION_AFTER_ENTRY_GATE  
Target system: S-Factory MES Enterprise  
Master rules: `AI_document/REMEDIATION_MASTER_RULES.md`  
Blueprint: `AI_document/MES_CONSOLE_FULL_REMEDIATION_BLUEPRINT.md`  
Previous report: `AI_document/Phase-01/REPORT_PHASE_01.md`

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
PHASE_UI_01_PASSED_READY_FOR_UI_02
```

If the report is absent, contradictory, or blocked, stop and create only the current phase report with:

```text
PHASE_UI_02_BLOCKED
```

Do not bypass the entry gate.

---

# 3. Objective


Create an idempotent, API-driven UAT fixture lifecycle that produces three deterministic Work Orders:

1. Primary Line READY.
2. Backup Line selected through fallback.
3. Both eligible lines blocked and Work Order in `RESOURCE_HOLD`.

The fixtures must be verifiable, reusable by later Playwright phases, and exactly cleanable.


---

# 4. In Scope


- Prepare, verify, and cleanup scripts.
- Deterministic fixture manifest and business-code strategy.
- API-driven Work Order creation.
- Temporary, bounded readiness mutations required for fallback and hold.
- Exact restoration of all mutations.
- API integration tests for all three states.
- Focused current-UI browser smoke for all three Work Orders.


---

# 5. Out of Scope


- Work Order list column redesign.
- Full evaluated-line matrix UI.
- Resource Planning UI redesign.
- Route cleanup.
- Permanent insertion of UAT Work Orders into base seed.
- Direct execution-table insertion.


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


## 7.1 Inspect canonical two-line model

Identify from current seed and APIs:

- canonical site;
- released two-line Production Version;
- Primary Line;
- Backup Line;
- routing operations;
- shift and UAT date;
- required workstations, machine units, assignments, capabilities, calendars, standards, employees, skills, and schedules.

Fail when the model is not complete.

## 7.2 Create scripts

Create repository-appropriate commands equivalent to:

```text
prepare:mes:two-line-uat
verify:mes:two-line-uat
cleanup:mes:two-line-uat
```

Use current naming conventions.

Preparation must:

- authenticate through the supported test path;
- use supported APIs/workflows;
- create deterministic Work Orders or record generated IDs;
- write a fixture manifest;
- leave fixtures available for browser tests;
- avoid duplicate creation on rerun.

Verification must:

- fetch Work Order detail;
- verify line-selection fields;
- verify evaluated-line results;
- verify operation-line consistency;
- verify no mixed-line candidate leakage;
- verify expected fallback and hold reasons.

Cleanup must:

- remove or cancel generated Work Orders using supported test cleanup behavior;
- restore temporary resource states;
- verify restoration;
- be safe when run twice.

## 7.3 Primary READY fixture

Expected:

```text
line_selection_mode = AUTO
line_selection_status = READY
selected line = Primary Line
fallback reason = null
Primary result = READY
```

All mandatory operations and readiness dimensions must be feasible on the Primary Line.

## 7.4 Backup fallback READY fixture

Create a bounded temporary condition that blocks the complete Primary Line while leaving the Backup Line ready.

Expected:

```text
line_selection_mode = AUTO
line_selection_status = READY
selected line = Backup Line
Primary result = BLOCKED
Backup result = READY
fallback reason = backend-provided non-empty reason
```

Do not permanently corrupt canonical readiness.

## 7.5 Resource Hold fixture

Create a bounded condition that blocks every complete eligible line.

Expected:

```text
line_selection_mode = AUTO
line_selection_status = RESOURCE_HOLD
selected line = null
Primary result = BLOCKED
Backup result = BLOCKED
resource hold reason = backend-provided non-empty reason
```

## 7.6 Exact restoration

Store before-state for every mutated record.

After cleanup verify:

- resource status restored;
- planning flags restored;
- assignments restored;
- calendars and capacities restored;
- generated Work Orders absent or in the approved cleaned state;
- no reservation or allocation leak;
- no orphan outbox/test record that violates current cleanup policy.


---

# 8. Domain and Architecture Guardrails


- Create Work Orders through supported APIs/workflows.
- Do not directly insert into Work Order tables.
- Do not hardcode runtime UUIDs without discovery.
- Do not use frontend logic to force a line.
- Do not use per-operation mixed lines.
- Keep fixtures deterministic at business level and manifest-driven at ID level.


Also apply every invariant from `REMEDIATION_MASTER_RULES.md`.

---

# 9. API and Data Contract Rules


- Use current Work Order creation workflow and line-selection API behavior.
- Do not add API behavior merely to manufacture test states.
- A read-only test-support discovery endpoint may be added only when existing APIs cannot safely identify canonical records and the change is production-safe and documented.
- Preserve idempotency and row-version rules.


All API changes must be additive unless the approved phase explicitly says otherwise.

Do not let React calculate backend business decisions.

---

# 10. UI Rules


No Work Order UI redesign.

Focused E2E may navigate to existing list/detail routes and verify current visible state plus network responses. Later phases own the final list and matrix.


Preserve the current dense enterprise MES visual identity.

---

# 11. Database, Migration, Seed, and Fixture Rules


- Base seed remains clean.
- Fixture preparation may temporarily mutate canonical readiness only when before-state is recorded.
- Fixture cleanup must restore exact values, not approximate defaults.
- No broad database truncation.
- No cross-service direct writes.


Never edit applied migrations.

Never use manual SQL as a hidden prerequisite.

---

# 12. Mandatory Test Work

## 12.1 Tests to add or update


Add tests for:

- preparation rerun;
- verification rerun;
- cleanup rerun;
- Primary READY;
- Backup fallback READY;
- Resource Hold;
- one-WO-one-line consistency;
- candidates restricted to selected line;
- no selected line during hold;
- fallback and hold reason presence;
- reservation/allocation leak detection;
- exact state restoration.


## 12.2 Static and build checks

Run actual repository commands. At minimum where applicable:

```bash
npm --prefix services/mes-console run typecheck
npm --prefix services/mes-console run build
```

Run build/test commands for every affected backend service.

## 12.3 API integration


Run the new prepare/verify/cleanup API flow plus:

```bash
npm run test:mes:two-line-resource-planning:phase7
npm run test:mes:two-line-full-regression:phase9
npm run verify:mes:canonical-seed
```

Use actual available command names and record any mapping.


## 12.4 Browser E2E


Add a focused Playwright fixture smoke that:

- loads each fixture by manifest;
- confirms the page can fetch it;
- confirms current selected-line or hold state is visible or present in the API response;
- captures one screenshot and trace per fixture;
- refreshes and confirms persistence.

Do not assert future matrix columns that are not implemented yet.


Do not turn failures into skips.

## 12.5 Required regression


Run Phase 01 skill/readiness verification and the maintained resource-planning full flow after cleanup.

Canonical seed verification must still pass.


Record exact declared, executed, passed, failed, and skipped counts.

---

# 13. Artifacts

Create:

```text
artifacts/mes-console-remediation/phase-02/<run-id>/
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
uat-fixture-manifest.json
resource-before-state.json
resource-mutated-state.json
resource-restored-state.json
primary-ready-evidence.json
backup-fallback-evidence.json
resource-hold-evidence.json
```


Do not store secrets.

---

# 14. Required Report

Create:

```text
AI_document/Phase-02/REPORT_PHASE_02.md
```

Use `AI_document/REPORT_TEMPLATE.md`.

The report must include exact command evidence, files changed, APIs changed, seed/migration impact, test counts, cleanup, known issues, rollback, and the final gate.

---

# 15. Acceptance Criteria


- Prepare, verify, and cleanup commands exist and are documented.
- Preparation is idempotent.
- Exactly three required UAT business scenarios are available.
- Primary fixture selects Primary Line.
- Fallback fixture selects Backup Line because Primary is blocked.
- Hold fixture selects no line.
- All operations remain line-consistent.
- Cleanup restores every temporary mutation.
- Canonical seed verification passes after cleanup.
- API tests pass.
- Focused browser fixture smoke passes.
- No mandatory test is skipped.
- Report authorizes UI-03.


Every mandatory criterion must pass.

---

# 16. Stop Conditions

In addition to the master rules, stop when:


- canonical two-line Production Version is not valid after UI-01;
- fallback cannot be created without a destructive or ambiguous mutation;
- fixture creation requires direct cross-service DB writes;
- cleanup cannot prove exact restoration;
- Work Order line-selection results are nondeterministic under controlled state.


Do not continue into the next phase.

---

# 17. Completion Gate

On success, the report and completion response must state:

```text
PHASE_UI_02_PASSED_READY_FOR_UI_03
```

On failure:

```text
PHASE_UI_02_BLOCKED
```

Do not start Phase UI-03 in the same execution.
