# Phase UI-06 — Resource Foundation and Planning Constraint UI Alignment

Version: 1.0  
Status: READY_FOR_EXECUTION_AFTER_ENTRY_GATE  
Target system: S-Factory MES Enterprise  
Master rules: `AI_document/REMEDIATION_MASTER_RULES.md`  
Blueprint: `AI_document/MES_CONSOLE_FULL_REMEDIATION_BLUEPRINT.md`  
Previous report: `AI_document/Phase-05/REPORT_PHASE_05.md`

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
PHASE_UI_05_PASSED_READY_FOR_UI_06
```

If the report is absent, contradictory, or blocked, stop and create only the current phase report with:

```text
PHASE_UI_06_BLOCKED
```

Do not bypass the entry gate.

---

# 3. Objective


Align resource-foundation and planning-constraint screens so users can understand hierarchy, line membership, requirements, effective assignments, capabilities, calendars, standards, readiness, and history without collapsing domain concepts.


---

# 4. In Scope


- Factory/Site.
- Shopfloor.
- Production Area.
- Production Line.
- Work Center.
- Workstation.
- Machines and physical Machine Units.
- Resource Assignments.
- Resource Capabilities.
- Resource Calendars.
- Production Standards.
- Readiness panels and backend blocker links.
- Planning form option constraints.
- Resource CRUD, lifecycle, effectivity, and readiness E2E.


---

# 5. Out of Scope


- Employee Skill assignment UX.
- Work Order line matrix.
- Allocation lifecycle actions.
- Automatic exact resource allocation.
- Physical printer integration.


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


## 7.1 Hierarchy

Make hierarchy visible and navigable:

```text
Site
→ Shopfloor
→ Production Area
→ Production Line and/or Work Center context
→ Workstation
→ assigned Machine Definition / Machine Unit
```

Use actual current domain relationships. Do not fabricate a strict parent relation where the schema models associations.

## 7.2 Production Line

List columns:

- localized name/code;
- site and area/shopfloor context;
- lifecycle/active/effectivity;
- Work Center count;
- eligible Production Version count;
- backend readiness summary;
- actions.

Detail tabs:

```text
Overview
Work Centers
Eligibility
Readiness
Audit/History
```

Use additive backend read contracts only when current data is missing.

## 7.3 Work Center

Show logical routing responsibility, headcount/readiness where supported, line membership, downstream Workstations, capabilities, calendars, standards, and history.

Do not present Work Center as an execution candidate.

## 7.4 Workstation

Separate:

- execution identity;
- Work Center parent;
- machine/resource requirements;
- effective Resource Assignments;
- capabilities;
- calendars;
- readiness;
- assignment history.

Do not merge requirements with assignments.

## 7.5 Machines and Machine Units

Machines is canonical.

Separate definition from physical unit identity.

Display:

- machine definition;
- expected/actual units;
- asset or serial identity;
- unit status;
- planning eligibility;
- current assignment;
- lifecycle/effectivity.

## 7.6 Resource Assignment

Support current domain fields:

- site/context;
- Work Center;
- Workstation;
- Machine/Equipment Definition;
- Machine Unit;
- role;
- primary/backup where modeled;
- effectivity;
- status;
- history.

Do not overwrite historical assignments.

## 7.7 Planning constraints

Capabilities, Calendars, and Production Standards must use constrained selectors.

Do not use free-form resource-type values when the backend has a known enum and valid entity sources.

Reset invalid dependent fields.

## 7.8 Readiness

Display backend readiness status and blocker codes with links to the relevant master-data screen.

No React readiness calculation.


---

# 8. Domain and Architecture Guardrails


- Preserve every resource-model distinction.
- Requirements are not assignments.
- Assignments are not Work Order allocations.
- Machine Definition is not Machine Unit.
- Production Line is not Work Center.
- Effectivity and history must remain visible.


Also apply every invariant from `REMEDIATION_MASTER_RULES.md`.

---

# 9. API and Data Contract Rules


Add only additive read fields/endpoints required for:

- line membership summary;
- PV eligibility summary;
- readiness and blocker details;
- assignment history;
- option metadata by resource type.

Keep backend validation authoritative.


All API changes must be additive unless the approved phase explicitly says otherwise.

Do not let React calculate backend business decisions.

---

# 10. UI Rules


Use shared tables, forms, tabs, badges, blocker list, dependency panel, and audit timeline.

Cross-link related objects using business code/name.

No raw UUID as the main link label.


Preserve the current dense enterprise MES visual identity.

---

# 11. Database, Migration, Seed, and Fixture Rules


Do not change canonical resource topology unless a current seed defect is proven.

Use Phase UI-02 fixture state only through its approved lifecycle.

Test-created assignments/calendars/capabilities must use exact cleanup and preserve historical records.


Never edit applied migrations.

Never use manual SQL as a hidden prerequisite.

---

# 12. Mandatory Test Work

## 12.1 Tests to add or update


Add or update tests for:

- hierarchy create/edit/hydration;
- Production Line Work Center membership;
- line eligibility summary;
- Workstation requirement vs assignment panels;
- Machine Definition and Machine Unit identity;
- assignment overlap rejection;
- assignment effectivity;
- capability valid/invalid combinations;
- calendar resource type and date validation;
- production-standard positive time validation;
- backend readiness blocker rendering;
- dependent field reset;
- lifecycle and delete/deactivate dependency behavior.


## 12.2 Static and build checks

Run actual repository commands. At minimum where applicable:

```bash
npm --prefix services/mes-console run typecheck
npm --prefix services/mes-console run build
```

Run build/test commands for every affected backend service.

## 12.3 API integration


Run focused master-data resource flows and maintained resource-planning domain/full-flow suites.

Verify candidates and line selection still consume the corrected resource foundation.


## 12.4 Browser E2E


Playwright must cover representative CRUD, detail tabs, hierarchy navigation, readiness blockers, assignment history, constrained selectors, refresh persistence, and dependency errors.

Include Production Line and Workstation screenshots.


Do not turn failures into skips.

## 12.5 Required regression


Run product-definition and Production Version eligibility E2E from UI-05, shared-component smoke, route redirects, seed verification, and two-line fixture verification.


Record exact declared, executed, passed, failed, and skipped counts.

---

# 13. Artifacts

Create:

```text
artifacts/mes-console-remediation/phase-06/<run-id>/
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
resource-hierarchy-before.json
resource-hierarchy-after.json
readiness-api-contract.json
resource-form-option-matrix.json
resource-e2e-screenshot-index.json
```


Do not store secrets.

---

# 14. Required Report

Create:

```text
AI_document/Phase-06/REPORT_PHASE_06.md
```

Use `AI_document/REPORT_TEMPLATE.md`.

The report must include exact command evidence, files changed, APIs changed, seed/migration impact, test counts, cleanup, known issues, rollback, and the final gate.

---

# 15. Acceptance Criteria


- Resource concepts remain distinct.
- Production Line detail provides required tabs.
- Workstation requirements and assignments are separate.
- Machines and Machine Units are separate.
- Planning forms constrain valid resource types.
- Backend readiness and blockers are visible.
- Effectivity and history are preserved.
- Resource API integration and E2E pass.
- Two-line UAT fixture verification still passes.
- No mandatory test is skipped.
- Report authorizes UI-07.


Every mandatory criterion must pass.

---

# 16. Stop Conditions

In addition to the master rules, stop when:


- current schema cannot distinguish required resource concepts;
- a UI panel would need cross-service DB access;
- readiness requires frontend calculation;
- assignment changes would destroy history;
- resource APIs return ambiguous identities that cannot be extended compatibly.


Do not continue into the next phase.

---

# 17. Completion Gate

On success, the report and completion response must state:

```text
PHASE_UI_06_PASSED_READY_FOR_UI_07
```

On failure:

```text
PHASE_UI_06_BLOCKED
```

Do not start Phase UI-07 in the same execution.
