# Phase 3 Production Line Resource Scope Report

Date: 2026-08-07

## Objective

Make `md_production_line_resource_scope` the authoritative candidate boundary for shared Work Centers and expose it through Master Data APIs.

## Baseline findings

- The resource-scope table and hierarchy trigger existed but had no HTTP API.
- Resource readiness accepted Site, product, Routing Operation, and Work Center, but not Production Line.
- Candidate SQL selected every effective scheduling Resource Assignment in the Work Center, so a shared Work Center could leak Workstations/machines across lines.
- The prior Work Center trigger prohibited sharing one Work Center across lines, which contradicted the required `WC-TEST5` with line-specific Workstations scenario.
- The current schema has no `routing_operation_id` on resource scope. Operation-specific scope is therefore not an existing supported semantic and was not invented in this phase.

## Implementation summary

- Added transactional `GET/PUT /production-lines/:id/resource-scopes` APIs.
- PUT accepts Resource Assignment IDs and derives Work Center, Workstation, Equipment, Machine Group, and Machine Unit snapshots from authoritative assignment rows. Clients cannot spoof those relationships.
- Added validation for existence, site, configured Work Center topology, lifecycle, effectivity, duplicate scope, cross-line assignment overlap, and Released-line removal.
- Added `MES.MasterData.ProductionLineResourceScopeAssigned.v1` outbox publication.
- Added migration `0074_shared_work_center_line_resource_scope`:
  - permits the same Work Center in multiple lines;
  - retains duplicate membership prevention inside one line;
  - rejects one effective Resource Assignment being scoped to two lines over an overlapping interval.
- MES Execution now sends the persisted `selected_production_line_id` in every readiness request.
- Readiness requires `production_line_id`, verifies line-to-Work-Center membership, and filters simple assignments, machine groups, and group members through effective resource scope.
- Backward compatibility: a Work Center effective in exactly one line may use all of its assignments when no explicit scope exists. A Work Center shared by multiple lines has no fallback and must use explicit scopes.

## Candidate boundary

```text
Dedicated Work Center, no explicit scope
  -> current effective Work Center assignments remain candidates

Shared Work Center
  -> candidate Resource Assignment must have an active/effective scope for selected line
  -> assignment scoped to another line is excluded
  -> missing scope yields no candidate, never cross-line fallback
```

Candidate evaluation remains in MES Master Data through the existing HTTP client. MES Execution does not access the Master Data database.

## API contract

### List

`GET /api/mes/master-data/production-lines/:id/resource-scopes`

Returns scope history with Resource Assignment, Work Center, Workstation, Equipment, Machine Group, and Machine Unit business identities. Unknown line returns `404 PRODUCTION_LINE_NOT_FOUND`.

### Replace

`PUT /api/mes/master-data/production-lines/:id/resource-scopes`

```json
{
  "resource_scopes": [
    {
      "resource_assignment_id": "uuid",
      "effective_from": "2026-08-07T00:00:00Z",
      "effective_to": null
    }
  ]
}
```

Success returns `{ "data": [scope rows] }`. Existing current scopes are expired and replacements inserted in one transaction.

Relevant errors:

- `PRODUCTION_LINE_RESOURCE_SCOPES_REQUIRED`
- `RESOURCE_ASSIGNMENT_ID_REQUIRED`
- `RESOURCE_ASSIGNMENT_NOT_FOUND`
- `PRODUCTION_LINE_RESOURCE_SCOPE_DUPLICATE`
- `PRODUCTION_LINE_RESOURCE_SITE_MISMATCH`
- `PRODUCTION_LINE_RESOURCE_WORK_CENTER_NOT_SCOPED`
- `PRODUCTION_LINE_RESOURCE_ASSIGNMENT_INACTIVE`
- `RESOURCE_ASSIGNMENT_LINE_SCOPE_OVERLAP`
- `PRODUCTION_LINE_RESOURCE_SCOPE_EFFECTIVITY_INVALID`
- `PRODUCTION_LINE_RESOURCE_SCOPE_EFFECTIVITY_INACTIVE`
- `PRODUCTION_LINE_RELEASED_RESOURCE_SCOPE_REMOVE_FORBIDDEN`

### Readiness request

`POST /api/mes/master-data/resource-planning/readiness` now requires:

```json
{
  "site_id": "uuid",
  "product_revision_id": "uuid",
  "routing_operation_id": "uuid",
  "work_center_id": "uuid",
  "production_line_id": "uuid",
  "quantity": 100,
  "planned_date": "2026-08-07",
  "shift_id": "uuid"
}
```

## Files changed

- `services/mes-master-data-service/src/infrastructure/http/line-resource-scope-validation.ts`
- `services/mes-master-data-service/src/infrastructure/http/master-data.router.ts`
- `services/mes-master-data-service/src/infrastructure/db/migrate.ts`
- `services/mes-master-data-service/service.manifest.yaml`
- `services/mes-master-data-service/test/unit/line-resource-scope-validation.test.ts`
- `services/mes-master-data-service/src/infrastructure/http/line-work-center-validation.ts`
- `services/mes-master-data-service/test/unit/line-work-center-validation.test.ts`
- `services/mes-execution-service/internal/application/usecase/resource_allocation.go`
- `scripts/test-mes-two-line-master-data-phase6.mjs`
- `AI_document/two-line/PHASE_2_LINE_WORKCENTER_REPORT.md`
- `AI_document/two-line/PHASE_3_LINE_RESOURCE_SCOPE_REPORT.md`

## Schema/API changes

- Additive migration `0074_shared_work_center_line_resource_scope`.
- New line resource-scope GET/PUT API.
- Additive required `production_line_id` field on internal readiness request; all in-repository callers were updated atomically.
- New outbox event type for effective resource-scope replacement.

## Tests and commands

- Master Data unit tests: PASS, 8 files and 34 tests.
- Master Data TypeScript build: PASS.
- MES Execution `go test ./...`: PASS.
- Existing two-line Master Data integration: PASS all steps, including shared Work Center topology and exact cleanup.
- Two-line resource-planning regression: PASS 19/19, including Primary, Backup, Resource Hold, capacity/calendar/resource failure, mixed-line rejection, replanning, execution lock, concurrency, and idempotency.
- Docker images rebuilt and services restarted; Master Data and Execution health endpoints return OK.

## Remaining risks

- Canonical seed currently models dedicated Work Centers. Phase 10 must add a deterministic shared-Work-Center split-scope fixture to prove the exact WS-01/02 versus WS-03/04 scenario in full-flow tests.
- Operation-specific scope remains not applicable because the current canonical model has no approved field or semantics for it.
- Execution logs contain replay failures for unrelated historical WMS events with non-UUID IDs. No Phase 3 request, migration, or readiness errors appeared; the WMS issue is outside this phase.

## Phase gate

PASS

## Post-Workstation UI Reconciliation (2026-08-08)

The Console no longer exposes `Resource Assignment` as a user-selectable Production Line object. Workstation configuration is authoritative for machine serials and machine groups. Production Line configuration now selects Workstations under its configured Work Centers; the Master Data API expands those Workstations to current technical assignment rows inside the existing resource-scope transaction so Resource Planning keeps its candidate boundary without reintroducing the removed Assignment page.
