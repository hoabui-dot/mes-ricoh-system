# MES Console Post Phase 11 UI Audit

Date: 2026-08-02

Run id: `2026-08-02T10-30-00Z`

Instruction source: `process-expand/mes-enterprise/expands/Audit-MES-Console-UI-Against-the-Completed-11-Phase-MES-Implementation-and-Produce-a-Full-UI-Gap-Report.md`

Guardrail source: `process-expand/mes-enterprise/docs/23_PHASE_IMPLEMENTATION_GUARDRAILS.md`

Audit mode: read-only. No UI, backend, migration, or seed files were modified.

## Executive Summary

Overall UI status: `BACKEND_READY_UI_INCOMPLETE`

The MES Console has broad route coverage for the completed 11-phase backend, including work order creation, work order detail, resource planning, resource foundation data, planning constraints, production version line eligibility, employee management, and skill management. The most important post-phase-11 backend concepts are present in the UI: automatic production line selection during work order creation, selected line display on work order detail, line replan, per-operation resource candidate planning, resource revalidation, start execution, worker-skill definitions, employee skill assignments, and two-line seed data.

The UI is not yet complete enough to be considered fully aligned with the 11-phase implementation. The current gaps are concentrated around phase-11 proof and operator visibility: the work order detail page renders simplified evaluated-line result cards but not a complete diagnostic comparison matrix; the requested target work order is currently in `ResourceHold` with no selected line; worker skill screens are split between worker skill definitions and employee assignment flows; and legacy console aliases still expose an obsolete skills route.

Target work order status:

| Work Order ID | Current DB status | UI audit result |
| --- | --- | --- |
| `ad71bae7-0252-46db-a1f0-e9e0fad3c468` | `ResourceHold`; `line_selection_status=RESOURCE_HOLD`; `selected_production_line_id=NULL`; `selected_production_line_code=NULL`; `line_selection_mode=AUTO` | Can be opened by `/work-orders/:id`, but cannot demonstrate selected-line or fallback-line behavior until the resource hold is resolved. |

Seed status from current database:

| Area | Evidence |
| --- | --- |
| Two-line seed | `WST-SEED-PV-SEAL-ASM-01` has `WST-SEED-LINE-1` primary and `WST-SEED-LINE-2` backup. |
| Current work order state | Execution DB contains two WOs; both are `ResourceHold`. |
| Worker skill data | 3 skills, 4 employees, 4 employee skill rows, 4 employee shift schedules, 3 operation skill requirements. |
| Important mismatch | The seeded worker skills currently have `scope=WorkCenter`, while worker-skill APIs and employee-skill mutation endpoints validate `scope=Employee`. |

## Evidence Sources

| Evidence | Source |
| --- | --- |
| Route inventory | `services/mes-console/src/App.tsx` |
| Sidebar navigation | `services/mes-console/src/components/Sidebar.tsx` |
| Work order create UI and APIs | `services/mes-console/src/routes/work-orders/WOCreateScreen.tsx` |
| Work order list UI and APIs | `services/mes-console/src/routes/work-orders/WOListScreen.tsx` |
| Work order detail UI and APIs | `services/mes-console/src/routes/work-orders/WODetailScreen.tsx` |
| Skill management UI | `services/mes-console/src/routes/master-data/SkillManagementScreen.tsx` |
| Employee skill assignment UI | `services/mes-console/src/routes/master-data/EmployeesScreen.tsx` |
| Master data API routes | `services/mes-master-data-service/src/infrastructure/http/master-data.router.ts` |
| Execution API routes | `services/mes-execution-service/internal/infrastructure/http/router.go` |
| Line selection use case | `services/mes-execution-service/internal/application/usecase/line_selection.go` |
| Current DB evidence | Direct read-only queries against `mes_master_data_db` and `mes_execution_db` |
| Seed verification artifact | `artifacts/mes-canonical-reset/2026-08-02T09-59-22-109Z/verification-result.json` |
| Full-flow artifact | `artifacts/mes-canonical-reset/2026-08-02T09-59-26-515Z/full-flow-result.json` |

## Route Inventory

Classification values: `Current`, `Legacy alias`, `Redirect`, `Detail/Edit subroute`, `Needs merge`.

