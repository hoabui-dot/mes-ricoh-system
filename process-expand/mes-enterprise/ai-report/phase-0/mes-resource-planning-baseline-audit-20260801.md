# MES Resource Planning Baseline Audit

Date: 2026-08-01
Phase: 0 - Documentation and baseline freeze
Status: IMPLEMENTED_NOT_FULLY_VERIFIED

## Scope and Rule Compliance

This report documents the current MES Resource Planning baseline only. No source code, migrations, seed data, or runtime data were modified for Phase 0.

Source precedence followed:

1. Running source code.
2. Database migrations and schema.
3. Service manifests.
4. Docker Compose and runtime configuration.
5. Automated/API/browser tests.
6. Current implementation docs and AI context.
7. Product documents.

## Sources Inspected

| Area | Evidence |
|---|---|
| Canonical context | `AI_CONTEXT.md`, `UI_AI_CONTEXT.md`, `AI_document/` |
| Phase rules | `process-expand/mes-enterprise/docs/23_PHASE_IMPLEMENTATION_GUARDRAILS.md` |
| Product docs | `product-doc/product-doc.md`, numbered product catalogs, MES ERD |
| Execution routes | `services/mes-execution-service/internal/infrastructure/http/router.go` |
| Execution resource planning | `services/mes-execution-service/internal/application/usecase/resource_allocation.go` |
| Execution migrations | `services/mes-execution-service/migrations/000010_resource_allocations.up.sql`, `000011_machine_group_allocations.up.sql`, `000019_resource_allocation_advisory_approval.up.sql`, `000014_routing_planning_resolution.up.sql`, `000020_routing_operation_timing_snapshot.up.sql` |
| Master-data readiness | `services/mes-master-data-service/src/infrastructure/http/master-data.router.ts` |
| MES Console | `services/mes-console/src/routes/work-orders/WOCreateScreen.tsx`, `services/mes-console/src/routes/work-orders/WODetailScreen.tsx`, `services/mes-console/src/i18n.ts` |
| Service manifests | `services/mes-execution-service/service.manifest.yaml`, `services/mes-master-data-service/service.manifest.yaml` |
| API verification | `scripts/test-mes-resource-planning-flow.mjs` |
| Browser E2E | `e2e/resource-planning/resource-planning-flow.spec.ts`, concurrency and numbering specs |
| Test docs | `docs/testing/mes-resource-planning-e2e-matrix.md`, `docs/testing/browser-e2e-coverage-matrix.md` |
| Seed/reset | `scripts/seed-mes-wo-complete-dataset.mjs`, `scripts/reset-won-seal-tech-machines.mjs`, `scripts/cleanup-mes-resource-planning-e2e.mjs` |

## Current Factory and Resource Hierarchy

Classification: IMPLEMENTED_NOT_FULLY_VERIFIED

Current model:

```text
Site
  -> Shopfloor / Production Area
    -> Work Center
      -> Workstation
        -> Workstation Machine Group
        -> Machine Requirements
        -> Resource Assignments
Equipment / Machine Definition
  -> Machine Unit
Work Order Operation
  -> Work Order Resource Allocation
  -> Capacity Reservation
```

Evidence:

- `AI_document/01_BUSINESS_DOMAIN.md`
- `services/mes-master-data-service/src/infrastructure/http/master-data.router.ts`
- `services/mes-execution-service/migrations/000010_resource_allocations.up.sql`
- `services/mes-execution-service/migrations/000011_machine_group_allocations.up.sql`

Notes:

- Routing Operation owns Work Center.
- Workstation is a candidate execution point.
- Machine Definition and Physical Machine Unit are separate.
- Resource Assignment is master data; Work Order Resource Allocation is runtime commitment.

## Routing Operation to Work Center

Classification: IMPLEMENTED_NOT_FULLY_VERIFIED

Current behavior:

