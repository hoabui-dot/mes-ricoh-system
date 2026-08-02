# MES Two-Line Master Data Implementation - Phase 6

Date: 2026-08-01
Status: PASS

## Scope

Phase 6 implemented master-data structures and APIs only. Work Order line selection, `RESOURCE_HOLD`, selected-line snapshots, and runtime allocation enforcement were not modified in this phase.

Required guardrail source:

- `process-expand/mes-enterprise/docs/23_PHASE_IMPLEMENTATION_GUARDRAILS.md`
- `process-expand/mes-enterprise/docs/Phase-6-—-Two-Line-Master-Data-Implementation.md`

## Implemented Changes

Master Data database:

- Added migration `0062_two_line_master_data`.
- Added `md_production_line`.
- Added `md_production_line_work_center`.
- Added `md_production_line_resource_scope`.
- Added `md_production_version_line_eligibility`.
- Added same-site, area, effective-period, active ownership overlap, single-primary, priority, and potential line capability validation.

Master Data API:

- Added Production Line list/detail/create/update/delete.
- Added Production Line release through generic lifecycle endpoint.
- Added Production Line Work Center assignment.
- Added Production Version Line Eligibility replacement API.
- Added Production Version line-readiness preview API.
- Added versioned outbox facts for Production Line release, line Work Center assignment, and PV line eligibility release.

MES Console:

- Added Production Line list/detail/create/edit routes through `ResourceFoundationScreen`.
- Added sidebar and route-header navigation.
- Added localized Production Line labels.

Tests:

- Added `scripts/test-mes-two-line-master-data-phase6.mjs`.
- Added package script `test:mes:two-line-master-data:phase6`.

## Verification

Command:

```bash
npm run test:mes:two-line-master-data:phase6
```

Result:

- Declared: 9 API/DB verification steps
- Executed: 9
- Passed: 9
- Failed: 0
- Skipped: 0

Verified:

- Migration tables and constraints exist.
- Production Line CRUD and lifecycle release API.
- Same-site validation rejects mismatched Site/Area.
- Work Center line assignment API.
- Conflicting active Work Center line ownership is rejected.
- Production Version Line Eligibility requires one primary and supports ordered primary/backup lines.
- Line-readiness preview returns Ready for both configured lines.
- Dependency-aware Production Line delete rejects referenced lines.
- Master Data outbox events are written.
- Exact cleanup leaves no generated Phase 6 rows.

Supporting checks:

```bash
npm --prefix services/mes-master-data-service run typecheck
npm --prefix services/mes-master-data-service run build
npm --prefix services/mes-console run typecheck
npm --prefix services/mes-console run build
node --check scripts/test-mes-two-line-master-data-phase6.mjs
git diff --check
```

All passed.

Browser E2E command:

```bash
MES_E2E_BASE_URL=http://127.0.0.1:13992 MES_E2E_API_BASE_URL=http://127.0.0.1:13991 npm run test:e2e:resource-planning:phase6
```

Result:

- Declared: 1 browser test
- Executed: 1
- Passed: 1
- Failed: 0
- Skipped: 0

Verified:

- MES Console login works against the temporary local console.
- Production Lines navigation is visible.
- Production Lines list route calls the master-data API.
- Production Line create form exposes Site, Production Area, and Line Type authoring fields.

## Gate Decision

Phase 6 gate: PASS.

The phase implements only master-data structures, APIs, outbox facts, and master-data UI routes. Execution-selected line snapshots, `RESOURCE_HOLD`, primary-to-backup Work Order selection, and mixed-line allocation rejection remain for later phases.
