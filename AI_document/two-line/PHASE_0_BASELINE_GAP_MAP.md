# Phase 0 Baseline and Gap Map

Date: 2026-08-07

## Scope and source of truth

This baseline compares `WO-2-LINE.md` with the currently executable MES Master Data, MES Execution, MES Console, migrations, tests, and seed/UAT tooling. It describes the source as found and makes no production-code changes.

## Current architecture from source

### Master Data ownership

- Production Lines are stored in `md_production_line`; line-to-Work-Center membership is stored in `md_production_line_work_center`; exact resource scope is represented by `md_production_line_resource_scope`; Production Version eligibility is stored in `md_production_version_line_eligibility` (`services/mes-master-data-service/src/infrastructure/db/schema.ts`).
- Production Line CRUD exists at `GET/POST /production-lines`, `GET/PUT/DELETE /production-lines/:id` (`master-data.router.ts:942-1052`).
- Work Center membership is readable and replaceable through `GET/PUT /production-lines/:id/work-centers` (`master-data.router.ts:1055-1088`). The PUT operation expires prior active rows and inserts the submitted effective membership in one transaction, then writes an outbox event.
- Production Version eligibility is readable and replaceable through `GET/PUT /production-versions/:id/line-eligibility` (`master-data.router.ts:1093-1130`).
- `md_production_line_resource_scope` is currently referenced by delete dependency checks and readiness projection, but no dedicated read/write HTTP route exists. It is populated by seed scripts/direct database setup only.

### Read-model boundary

- MES Execution owns replicated `rm_production_line`, `rm_production_line_work_center`, and `rm_production_version_line_eligibility`, added by migration `000023_production_line_selection.up.sql:6-48`.
- Master-data events populate Execution read models through the existing consumer; MES Execution does not read the Master Data database directly.
- The current Execution migration has no replicated `rm_production_line_resource_scope`. Exact candidates are obtained through the resource-planning service contract instead of a cross-database query.

### Work Order line decision

- `CreateWorkOrder` derives product/site from the Production Version, snapshots Routing operations, calls `evaluateProductionLineSelection`, and persists the decision before creating operations (`create_work_order.go:242-389`).
- Eligible lines are ordered Primary first, then Backup priority (`line_selection.go:177-190`).
- For every Routing operation, a line must have one released/effective Work Center with operation capability, production standard, calendar coverage, positive capacity, and no overlapping coarse Work Center reservation (`line_selection.go:256-365`).
- Selection is side-effect-free: it reads readiness evidence and does not create allocations or reservations.
- The first complete line is selected. If Primary is blocked, Backup is evaluated. If none is complete, the Work Order is persisted as `ResourceHold` with `resource_hold_reason` and `evaluated_line_results` (`line_selection.go:210-253`, `create_work_order.go:295-330`).
- The selected line is snapshotted on `wo_header` and every `wo_operation`; an audit row is written to `wo_line_selection_audit` (`create_work_order.go:311-389`).

### Whole-WO enforcement and resource planning

- Migration `000023` adds line snapshots to headers, operations, allocations, and reservations and installs database triggers rejecting mixed operation/allocation/reservation lines (`000023_production_line_selection.up.sql:50-139`).
- `requireSelectedLineConsistency` rejects Resource Hold, missing selected line, and mixed operation/allocation/reservation state (`line_selection.go:374-407`).
- Candidate planning is blocked for Resource Hold or missing selected line. Proposals reject operations whose line differs from the WO and annotate candidates as selected-line only (`resource_allocation.go:104-173`, `resource_allocation.go:176-315`).
- Allocation validates the selected-line context and invokes the consistency guard before commit (`resource_allocation.go:381-546`). Revalidation invokes the same guard (`resource_allocation.go:571+`).
- Approval uses committed allocations and line consistency guards; operation start calls `requireSelectedLineConsistency` before creating an execution session (`approve_work_order.go`, `start_operation.go:39-47`). There is no silent line switch in start/execute paths.
- Explicit replan is supported before execution through `ReplanWorkOrderLine`; it reevaluates the complete line, audits the decision, updates operation line snapshots, and supersedes prior planning. In-progress transfer is not silently performed (`line_selection.go:428+`).

