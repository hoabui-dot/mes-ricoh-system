# Phase UI-00 Report — Product Decision Approval and Readiness Gate

Date: 2026-08-02

Initial run ID: `2026-08-02T14-22-00Z`

Reverification run ID: `2026-08-02T14-35-33Z`

Final status: `PHASE_UI_00_PASSED_READY_FOR_UI_01`

## 1. Executive Summary

Phase UI-00 completed the required source review, product decision record, role baseline, Worker Skill domain confirmation, UAT fixture strategy, phase-order confirmation, and baseline command execution.

The eight product decisions are approved for planning and do not block UI-01.

The initial run was blocked by stale disposable runtime data and a stale served `mes-console` bundle. Reverification cleared the gate after a guarded canonical reset/seed/verify and `mes-console` container rebuild/recreate.

| Baseline | Result |
| --- | --- |
| MES Console typecheck | Passed |
| MES Console build | Passed with existing Vite chunk-size warning |
| Canonical seed verification | Passed 40/40 |
| Resource Planning Phase 1 API | Passed 20/20 through Phase 2 negative matrix |
| Resource Planning Phase 2 full flow | Passed with print-station/third-party steps skipped per user instruction |
| Two-line Phase 7 API | Passed 19/19 |
| Two-line Phase 9 API regression | Passed 19/19 |
| Phase 8 browser E2E | Passed 3/3 |

Phase UI-01 is authorized from this report.

## 2. Scope

Allowed and performed:

- Inspected rules, blueprint, source, scripts, tests, AI context, and prior artifacts.
- Revalidated product decisions DEC-001 through DEC-008.
- Documented role and permission baseline.
- Confirmed Worker Skill source/schema/runtime mismatch.
- Confirmed UAT fixture strategy.
- Ran non-destructive static/build checks.
- Ran maintained API and browser baseline suites.
- Ran the guarded canonical reset/seed/verify command to clear stale disposable execution state.
- Rebuilt and recreated the `mes-console` container so browser tests exercised the current source bundle.
- Created Phase UI-00 docs and artifacts.
- Updated blueprint readiness status.

Not performed:

- No MES Console source changes.
- No backend source changes.
- No migrations.
- No seed script changes.
- No UAT Work Order creation.
- No route changes.
- No test changes.

## 3. Sources Inspected

Key sources:

- `AI_document/refactor-mes-console/REMEDIATION_MASTER_RULES.md`
- `AI_document/refactor-mes-console/PROMPT_PHASE_00.md`
- `AI_document/refactor-mes-console/REPORT_TEMPLATE.md`
- `AI_document/MES_CONSOLE_FULL_REMEDIATION_BLUEPRINT.md`
- `AI_CONTEXT.md`
- `UI_AI_CONTEXT.md`
- `services/mes-console/src/App.tsx`
- `services/mes-console/src/components/Sidebar.tsx`
- `services/mes-console/src/context/AuthContext.tsx`
- `services/mes-console/src/lib/masterDataApi.ts`
- `services/mes-console/src/routes/master-data/EmployeesScreen.tsx`
- `services/mes-console/src/routes/master-data/SkillManagementScreen.tsx`
- `services/mes-console/src/routes/work-orders/WODetailScreen.tsx`
- `services/mes-master-data-service/src/infrastructure/http/master-data.router.ts`
- `services/mes-master-data-service/src/infrastructure/db/seed.ts`
- `services/mes-execution-service/internal/infrastructure/http/router.go`
- `services/mes-execution-service/internal/application/usecase/line_selection.go`
- `scripts/verify-mes-canonical-seed.mjs`
- `scripts/test-mes-resource-planning-domain-phase1.mjs`
- `scripts/test-mes-resource-planning-full-flow.mjs`
- `scripts/test-mes-two-line-resource-planning-phase7.mjs`
- `e2e/resource-planning/phase8-two-line-console.spec.ts`
- `package.json`
- `playwright.config.ts`

Package path note: `README(3).md` and `manifest.json` describe `AI_document/Phase-XX/...` prompt paths, but the actual prompt files are flat under `AI_document/refactor-mes-console/`.

## 4. Runtime Environment

Working directory: `/home/neurosus/recoh-system/mes-system`

Environment date: 2026-08-02

Baseline commands used the existing local development/test configuration. The re-verification run executed the guarded local-only full reset command:

`npm run reset:seed:verify:mes:canonical`

The command passed its safety checks, reset only MES-owned disposable service databases, preserved non-MES systems, reseeded the canonical dataset, and verified the seed.

## 5. Product Decisions

