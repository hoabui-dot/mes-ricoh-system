# Correct Planning Value Inheritance Across MES Planning Layers

Date: 2026-07-27
Process: `process-expand/Correct-Planning-Value-Inheritance-Across-Operation,-Workstation-Capability,-Routing,-and-Work-Order.md`

## Root cause

Routing replacement previously copied Operation defaults into a Routing Production Standard for every row. That made inherited and override states indistinguishable, treated Workstation capability data as an authority, and forced release/readiness code to require redundant standards. Work Order creation also used hardcoded `15` minute setup and `45` second cycle fallbacks.

## Implemented contract

`md_operation` owns engineering defaults. `md_workstation_operation_capability` is advisory resource capability data. `md_routing_operation` now stores `planning_mode` as `INHERITED` or `ROUTING_OVERRIDE`. A Routing Production Standard is created only for an explicit override.

Resolution precedence is Routing-scoped released Standard, released generic Work Center Standard, Operation engineering defaults, then unresolved. Unresolved required values block release. Routing responses include resolved values, `resolved_source`, the Routing standard ID, and Workstation capability summary. The editor exposes inherited/read-only and override/editable modes. Worker skill defaults are not persisted as Routing rows unless explicitly overridden.

## Database and API changes

- Migration `0042_explicit_routing_planning_inheritance` adds and backfills `md_routing_operation.planning_mode`, ends only redundant copied standards, and preserves differing standards as overrides.
- Routing replacement is transactional and creates a standard only for `ROUTING_OVERRIDE`.
- Routing release returns `ROUTING_PLANNING_VALUES_UNRESOLVED` with affected operation IDs when required values are missing or invalid.
- Production Version validation accepts valid Operation defaults or a released Work Center standard instead of requiring a copied Routing standard.
- `000014_routing_planning_resolution` adds resolved fields to the execution Routing read model. `RoutingReleased.v1` publishes the complete resolved operation list, and execution projects it before Work Order creation.

## Work Order behaviour

Work Order creation consumes only the released Routing read-model snapshot and persists source, base quantity, setup, cycle, workers, efficiency, yield, and predecessor in `wo_operation.planning_snapshot`. A later standard query cannot silently replace the approved snapshot. The old `15/45` fallback was removed; legacy rows use only a compatibility `0/60/1` fallback.

## Verification

- Master Data TypeScript build: passed.
- Master Data Vitest suite: 6 tests passed.
- Execution `go test ./...`: passed.
- MES Console TypeScript/Vite build: passed.
- `git diff --check`: passed.

Full Docker/database/browser E2E and the numeric scenario (Operation 60, Workstation 45-65, Routing override 75, WO snapshot 75, then inherited) require the running platform database and broker environment and remain deployment verification items.

## Changed files

`services/mes-master-data-service/src/infrastructure/db/schema.ts`, `migrate.ts`, `master-data.router.ts`, `validation-engine.ts`; `services/mes-execution-service/migrations/000014_routing_planning_resolution.up.sql`, `cmd/server/main.go`, `masterdata_consumer.go`, `create_work_order.go`; and `services/mes-console/src/routes/master-data/RoutingOperationsScreen.tsx`.
