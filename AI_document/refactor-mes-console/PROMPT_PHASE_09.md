# Phase UI-09 — Resource Planning and Work Order Lifecycle Action Alignment

Version: 1.0  
Status: READY_FOR_EXECUTION_AFTER_ENTRY_GATE  
Target system: S-Factory MES Enterprise  
Master rules: `AI_document/REMEDIATION_MASTER_RULES.md`  
Blueprint: `AI_document/MES_CONSOLE_FULL_REMEDIATION_BLUEPRINT.md`  
Previous report: `AI_document/Phase-08/REPORT_PHASE_08.md`

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
PHASE_UI_08_PASSED_READY_FOR_UI_09
```

If the report is absent, contradictory, or blocked, stop and create only the current phase report with:

```text
PHASE_UI_09_BLOCKED
```

Do not bypass the entry gate.

---

# 3. Objective


Align Work Order Resource Planning and lifecycle actions with current backend rules for candidates, commit, reallocate, cancel, revalidate, approve, reject, line replan, and execution start.

Every action must expose authoritative availability, stale-state, permission, confirmation, audit, and refresh behavior.


---

# 4. In Scope


- Candidate loading per operation.
- Candidate line constraint.
- Exact resource commit.
- Reallocate.
- Cancel allocation.
- Revalidate.
- Compute/check and material staging where already part of the current screen.
- Approve/reject.
- Line replan.
- Start execution.
- Confirmation and reason input.
- Pending/disabled/forbidden state.
- Row-version and stale-candidate behavior.
- Allocation history and refresh.
- Full API and browser lifecycle flows.


---

# 5. Out of Scope


- Automatic exact allocation.
- Changing line-selection algorithm.
- Cross-line operation allocation.
- Kiosk redesign.
- Physical Print Station testing.
- Final global authorization/i18n polish beyond action-specific needs.


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


## 7.1 Candidate flow

For each routing operation:

- fetch candidates from backend;
- show selected line context;
- show candidate identity, readiness, warnings, and stale state;
- prevent cross-line candidates from appearing;
- support retry and refresh;
- do not cache candidates as permanent truth.

## 7.2 Commit

Commit exact resource using current API, idempotency, row-version, and reservation rules.

Display:

- selected candidate;
- confirmation when replacing existing allocation;
- backend validation;
- committed timestamp/status;
- audit result.

## 7.3 Reallocate and cancel

Reallocate must preserve superseded history.

Cancel must end the active commitment according to current backend behavior.

Require reason only when the API supports or requires it.

Use destructive/high-impact confirmation.

## 7.4 Revalidate

Show per-operation validation:

- valid;
- stale;
- unavailable;
- capability mismatch;
- calendar conflict;
- capacity conflict;
- skill/labor blocker;
- assignment blocker.

Use backend codes.

## 7.5 Approval and rejection

Display backend gate and freshness result.

Under strict allocation policy:

- approval must not appear successful without valid required allocations;
- stale or invalid allocations block approval;
- role and status restrictions are visible;
- backend remains authoritative.

## 7.6 Line replan

Allow only before the backend lock point.

Show:

- current line;
- reason;
- expected impact;
- new backend evaluation;
- changed selected line or Resource Hold;
- allocation impact;
- audit.

Do not transfer an in-progress Work Order to another line in place.

## 7.7 Start execution

Start only when backend permits.

Show blockers for:

- no ready line;
- invalid allocation;
- stale readiness;
- approval state;
- material/compute prerequisites;
- print policy when relevant and in scope.

Physical third-party printer execution is excluded unless already available in the maintained test environment.

## 7.8 Mutation state

Every action must:

- prevent duplicate submit;
- show pending state;
- normalize backend errors;
- invalidate exact queries;
- refetch detail/history;
- persist after refresh.


---

# 8. Domain and Architecture Guardrails


- Automatic whole-line selection plus manual exact per-operation allocation remains.
- No mixed-line allocation.
- Backend owns candidate validity and lifecycle gates.
- Preserve allocation and approval audit history.
- No in-place line transfer after execution lock.


Also apply every invariant from `REMEDIATION_MASTER_RULES.md`.

---

# 9. API and Data Contract Rules


Use current candidate, allocation, reallocation, cancellation, revalidation, approval, rejection, replan, and start APIs.

Add only additive capability hints or structured blockers when current responses are insufficient for correct UI.

Do not weaken strict approval or execution checks.


All API changes must be additive unless the approved phase explicitly says otherwise.

Do not let React calculate backend business decisions.

---

# 10. UI Rules


Use shared confirmation, blocker, status, audit, and error components.

Action visibility and disabled reasons must be clear, but backend denial remains required.

Do not hide lifecycle blockers behind a generic toast only.


Preserve the current dense enterprise MES visual identity.

---

# 11. Database, Migration, Seed, and Fixture Rules


Use UI-02 fixture lifecycle and create additional bounded flow-specific Work Orders only through supported APIs.

Every allocation/reservation test must clean exact generated state.

Do not alter canonical resources without before/after restoration evidence.


Never edit applied migrations.

Never use manual SQL as a hidden prerequisite.

---

# 12. Mandatory Test Work

## 12.1 Tests to add or update


Add or update tests for:

- candidates limited to selected line;
- commit idempotency;
- stale candidate rejection;
- duplicate commit protection;
- reallocate history;
- cancel history;
- revalidate valid and invalid operations;
- approval allowed and blocked;
- rejection;
- line replan allowed;
- replan blocked after lock;
- replan to Backup;
- replan to Resource Hold;
- start execution allowed;
- start blocked by invalid allocation;
- mixed-line rejection;
- refresh persistence;
- concurrent or row-version conflict;
- exact cleanup.


## 12.2 Static and build checks

Run actual repository commands. At minimum where applicable:

```bash
npm --prefix services/mes-console run typecheck
npm --prefix services/mes-console run build
```

Run build/test commands for every affected backend service.

## 12.3 API integration


Run:

- maintained resource-planning domain Phase 1;
- full flow Phase 2;
- two-line Phase 7;
- full regression Phase 9;
- new action-specific integration tests;
- canonical seed verification.

Use actual repository command names.


## 12.4 Browser E2E


Playwright must execute persisted end-to-end flows:

```text
create/open WO
→ inspect selected line
→ fetch candidates
→ commit exact resources
→ revalidate
→ approve
→ start execution
```

Also cover:

- reallocate;
- cancel;
- stale candidate;
- fallback line;
- Resource Hold;
- replan allowed/blocked;
- mixed-line rejection;
- refresh after every mutation.

Capture traces/screenshots for allocation, replan, approval, and start.


Do not turn failures into skips.

## 12.5 Required regression


Run all prior retained-page and three-WO E2E plus the maintained API regression.

Physical printer tests may be excluded only when explicitly out of scope; Print Station master-data smoke remains required later.


Record exact declared, executed, passed, failed, and skipped counts.

---

# 13. Artifacts

Create:

```text
artifacts/mes-console-remediation/phase-09/<run-id>/
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
allocation-flow-evidence.json
reallocation-cancel-history.json
revalidation-results.json
approval-start-results.json
line-replan-results.json
lifecycle-e2e-screenshot-index.json
```


Do not store secrets.

---

# 14. Required Report

Create:

```text
AI_document/Phase-09/REPORT_PHASE_09.md
```

Use `AI_document/REPORT_TEMPLATE.md`.

The report must include exact command evidence, files changed, APIs changed, seed/migration impact, test counts, cleanup, known issues, rollback, and the final gate.

---

# 15. Acceptance Criteria


- Candidates are constrained to selected line.
- Exact resources remain manually committed.
- Commit, reallocate, cancel, and revalidate follow backend rules.
- Strict approval cannot be bypassed.
- Replan is allowed and blocked at correct lifecycle points.
- Start execution is gated correctly.
- Allocation and lifecycle history persist.
- Mixed-line allocation is rejected.
- API and browser full flows pass.
- Cleanup passes.
- No mandatory test is skipped.
- Report authorizes UI-10.


Every mandatory criterion must pass.

---

# 16. Stop Conditions

In addition to the master rules, stop when:


- backend candidate API leaks cross-line resources;
- strict approval or start can be bypassed;
- allocation mutations lose history;
- row-version or stale-candidate behavior cannot be represented safely;
- test cleanup leaves reservations;
- replan behavior conflicts with one-WO-one-line invariants.


Do not continue into the next phase.

---

# 17. Completion Gate

On success, the report and completion response must state:

```text
PHASE_UI_09_PASSED_READY_FOR_UI_10
```

On failure:

```text
PHASE_UI_09_BLOCKED
```

Do not start Phase UI-10 in the same execution.
