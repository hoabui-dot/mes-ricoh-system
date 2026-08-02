# MES Resource Planning API Inventory

Date: 2026-08-01
Phase: 0
Status: IMPLEMENTED_NOT_FULLY_VERIFIED

## Scope

This inventory maps current Resource Planning and Work Order planning APIs from source. It does not invent two-line APIs.

## MES Execution APIs

Source: `services/mes-execution-service/internal/infrastructure/http/router.go`.

| Method | Path | Classification | Owner | Purpose | Notes |
|---|---|---|---|---|---|
| POST | `/api/mes/execution/work-order-creation-workflows` | IMPLEMENTED_NOT_FULLY_VERIFIED | MES Execution | Start async WO creation workflow | Uses idempotency key and workflow status. |
| GET | `/api/mes/execution/work-order-code-preview` | IMPLEMENTED_NOT_FULLY_VERIFIED | MES Execution | Preview WO code | Preview is not authoritative. |
| GET | `/api/mes/execution/work-order-creation-workflows/{id}` | IMPLEMENTED_NOT_FULLY_VERIFIED | MES Execution | Get workflow snapshot | Used by API/browser tests. |
| GET | `/api/mes/execution/ws/work-order-creation` | IMPLEMENTED_NOT_FULLY_VERIFIED | MES Execution | WebSocket creation progress | UI progress channel. |
| POST | `/api/mes/execution/work-orders` | IMPLEMENTED_NOT_FULLY_VERIFIED | MES Execution | Create Draft WO synchronously | Existing compatibility/direct route. |
| GET | `/api/mes/execution/work-orders` | IMPLEMENTED_NOT_FULLY_VERIFIED | MES Execution | List Work Orders | Filtering not exhaustively mapped in Phase 0. |
| GET | `/api/mes/execution/work-orders/{id}` | IMPLEMENTED_NOT_FULLY_VERIFIED | MES Execution | WO detail with operations/materials/allocations | Includes resource allocation summary per operation. |
| POST | `/api/mes/execution/work-orders/{id}/compute-check` | IMPLEMENTED_NOT_FULLY_VERIFIED | MES Execution | Compute and Check | Current compute is not a full finite scheduler. |
| POST | `/api/mes/execution/work-orders/{id}/approve` | IMPLEMENTED_NOT_FULLY_VERIFIED | MES Execution | Approve/release WO | Calls allocation revalidation; demo path can bypass. |
| POST | `/api/mes/execution/work-orders/{id}/reject` | IMPLEMENTED_NOT_FULLY_VERIFIED | MES Execution | Reject WO | Existing lifecycle path. |
| POST | `/api/mes/execution/work-orders/{id}/start-execution` | PARTIALLY_IMPLEMENTED | MES Execution | Start WO execution | Negative allocation guards need Phase 1 proof. |
| POST | `/api/mes/execution/work-orders/{id}/stage-materials` | DEPRECATED_COMPATIBILITY | MES Execution | Retryable WMS staging request | Manual/recovery surface, not final automatic lifecycle. |
| GET | `/api/mes/execution/work-orders/{id}/operations/{opId}/resource-candidates` | IMPLEMENTED_NOT_FULLY_VERIFIED | MES Execution | Advisory candidates with execution-owned capacity view | Delegates readiness to Master Data; adds capacity conflicts. |
| POST | `/api/mes/execution/work-orders/{id}/operations/{opId}/resource-allocation` | IMPLEMENTED_NOT_FULLY_VERIFIED | MES Execution | Commit allocation | Revalidates, serializable tx, reservations, audit/outbox/idempotency. |
| POST | `/api/mes/execution/work-orders/{id}/operations/{opId}/reallocate` | PARTIALLY_IMPLEMENTED | MES Execution | Supersede allocation | Requires change reason; coverage incomplete. |
| DELETE | `/api/mes/execution/work-orders/{id}/operations/{opId}/resource-allocation` | PARTIALLY_IMPLEMENTED | MES Execution | Cancel allocation before lifecycle lock | Cancels allocation/reservation; audit write not proven. |
| POST | `/api/mes/execution/work-orders/{id}/resource-allocations/revalidate` | IMPLEMENTED_NOT_FULLY_VERIFIED | MES Execution | Revalidate committed allocations | Marks stale allocations. |
| POST | `/api/mes/execution/work-orders/{id}/operations/{opId}/start` | PARTIALLY_IMPLEMENTED | MES Execution | Start operation | Guard coverage incomplete. |
| POST | `/api/mes/execution/work-orders/{id}/operations/{opId}/confirm` | IMPLEMENTED_NOT_FULLY_VERIFIED | MES Execution | Confirm operation | Traceability dependency where labels/genealogy apply. |
| POST | `/api/mes/execution/work-orders/{id}/operations/{opId}/abort` | IMPLEMENTED_NOT_FULLY_VERIFIED | MES Execution | Abort session | Current route exists. |
| GET | `/api/mes/execution/work-orders/{id}/operations/{opId}/consumption` | IMPLEMENTED_NOT_FULLY_VERIFIED | MES Execution | List material consumption | Current route exists. |
| POST | `/api/mes/execution/work-orders/{id}/operations/{opId}/print-retry` | IMPLEMENTED_NOT_FULLY_VERIFIED | MES Execution | Retry operation print | Runtime printer proof is environment-dependent. |