| Route | Component or behavior | Sidebar | Status |
| --- | --- | --- | --- |
| `/` | Redirect to `/work-orders` | No | Redirect |
| `/work-orders` | Work order list | Yes | Current |
| `/work-orders/new` | Work order creation workflow | From list | Current |
| `/work-orders/:id` | Work order detail, approval, resource planning, start execution | From list | Current |
| `/console/mes/work-orders` | Work order list alias | No | Legacy alias |
| `/console/mes/work-orders/new` | Work order creation alias | No | Legacy alias |
| `/console/mes/work-orders/:id` | Work order detail alias | No | Legacy alias |
| `/master-data/items` | Items and revisions | Yes | Current |
| `/master-data/uoms` | UOMs | Yes | Current |
| `/master-data/material-groups` | Material groups | Yes | Current |
| `/master-data/mboms` | MBOM list | Yes | Current |
| `/master-data/mboms/new` | MBOM create | From list | Current |
| `/master-data/mboms/:id` | MBOM detail | From list | Current |
| `/master-data/routings` | Routing list | Yes | Current |
| `/master-data/routings/new` | Routing create | From list | Current |
| `/master-data/routings/:id/edit` | Routing edit | From list | Current |
| `/master-data/routings/:id/operations` | Routing operation management | From routing | Current |
| `/master-data/production-versions` | Production version list | Yes | Current |
| `/master-data/production-versions/new` | Production version create | From list | Current |
| `/master-data/production-versions/:id/edit` | Production version edit | From list | Current |
| `/master-data/product-recipes` | Redirect to production versions | No | Redirect |
| `/master-data/eboms` | EBOM list | Yes | Current |
| `/master-data/eboms/:id` | EBOM detail | From list | Current |
| `/master-data/operations` | Operation catalog list | Yes | Current |
| `/master-data/operations/new` | Operation create | From list | Current |
| `/master-data/operations/:id` | Operation detail | From list | Current |
| `/master-data/operations/:id/edit` | Operation edit | From list | Current |
| `/master-data/factories` | Factory/site resource foundation | Yes | Current |
| `/master-data/shopfloors` | Shopfloor resource foundation | Yes | Current |
| `/master-data/production-areas` | Area resource foundation | No | Current, navigation gap |
| `/master-data/production-lines` | Production line resource foundation | Yes | Current |
| `/master-data/work-centers` | Work center resource foundation | Yes | Current |
| `/master-data/workstations` | Workstation resource foundation | Yes | Current |
| `/master-data/equipment` | Equipment resource foundation | Direct only | Needs merge |
| `/master-data/machines` | Machine/equipment resource foundation | Yes | Current |
| `/master-data/resource-assignments` | Machine unit to work center/workstation assignment | Yes | Current |
| `/master-data/resource-capabilities` | Capability constraints | Yes | Current |
| `/master-data/resource-calendars` | Resource calendars | Yes | Current |
| `/master-data/production-standards` | Production standards | Yes | Current |
| `/master-data/operation-skill-requirements` | Operation worker-skill requirements | Yes | Current |
| `/master-data/print-stations` | Print station screen | Yes | Current, third-party flow skipped in UAT |
| `/master-data/reason-codes` | Reason codes | Yes | Current |
| `/master-data/skills` | Skill management default tab | Yes | Current |
| `/master-data/skills/:scope` | Machine, workstation, work-center, worker tabs | From skills tab | Current |
| `/master-data/worker-skills` | Redirect to `/master-data/skills/workers` | No | Redirect |
| `/master-data/employee-skills` | Redirect to `/master-data/skills/workers` | No | Redirect |
| `/worker-skills` | Redirect to `/master-data/skills/workers` | No | Redirect |
| `/employees` | Employee list and employee skill assignment modal | Yes | Current |
| `/shifts` | Shifts | Yes | Current |
| `/work-calendar` | Employee schedule bulk UI | Yes | Current |
| `/console/mes/skills` | `Tier2AdminScreen` for `skills` | No | Needs merge, obsolete behavior risk |
| `/console/mes/*` master-data aliases | Compatibility screens | No | Legacy alias |
| `*` | Not found | No | Current |

## Screen Coverage Summary

