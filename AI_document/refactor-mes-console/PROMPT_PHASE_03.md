# Phase UI-03 — Route, Navigation, and Legacy Redirect Cleanup

Version: 1.0  
Status: READY_FOR_EXECUTION_AFTER_ENTRY_GATE  
Target system: S-Factory MES Enterprise  
Master rules: `AI_document/REMEDIATION_MASTER_RULES.md`  
Blueprint: `AI_document/MES_CONSOLE_FULL_REMEDIATION_BLUEPRINT.md`  
Previous report: `AI_document/Phase-02/REPORT_PHASE_02.md`

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
PHASE_UI_02_PASSED_READY_FOR_UI_03
```

If the report is absent, contradictory, or blocked, stop and create only the current phase report with:

```text
PHASE_UI_03_BLOCKED
```

Do not bypass the entry gate.

---

# 3. Objective


Make MES Console routing and navigation consistent without deleting legacy access paths.

Canonicalize retained routes, redirect obsolete aliases, use Machines terminology, expose or intentionally place Production Areas, and remove diagnostic routes from normal navigation.


---

# 4. In Scope


- `App.tsx` route declarations.
- Sidebar and route-header navigation.
- Internal links and breadcrumbs.
- Redirects for legacy `/console/mes/*` routes.
- `/console/mes/skills` redirect.
- Equipment to Machines route redirects.
- Existing Product Recipe redirect.
- i18n review navigation visibility.
- Production Area navigation decision from UI-00.
- Route smoke and redirect E2E.


---

# 5. Out of Scope


- Physical deletion of legacy routes.
- Business screen redesign.
- API changes.
- Seed changes.
- Work Order feature changes.
- Authorization redesign beyond the approved diagnostic visibility behavior.


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


## 7.1 Consumer inventory

Search:

- route declarations;
- sidebar entries;
- breadcrumbs;
- header links;
- detail-page links;
- documentation;
- Playwright specs;
- redirect tests.

Produce a route map before changing code.

## 7.2 Canonical routes

Retain canonical route families defined by the blueprint.

At minimum:

```text
/work-orders*
/master-data/items
/master-data/mboms*
/master-data/routings*
/master-data/production-versions*
/master-data/production-lines*
/master-data/work-centers*
/master-data/workstations*
/master-data/machines*
/master-data/skills*
/employees
/shifts
/work-calendar
```

## 7.3 Required redirects

Implement parameter-preserving redirects for approved aliases.

Examples:

```text
/console/mes/work-orders*            -> /work-orders*
/console/mes/items                   -> /master-data/items
/console/mes/routings                -> /master-data/routings
/console/mes/production-versions     -> /master-data/production-versions
/console/mes/employees               -> /employees
/console/mes/shifts                  -> /shifts
/console/mes/work-calendar           -> /work-calendar
/console/mes/mboms*                  -> /master-data/mboms*
/console/mes/work-centers            -> /master-data/work-centers
/console/mes/skills                  -> /master-data/skills/workers
/master-data/worker-skills           -> /master-data/skills/workers
/master-data/employee-skills         -> /employees
/worker-skills                       -> /master-data/skills/workers
/master-data/equipment*              -> /master-data/machines*
/console/mes/equipment               -> /master-data/machines
/master-data/product-recipes         -> /master-data/production-versions
```

Validate exact current route availability and do not invent a destination that does not exist.

## 7.4 Navigation cleanup

- Machines is canonical.
- Remove Equipment duplicate navigation.
- Do not expose generic Tier2 Skills as a separate product surface.
- Hide i18n review from normal sidebar.
- Keep diagnostic route only according to UI-00 decision.
- Add Production Areas to the correct hierarchy navigation or record the approved intentional-hidden state.
- Ensure active-state highlighting works for detail/new/edit routes.

## 7.5 Deprecation

Keep redirects for the approved period.

Do not physically remove alias logic in this phase.


---

# 8. Domain and Architecture Guardrails


- Redirect first; remove later.
- Preserve path parameters and query strings.
- Do not collapse Machine Definition and Machine Unit.
- Do not break deep links.
- Do not display a deprecation notice that blocks operational navigation.


Also apply every invariant from `REMEDIATION_MASTER_RULES.md`.

---

# 9. API and Data Contract Rules


No API change is expected.

Do not add backend endpoints to solve frontend routing.


All API changes must be additive unless the approved phase explicitly says otherwise.

Do not let React calculate backend business decisions.

---

# 10. UI Rules


Use existing navigation components and visual conventions.

Avoid duplicate sidebar entries.

Canonical labels must use translation keys and the approved Machines terminology.


Preserve the current dense enterprise MES visual identity.

---

# 11. Database, Migration, Seed, and Fixture Rules


No migration, canonical seed, or UAT fixture change.

The Phase UI-02 fixture manifest must remain usable after route redirects.


Never edit applied migrations.

Never use manual SQL as a hidden prerequisite.

---

# 12. Mandatory Test Work

## 12.1 Tests to add or update


Add or update:

- canonical route smoke;
- every legacy redirect;
- parameter-preserving Work Order and MBOM redirects;
- Equipment/Machines redirects;
- Skill redirects;
- Product Recipe indefinite redirect;
- active sidebar state;
- hidden diagnostic navigation;
- Production Area navigation behavior;
- Not Found behavior.


## 12.2 Static and build checks

Run actual repository commands. At minimum where applicable:

```bash
npm --prefix services/mes-console run typecheck
npm --prefix services/mes-console run build
```

Run build/test commands for every affected backend service.

## 12.3 API integration


No new API suite is required, but run a lightweight API health check for screens used by route smoke.

Run maintained seed verification to ensure the environment remains valid.


## 12.4 Browser E2E


Playwright must navigate directly to every retained and redirected route.

Verify:

- final URL;
- correct screen heading;
- no redirect loop;
- no blank page;
- no duplicate sidebar item;
- preserved route parameter;
- browser refresh;
- back/forward navigation;
- unauthorized diagnostic access behavior according to current backend capability.


Do not turn failures into skips.

## 12.5 Required regression


Run existing MES Console route/navigation smoke plus Phase UI-02 fixture smoke using both canonical and relevant legacy Work Order URLs.


Record exact declared, executed, passed, failed, and skipped counts.

---

# 13. Artifacts

Create:

```text
artifacts/mes-console-remediation/phase-03/<run-id>/
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
route-map-before.json
route-map-after.json
redirect-results.json
navigation-screenshot-index.json
```


Do not store secrets.

---

# 14. Required Report

Create:

```text
AI_document/Phase-03/REPORT_PHASE_03.md
```

Use `AI_document/REPORT_TEMPLATE.md`.

The report must include exact command evidence, files changed, APIs changed, seed/migration impact, test counts, cleanup, known issues, rollback, and the final gate.

---

# 15. Acceptance Criteria


- Canonical routes remain reachable.
- Every approved alias redirects correctly.
- `/console/mes/skills` no longer renders the generic Tier2 screen.
- Machines is the canonical route and label.
- No route is physically deleted.
- i18n review is absent from normal navigation.
- Production Area navigation matches the approved decision.
- Internal links use canonical routes.
- Redirect E2E passes with zero mandatory skips.
- Existing UAT fixture navigation remains valid.
- Report authorizes UI-04.


Every mandatory criterion must pass.

---

# 16. Stop Conditions

In addition to the master rules, stop when:


- a route has an unknown active internal consumer that cannot be migrated safely;
- parameter preservation cannot be implemented without breaking canonical routing;
- UI-00 decisions about Machines or diagnostics are unresolved;
- redirect behavior causes loops or loss of Work Order IDs.


Do not continue into the next phase.

---

# 17. Completion Gate

On success, the report and completion response must state:

```text
PHASE_UI_03_PASSED_READY_FOR_UI_04
```

On failure:

```text
PHASE_UI_03_BLOCKED
```

Do not start Phase UI-04 in the same execution.