## MES Master Data Resource Planning APIs

Source: `services/mes-master-data-service/src/infrastructure/http/master-data.router.ts`.

| Method | Path | Classification | Owner | Purpose | Notes |
|---|---|---|---|---|---|
| POST | `/api/mes/master-data/resource-planning/readiness` | IMPLEMENTED_NOT_FULLY_VERIFIED | MES Master Data | Evaluate candidates without allocating | Validates routing context, shift, assignments, capabilities, calendars, standards, machine requirements, worker readiness. |
| GET | `/api/mes/master-data/resource-assignments` | IMPLEMENTED_NOT_FULLY_VERIFIED | MES Master Data | List assignments | Effective-dated assignment inventory. |
| POST | `/api/mes/master-data/resource-assignments` | IMPLEMENTED_NOT_FULLY_VERIFIED | MES Master Data | Create assignment | Publishes assignment event. |
| POST | `/api/mes/master-data/resource-assignments/:id/end` | IMPLEMENTED_NOT_FULLY_VERIFIED | MES Master Data | End assignment | Preserves history via `effective_to`. |
| POST | `/api/mes/master-data/resource-assignments/:id/move` | IMPLEMENTED_NOT_FULLY_VERIFIED | MES Master Data | Move assignment | Ends current and creates replacement. |
| GET | `/api/mes/master-data/workstations/machine-availability` | IMPLEMENTED_NOT_FULLY_VERIFIED | MES Master Data | Machine availability for workstation authoring | Master-data view, not execution capacity authority. |
| GET | `/api/mes/master-data/workstations/:id` | IMPLEMENTED_NOT_FULLY_VERIFIED | MES Master Data | Workstation detail | Includes assignments/readiness contexts. |
| GET | `/api/mes/master-data/workstations/:id/machine-groups` | IMPLEMENTED_NOT_FULLY_VERIFIED | MES Master Data | Workstation machine groups | Compatibility/current authoring. |
| POST | `/api/mes/master-data/workstations/:id/machine-groups` | IMPLEMENTED_NOT_FULLY_VERIFIED | MES Master Data | Create machine group | Current master-data authoring. |
| PUT | `/api/mes/master-data/workstations/:id/machine-groups` | IMPLEMENTED_NOT_FULLY_VERIFIED | MES Master Data | Replace machine groups | Current master-data authoring. |
| POST | `/api/mes/master-data/workstations/:id/machine-groups/:groupId/members` | IMPLEMENTED_NOT_FULLY_VERIFIED | MES Master Data | Add group member | Current master-data authoring. |
| POST | `/api/mes/master-data/workstations/:id/machine-groups/:groupId/members/:memberId/end` | IMPLEMENTED_NOT_FULLY_VERIFIED | MES Master Data | End member assignment | Effectivity-preserving. |
| POST | `/api/mes/master-data/workstations/:id/machine-groups/:groupId/replace-primary` | IMPLEMENTED_NOT_FULLY_VERIFIED | MES Master Data | Replace primary machine | Current master-data authoring. |
| GET | `/api/mes/master-data/workstations/:id/change-impact` | IMPLEMENTED_NOT_FULLY_VERIFIED | MES Master Data | Change impact view | UI support. |
| GET | `/api/mes/master-data/workstations/:id/dependencies` | IMPLEMENTED_NOT_FULLY_VERIFIED | MES Master Data | Dependency view | UI support. |
| GET | `/api/mes/master-data/work-centers/:id/headcount` | IMPLEMENTED_NOT_FULLY_VERIFIED | MES Master Data | Current headcount | Labor readiness support. |