### Readiness policy currently encoded

Blocking during line selection:

- Production Version eligibility and effectivity.
- Line and Work Center released/active/effective state.
- Work Center coverage for every Routing operation.
- Operation capability.
- Production standard.
- Calendar/shift time-window availability.
- Coarse Work Center capacity/reservation conflict.

Explicitly deferred to exact resource allocation:

- Workstation readiness.
- Machine requirements.
- Equipment/machine-unit readiness.
- Resource assignment readiness.
- Worker skill/labor.

The deferred dimensions are persisted as `DEFERRED` in line diagnostics (`line_selection.go:140-147`). Labor is therefore not currently a blocking line-selection dimension.

### MES Console state

- `/master-data/production-lines` uses `ResourceFoundationScreen`; it supports line create/edit/release, list/detail, and displays Work Center membership (`ResourceFoundationScreen.tsx:19-340`, `:465-581`).
- The detail view displays line membership but does not provide a complete editable Work Center/resource-scope workspace.
- Production Version create/edit has line eligibility rows with line, primary marker, priority, efficiency, and selection mode (`ProductionVersionCrudScreen.tsx`).
- Work Order list/detail displays persisted selected line, selection mode/status, fallback reason, evaluated dimensions, candidate diagnostics, resource planning, replan, and line lock. The browser renders backend diagnostics rather than recomputing feasibility (`WOListScreen.tsx`, `WODetailScreen.tsx`).

### Existing verification assets

- Unit tests: `line_selection_dimension_test.go`, `resource_allocation_test.go`, HTTP dimension tests, approval/start integration coverage.
- Data/API UAT: `scripts/mes-two-line-uat-fixtures.mjs`, `scripts/test-mes-two-line-master-data-phase6.mjs`, `scripts/test-mes-two-line-resource-planning-phase7.mjs`.
- Browser UAT: `phase2-two-line-uat-fixtures.spec.ts`, `phase6-production-lines.spec.ts`, `phase8-two-line-console.spec.ts`.
- Canonical reset/seed scripts already create two lines, memberships, resource scopes, eligibility, capabilities, calendars, standards, and two-line evidence.

## Answers required by Phase 0

1. A Production Line is created through `POST /production-lines`; the API validates hierarchy and inserts `md_production_line`.
2. Work Centers are attached/detached by replacing effective membership through `PUT /production-lines/:id/work-centers`; old active rows are expired rather than deleted.
3. Line resource scope exists in schema but has no dedicated writable HTTP API.
4. `md_resource_assignment` links Work Center, optional Workstation, Equipment, and Machine Unit with role/type, effectivity, lifecycle, and active state. Resource scope points to the assignment plus denormalized resource IDs.
5. Current line selection checks eligibility, Work Center coverage, capability, production standard, calendar/shift window, and coarse capacity/reservation conflict.
6. Workstation, machine requirement, equipment unit, assignment, and labor/skill checks are deferred to resource planning.
7. Exact-resource failure does not automatically reevaluate Backup in the normal proposal/commit path. Backup fallback occurs during create/replan coarse line evaluation only. This is the main behavioral gap against the hardened target.
8. Work Order enters `ResourceHold` when no released/effective eligibility exists or no complete line passes the current coarse dimensions. Exact-resource proposal failure leaves planning incomplete but does not currently transition/reselect the WO line.
9. The selected line is persisted on `wo_header`, snapshotted on every `wo_operation`, allocations, reservations, planning snapshots, events, and `wo_line_selection_audit`.
10. UI gaps: writable exact resource scope, complete line configuration workspace/readiness preview, and clearer distinction between coarse line readiness and exact-resource feasibility/fallback.
11. Existing tests encode workstation/machine/assignment/labor as deferred and generally test fallback through coarse calendar/capability mutation. They must be extended so an exact-resource failure on Primary can drive Backup selection before execution lock without allowing per-operation line mixing.

