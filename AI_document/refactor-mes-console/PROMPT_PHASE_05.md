# Phase UI-05 — Product Definition and Production Version UI Alignment

Version: 1.0  
Status: READY_FOR_EXECUTION_AFTER_ENTRY_GATE  
Target system: S-Factory MES Enterprise  
Master rules: `AI_document/REMEDIATION_MASTER_RULES.md`  
Blueprint: `AI_document/MES_CONSOLE_FULL_REMEDIATION_BLUEPRINT.md`  
Previous report: `AI_document/Phase-04/REPORT_PHASE_04.md`

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
PHASE_UI_04_PASSED_READY_FOR_UI_05
```

If the report is absent, contradictory, or blocked, stop and create only the current phase report with:

```text
PHASE_UI_05_BLOCKED
```

Do not bypass the entry gate.

---

# 3. Objective


Align product-definition screens with current MES Master Data authority and make Production Version Line Eligibility discoverable, editable, validated, and traceable.

A planner must be able to trace Item Revision to EBOM/MBOM/Routing to Production Version to eligible Production Lines to Work Order creation.


---

# 4. In Scope


- Items and Item Revisions.
- UOM and Material Groups where needed by dependent forms.
- EBOM.
- MBOM and substitutes.
- Operation Catalog.
- Routing and Routing Operations.
- Production Version list, create/edit, detail, release, validation.
- Production Version Line Eligibility summary and detail tab.
- Additive Production Version readiness-preview API when current APIs lack authoritative data.
- Product-definition CRUD and lifecycle E2E.


---

# 5. Out of Scope


- Resource foundation page redesign.
- Employee/Worker Skill UX.
- Work Order diagnostic matrix.
- Resource allocation lifecycle.
- New product-definition semantics.
- EBOM manufacturing authority.


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


## 7.1 Preserve domain ownership

Ensure UI language and behavior distinguish:

```text
Item
Item Revision
EBOM
MBOM
Routing
Routing Operation
Production Version
```

Production Version remains the sole Work Order production-definition authority.

## 7.2 Table and form alignment

Apply blueprint column and form contracts.

Requirements include:

- localized name first and code second;
- lifecycle and effectivity;
- compatible option sources;
- immutable released fields;
- correct dependent-field reset;
- hydrated edit forms;
- no raw UUID;
- backend validation rendering.

## 7.3 EBOM

Use engineering terminology only.

Do not add manufacturing consumption, workstation, or allocation semantics.

## 7.4 MBOM

Support current:

- output revision;
- component lines;
- UOM/quantity precision;
- substitute semantics;
- validation;
- new version or release behavior.

Do not silently mutate a released MBOM.

## 7.5 Routing and Operations

Routing Operations target logical Work Centers.

Do not assign exact Workstations or Production Lines in Routing.

Operation skill requirements may link to the Phase UI-01 Employee-scoped skill identity but full labor UX remains UI-07.

## 7.6 Production Version

List must show:

- code/name;
- Item Revision;
- MBOM;
- Routing;
- optional EBOM;
- lifecycle/effectivity;
- compact line-eligibility summary.

Detail/create/edit must include a dedicated Line Eligibility area with:

- Production Line;
- Primary/Backup role;
- priority;
- efficiency factor when supported;
- selection policy/mode when supported;
- effective from/to;
- active/lifecycle;
- validation.

Enforce through backend:

- exactly one active Primary Line;
- unique active priority;
- matching site;
- mandatory operation Work Center coverage;
- released/effective compatibility.

## 7.7 Readiness preview

If current Production Version detail lacks authoritative readiness preview, add an additive read-only endpoint or response field.

Frontend displays backend results only.


---

# 8. Domain and Architecture Guardrails


- Do not merge EBOM and MBOM.
- Do not let browser select independent MBOM/Routing for Work Order creation.
- Do not put line identity into Routing.
- Do not mutate released structures in place.
- Do not compute line readiness in React.


Also apply every invariant from `REMEDIATION_MASTER_RULES.md`.

---

# 9. API and Data Contract Rules


Implement only proven additive needs, such as:

- Production Version detail with line names/codes, role, priority, and effectivity;
- line-eligibility list/create/update/delete or lifecycle operations already supported by domain;
- read-only readiness preview.

Use current validation and stable error codes.


All API changes must be additive unless the approved phase explicitly says otherwise.

Do not let React calculate backend business decisions.

---

# 10. UI Rules


Use Phase UI-04 shared components.

Provide:

- server-backed lists;
- clear hierarchy links;
- release/validation confirmation;
- dependency errors;
- eligibility summary;
- dedicated detail tab;
- no duplicate Product Recipe screen.


Preserve the current dense enterprise MES visual identity.

---

# 11. Database, Migration, Seed, and Fixture Rules


Use existing canonical Product Version and line eligibility.

Only add bounded test/UAT data through approved scripts.

Do not modify base seed merely to make UI tests easier unless a missing canonical relationship is a verified seed defect.


Never edit applied migrations.

Never use manual SQL as a hidden prerequisite.

---

# 12. Mandatory Test Work

## 12.1 Tests to add or update


Add or update tests for:

- Item and Revision create/edit/hydration;
- EBOM engineering fields;
- MBOM lines and substitutes;
- Routing Operations and Work Center options;
- release immutability;
- Production Version compatible references;
- line eligibility create/edit/deactivate;
- exactly-one-Primary validation;
- duplicate priority;
- site mismatch;
- missing Work Center coverage;
- readiness preview rendering;
- dependent-field reset;
- no UUID primary display.


## 12.2 Static and build checks

Run actual repository commands. At minimum where applicable:

```bash
npm --prefix services/mes-console run typecheck
npm --prefix services/mes-console run build
```

Run build/test commands for every affected backend service.

## 12.3 API integration


Run focused MES Master Data integration flows for all modified product objects.

Run Work Order creation authority tests to prove only Production Version is selected.

Run canonical seed and two-line regression.


## 12.4 Browser E2E


Playwright must cover:

- retained product-definition page smoke;
- representative create/edit/hydration;
- release and validation;
- Production Version list summary;
- Line Eligibility tab;
- Primary and Backup rows;
- invalid eligibility combinations;
- refresh persistence;
- navigation from Production Version toward Work Order creation.


Do not turn failures into skips.

## 12.5 Required regression


Run UI-03 redirects, UI-04 shared-component smoke, UI-01 skill compatibility, and UI-02 UAT fixture verification.

Do not break existing Work Order snapshots.


Record exact declared, executed, passed, failed, and skipped counts.

---

# 13. Artifacts

Create:

```text
artifacts/mes-console-remediation/phase-05/<run-id>/
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
product-definition-contract.json
production-version-api-evidence.json
line-eligibility-validation-results.json
pv-e2e-screenshot-index.json
```


Do not store secrets.

---

# 14. Required Report

Create:

```text
AI_document/Phase-05/REPORT_PHASE_05.md
```

Use `AI_document/REPORT_TEMPLATE.md`.

The report must include exact command evidence, files changed, APIs changed, seed/migration impact, test counts, cleanup, known issues, rollback, and the final gate.

---

# 15. Acceptance Criteria


- Product-definition concepts are clearly distinct.
- Released data remains immutable according to backend policy.
- Production Version list shows eligibility summary.
- Production Version detail provides the full eligibility contract.
- Exactly one active Primary is enforced.
- Backend provides readiness preview when shown.
- Work Order creation still selects only Production Version.
- CRUD, lifecycle, API integration, and E2E pass.
- No mandatory test is skipped.
- Report authorizes UI-06.


Every mandatory criterion must pass.

---

# 16. Stop Conditions

In addition to the master rules, stop when:


- current backend domain contradicts the blueprint Production Version authority;
- eligibility cannot be represented without a breaking schema redesign;
- frontend would need to calculate readiness;
- tests reveal released structures are mutated in place;
- canonical two-line Product Version is invalid.


Do not continue into the next phase.

---

# 17. Completion Gate

On success, the report and completion response must state:

```text
PHASE_UI_05_PASSED_READY_FOR_UI_06
```

On failure:

```text
PHASE_UI_05_BLOCKED
```

Do not start Phase UI-06 in the same execution.