## Generic Master Data APIs Used by Resource Planning

Source: service manifest and `master-data.router.ts`.

| Resource family | API shape | Classification | Resource Planning relevance |
|---|---|---|---|
| Work Centers | generic CRUD/release | IMPLEMENTED_NOT_FULLY_VERIFIED | Routing logical capability. |
| Workstations | generic CRUD/detail | IMPLEMENTED_NOT_FULLY_VERIFIED | Candidate execution points. |
| Equipment/Machines | generic CRUD/detail | IMPLEMENTED_NOT_FULLY_VERIFIED | Machine definitions and units. |
| Resource Capabilities | generic CRUD/release | IMPLEMENTED_NOT_FULLY_VERIFIED | Eligibility and priority. |
| Resource Calendars | generic CRUD/release | IMPLEMENTED_NOT_FULLY_VERIFIED | Availability by date/shift. |
| Production Standards | generic CRUD/release | IMPLEMENTED_NOT_FULLY_VERIFIED | Duration calculation. |
| Shifts | generic CRUD/release | IMPLEMENTED_NOT_FULLY_VERIFIED | Required readiness input. |
| Operation Skill Requirements | generic CRUD/release | IMPLEMENTED_NOT_FULLY_VERIFIED | Worker readiness. |
| Employees and Skills | generic/special APIs | IMPLEMENTED_NOT_FULLY_VERIFIED | Current labor readiness/headcount. |
| Production Versions | generic CRUD, validate, release | IMPLEMENTED_NOT_FULLY_VERIFIED | Work Order creation authority. |

## Authorization and Headers

| Area | Current behavior | Classification |
|---|---|---|
| Allocation mutation roles | `PLANT_MANAGER`, `PROD_MANAGER`, `PLANNER`, `EXECUTIVE` allowed; others get `RESOURCE_ALLOCATION_FORBIDDEN`. | IMPLEMENTED_NOT_FULLY_VERIFIED |
| User/role headers | Services read `X-User-ID`, `X-Role-Code`, `X-Trace-ID`. | IMPLEMENTED_NOT_FULLY_VERIFIED |
| Gateway trust | WMS/QMS bearer enforcement documented; MES legacy route parity is incomplete. | PARTIALLY_IMPLEMENTED |
| Viewer browser coverage | Test exists but is skipped because viewer credentials are not configured. | PARTIALLY_IMPLEMENTED |

## Stable Error Categories Observed