## Gap matrix

| Priority | Intended behavior | Current behavior | No-code-change recommendation for implementation phase |
| --- | --- | --- | --- |
| P0 | A line is feasible only if every mandatory operation has at least one feasible execution candidate | Selection proves only a feasible Work Center; exact workstation/machine/assignment failure happens later | Define one backend-owned readiness policy and candidate evidence contract before changing selection |
| P0 | Primary exact-resource failure automatically evaluates Backup before execution | Normal proposal failure keeps Primary selected and returns incomplete planning | Add a pre-execution whole-WO reevaluation path; never switch individual operations |
| P0 | Commit/approve/start cannot use non-selected or degraded resources | Line consistency is guarded; degradation revalidation exists but full canonical evidence is incomplete | Preserve guards and add explicit regression scenarios at proposal, commit, approval, and start |
| P1 | Resource scope is maintainable via service API | Table exists but no dedicated route | Reuse `md_production_line_resource_scope`; add transactional list/replace API and outbox event |
| P1 | Operators configure membership and exact scope in one line workspace | Console mainly displays membership and lacks scope editing | Extend existing Production Line detail; do not introduce a parallel line page |
| P1 | Diagnostics state which operation and resource dimension blocked each line | Coarse blockers are persisted; deferred exact failures are separate candidate errors | Normalize reason codes and persist candidate-derived line diagnostics during pre-execution reevaluation |
| P1 | Release gate prevents structurally incomplete lines | Release action exists, but no single authoritative readiness response covers membership plus scope | Add backend readiness endpoint/gate and make UI consume it |
| P2 | Canonical seed proves redundant candidate behavior | Existing fixtures prove coarse fallback and selected-line restriction | Add multiple same-line candidates and mutate one vs all candidates deterministically |
| P2 | UI does not expose raw IDs or duplicate readiness logic | Existing screens mostly use code/name and backend reason keys | Retain shared localization/components and add missing reason-key coverage only |

## Candidate reuse opportunities

- Reuse `evaluateProductionLineSelection`, `buildLineEvaluation`, `requireSelectedLineConsistency`, and `ReplanWorkOrderLine` rather than creating a second selector.
- Reuse the resource planner `Readiness` response and AllocationService candidate ordering for exact candidate evidence.
- Reuse effective-dated replace semantics and outbox patterns from line Work Center and PV eligibility PUT endpoints.
- Reuse `md_production_line_resource_scope`; do not create another line-resource join table.
- Extend `ResourceFoundationScreen` and existing Work Order diagnostics components/localization.
- Extend current two-line fixture scripts and Playwright tests instead of creating disconnected seed/test stacks.

## Behaviors that must not change

- One normal Work Order uses exactly one Production Line across all operations.
- Line feasibility evaluation itself creates no reservation or allocation.
- Backend remains authoritative; the MES Console only renders decisions and submits commands.
- Database-per-service isolation, read-model replication, outbox, idempotency, audit, and effectivity patterns remain intact.
- Running Work Orders retain their snapshots and never hot-switch line silently.
- A failed resource is not equivalent to a failed line when another valid same-line candidate exists.
- Resource Hold and fallback diagnostics remain persisted and localized by stable reason code.
- Existing print-station behavior remains outside this reimplementation unless a phase explicitly requires an integration boundary check.

## Phase 0 conclusion

The codebase has a strong whole-WO line lock and coarse Primary/Backup selector. The implementation work must concentrate on an explicit readiness contract, writable resource scope, exact-candidate-aware pre-execution fallback, release/revalidation guards, operator configuration, and deterministic regression evidence. These changes can be made by extending existing boundaries without inventing a new domain model.