| Decision | Final value | Blocks UI-01 | Notes |
| --- | --- | ---: | --- |
| DEC-001 Employee Skill assignment ownership | `EMPLOYEE_MODAL_ONLY` | No | Employee Create/Edit is the only mutation authority. |
| DEC-002 Worker Skill Detail mutation | `READ_ONLY_WITH_EMPLOYEE_LINK` | No | Worker detail stays definition/dependency/assignment visibility only. |
| DEC-003 UAT Work Order fixture strategy | `IDEMPOTENT_PREPARE_VERIFY_CLEANUP` | No | UI-02 must use APIs/workflows, not direct table inserts. |
| DEC-004 Canonical Equipment route | `MACHINES_CANONICAL` | No | `/master-data/machines` is canonical. |
| DEC-005 Legacy alias lifetime | `1_RELEASE`, equipment `2_RELEASES` | No | Redirect before removal. |
| DEC-006 PV line readiness visibility | `LIST_SUMMARY_PLUS_DETAIL_TAB` | No | Backend-provided readiness only. |
| DEC-007 Exact resource allocation | `AUTO_LINE_MANUAL_EXACT_RESOURCES` | No | Do not remove manual resource planning. |
| DEC-008 i18n review visibility | `DIAGNOSTIC_ADMIN_ONLY` | No | Hide from normal sidebar in UI-03. |

Decision record: `AI_document/Phase-00/PHASE_00_PRODUCT_DECISIONS.md`

## 6. Role and Permission Findings

The role baseline is sufficient for UI-01 because seed correction does not depend on final route/action authorization.

Confirmed:

- Keycloak realm roles are loaded in `AuthContext`.
- `masterDataApi.ts` forwards the first role as `X-Role-Code`, defaulting to `PROD_MANAGER`.
- Execution resource allocation mutation allows `PLANT_MANAGER`, `PROD_MANAGER`, `PLANNER`, and `EXECUTIVE`.
- Execution returns `RESOURCE_ALLOCATION_FORBIDDEN` for unauthorized allocation mutation roles.
- Seed contains `PROD_MANAGER` role permission and resource scope records.
- Playwright credentials use `plant.manager`.

Unresolved for later phase:

- Real ADMIN and VIEWER role behavior.
- Gateway forged-header rejection evidence.
- Complete cross-site denial behavior.
- Route-level UI visibility rules.

Role record: `AI_document/Phase-00/PHASE_00_ROLE_PERMISSION_BASELINE.md`

## 7. Worker Skill Domain Confirmation

Required domain contract:

- Worker Skill Definition: `scope=Employee`.
- Employee Skill rows reference Employee-scoped skills.
- Operation Skill Requirement rows reference Employee-scoped skills.
- Employee UI and Worker Skills tab use the same Employee-scoped definitions.

Confirmed source behavior:

- `GET /worker-skills` filters Employee-scoped skills.
- `POST /worker-skills` creates Employee-scoped skills.
- `PUT /employees/:id/skills` validates Employee-scoped skills.
- `POST /worker-skills/:id/assignments` validates Employee-scoped skills.
- Operation Skill Requirement create/update validates Employee-scoped skills.
- `EmployeesScreen.tsx` loads `fetchResource('skills', user, '?scope=Employee')`.
- `SkillManagementScreen.tsx` worker tab uses `/worker-skills`.

Current mismatch inventory:

| Record type | Business code | Current scope/reference | Required scope/reference | Impact |
| --- | --- | --- | --- | --- |
| Skill | `SK-WC-INSPECTION` | `WorkCenter` | `Employee` | Worker Skills tab and Employee modal do not share valid seed identity. |
| Skill | `SK-WC-MIX-MASTER` | `WorkCenter` | `Employee` | Employee skill save can reject seeded skill identity. |
| Skill | `SK-WC-VULCAN-OPERATOR` | `WorkCenter` | `Employee` | Operation labor readiness is based on inconsistent domain identity. |
| Employee Skill | `EMP-MIX-001 -> SK-WC-MIX-MASTER` | WorkCenter-scoped skill | Employee-scoped skill | Must be relinked in UI-01. |
| Employee Skill | `EMP-VULCAN-001/002 -> SK-WC-VULCAN-OPERATOR` | WorkCenter-scoped skill | Employee-scoped skill | Must be relinked in UI-01. |
| Employee Skill | `EMP-QC-001 -> SK-WC-INSPECTION` | WorkCenter-scoped skill | Employee-scoped skill | Must be relinked in UI-01. |
| Operation Skill Requirement | WST operation requirements | WorkCenter-scoped skill | Employee-scoped skill | Must be relinked in UI-01. |

UI-01 correction specification:

1. Keep business codes unless product chooses new worker-specific codes.
2. Correct canonical worker skills to Employee scope.
3. Relink `md_employee_skill`.
4. Relink `md_operation_skill_requirement`.
5. Treat old WorkCenter-scoped rows as incompatible seed artifacts, not UI authority.
6. Reset/reseed disposable canonical data.
7. Verify `/worker-skills`, `/skills?scope=Employee`, `/employees/:id/skills`, and operation requirements all return the same skill identity.
8. Add Worker Skill API, Employee Skill API, labor readiness, and browser Employee/Skill coverage.

## 8. UAT Fixture Strategy

Approved strategy: `IDEMPOTENT_PREPARE_VERIFY_CLEANUP`

Required Work Orders:

| Fixture | Expected state |
| --- | --- |
| `UAT-WO-PRIMARY` | `line_selection_mode=AUTO`, `line_selection_status=READY`, selected line is primary, fallback reason null |
| `UAT-WO-FALLBACK` | `line_selection_mode=AUTO`, `line_selection_status=READY`, selected line is backup, fallback reason present, primary blocked, backup ready |
| `UAT-WO-HOLD` | `line_selection_mode=AUTO`, `line_selection_status=RESOURCE_HOLD`, selected line null, resource hold reason present |

Canonical PV: `WST-SEED-PV-SEAL-ASM-01`

Primary line: `WST-SEED-LINE-1`

Backup line: `WST-SEED-LINE-2`

Expected operation count: 4 for the WST two-line scenario.

Existing target WO `ad71bae7-0252-46db-a1f0-e9e0fad3c468` remains useful only as an ad hoc hold fixture. It must not be treated as the deterministic UI-02 hold fixture until the UI-02 script owns prepare/verify/cleanup and artifact output.

## 9. Canonical Remediation Phase Order

Approved canonical order:

1. UI-01 Worker Skill Domain and Canonical Seed Correction
2. UI-02 Deterministic Two-Line UAT Fixtures
3. UI-03 Routes, Navigation, and Legacy Redirect Cleanup
4. UI-04 Shared UI Components and Server-State Standardization
5. UI-05 Product Definition and Production Version UI
6. UI-06 Resource Foundation and Planning Constraints UI
7. UI-07 Labor, Worker Skill, and Employee Skill UX
8. UI-08 Work Order List and Two-Line Diagnostics
9. UI-09 Resource Planning and Lifecycle Actions
10. UI-10 Authorization, i18n, Accessibility, Regression, and UAT

## 10. Baseline Build Results

| Command | Declared | Executed | Passed | Failed | Skipped | Exit |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `npm --prefix services/mes-console run typecheck` | 1 | 1 | 1 | 0 | 0 | 0 |
| `npm --prefix services/mes-console run build` | 1 | 1 | 1 | 0 | 0 | 0 |

Build warning: Vite reports the main JS chunk exceeds 500 kB after minification.

## 11. API Integration Baseline Results

| Command | Declared | Executed | Passed | Failed | Skipped | Exit |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `npm run reset:seed:verify:mes:canonical` | 40 | 40 | 40 | 0 | 0 | 0 |
| `npm run verify:mes:canonical-seed` | 40 | 40 | 40 | 0 | 0 | 0 |
| `SKIP_PRINT_STATION_THIRD_PARTY=true npm run test:mes:resource-planning-full-flow:phase2` | 12 | 12 | 8 | 0 | 4 | 0 |
| `npm run test:mes:two-line-resource-planning:phase7` | 19 | 19 | 19 | 0 | 0 | 0 |
| `npm run test:mes:two-line-full-regression:phase9` | 19 | 19 | 19 | 0 | 0 | 0 |

API notes:

- Initial canonical seed verification failed because previous mutating checks left two execution Work Orders. Guarded reset/seed/verify cleared this.
- Phase 2 strict print-station revalidation is excluded in the re-verification run because print-station/third-party scenarios are skipped by user instruction.
- Phase 2 cleanup deleted its exact generated Work Orders and left zero target rows.

## 12. Browser E2E Baseline Results

| Command | Declared | Executed | Passed | Failed | Skipped | Exit |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `npm run test:e2e:resource-planning:phase8` | 3 | 3 | 3 | 0 | 0 | 0 |

Browser note:

- The initial browser run hit a stale deployed `mes-console` bundle at port `13052`. Rebuilding and recreating the container refreshed the served bundle and the Phase 8 browser suite passed 3/3.

## 13. Existing Failures and Expected Blockers

| Blocker | Classification | Maps to |
| --- | --- | --- |
| Worker Skill seed scope mismatch | `UI-01_REQUIRED_INPUT` | UI-01 |

## 14. Risks

- UI-01 will intentionally change seed/domain behavior for Worker Skills, so post-UI-01 failures should be evaluated against the Employee-scoped Worker Skill contract rather than the pre-remediation seed identity.
- Role evidence is incomplete for UI-10; this is acceptable for UI-01 but not for final authorization remediation.
- Phase prompt package path mismatch can confuse future runs unless actual repo paths are used.

## 15. Required UI-01 Inputs

UI-01 may start because the Phase UI-00 baseline gate passed on re-verification.

Required UI-01 inputs:

- Employee-scoped Worker Skill correction design.
- Reset/reseed plan for disposable environment.
- Verification queries for skill scopes and references.
- API tests for `/worker-skills`, `/employees/:id/skills`, operation skill requirements, and labor readiness.
- Browser tests for Employee skill assignment and Worker Skill visibility.

## 16. Blueprint Updates

Updated `AI_document/MES_CONSOLE_FULL_REMEDIATION_BLUEPRINT.md` with:

- Phase UI-00 decision values and approval date.
- Resolved Phase UI-00 baseline blocker status.
- Canonical next phase authorization state: `UI-01`.

## 17. Final Gate

Final gate: `PHASE_UI_00_PASSED_READY_FOR_UI_01`

Next authorized phase: `UI-01 Worker Skill Domain and Canonical Seed Correction`
