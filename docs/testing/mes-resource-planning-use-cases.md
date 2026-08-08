# MES Resource Planning Use Cases

The current flow is strict manual planning. A released Production Version is the only Work Order product source. Routing snapshots provide the Work Center; readiness resolves Workstations, requirements, effective assignments, machine units, capability, calendar, standard, worker readiness, and capacity. The planner commits a Ready candidate through the execution API.

## UC-RP-001 — Create Work Order from a released Production Version

### Objective
Create a Draft Work Order from a released, effective Production Version.

### Preconditions
Released Item Revision, MBOM, Routing, Production Version, site, and an effective Work Center resource calendar for the target date. Shift is resolved by MES during workflow execution.

### Test Data
`E2E-WO-FG-01`, `PV-*`, `SITE-KZ3`, an active shift.

### User Steps
Open Work Orders, choose the released Production Version, enter a valid quantity and target date with an effective resource calendar, submit, then open the created Work Order.

### API Steps
Use `POST /api/mes/execution/work-order-creation-workflows` and poll the workflow snapshot.

### Expected Result
Workflow succeeds and Work Order operations are created from immutable snapshots.

### Database Validation
`wo_header`, `wo_operation`, and planning snapshots reference the selected Production Version.

### Cleanup
Delete only the disposable Work Order and child rows.

### Result
Covered by `test-mes-resource-planning-flow.mjs` and the browser suite.

## UC-RP-002 — Resolve Ready and Blocked candidates

### Objective
Classify candidates using backend readiness and capacity.

### Preconditions
Work Order operation has a Work Center and the master readiness matrix exists.

### Test Data
Two disposable WOs with the same site, shift, operation, and planned window.

### User Steps
Open an operation's Resource Planning section and inspect candidate status and reasons.

### API Steps
Call `GET /work-orders/{id}/operations/{opId}/resource-candidates`.

### Expected Result
Ready candidates are selectable; Blocked candidates contain structured reasons and cannot be committed.

### Database Validation
Capacity conflicts are based on active `wo_capacity_reservation` rows.

### Cleanup
Delete both disposable WOs.

### Result
Covered by the API flow script after the first WO creates an exclusive reservation.

## UC-RP-003 — Select a Ready Workstation

### Objective
Select the backend-resolved Workstation and exact machine-unit snapshot.

### Preconditions
At least one Ready candidate.

### Test Data
Active Workstation with effective Resource Assignment and eligible physical unit.

### User Steps
Open an operation, inspect the machine requirement, and choose Select and Commit.

### API Steps
POST the selected candidate identifiers to the resource-allocation endpoint.

### Expected Result
The backend revalidates the candidate and accepts only a currently Ready selection.

### Database Validation
Allocation stores Workstation/Equipment and primary/supporting machine-unit snapshot.

### Cleanup
Cancel/delete only the disposable allocation through WO cleanup.

### Result
Covered by browser and API flow.

## UC-RP-004 — Commit allocation transactionally

### Objective
Persist the allocation, reservation, audit, idempotency row, and outbox event atomically.

### Preconditions
Draft Work Order and Ready candidate.

### Test Data
Valid shift and planned start.

### User Steps
Commit one candidate and observe the operation status.

### API Steps
POST with `Idempotency-Key`.

### Expected Result
HTTP success returns Committed allocation.

### Database Validation
One current allocation, reservations, audit row, and idempotency response exist.

### Cleanup
Remove the disposable WO graph in child-first order.

### Result
Covered by API script.

## UC-RP-005 — Refresh committed allocation

### Objective
Verify persistence after browser refresh.

### Preconditions
All operations have committed allocations.

### User Steps
Refresh the Work Order detail.

### API Steps
GET Work Order detail.

### Expected Result
Every operation remains Committed and displays its planning result.

### Database Validation
Current allocation rows remain valid and historical rows are not overwritten.

### Cleanup
Use disposable WO cleanup.

### Result
Covered by browser suite.

## UC-RP-006 — Execution uses committed allocation

### Objective
Ensure execution resolves the committed allocation rather than selecting a different resource.

### Preconditions
Committed, valid allocation.

### User Steps
Start the operation through the execution action when the Work Order is released.

### API Steps
Use the operation start endpoint.

### Expected Result
Execution is blocked when allocation is missing/stale and uses the committed resource when valid.

### Database Validation
Execution session preserves the allocation identity/resource context.

### Cleanup
Use the normal disposable WO cleanup.

### Result
Backend guard is present; physical execution is a separate runtime dependency.

## UC-RP-007 — Idempotent repeat and cancellation

### Objective
Prevent duplicate allocations and preserve history on cancellation.

### Preconditions
Draft WO and allocation endpoint available.

### User Steps
Submit the same allocation twice, then cancel while editable.

### API Steps
Repeat the same idempotency key and call the cancellation endpoint.

### Expected Result
The replay returns the same persisted response; cancellation ends the current allocation and reservations without deleting audit history.

### Database Validation
One idempotency row, cancelled reservation, and audit/history remain.

### Cleanup
Delete disposable WO after evidence is captured.

### Result
Replay is covered by the API script; cancellation remains an API regression case.

## UC-RP-101 — Missing shift or calendar

### Objective
Verify missing planning context blocks candidate resolution.

### Expected Result
`SHIFT_REQUIRED` or calendar blocking reason is returned; no allocation is written.

## UC-RP-102 — Inactive or unassigned Workstation

### Objective
Verify machine readiness and effective assignment rules.

### Expected Result
Candidate is Blocked with translated readiness reasons and cannot be committed.

## UC-RP-103 — Capacity conflict

### Objective
Verify exclusive reservation conflict.

### Expected Result
Second Work Order candidate becomes Blocked/has capacity conflict after the first allocation commits.

## UC-RP-104 — Stale candidate

### Objective
Verify POST never trusts an old candidate.

### Expected Result
The allocation is rejected with the existing stale-candidate error and no partial reservation is committed.

## Verification Commands

```bash
MES_ENV=development ALLOW_RESOURCE_PLANNING_MUTATION=true npm run test:mes:resource-planning-flow
MES_E2E_USERNAME=plant.manager MES_E2E_PASSWORD='Manager@123!' ALLOW_E2E_MUTATION=true MES_MASTER_DATA_DATABASE_URL=postgres://mes_master_data_user:mes_master_data_pass@127.0.0.1:15434/mes_master_data_db MES_EXECUTION_DATABASE_URL=postgres://mes_execution_user:mes_execution_pass@127.0.0.1:15435/mes_execution_db npm run test:e2e:resource-planning
```