| Code | Source | Meaning |
|---|---|---|
| `SHIFT_REQUIRED` | Execution candidates/allocation | Work Order or request lacks shift. |
| `READINESS_REQUEST_INVALID` | Master Data readiness | Required readiness fields missing/invalid. |
| `ROUTING_OPERATION_NOT_FOUND` | Master Data readiness | No matching routing context. |
| `ROUTING_CONTEXT_INVALID` | Master Data readiness | Site/product/work-center/routing mismatch. |
| `SHIFT_SITE_INVALID` | Master Data readiness | Shift outside requested Site. |
| `NO_EFFECTIVE_ASSIGNMENT` | Master Data readiness | No candidate assignment/group. |
| `NO_EFFECTIVE_CAPABILITY` | Master Data readiness | Missing capability. |
| `CAPABILITY_EXPLICIT_DENY` | Master Data readiness | Capability denies eligibility. |
| `WORKSTATION_INACTIVE` | Master Data readiness | Candidate workstation inactive. |
| `EQUIPMENT_INACTIVE` | Master Data readiness | Equipment inactive/obsolete. |
| `EQUIPMENT_OUT_OF_SERVICE` | Master Data readiness | Equipment execution status out of service. |
| `EQUIPMENT_NOT_AVAILABLE` | Master Data readiness | Equipment not available. |
| `EQUIPMENT_MACHINE_UNIT_UNAVAILABLE` | Master Data readiness | No identified/planning/available units. |
| `EQUIPMENT_NOT_PLANNING_RESOURCE` | Master Data readiness | Machine definition not planning eligible. |
| `CALENDAR_NOT_CONFIGURED` | Master Data readiness | Missing calendar. |
| `CALENDAR_HOLIDAY` | Master Data readiness | Calendar holiday. |
| `RESOURCE_PLANNED_DOWN` | Master Data readiness | Planned down calendar. |
| `CALENDAR_UNAVAILABLE` | Master Data readiness | Calendar unavailable. |
| `NO_EFFECTIVE_PRODUCTION_STANDARD` | Master Data readiness | Missing standard. |
| `INSUFFICIENT_CAPACITY` | Master Data readiness | Required duration exceeds available minutes. |
| `WORKSTATION_MACHINE_REQUIREMENT_UNSATISFIED` | Master Data readiness | No active machine requirement. |
| `WORKSTATION_PRIMARY_MACHINE_MISSING` | Master Data readiness | Primary requirement missing. |
| `WORKSTATION_MACHINE_QUANTITY_INSUFFICIENT` | Master Data readiness | Required quantity not met. |
| `MACHINE_UNIT_UNAVAILABLE` | Master Data readiness | Pinned unit unavailable. |
| `MACHINE_GROUP_NO_PRIMARY` | Master Data readiness | No primary group member. |
| `MACHINE_GROUP_MULTIPLE_PRIMARY` | Master Data readiness | Multiple primary group members. |
| `RESOURCE_CANDIDATE_STALE` | Execution allocation | Candidate not currently valid. |
| `RESOURCE_CAPACITY_CONFLICT` | Execution allocation | Overlapping reservation/serialization conflict. |
| `IDEMPOTENCY_KEY_CONFLICT` | Execution allocation | Same key with different request hash. |
| `WO_ALLOCATION_VERSION_CONFLICT` | Execution allocation | Stale Work Order row version. |
| `CHANGE_REASON_REQUIRED` | Execution reallocation | Reallocation lacks reason. |
| `ALLOCATION_LIFECYCLE_LOCKED` | Execution allocation/cancel | WO state disallows allocation mutation. |
| `RESOURCE_ALLOCATION_FORBIDDEN` | Execution router | Role is not allowed to mutate allocation. |
| `WO_RESOURCE_ALLOCATION_INVALID` | Execution approval | Approval revalidation failed. |

## APIs Not Implemented in Phase 0 Baseline

| API need | Classification | Reason |
|---|---|---|
| Production Line CRUD | NOT_IMPLEMENTED | Reserved for Phase 6. |
| Production Version Line Eligibility | NOT_IMPLEMENTED | Reserved for Phase 6. |
| Production line-readiness endpoint | NOT_IMPLEMENTED | Reserved for Phase 6/7. |
| Work Order line-selection state | NOT_IMPLEMENTED | Reserved for Phase 7. |
| Audited change-line/replan action | NOT_IMPLEMENTED | Reserved for Phase 7/8. |
| RESOURCE_HOLD line result | NOT_IMPLEMENTED | Reserved for Phase 7. |

## Phase 0 API Gate

Result: PASS_FOR_BASELINE_DOCUMENTATION.

Every currently discovered Resource Planning API has been mapped with owner, purpose, and classification. Two-line APIs are explicitly not implemented.
