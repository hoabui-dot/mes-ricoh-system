# Phase UI-10 — Authorization, i18n, Accessibility, Full Regression, and Final UAT

Version: 1.0  
Status: READY_FOR_EXECUTION_AFTER_ENTRY_GATE  
Target system: S-Factory MES Enterprise  
Master rules: `AI_document/REMEDIATION_MASTER_RULES.md`  
Blueprint: `AI_document/MES_CONSOLE_FULL_REMEDIATION_BLUEPRINT.md`  
Previous report: `AI_document/Phase-09/REPORT_PHASE_09.md`

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
PHASE_UI_09_PASSED_READY_FOR_UI_10
```

If the report is absent, contradictory, or blocked, stop and create only the current phase report with:

```text
PHASE_UI_10_BLOCKED
```

Do not bypass the entry gate.

---

# 3. Objective


Complete enterprise-wide authorization affordances, translation coverage, loading/error consistency, accessibility, retained-page regression, API integration regression, canonical seed verification, and final three-state UAT.

This phase adds no broad new business feature.


---

# 4. In Scope


- Apply UI-00 authoritative role matrix.
- Route/action visibility and disabled reasons.
- Backend negative authorization verification.
- Cross-site scope verification.
- VI default plus EN/JA/KO translation completion.
- Error and blocker translation.
- Accessibility remediation.
- All retained-page smoke.
- Representative CRUD/lifecycle E2E.
- All maintained API integration suites.
- Three UAT Work Orders.
- Print Station master-data smoke; physical printer excluded unless available.
- Final blueprint and final report.


---

# 5. Out of Scope


- New MES modules.
- New domain behavior.
- Automatic exact allocation.
- New physical printer integration.
- Unapproved route deletion.
- Dependency upgrades unrelated to verified defects.


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


## 7.1 Authorization

Use role constants and evidence approved in UI-00.

For each screen and action:

- show, hide, or disable according to approved UX;
- provide a clear reason when disabled;
- verify direct URL behavior;
- verify backend denial;
- verify cross-site denial;
- verify forged-header behavior at the trusted boundary.

Do not treat client visibility as security.

## 7.2 i18n

Complete VI, EN, JA, and KO for:

- navigation;
- pages;
- columns;
- forms;
- lifecycle;
- Work Order states;
- line roles and selection;
- fallback and hold;
- readiness;
- resource model;
- Worker Skills;
- validation;
- authorization;
- errors;
- redirects/deprecation notices.

VI remains default.

Remove raw enum and raw backend-code rendering where a mapping exists.

## 7.3 Loading, error, and empty states

Verify every retained screen has:

- loading;
- empty;
- filtered empty;
- retryable error;
- forbidden;
- validation summary;
- mutation pending;
- success refresh.

## 7.4 Accessibility

Verify:

- keyboard navigation;
- focus order;
- modal focus trap and return;
- labelled forms;
- table headers;
- screen-reader status text;
- visible focus;
- color-independent status;
- accessible error summaries;
- no hover-only critical action.

## 7.5 Full route and screen regression

Run every retained route.

Cover all screen families:

- Work Orders;
- Product Definition;
- Resource Foundation;
- Planning Constraints;
- Labor;
- Skills;
- Print Station master data;
- diagnostic access;
- Not Found;
- legacy redirects.

## 7.6 Final UAT

Prepare and verify the three UI-02 UAT Work Orders.

Execute and capture:

- Work Order list triage;
- Primary READY detail;
- Backup fallback READY detail;
- Resource Hold detail;
- line matrix;
- blocker links;
- allocation;
- reallocation/cancel;
- revalidation;
- approval;
- replan;
- execution start where the scenario permits;
- refresh persistence.

## 7.7 Final documentation

Update the remediation blueprint with:

- implemented decisions;
- final routes;
- final API contracts;
- final seed status;
- final E2E evidence;
- remaining approved backlog;
- final readiness status.

Do not overwrite historical phase reports.


---

# 8. Domain and Architecture Guardrails


- Backend remains security and business authority.
- Do not weaken validation to make final regression green.
- No mandatory test skip.
- Physical printer exclusion does not permit skipping Print Station master-data smoke.
- Preserve redirects for approved deprecation periods.


Also apply every invariant from `REMEDIATION_MASTER_RULES.md`.

---

# 9. API and Data Contract Rules


No new API should be added unless a final verified defect cannot be fixed without an additive contract.

Authorization tests must hit the real trusted path used by the environment.

All affected API contracts must remain backward compatible.


All API changes must be additive unless the approved phase explicitly says otherwise.

Do not let React calculate backend business decisions.

---

# 10. UI Rules


Use shared components and translation keys.

Do not create last-minute page-local fixes that bypass the standard wrappers.

Do not expose raw UUIDs, enums, or blocker codes in normal UI.


Preserve the current dense enterprise MES visual identity.

---

# 11. Database, Migration, Seed, and Fixture Rules


Start from verified canonical seed.

Use approved UAT prepare/verify/cleanup scripts.

Final cleanup must restore all temporary data and prove no reservation or resource-state leak.

Do not reset a non-disposable environment.


Never edit applied migrations.

Never use manual SQL as a hidden prerequisite.

---

# 12. Mandatory Test Work

## 12.1 Tests to add or update


Add or update missing coverage for:

- role-positive and role-negative actions;
- direct URL access;
- cross-site denial;
- forged role/header denial;
- every translation locale;
- raw enum/code detection;
- keyboard and dialog behavior;
- retained-page smoke;
- representative CRUD/hydration;
- lifecycle operations;
- filters and columns;
- all redirects;
- all three UAT states;
- full allocation/lifecycle flow;
- refresh persistence;
- Print Station master-data smoke;
- exact cleanup.


## 12.2 Static and build checks

Run actual repository commands. At minimum where applicable:

```bash
npm --prefix services/mes-console run typecheck
npm --prefix services/mes-console run build
```

Run build/test commands for every affected backend service.

## 12.3 API integration


Run every maintained MES API integration suite, including:

```bash
npm run test:mes:resource-planning-domain:phase1
npm run test:mes:resource-planning-full-flow:phase2
npm run test:mes:two-line-resource-planning:phase7
npm run test:mes:two-line-full-regression:phase9
npm run verify:mes:canonical-seed
```

Also run all Worker Skill, Employee Skill, UAT fixture, Product Version, route-support health, and authorization suites added by remediation.

Use actual command names and record mappings.


## 12.4 Browser E2E


Run the complete Playwright MES Console suite.

Required evidence:

- every retained page smoke;
- every representative CRUD/hydration;
- table columns and filters;
- dependent-field reset;
- lifecycle/release/deactivate/delete;
- permission negative cases;
- Worker and Employee Skills;
- Production Line and Line Eligibility;
- Primary READY;
- Backup fallback READY;
- Resource Hold;
- mixed-line rejection;
- replan allowed/blocked;
- allocation lifecycle;
- approval;
- execution start;
- refresh persistence;
- legacy redirects;
- four-language smoke;
- accessibility smoke.

No mocked runtime may substitute for the three persisted UAT Work Orders.


Do not turn failures into skips.

## 12.5 Required regression


Run all static checks, frontend build, affected backend builds, all API integration suites, all Playwright specs, seed verification, fixture cleanup verification, and git diff checks.

Zero mandatory skips.

Classify any environment-only exclusion explicitly and do not mark the phase complete when it covers a mandatory requirement.


Record exact declared, executed, passed, failed, and skipped counts.

---

# 13. Artifacts

Create:

```text
artifacts/mes-console-remediation/phase-10/<run-id>/
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
final-route-inventory.json
final-role-matrix-results.json
final-i18n-coverage.json
final-accessibility-results.json
final-api-regression.json
final-e2e-regression.json
final-uat-evidence.json
final-cleanup-results.json
final-readiness-gate.json
```

Create a final human-readable document:

```text
AI_document/MES_CONSOLE_REMEDIATION_FINAL_REPORT.md
```


Do not store secrets.

---

# 14. Required Report

Create:

```text
AI_document/Phase-10/REPORT_PHASE_10.md
```

Use `AI_document/REPORT_TEMPLATE.md`.

The report must include exact command evidence, files changed, APIs changed, seed/migration impact, test counts, cleanup, known issues, rollback, and the final gate.

---

# 15. Acceptance Criteria


- Role/action UX matches approved matrix.
- Backend denies unauthorized and cross-site actions.
- VI/EN/JA/KO required keys are complete.
- No raw normal-UI enums, blocker codes, UUID identities, or `[object Object]`.
- Accessibility checks pass.
- Every retained route passes smoke.
- Product, resource, labor, skill, Work Order, and lifecycle flows pass.
- All three UAT states are proven with persisted runtime data.
- All maintained API integration suites pass.
- Full Playwright suite passes.
- Canonical seed passes.
- Exact cleanup passes.
- Zero mandatory tests are skipped.
- Blueprint and final report are updated.
- Final status is `MES_CONSOLE_REMEDIATION_COMPLETE`.


Every mandatory criterion must pass.

---

# 16. Stop Conditions

In addition to the master rules, stop when:


- any mandatory API or E2E test fails or is skipped;
- authorization relies only on frontend hiding;
- translations remain incomplete on required flows;
- UAT fixture state is nondeterministic;
- cleanup leaks reservations or modified resources;
- a last-minute broad feature is required;
- blueprint, reports, source, and runtime evidence disagree.


Do not continue into the next phase.

---

# 17. Completion Gate

On success, the report and completion response must state:

```text
MES_CONSOLE_REMEDIATION_COMPLETE
```

On failure:

```text
PHASE_UI_10_BLOCKED
```

Do not start any new remediation phase in the same execution.