| Screen family | UI status | Backend status | Gap |
| --- | --- | --- | --- |
| Work order list | Current | Current | No line-selection filter or line-selection status column. |
| Work order create | Current | Current | No manual line selection, by design. Auto selection is triggered by creation workflow. |
| Work order detail | Partial | Current | Selected line, hold status, and simplified evaluated-line cards are shown, but the full diagnostic comparison is incomplete. |
| Resource planning tab | Current | Current | Manual per-operation resource selection is still required after automatic line selection. This is expected, not contradictory. |
| Line replan | Current | Current | Present before execution start; not available after started/completed/closed state. |
| Production line master data | Current | Current | Navigation and detail can manage line foundation, but readiness visualization is split across multiple screens. |
| Production version line eligibility | Partial | Current | Seed/data exists; UI discoverability and operator preview are incomplete. |
| Worker skills | Partial | Current | Worker skill definition tab exists; assignment mutation exists in backend but is not exposed from the worker skill detail modal. |
| Employee skill assignment | Partial | Current | Employee modal can assign skills, but it loads generic `/skills?scope=Employee`; current seed has skills scoped `WorkCenter`. |
| Resource foundation | Current | Current | Many critical readiness inputs exist, but the screens are generic and not optimized for two-line UAT diagnosis. |
| Planning constraints | Current | Current | Generic forms can create invalid-looking drafts until backend validation responds. |
| Print station | Partial | Partial/skipped | Print station and third-party flows were intentionally skipped for this audit. |

## Backend-to-UI Traceability

| Backend concept | Backend field/API | UI exposure | Status |
| --- | --- | --- | --- |
| Automatic line selection | `POST /work-order-creation-workflows` returns `selectedProductionLineId`, `selectedProductionLineCode`, `lineSelectionStatus`, `fallbackReason` | Create workflow result and detail page | Partial |
| Selected production line | `wo_header.selected_production_line_*` and detail response | Work order detail panel and operation rows | Current |
| Line selection mode | `line_selection_mode` | Work order create displays auto mode; detail displays mode | Current |
| Resource hold | `line_selection_status=RESOURCE_HOLD`, `resource_hold_reason` | Detail warning panel | Current |
| Evaluated line results | `evaluated_line_results` | UI renders role/status/blocker cards but not the complete line readiness comparison needed for UAT proof | Partial |
| Fallback reason | `fallback_reason` | Detail panel | Current |
| Line replan | `POST /work-orders/:id/line-replan` | Replan modal and button | Current |
| Resource candidates | `GET /work-orders/:id/operations/:opId/resource-candidates` | Candidate panel with readiness and blockers | Current |
| Mixed-line allocation prevention | DB trigger and allocation use case | Indirect through backend errors | Partial |
| Worker skill definitions | `/worker-skills` CRUD endpoints | Worker tab under Skill Management | Current |
| Worker skill assignments | `/worker-skills/:id/assignments`, `/employees/:id/skills` | Employee modal assignment; worker detail read-only list | Partial |
| Operation skill requirements | `/operation-skill-requirements` and routing operation worker-skill loading | Constraint screen and routing operation screens | Current |

## Mandatory Two-Line Work Order Verification

The requested target work order `ad71bae7-0252-46db-a1f0-e9e0fad3c468` exists in the execution database.

Current values:

| Field | Value |
| --- | --- |
| `wo_code` | `WO-20260802-0047` |
| `status` | `ResourceHold` |
| `line_selection_mode` | `AUTO` |
| `line_selection_status` | `RESOURCE_HOLD` |
| `selected_production_line_id` | `NULL` |
| `selected_production_line_code` | `NULL` |
| `fallback_reason` | `NULL` |

Conclusion: this work order is useful for verifying the resource-hold UI path, not the selected primary-line or fallback-to-backup-line UI path. The work order detail page has the required route and panels to expose `RESOURCE_HOLD`, but phase-11 UAT still needs at least one persisted READY work order with a selected primary line and one persisted fallback scenario with a backup line selected.

## Worker Skill and Employee Skill Management

Worker skill management is present but not fully aligned.

Confirmed backend:

| Endpoint | Purpose |
| --- | --- |
| `GET /worker-skills` | List Employee-scope worker skill definitions. |
| `POST /worker-skills` | Create Employee-scope worker skill. |
| `PUT /worker-skills/:id` | Edit/deactivate worker skill. |
| `GET /worker-skills/:id/dependencies` | Show employee assignment, operation requirement, production standard dependencies. |
| `GET /worker-skills/:id/assignments` | List employee assignments for a skill. |
| `POST /worker-skills/:id/assignments` | Assign a worker skill to an employee. |
| `POST /worker-skills/:id/assignments/:employeeId/end` | End an employee assignment. |
| `GET /employees/:id/skills` | Read employee skill assignments. |
| `PUT /employees/:id/skills` | Replace employee skill assignments. |

