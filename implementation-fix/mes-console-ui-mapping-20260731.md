# MES Console UI Mapping and Resource Ownership

Date: 2026-07-31

## Scope

Audited and aligned the MES Console Tier 2 resource screens with
`process-fix/MES-Console-UI-mapping.md`. The authoritative runtime model is now represented in the UI and
the current Routing authoring flow:

```text
Routing Operation -> logical Work Center
Work Center -> candidate Workstations
Workstation -> Machine Requirements + effective Resource Assignments
Work Order Resource Planning -> readiness evaluation + candidate scoring + committed allocation
```

## Changes

### Routing

- `RoutingCreateScreen` no longer loads or submits Workstation selections.
- `RoutingOperationsScreen` no longer requires a Workstation and no longer loads Workstation options.
- Routing help text now explains that Workstation and physical machine selection happens during Resource Planning.
- Routing detail presents Work Center as the routing location and explains that the runtime target is resolved later.
- The routing replacement endpoint accepts a nullable legacy `workstation_id`, but current authoring does not send it.
- Routing release validation no longer blocks a route because a direct Workstation is missing. It still validates active
  Work Centers, Operation lifecycle, sequence/dependency rules, and planning values.

### Work Center

- The primary create/edit form now persists only canonical Work Center fields: generated code, localized name, Site,
  Shopfloor, Area, type, and active state.
- Capability and legacy Work Center Composition mutations were removed from the primary Work Center save flow.
- Work Center detail now shows related Workstations and a separate Resource Capability summary.
- New multilingual help text explains that capabilities, calendars, standards, machines, and Workstations are
  planning/resource concerns rather than duplicated Work Center form state.

### Runtime dispatch

- Print dispatch now resolves the committed `wo_resource_allocation.planned_workstation_id` first and falls back to the
  historical `wo_operation.workstation_id` snapshot only for compatibility with old Work Orders.
- This preserves immutable historical snapshots while making committed planning allocation authoritative for current
  execution and Print Station resolution.

### API and compatibility

- Routing detail candidate counts are calculated from active/effective Workstations under the Routing Work Center,
  not from `md_workstation_operation_capability`.
- The existing nullable `md_routing_operation.workstation_id` column and legacy Workstation capability routes remain
  as compatibility surfaces. No historical table or column was dropped.
- Existing resource requirement, assignment, readiness, Print Station binding, and Work Order allocation flows were
  preserved.

### Documentation

- Updated `AI_CONTEXT.md` to remove the direct Routing-to-Workstation ownership claim.
- Updated `UI_AI_CONTEXT.md` to describe the current Work Center, Workstation, Routing, and Resource Planning UI
  mapping, including form boundaries and warnings.
- Updated the existing `scripts/test-mes-operation-workstation-workcenter-flow.mjs` instead of creating a second
  verification script. It no longer asserts direct Workstation ownership or mutates Work Center Composition.

## Verification

Commands executed successfully:

```text
npm run typecheck
cd services/mes-master-data-service && npm run typecheck
go test ./...                         (services/mes-execution-service)
npm run build                         (services/mes-console)
npm run build                         (services/mes-master-data-service)
npm run test:mes:operation-flow
git diff --check
```

The existing verification script passed with active runtime data. It created and cleaned a disposable Operation,
confirmed the Work Center hierarchy, loaded Operation detail, and confirmed that Routing rows expose Work Center
ownership while Workstation resolution is delegated to Resource Planning.

Affected services were rebuilt and restarted with:

```text
docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.mes.yml \
  up --build -d mes-master-data-service mes-execution-service mes-console
```

MES Console and MES Master Data were healthy after restart. MES Execution completed startup and began its health
check; its startup log confirmed database migrations were already applied, Master Data and printer-result consumers
were running, and the service was listening on port 3030.

## Remaining limitations

- Legacy `md_workstation_operation_capability`, Work Center Composition, and nullable routing Workstation fields remain
  in the database/API for historical compatibility. They are no longer part of the current primary Routing/Work
  Center authoring flow.
- Existing historical Work Orders can still contain a snapshot Workstation. They are not rewritten. Current Work
  Order execution uses the committed resource allocation whenever available.
- Full browser visual verification was not automated in this pass; typecheck, production builds, API verification,
  container rebuild, and runtime health checks were completed.
