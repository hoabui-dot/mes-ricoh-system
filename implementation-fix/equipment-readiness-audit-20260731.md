# Equipment Readiness Audit

Date: 2026-07-31
Scope: MES Master Data resource-planning readiness, MES Execution allocation, and MES Console Equipment/Work Order views.

## Current-flow findings

| Factor | Source of truth | API / consumer | UI | Status | Gap |
|---|---|---|---|---|---|
| Lifecycle | `md_equipment.active_flag`, `lifecycle_status` | Master Data readiness | Equipment list/detail | PARTIALLY_IMPLEMENTED | Direct candidates checked `active_flag`, but did not expose a lifecycle dimension. |
| Execution status | `md_equipment.execution_status` | Master Data readiness, allocation revalidation | Equipment detail, candidate cards | IMPLEMENTED_BUT_NOT_TESTED | Stable reason codes were not shown as a structured readiness dimension. |
| Machine Unit availability | `md_machine_unit` | Group readiness; equipment detail | Equipment detail/list | PARTIALLY_IMPLEMENTED | Direct equipment candidates did not validate or return unit availability. |
| Resource Assignment | `md_resource_assignment` | Master Data readiness | Assignment history only | PARTIALLY_IMPLEMENTED | Readiness query did not require active assignment/lifecycle validity explicitly. |
| Capability | `md_resource_capability` | Master Data readiness | Not exposed in Equipment detail | IMPLEMENTED_BUT_NOT_TESTED | Correctly evaluated, but candidate response lacked a complete dimension summary. |
| Calendar | `md_resource_calendar` | Master Data readiness | Not exposed in Equipment detail | IMPLEMENTED_BUT_NOT_TESTED | Contextual check exists; no structured diagnostic card. |
| Capacity reservation | `wo_capacity_reservation` in Execution DB | Candidate view and allocation transaction | Candidate card | PARTIALLY_IMPLEMENTED | Conflicts were added after Master Data readiness and did not change candidate status before allocation. |
| Maintenance | No MES/CMMS authoritative table or event found | None | None | MISSING | No speculative MES ownership added; readiness reports Unknown. |
| Calibration | No authoritative table or event found | None | None | MISSING | No speculative MES ownership added; readiness reports Unknown. |
| Operational hold/lock | No generic Equipment source found | None | None | MISSING | Missing source is reported as Unknown, never Ready. |
| Connectivity/heartbeat | Only Print Station runtime projection exists | Print Station integration only | Print Station detail | MISSING | It is not an Equipment heartbeat source and is not reused as one. |
| Current fault/breakdown | No authoritative source found | None | None | MISSING | No duplicate fault model introduced. |

## Target decisions

1. `md_equipment`, `md_machine_unit`, assignments, capabilities, and calendars remain master/planning facts. Runtime reservations remain owned by MES Execution.
2. The existing `POST /resource-planning/readiness` endpoint remains the only readiness engine. Its candidate response is extended with structured dimensions and stable diagnostics.
3. Missing maintenance, calibration, hold, fault, and generic heartbeat facts remain `Unknown`. They are warnings in the current policy because no authoritative owning service exists; the system never labels missing facts as `Ready`.
4. No migration is required for the proven gaps. Adding speculative maintenance or calibration tables to MES would create a second owner and is explicitly deferred.
5. Equipment list/detail responses are enriched with batched master-data counts and structured, context-free readiness (`Unknown` when a routing/date/shift context is unavailable). Work Order candidates remain the authoritative contextual result.

## Implemented changes

- Readiness now validates active/effective assignment and direct machine-unit availability.
- Readiness exposes equipment, machine unit, assignment, capability, calendar, capacity, maintenance, calibration, and operational-state dimensions.
- Execution capacity conflicts change a candidate to `Blocked` before selection.
- Equipment detail exposes readiness diagnostics and capability/calendar summaries without cross-service database reads.
- Work Order candidate cards render structured readiness reasons and link to Equipment detail.

## Verification record

### Passed

- `npm run build` in `services/mes-console`.
- `npm run build` in `services/mes-master-data-service`.
- `gofmt -w internal/application/usecase/resource_allocation.go` and `go test ./...` in `services/mes-execution-service`.
- `docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.mes.yml up --build --force-recreate -d mes-master-data-service mes-execution-service mes-console`.
- `MES_MASTER_DATA_URL=http://127.0.0.1:13020 node scripts/test-mes-resource-planning-constraints.mjs`: `PASS=10 FAIL=0`, with 2 explicitly documented non-destructive skips.
- Runtime Equipment list/detail smoke check: list returned unit, assignment, capability and `Unknown` context-free readiness counts; detail returned all eight readiness dimensions.
- `git diff --check`.

### Findings retained outside this task

- Master Data startup remains healthy, but its existing Schema Registry registration logs a compatibility warning (`409`) for `MES.MasterData.ItemRevisionReleased.v1-value`; this is pre-existing event-schema drift and is outside Equipment readiness.
- `npm test -- --run` in `services/mes-master-data-service` currently has four failures from pre-existing architecture changes: the table-registry expected count is stale and Routing validation tests still use the old operation-field contract. No Equipment readiness test failed.
- The live Execution container was still `health: starting` immediately after recreation; its startup logs showed successful database migration, Kafka consumers, and HTTP bind. A later health probe should be used after its normal startup window.