Confirmed UI:

| UI | Capability |
| --- | --- |
| `/master-data/skills/workers` | Lists worker skill definitions, creates definitions, edits/deactivates definitions, shows read-only assignment list. |
| `/employees` modal | Loads skills with `?scope=Employee`, reads `employees/:id/skills`, and writes assignments through `PUT /employees/:id/skills`. |

Gap: the current seed has worker-related skills with `scope=WorkCenter`, while worker-skill APIs and employee assignment validation require `scope=Employee`. The existing database therefore contains employee skill rows using WorkCenter-scoped skill IDs. This can support some execution read-model checks, but it is not aligned with the worker-skill UI contract.

## Manual Resource Planning vs Automatic Line Selection

Automatic line selection and manual resource planning are separate responsibilities.

The completed phase-11 logic selects exactly one production line for the work order based on production version eligibility and line readiness. The UI correctly does not ask the planner to manually choose the production line during work order creation.

Manual resource planning remains valid after the line is selected. The work order detail page fetches per-operation candidates only within the selected line context and commits one workstation/equipment candidate per operation. This is expected because automatic line selection does not automatically reserve exact workstation/machine-unit capacity for every operation.

## Current Seed Data Audit

Current database inventory:

| Dataset | Count |
| --- | ---: |
| Sites | 1 |
| Shopfloors | 1 |
| Production areas | 2 |
| Production lines | 3 |
| Production line work centers | 12 |
| Production version line eligibilities | 3 |
| Work centers | 12 |
| Workstations | 12 |
| Equipment | 13 |
| Machine units | 12 |
| Resource assignments | 12 |
| Skills | 3 |
| Employees | 4 |
| Employee skills | 4 |
| Employee shift schedules | 4 |
| Items | 8 |
| Item revisions | 8 |
| EBOMs | 1 |
| MBOMs | 3 |
| Routings | 2 |
| Routing operations | 10 |
| Production versions | 2 |
| Operation skill requirements | 3 |

Line eligibility:

| Production version | Line | Primary | Priority |
| --- | --- | --- | ---: |
| `PV-FG-WS-CM01-R1` | `LINE-BASE-1` | Yes | 1 |
| `WST-SEED-PV-SEAL-ASM-01` | `WST-SEED-LINE-1` | Yes | 1 |
| `WST-SEED-PV-SEAL-ASM-01` | `WST-SEED-LINE-2` | No | 2 |

Worker skills:

| Employee | Skill | Scope | Level |
| --- | --- | --- | --- |
| `EMP-MIX-001` | `SK-WC-MIX-MASTER` | `WorkCenter` | `L3` |
| `EMP-QC-001` | `SK-WC-INSPECTION` | `WorkCenter` | `L2` |
| `EMP-VULCAN-001` | `SK-WC-VULCAN-OPERATOR` | `WorkCenter` | `L2` |
| `EMP-VULCAN-002` | `SK-WC-VULCAN-OPERATOR` | `WorkCenter` | `L2` |

## Pages to Remove, Merge, or Retain

| Page/route | Recommendation | Reason |
| --- | --- | --- |
| `/console/mes/skills` | Merge/remove alias | It routes to `Tier2AdminScreen` instead of the current skill management tabbed UI and can bypass worker-skill semantics. |
| `/master-data/equipment` and `/master-data/machines` | Merge naming | Both map to equipment/machine resource foundation concepts; sidebar prefers Machines. |
| `/master-data/production-areas` | Retain and add sidebar entry or parent navigation | Current route exists but is less discoverable than other hierarchy screens. |
| `/console/mes/*` aliases | Retain temporarily as compatibility aliases | Keep only if external bookmarks require them; otherwise redirect to canonical `/master-data` routes. |
| `/master-data/product-recipes` | Keep redirect only | Product recipe concept has been superseded by Production Versions. |

## Findings

### Critical