- `wo_operation.work_center_id` is created from routing-operation read model during Work Order creation.
- `wo_operation.routing_operation_id` links the WO operation back to routing operation identity.
- Readiness request uses `routing_operation_id` and `work_center_id`.

Evidence:

- `services/mes-execution-service/internal/application/usecase/create_work_order.go`
- `services/mes-execution-service/internal/application/usecase/resource_allocation.go`
- `services/mes-master-data-service/src/infrastructure/http/master-data.router.ts`

## Workstation Candidate Resolution

Classification: IMPLEMENTED_NOT_FULLY_VERIFIED

Current behavior:

- MES Execution calls MES Master Data `POST /api/mes/master-data/resource-planning/readiness`.
- Master Data validates requested site, product revision, routing operation, Work Center, planned date, shift, and quantity.
- Candidate list is built from effective `md_resource_assignment` rows and released/effective `md_workstation_machine_group` rows.
- Candidates are sorted by readiness, capability priority, speed factor, and deterministic code fallback.
- Execution adds capacity-conflict checks against `wo_capacity_reservation`.

Evidence:

- `resource_allocation.go` `Candidates`
- `master-data.router.ts` `/resource-planning/readiness`

## Machine Requirement and Resource Assignment Ownership

Classification: IMPLEMENTED_NOT_FULLY_VERIFIED

Current behavior:

- `md_workstation_machine_requirement` describes required machine demand for machine groups.
- `md_resource_assignment` describes effective master-data assignment.
- Requirements are checked against assigned group members.
- Optional supporting requirement gaps are warnings; required/primary gaps block.

Evidence:

- `master-data.router.ts` machine group and readiness logic.
- `AI_CONTEXT.md` resource model invariants.

## Machine Unit Availability and Planning Eligibility

Classification: IMPLEMENTED_NOT_FULLY_VERIFIED

Current behavior:

- Candidate readiness counts available units only when `mu.active_flag = TRUE`, `mu.execution_status = 'Available'`, `mu.physical_identity_status = 'Identified'`, and `mu.planning_resource_flag = TRUE`.
- Pending/unidentified/non-planning units do not count as available machine units.
- Group candidate logic uses member `machine_unit_id` and `unit_execution_status`.

Evidence:

- `master-data.router.ts` assignment query and group-member checks.

Gap:

- Browser coverage for every state mutation variant is documented as partial.

## Resource Calendar and Shift Checks

Classification: IMPLEMENTED_NOT_FULLY_VERIFIED

Current behavior:

- Readiness request requires `shift_id`.
- Master Data verifies the shift belongs to the requested site.
- Candidate calendar lookup checks Equipment, Workstation, then Work Center calendar rows for planned date and shift.
- Missing/unavailable/holiday/planned-down calendars block.

Evidence:

- `master-data.router.ts` `/resource-planning/readiness`
- `resource_allocation.go` `Candidates` returns `SHIFT_REQUIRED` when no shift is available.

## Production Standard Checks

Classification: IMPLEMENTED_NOT_FULLY_VERIFIED

Current behavior:

- Readiness selects a released/effective `md_production_standard` for site, item revision, Work Center, routing operation or operation, and optional equipment.
- Equipment-specific standards are preferred over Work Center fallback.
- Missing standards block candidates.
- Estimated duration is calculated from setup, quantity, base quantity, cycle time, capability speed, standard efficiency, equipment efficiency, calendar capacity, queue, and move time.

Evidence:

- `master-data.router.ts` production-standard readiness query.

## Capacity Reservation Behavior

Classification: IMPLEMENTED_NOT_FULLY_VERIFIED

Current behavior:

- Execution owns `wo_capacity_reservation`.
- Candidate preview checks existing reservations for Equipment and Workstation.
- Allocation commit checks Equipment, Workstation, Work Center, and required Machine Unit overlap.
- Overlap conflict returns `RESOURCE_CAPACITY_CONFLICT`.

Evidence:

- `resource_allocation.go` `addCapacityView` and `Allocate`
- `000010_resource_allocations.up.sql`
- `000011_machine_group_allocations.up.sql`

## Resource Allocation Transaction Boundaries

Classification: IMPLEMENTED_NOT_FULLY_VERIFIED

Current behavior:

- Allocation commit uses a serializable transaction.
- It obtains `pg_advisory_xact_lock`.
- It checks WO lifecycle, locks old allocation if present, checks conflicts, supersedes old allocation, cancels old reservations, inserts new allocation/reservations/audit/outbox/idempotency response, and commits.

Evidence:

- `resource_allocation.go` `Allocate`.

## Reallocation and Cancellation

Classification: PARTIALLY_IMPLEMENTED

Reallocation:

- Uses the same `Allocate` path with `reallocate=true`.
- Requires `change_reason`.
- Supersedes previous allocation and cancels prior reservations.
- Writes `MES.Execution.WOResourceReallocated.v1`.

Cancellation:

- `DELETE /work-orders/{id}/operations/{opId}/resource-allocation` sets allocations to `Cancelled` and cancels active reservations.
- Allowed only while Work Order status is `Draft` or `PendingApproval`.
- Cancellation does not write allocation audit in the current router path.

Evidence:

- `router.go` `handleDeleteResourceAllocation`
- `resource_allocation.go` `Allocate`

Gap:

- Cancellation audit preservation is not proven by source in the delete path.

## Idempotency Behavior

Classification: IMPLEMENTED_NOT_FULLY_VERIFIED

Current behavior:

- Allocation idempotency stores `(user_id, idempotency_key)` plus request hash and response payload.
- Replay with the same hash returns prior response.
- Reusing the same key with a different hash returns `IDEMPOTENCY_KEY_CONFLICT`.
- Work Order creation workflow also uses idempotency key and request hash.

Evidence:

- `resource_allocation.go`
- `services/mes-execution-service/internal/infrastructure/http/creation_workflow.go`
- `000010_resource_allocations.up.sql`

## Approval Revalidation

Classification: IMPLEMENTED_NOT_FULLY_VERIFIED

Current behavior:

- Approval route calls `allocationService.Revalidate`.
- If invalid, approval returns `WO_RESOURCE_ALLOCATION_INVALID`.
- Demo print-on-approval mode can bypass strict allocation/material behavior and create demo allocations.

Evidence:

- `router.go` `handleApproveWO`
- `approve_work_order.go`

Demo-only:

- `MES_DEMO_PRINT_ON_APPROVAL` path is `DEMO_ONLY`, not strict production behavior.

## Execution Start Guards

Classification: PARTIALLY_IMPLEMENTED

Current behavior:

- Execution start endpoint exists: `POST /api/mes/execution/work-orders/{id}/start-execution`.
- Operation start endpoint exists: `POST /work-orders/{id}/operations/{opId}/start`.

Gap:

- Phase 0 inspection did not prove full negative coverage for execution start without valid allocation.
- Browser coverage matrix lists execution as 0 percent.

Evidence:

- `router.go`
- `docs/testing/browser-e2e-coverage-matrix.md`

## Existing Database Table Owner Map

Classification: IMPLEMENTED_NOT_FULLY_VERIFIED

Resource Planning relevant tables discovered in current source and migrations:

| Table | Owner | Resource Planning role | Evidence |
|---|---|---|---|
| `wo_header` | MES Execution | Work Order lifecycle and planning snapshot authority. | `000001_initial_execution_schema.up.sql`, `create_work_order.go` |
| `wo_operation` | MES Execution | Work Order operation snapshot, Work Center snapshot, Routing Operation link, operation execution state. | `000001_initial_execution_schema.up.sql`, `000010_resource_allocations.up.sql`, `000013_harmonize_work_order_planning_snapshot.up.sql`, `000020_routing_operation_timing_snapshot.up.sql` |
| `wo_material_requirement` | MES Execution | Work Order material snapshot and WMS stock-check/staging state. | `000001_initial_execution_schema.up.sql`, `000005_wms_stock_check_status.up.sql`, `000022_mbom_snapshot_line_traceability.up.sql` |
| `wo_resource_allocation` | MES Execution | Runtime resource commitment for a Work Order Operation. | `000010_resource_allocations.up.sql`, `000011_machine_group_allocations.up.sql` |
| `wo_capacity_reservation` | MES Execution | Runtime capacity conflict prevention for Work Center, Workstation, Equipment, and Machine Unit. | `000010_resource_allocations.up.sql`, `000011_machine_group_allocations.up.sql` |
| `wo_resource_allocation_audit` | MES Execution | Allocation audit trail for commit/reallocation path. | `000010_resource_allocations.up.sql`, `resource_allocation.go` |
| `wo_resource_allocation_idempotency` | MES Execution | Allocation mutation idempotency response store. | `000010_resource_allocations.up.sql`, `resource_allocation.go` |
| `wo_creation_workflow` | MES Execution | Asynchronous Work Order creation workflow state. | `000006_work_order_creation_workflows.up.sql`, `creation_workflow.go` |
| `wo_creation_workflow_event` | MES Execution | Creation workflow progress events for API/WebSocket snapshots. | `000006_work_order_creation_workflows.up.sql`, `creation_workflow.go` |
| `wo_numbering_daily` | MES Execution | Daily Work Order number uniqueness. | `000007_work_order_numbering_daily.up.sql` |
| `wo_approval_log` | MES Execution | Approval decisions and resource-allocation advisory status/warnings. | `000001_initial_execution_schema.up.sql`, `000019_resource_allocation_advisory_approval.up.sql` |
| `outbox_events` | MES Execution | MES Execution domain event outbox. | `000001_initial_execution_schema.up.sql`, `resource_allocation.go`, `create_work_order.go`, `approve_work_order.go` |
| `wo_print_job`, `wo_print_job_attempt`, `wo_print_job_event` | MES Execution | Execution dispatch/print integration state; adjacent to approval/execution readiness, not Resource Planning authority. | `000015_demo_execution_dispatch_print_jobs.up.sql` |
| `md_site`, `md_shopfloor`, `md_production_area` | MES Master Data | Factory hierarchy context. | `schema.ts`, `migrate.ts` |
| `md_work_center` | MES Master Data | Logical capability/capacity owner referenced by Routing Operation and candidates. | `schema.ts`, `migrate.ts`, `master-data.router.ts` |
| `md_workstation` | MES Master Data | Candidate execution point under Work Center. | `schema.ts`, `master-data.router.ts` |
| `md_equipment` | MES Master Data | Machine definition authority. | `schema.ts`, `master-data.router.ts` |
| `md_machine_unit` | MES Master Data | Physical Machine Unit identity, status, and planning eligibility. | `schema.ts`, `master-data.router.ts` |
| `md_workstation_machine_group` | MES Master Data | Workstation machine group definition for grouped resource candidates. | `schema.ts`, `master-data.router.ts` |
| `md_workstation_machine_requirement` | MES Master Data | Machine demand rules for machine groups. | `schema.ts`, `master-data.router.ts` |
| `md_resource_assignment` | MES Master Data | Effective-dated assignment of resource availability. | `schema.ts`, `master-data.router.ts` |
| `md_resource_capability` | MES Master Data | Resource-operation/product capability eligibility and priority. | `schema.ts`, `master-data.router.ts` |
| `md_resource_calendar` | MES Master Data | Date/shift resource availability and capacity. | `schema.ts`, `master-data.router.ts` |
| `md_shift` | MES Master Data | Site-owned shift used by readiness and allocation. | `schema.ts`, `master-data.router.ts` |
| `md_production_standard` | MES Master Data | Released/effective setup, cycle, labor, and efficiency standard for duration calculation. | `schema.ts`, `master-data.router.ts` |
| `md_item`, `md_item_revision`, `md_mbom_header`, `md_mbom_line`, `md_routing_header`, `md_routing_operation`, `md_production_version`, `md_operation` | MES Master Data | Product definition inputs used to create Work Order snapshots and validate readiness context. | `schema.ts`, `migrate.ts`, `master-data.router.ts` |
| `md_skill`, `md_employee`, `md_employee_skill`, `md_employee_shift_schedule`, `md_operation_skill_requirement` | MES Master Data | Labor/skill readiness inputs. | `schema.ts`, `master-data.router.ts` |
| `outbox_events` | MES Master Data | MES Master Data domain event outbox. | `schema.ts`, `master-data.router.ts` |

