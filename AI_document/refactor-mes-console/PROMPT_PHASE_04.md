# Phase UI-04 — Shared UI Components and Server-State Standardization

Version: 1.0  
Status: READY_FOR_EXECUTION_AFTER_ENTRY_GATE  
Target system: S-Factory MES Enterprise  
Master rules: `AI_document/REMEDIATION_MASTER_RULES.md`  
Blueprint: `AI_document/MES_CONSOLE_FULL_REMEDIATION_BLUEPRINT.md`  
Previous report: `AI_document/Phase-03/REPORT_PHASE_03.md`

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
PHASE_UI_03_PASSED_READY_FOR_UI_04
```

If the report is absent, contradictory, or blocked, stop and create only the current phase report with:

```text
PHASE_UI_04_BLOCKED
```

Do not bypass the entry gate.

---

# 3. Objective


Create a stable shared MES Console UI foundation so retained pages use consistent tables, filters, forms, dialogs, states, badges, blocker rendering, query behavior, and typed API contracts.

This phase standardizes infrastructure without changing domain behavior.


---

# 4. In Scope


- Inventory and consolidation of existing common UI wrappers.
- Base data table and server-backed filter contract.
- Pagination.
- Modal/dialog and confirmation.
- Tabs and detail panels.
- Status, lifecycle, readiness, and line badges.
- Loading, empty, error, retry, and warning states.
- Blocker list and dependency panel.
- Audit timeline foundation.
- Form field group and validation summary.
- TanStack Query key and invalidation standards.
- Core TypeScript domain/API types needed by later phases.
- Migration of shared/generic screen foundations and representative retained screens.


---

# 5. Out of Scope


- Product Definition domain changes.
- Resource readiness business logic.
- Worker Skill UX ownership changes.
- Work Order list/detail feature completion.
- Authorization policy changes.
- Visual redesign.


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


## 7.1 Component inventory

Identify all competing implementations of:

```text
table
pagination
modal/dialog
confirmation
tabs
status badge
loading/error/empty
form field wrapper
detail header
warning panel
dependency panel
audit history
```

For each, record consumers and decide:

```text
KEEP
MERGE
DEPRECATE
PAGE-SPECIFIC
```

Do not delete a wrapper with active consumers until migration is complete.

## 7.2 Canonical component contracts

Create or refine canonical wrappers with typed props.

Required capabilities:

### Data table

- typed columns;
- stable row key;
- loading/error/empty;
- server sorting/filter state;
- pagination;
- accessible headers;
- action column;
- no raw UUID identity;
- no page-local business filtering for authoritative lists.

### Filter bar

- URL or stable query-state support;
- reset;
- dependent filter reset;
- server-backed values;
- accessible labels.

### Modal and confirmation

- consistent header/body/footer;
- focus management;
- escape and close behavior;
- pending state;
- destructive/high-impact confirmation;
- backend error summary.

### Status/readiness badges

Typed variants for:

- lifecycle;
- Work Order state;
- line selection;
- Primary/Backup/Fallback/Hold;
- readiness;
- active/inactive.

### States

- loading;
- initial empty;
- filtered empty;
- recoverable error;
- forbidden;
- retry.

### Blocker list

- backend code translation;
- severity;
- affected dimension;
- optional canonical master-data link;
- raw detail only in diagnostic expansion.

## 7.3 Server state

Standardize:

- query keys;
- query parameters;
- mutation hooks;
- invalidation;
- optimistic behavior only where safe;
- refresh persistence;
- error normalization.

Replace ad hoc `any` for modified contracts with explicit types.

Do not rewrite every API client unrelated to later remediation.

## 7.4 Migration strategy

Migrate common generic screens and enough representative retained screens to prove the wrappers.

Create a documented consumer migration matrix for later phases.

Do not perform business-screen redesign.


---

# 8. Domain and Architecture Guardrails


- Shared components must remain domain-neutral.
- Do not place readiness calculation in a component.
- Do not hide backend validation.
- Do not produce a parallel second design system.
- Preserve existing enterprise density and accessibility.


Also apply every invariant from `REMEDIATION_MASTER_RULES.md`.

---

# 9. API and Data Contract Rules


No backend API change is expected.

Type frontend contracts from current responses. When a current response is genuinely inconsistent, record it for the owning later phase instead of fabricating normalization.


All API changes must be additive unless the approved phase explicitly says otherwise.

Do not let React calculate backend business decisions.

---

# 10. UI Rules


- Use existing tokens and layout.
- Do not set raw enum labels directly.
- Do not create duplicate modal/table wrappers.
- Every changed component must have accessible labels and focus behavior.
- Keep page-specific columns and business rules in the screen layer.


Preserve the current dense enterprise MES visual identity.

---

# 11. Database, Migration, Seed, and Fixture Rules


No migration or seed change.

Do not alter UAT fixture behavior.


Never edit applied migrations.

Never use manual SQL as a hidden prerequisite.

---

# 12. Mandatory Test Work

## 12.1 Tests to add or update


Add component/unit coverage where the repository supports it for:

- table loading/error/empty;
- server filter state;
- pagination;
- dependent filter reset;
- modal focus and pending state;
- destructive confirmation;
- status/readiness badge mapping;
- blocker translation;
- query invalidation;
- error normalization.

Update representative Playwright flows to use the migrated components.


## 12.2 Static and build checks

Run actual repository commands. At minimum where applicable:

```bash
npm --prefix services/mes-console run typecheck
npm --prefix services/mes-console run build
```

Run build/test commands for every affected backend service.

## 12.3 API integration


Run API health/integration suites for the representative migrated screens to prove the standardized clients preserve request and response behavior.

No backend behavior should change.


## 12.4 Browser E2E


Verify representative list, create/edit modal, detail tabs, confirmation, loading, error, empty, retry, filter, pagination, and refresh behavior.

Run retained-page smoke to catch component regressions.


Do not turn failures into skips.

## 12.5 Required regression


Run route redirects from UI-03 and UAT fixture smoke from UI-02.

Run MES Console typecheck/build with zero new TypeScript `any` in modified contracts.


Record exact declared, executed, passed, failed, and skipped counts.

---

# 13. Artifacts

Create:

```text
artifacts/mes-console-remediation/phase-04/<run-id>/
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
component-inventory.json
component-decision-matrix.json
consumer-migration-matrix.json
query-key-inventory.json
accessibility-smoke.json
```


Do not store secrets.

---

# 14. Required Report

Create:

```text
AI_document/Phase-04/REPORT_PHASE_04.md
```

Use `AI_document/REPORT_TEMPLATE.md`.

The report must include exact command evidence, files changed, APIs changed, seed/migration impact, test counts, cleanup, known issues, rollback, and the final gate.

---

# 15. Acceptance Criteria


- One canonical wrapper exists for each approved shared concern.
- No new duplicate table/modal/status implementation is introduced.
- Modified server-state paths use TanStack Query consistently.
- Modified API contracts are typed.
- Representative retained screens use the shared foundation.
- Loading/error/empty/retry behavior is consistent.
- Accessibility smoke passes.
- Retained-route smoke passes.
- No domain behavior changed.
- No mandatory test is skipped.
- Report authorizes UI-05.


Every mandatory criterion must pass.

---

# 16. Stop Conditions

In addition to the master rules, stop when:


- consolidation would require an unrelated application-wide rewrite;
- active consumers cannot be identified;
- a shared component would need embedded domain calculation;
- the existing design-system decision is unresolved;
- migration causes broad regressions outside the phase boundary.


Do not continue into the next phase.

---

# 17. Completion Gate

On success, the report and completion response must state:

```text
PHASE_UI_04_PASSED_READY_FOR_UI_05
```

On failure:

```text
PHASE_UI_04_BLOCKED
```

Do not start Phase UI-05 in the same execution.
