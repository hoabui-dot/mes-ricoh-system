# MES Two-Line Configuration and Operations Guide

Date: 2026-08-07

## Scope

This guide describes the implemented MES flow for one Production Version with a Primary line and a Backup line. Backend decisions are authoritative; MES Console displays and operates on those decisions.

## Configuration order

1. Create the Site, Production Area, Shopfloor, Shift, and calendars.
2. Create all Work Centers, Workstations, Equipment, Machine Units, Resource Assignments, capabilities, production standards, and worker-skill data.
3. Open MES Console at `/master-data/production-lines` and create both lines as Draft.
4. Open each line detail and attach its Work Centers. A Work Center may be shared only when line Resource Scopes separate its assignments unambiguously.
5. Configure the line's Workstation scope from the Production Line detail. Select Workstations that belong to the configured Work Centers; the backend derives the current machine configuration and technical Resource Assignment records from each Workstation. Users do not select Resource Assignment records directly.
6. Review the line readiness panel. Resolve all blockers, then release the line. Missing eligibility is a warning; invalid topology or resource scope is blocking.
7. Create/release MBOM and Routing independently, then create the Production Version from one MBOM plus one Routing.
8. In `/master-data/production-versions`, configure line eligibility with exactly one Primary line, optional Backup lines, unique priorities, effectivity, and Released lifecycle state.
9. Run line-readiness preview before creating production Work Orders.

## Supported APIs

- `GET/POST /production-lines`
- `GET/PUT/DELETE /production-lines/:id`
- `GET /production-lines/:id/readiness`
- `GET/PUT /production-lines/:id/work-centers`
- `GET/PUT /production-lines/:id/resource-scopes`
- `POST /production-lines/:id/release`
- `GET/PUT /production-versions/:id/line-eligibility`
- `POST /production-versions/:id/line-readiness-preview`
- `GET /work-orders/:id/line-readiness`
- `POST /work-orders/:id/line-replan`
- `GET /work-orders/:id/resource-allocation-proposals`
- `GET /work-orders/:id/operations/:opId/resource-candidates`
- `POST /work-orders/:id/operations/:opId/resource-allocation`
- `POST /work-orders/:id/resource-allocations/revalidate`

API paths above are relative to the Master Data or Execution service base path.

## Automatic line selection

At Work Order creation, the planner selects a Production Version, quantity, and
target date. MES derives shift candidates from released, available resource
calendars attached to eligible lines and evaluates them in deterministic order.
The first shift that produces complete-line feasibility is persisted on the WO
as a planning snapshot. A client-supplied shift is ignored.

At WO creation or an authorized pre-start replan, MES evaluates eligible lines in deterministic priority order. A line is complete only when every mandatory Routing Operation has at least one feasible candidate inside that line.

- Primary complete: select Primary and leave fallback reason empty.
- Primary blocked, Backup complete: select Backup and persist `PRIMARY_LINE_BLOCKED`.
- No complete line: select no line and persist `RESOURCE_HOLD` with evaluated-line diagnostics.
- One candidate inactive but another remains: keep the line Ready and exclude only the bad candidate.

The selected line is copied to every WO Operation. An operation cannot commit a resource from another line.

## Exact resource planning

Open the Work Order detail and use Resource Planning. Auto proposal evaluates current Workstation, Assignment, Equipment/Machine Unit, capability, calendar, production standard, capacity/reservation, and applicable labor readiness. Commit one candidate for every mandatory operation, then revalidate.

Approval, Work Order start, and Operation start revalidate committed resources. A stale or incomplete allocation returns `WO_RESOURCE_ALLOCATION_INVALID`; the user must restore the resource or replan before continuing.

Capacity is currently enforced by Work Center time window. Two Workstations in the same Work Center do not bypass an overlapping Work Center reservation.

## Diagnostics in MES Console

Use `/work-orders` to filter and compare selected line, fallback, and Resource Hold states. Open a WO detail to inspect:

- selected line and selection mode;
- fallback or hold reason;
- Primary/Backup comparison;
- all 13 readiness dimensions;
- per-operation candidate totals, feasible totals, and exclusion reasons;
- exact resource allocation and revalidation state.

`DEFERRED` means the dimension belongs to a later exact-resource or execution stage; it does not mean Ready. `BLOCKED` dimensions contain backend reason codes and details.

## Failure and recovery

- Before execution: an authorized replan may change the complete selected line and writes audit history.
- After execution starts: line replan is rejected. MES does not silently move remaining operations to Backup.
- Operation resource failure: fail the active session with an approved reason. The operation becomes `ExecutionError` and the WO becomes `Paused`.
- Recovery: use retry/recovery with the required role and Site scope. Events and old/new state remain in outbox and execution history.
- Partial-production transfer to another line requires a future Execution Segment/child-WO design and is not implemented as an automatic action.

## Verification commands

```bash
npm run verify:mes:canonical-seed
npm run test:mes:two-line-master-data:phase6
npm run test:mes:two-line-resource-planning:phase7
npm run test:mes:two-line-resource-lifecycle:phase8
npm run test:mes:two-line-full-flow:phase11
```

All mutation scripts reject unsafe environments and local/test database violations.
