# Phase 12 Final Report

Date: 2026-08-07

## Executive summary

The MES two-line Primary/Backup flow now selects one complete execution lane for a Work Order, proves every mandatory Routing Operation has a feasible candidate on that lane, falls back deterministically, and persists Resource Hold diagnostics when neither lane is complete. Exact planning, commit, revalidation, approval, Work Order start, and Operation start enforce the selected line and current resource state.

The Phase 11 release gate passed all 12 mandatory scenarios with zero skips. Backend tests, Master Data tests, Console build, canonical seed verification, four-state API fixtures, lifecycle tests, selected UI Playwright tests, cleanup, and the consolidated canonical regression all passed.

## Architecture before and after

Before:

- Line eligibility and coarse selection existed, but completeness was not consistently based on exact per-operation candidates.
- One failed resource could be treated as a failed line without proving alternatives.
- Shared Work Centers did not have an explicit line resource-scope contract.
- Approval/demo and execution-start paths could trust stale or synthetic allocation state.
- Console diagnostics exposed summary dimensions but not an exact operation comparison matrix.
- Canonical fixtures covered Primary, Backup, and Hold but not alternative-candidate resilience.

After:

- Master Data owns Production Line topology, line Resource Scope, readiness/release, and Production Version line eligibility.
- Execution consumes replicated master-data read models and calls the supported Master Data readiness API for exact candidates; it does not read the Master Data database.
- The selector evaluates complete lines in deterministic role/priority order and snapshots one selected line across all WO Operations.
- Selected-line database guards reject mixed-line operations, allocations, and reservations.
- Current exact allocation is required before approval, Work Order start, and Operation start.
- Console provides line configuration, readiness, eligibility, selected-line/fallback/hold triage, 13 dimensions, and per-operation candidate evidence.
- Canonical seed provides a second valid Primary Binding candidate and four deterministic line-selection fixtures.

## Domain audit

- One Work Order selects one complete line: PASS.
- Deterministic Primary/Backup priority: PASS.
- Complete-line feasibility before selection: PASS.
- One bad candidate with a valid alternative keeps the line Ready: PASS.
- Zero candidates for one mandatory operation blocks the line: PASS.
- Backup fallback: PASS.
- Both lines blocked produces persisted `RESOURCE_HOLD`: PASS.
- No post-start silent line hot-switch: PASS.

## Master Data audit

- Line -> Work Center API and UI: PASS.
- Line Resource Scope API and UI: PASS.
- Site/Area/Work Center/resource hierarchy validation: PASS.
- Readiness-gated line release: PASS.
- Explicit Production Version Primary/Backup eligibility: PASS.
- Shared Work Center requires unambiguous line resource scope: PASS.

## Execution audit

- Feasibility evaluation is read-only and separate from commit: PASS.
- Candidate generation is selected-line scoped: PASS.
- Cross-line commit is rejected by API and database consistency guard: PASS.
- Revalidation, approval, WO start, and Operation start use current authoritative readiness: PASS.
- Selection, fallback, hold, dimension, operation, and audit diagnostics are persisted: PASS.
- Failure after start uses controlled pause/retry events without changing line: PASS.

## MES Console audit

- Production Line workspace and supported configuration routes: PASS.
- Normal configuration requires no direct database setup: PASS.
- Selected line, fallback, and Resource Hold are visible in list/detail: PASS.
- Evaluated-line and per-operation matrix is understandable and responsive: PASS.
- Console renders backend decisions and does not reimplement selection policy: PASS.
- Vietnamese, English, Japanese, and Korean business labels for line dimensions and reasons: PASS.

## Schema and migrations

Relevant existing foundations:

- Master Data `0062_two_line_master_data`: Production Line, membership, and Production Version line eligibility.
- Master Data `0066_allow_draft_production_version_line_eligibility` and `0067_fix_draft_production_version_line_eligibility_enum`: authoring lifecycle compatibility.
- Execution `000023_production_line_selection`: replicated line models, WO line snapshot, audit, and consistency guards.

Migration added by this implementation:

- Master Data `0074_shared_work_center_line_resource_scope`: additive Resource Scope model and shared-Work-Center compatibility.

No destructive migration or route deletion was introduced.

## API changes

- Added/finished Production Line Work Center membership validation.
- Added Production Line Resource Scope read/write contract.
- Added line readiness response and readiness-gated release.
- Hardened Production Version eligibility and readiness preview.
- Added exact complete-line evaluation during WO creation and replan.
- Hardened candidate, commit, reallocate, and revalidate selected-line constraints.
- Added strict allocation revalidation to approval, WO start, and Operation start.
- Preserved auditable pre-start replan and rejected post-start replan.

## UI changes

- Added usable Production Line topology, Resource Scope, and readiness workspace.
- Added Production Version Primary/Backup eligibility authoring and preview.
- Added WO list filters and line-state summaries.
- Added selected line, fallback, hold, 13-dimension comparison, and exact operation feasibility matrix to WO detail.
- Added translated reason/status labels and responsive evidence layouts.

## Canonical data

- 2 lines, 8 Work Centers, 9 Workstations, 9 Equipment records, 9 Machine Units, 9 Resource Assignments, 13 capabilities, and 9 canonical calendars.
- 1 canonical Production Version with exactly one Primary and one Backup eligibility.
- Four reproducible scenarios: Primary Ready, Primary alternative survives, Backup fallback, and both-lines Resource Hold.
- Reset and seed scripts enforce local/test environment safety and reference-aware cleanup.

## Tests executed

- MES Execution `go test ./...`: PASS.
- MES Master Data unit tests: PASS, 40/40.
- MES Master Data TypeScript build: PASS.
- MES Console production build: PASS.
- Master Data two-line gate: PASS.
- Four-state exact selection gate: PASS, 4/4.
- Resource lifecycle gate: PASS, 5/5.
- Phase 11 full-flow/failure gate: PASS, 12/12, 0 skipped.
- MES Console selected release Playwright suite: PASS, 11/11.
- Canonical seed verification: PASS, no integrity defects.
- Consolidated `npm run test:mes:canonical-full-flow`: PASS.
- `git diff --check`: PASS.

Evidence:

- `artifacts/mes-two-line-phase11/`
- `artifacts/mes-two-line-uat-phase7-gate/`
- `artifacts/mes-two-line-uat-phase8-gate/`
- `artifacts/playwright/two-line-phase11/`
- `artifacts/mes-canonical-reset/`

## Unresolved backlog

- Controlled Execution Segment or child-WO transfer for partially completed production on another line.
- Full automatic labor assignment/check-in optimization described as future scope in `WO-2-LINE.md`.
- Full IIoT health, material staging, print station, WMS, and other third-party certification remains under their dedicated integration phases.
- Replace or archive the old one-line `machine_group + primary_machine` resource-planning fixture; the current canonical model uses direct Workstation/Equipment/Machine Unit assignments.

## Known non-blocking limitations

- Capacity reservation is enforced at Work Center/time-window scope; another Workstation in the same Work Center does not create independent capacity.
- Equipment maintenance/calibration freshness can appear as warnings when no authoritative freshness source is connected.
- MES Console has a non-failing Vite bundle-size warning.
- Historical invalid WMS replay payloads can produce unrelated Execution consumer log errors.

## Final status

READY_FOR_RELEASE