| ID | Finding | Evidence | Remediation |
| --- | --- | --- | --- |
| `CRIT-UI-001` | Full two-line UAT cannot be proven from the target work order because it is `ResourceHold` and has no selected line. | DB query for `ad71bae7-0252-46db-a1f0-e9e0fad3c468` returns `line_selection_status=RESOURCE_HOLD`, `selected_production_line_id=NULL`. | Create or preserve UAT work orders for READY primary-line and READY fallback-line states, or resolve the hold reason for the target WO before UAT. |
| `CRIT-UI-002` | Worker-skill seed scope is incompatible with worker-skill and employee-skill UI/API contracts. | Current seeded skills are `scope=WorkCenter`; `/worker-skills` and `/employees/:id/skills` validate `scope=Employee`. | Rebuild canonical worker skills as Employee-scoped records and relink operation skill requirements and employee skill assignments to the same Employee-scoped IDs. |

### High

| ID | Finding | Evidence | Remediation |
| --- | --- | --- | --- |
| `HIGH-UI-001` | Work order detail only renders simplified evaluated-line cards, not a complete diagnostic comparison table. | `WODetailScreen.tsx` maps `evaluated_line_results` into cards with role, line code, status, and blockers. It does not show the full readiness dimensions needed for two-line UAT proof. | Expand the line evaluation matrix to show each eligible line, readiness dimensions, blockers, fallback reason, and selected/fallback marker. |
| `HIGH-UI-002` | Worker skill assignment mutation is split and incomplete in the worker skill UI. | Worker tab shows assignment list but does not call `POST /worker-skills/:id/assignments` or end-assignment endpoint. | Add assign/end actions to worker skill detail, or explicitly document that assignment is owned only by Employee modal. |
| `HIGH-UI-003` | Legacy `/console/mes/skills` route can expose the wrong skill management surface. | App route maps it to `Tier2AdminScreen` instead of `SkillManagementScreen`. | Redirect `/console/mes/skills` to `/master-data/skills/workers` or remove the alias. |
| `HIGH-UI-004` | Work order list lacks line selection columns and filters. | WO list columns are WO, Item, Quantity, Target Date, Status, Actions. | Add selected line, line-selection status, and resource-hold/fallback badges. |
| `HIGH-UI-005` | Production version line eligibility is not prominent enough for two-line UAT. | Data and backend validation exist, but the UI does not provide a compact line eligibility/readiness summary at list/detail level. | Add line eligibility summary and readiness preview to production version detail/list. |

### Medium

| ID | Finding | Evidence | Remediation |
| --- | --- | --- | --- |
| `MED-UI-001` | Resource foundation and planning constraint screens are generic, making readiness diagnosis slow. | Line, work center, workstation, machine, capability, calendar, standard, and assignment data are spread across screens. | Add cross-link panels from production line and work order detail. |
| `MED-UI-002` | Planning constraint forms rely heavily on backend validation. | Generic screens include free-form resource type patterns and broad option loading. | Constrain selects by entity type and show validation hints before submit. |
| `MED-UI-003` | Print station UI exists but physical/third-party runtime UAT remains skipped. | User instructed print station or third party can be skipped. | Keep print station gaps out of phase-11 pass criteria unless print runtime is reintroduced. |
| `MED-UI-004` | Sidebar hides some valid current routes. | Production areas and equipment are direct-route only or naming-overlapped. | Add intentional navigation or redirects. |

## Remediation Backlog

1. Fix canonical worker skill scope to `Employee`, then re-run reset, seed, verification, and full-flow checks.
2. Add evaluated-line matrix to Work Order Detail.
3. Preserve at least three canonical UAT WOs: primary READY, fallback READY, and RESOURCE_HOLD.
4. Redirect `/console/mes/skills` to the modern skill management route.
5. Add selected line and line-selection status columns to Work Order List.
6. Add worker skill assignment and end-assignment actions to Worker Skills detail, or formally move all assignment ownership to Employee modal.
7. Add production version line eligibility/readiness summary.
8. Add navigation cleanup for production areas, equipment/machines, and legacy console aliases.

## Required Follow-Up Verification

After remediation, pass criteria should include:

| Check | Expected |
| --- | --- |
| `/work-orders/ad71bae7-0252-46db-a1f0-e9e0fad3c468` | Shows line selection status and hold reason, or is rebuilt as a READY UAT record. |
| Primary-line UAT WO | Shows selected primary line, evaluated line results, resource candidates, approval, and start execution. |
| Fallback-line UAT WO | Shows selected backup line and explicit fallback reason. |
| Worker skills tab | Lists Employee-scoped skills and shows assignment actions or documented read-only behavior. |
| Employee modal | Shows Employee-scoped worker skills and persists assignments without scope mismatch. |
| Canonical verification | Seed and full-flow artifacts pass after scope correction. |