No WMS service database tables were mapped from running source because this checkout has no `services/wms-*` source directory. WMS behavior remains external/contextual for Phase 0.

## Existing Kafka and Outbox Event Map

Classification: IMPLEMENTED_NOT_FULLY_VERIFIED

Current events relevant to Work Order and Resource Planning:

| Event or topic | Producer/consumer | Current role | Evidence |
|---|---|---|---|
| `MES.Execution.WOCreated.v1` | MES Execution producer | Work Order created event written to execution outbox. | `create_work_order.go`, `creation_workflow.go` |
| `MES.Execution.WOApproved.v1` | MES Execution producer | Approval event written to execution outbox. | `approve_work_order.go` |
| `MES.Execution.WOResourceAllocated.v1` | MES Execution producer | Allocation commit fact written to execution outbox. | `resource_allocation.go` |
| `MES.Execution.WOResourceReallocated.v1` | MES Execution producer | Reallocation fact written to execution outbox. | `resource_allocation.go` |
| `MES.MasterData.ResourceAssignmentCreated.v1` | MES Master Data producer | Resource Assignment creation fact written to master-data outbox. | `master-data.router.ts` |
| `MES.MasterData.ResourceAssignmentEnded.v1` | MES Master Data producer | Resource Assignment end/move fact written to master-data outbox. | `master-data.router.ts` |
| `WMS.Outbound.MaterialShortageDeclared.v1` | MES Execution consumer | Applies WMS material shortage result to execution state. | `wms_material_result_consumer.go` |
| `wo_creation_workflow_event` event types | MES Execution internal workflow | API/WebSocket creation progress, including `workflow.started`, `step.succeeded`, `step.event_queued`, and `workflow.succeeded`. | `creation_workflow.go` |

No two-line line-selection event is implemented in Phase 0 baseline.

## MES Console Resource Planning Surfaces

Classification: IMPLEMENTED_NOT_FULLY_VERIFIED

Current behavior:

- Work Order creation screen starts `POST /api/mes/execution/work-order-creation-workflows`, reads workflow snapshots, and opens the creation WebSocket.
- Work Order detail screen reads resource candidates and commits resource allocation through MES Execution APIs.
- Console localization contains Resource Planning language for Work Center and resource foundation concepts.
- The browser remains advisory; backend APIs own readiness, allocation, and validation.

Evidence:

- `services/mes-console/src/routes/work-orders/WOCreateScreen.tsx`
- `services/mes-console/src/routes/work-orders/WODetailScreen.tsx`
- `services/mes-console/src/i18n.ts`

## Demo-Only Paths

Classification: DEMO_ONLY

- `MES_DEMO_PRINT_ON_APPROVAL` can auto-prepare demo resource allocations and print jobs.
- Won Seal Tech seed fixtures use deterministic disposable namespaces.
- Offline print-station allowances are not physical print proof.

Evidence:

- `approve_work_order.go`
- `AI_CONTEXT.md`
- `scripts/reset-won-seal-tech-machines.mjs`
- `scripts/seed-mes-wo-complete-dataset.mjs`

## Deprecated or Compatibility Surfaces

Classification: DEPRECATED_COMPATIBILITY

- Legacy Workstation Supported Operations/capability surfaces may remain.
- `stage-materials` remains a compatibility/manual recovery surface, not the desired automatic WMS lifecycle.
- Routing Operation Work Center is current authority; Workstation Supported Operations must not become a second authority.

## Capability Classification Matrix

| Capability | Classification | Reason |
|---|---|---|
| Routing Operation owns Work Center | IMPLEMENTED_NOT_FULLY_VERIFIED | Source snapshots Work Center; browser/source tests are not exhaustive for all edge cases. |
| Candidate Workstations under Work Center | IMPLEMENTED_NOT_FULLY_VERIFIED | Readiness filters assignments by Work Center; cross-site/work-center negative tests incomplete. |
| Machine Requirements | IMPLEMENTED_NOT_FULLY_VERIFIED | Group requirement checks exist; all variants not browser verified. |
| Resource Assignment ownership | IMPLEMENTED_NOT_FULLY_VERIFIED | Master-data source owns assignments and events. |
| Physical Machine Unit planning eligibility | IMPLEMENTED_NOT_FULLY_VERIFIED | Source filters identified/available/planning units; edge coverage partial. |
| Required/primary gaps block | IMPLEMENTED_NOT_FULLY_VERIFIED | Source emits blocking codes. |
| Optional supporting gaps warn | IMPLEMENTED_NOT_FULLY_VERIFIED | Source emits warnings for optional supporting gaps. |
| Candidate APIs advisory | IMPLEMENTED_NOT_FULLY_VERIFIED | Commit revalidates; API docs align. |
| Commit transactional revalidation | IMPLEMENTED_NOT_FULLY_VERIFIED | Serializable transaction and readiness refresh are present. |
| Exclusive reservations | IMPLEMENTED_NOT_FULLY_VERIFIED | Conflict checks and concurrency E2E exist. |
| Reallocation history | PARTIALLY_IMPLEMENTED | Supersede exists; full audit expectations need more tests. |
| Cancellation audit | PARTIALLY_IMPLEMENTED | Cancellation cancels rows; audit write not proven in delete path. |
| Approval revalidation | IMPLEMENTED_NOT_FULLY_VERIFIED | Revalidation call exists; negative cases incomplete. |
| Execution start requires allocation | PARTIALLY_IMPLEMENTED | Gate not fully proven by Phase 0 evidence. |
| Two-line Production Line selection | NOT_IMPLEMENTED | No production-line model implemented yet. |
| RESOURCE_HOLD for no complete line | NOT_IMPLEMENTED | Future two-line phase. |

## Phase 0 Gate Result

Result: PASS_FOR_BASELINE_DOCUMENTATION.

| Gate criterion | Result | Evidence |
|---|---|---|
| Every current Resource Planning API is mapped. | PASS | `mes-resource-planning-api-inventory-20260801.md` maps MES Execution and MES Master Data Resource Planning APIs with owner, purpose, and classification. |
| Every relevant database table is mapped to its owner. | PASS | This report includes the explicit database table owner map for MES Execution and MES Master Data tables relevant to Resource Planning. |
| Every current test is listed. | PASS | `mes-resource-planning-test-coverage-matrix-20260801.md` lists API script, browser E2E files, package commands, documented latest results, and skipped coverage. |
| All known gaps have a classification. | PASS | Capability matrix, API inventory, and test coverage matrix classify known gaps using Phase 0 status vocabulary. |
| No unverified assumption is described as current behavior. | PASS | Unknown/partial areas are marked as `PARTIALLY_IMPLEMENTED`, `NOT_IMPLEMENTED`, `DEMO_ONLY`, `DEPRECATED_COMPATIBILITY`, or `UNKNOWN_REQUIRES_SOURCE_CONFIRMATION`. |

The current Resource Planning baseline is mapped with source-backed classifications. Phase 1 may proceed only to verify/harden the current one-line/current-resource model; two-line implementation remains forbidden until later phases.
