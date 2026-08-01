# Resource Planning Full E2E Improvement

## Inspection

The original suite contained four declarations: smoke, quantity validation, concurrency, and authorization. Concurrency was a real `test.skip` because it had no two-client barrier. Authorization was a placeholder because no Viewer account was configured and the execution API did not enforce a mutation role. The smoke test was also incorrectly tagged `@full`, so the `full` command did not represent full coverage.

The current source uses the MES Console login/session headers and the execution API resource-allocation transaction. Cleanup is database-backed and must use exact Work Order UUIDs. Viewer credentials remain an external prerequisite and are not stored in the repository.

## Implemented Changes

- Added a real two-client concurrency test in `e2e/resource-planning/concurrency/resource-planning-concurrency.spec.ts`.
- The concurrency test creates two disposable Work Orders, resolves the same Ready resource, synchronizes two independent API contexts at a barrier, commits simultaneously, asserts one success and one HTTP 409 conflict, and verifies one committed allocation.
- Added a real sequential and concurrent Work Order numbering test in `e2e/resource-planning/work-order/numbering.spec.ts`.
- Removed the misleading `@full` tag from the smoke case. `test:e2e:resource-planning:full` now executes the complete Resource Planning directory.
- Added the `@numbering` package command.
- Changed Machine E2E missing-credential handling to an explicit skip instead of a false failure. Credentials remain runtime-only.
- Extended cleanup to accept multiple exact Work Order IDs and report `workOrderIds`, `workOrdersRemoved`, `remainingWorkOrders`, and `sharedFixtureRestored`.
- Added execution API role enforcement for allocation create, reallocate, and cancel. Allowed mutation roles are `PLANT_MANAGER`, `PROD_MANAGER`, `PLANNER`, and `EXECUTIVE`; other roles receive HTTP 403 with `RESOURCE_ALLOCATION_FORBIDDEN`.
- Added localized UI mapping for `RESOURCE_ALLOCATION_FORBIDDEN`.
- Mapped PostgreSQL serialization conflict `SQLSTATE 40001` to stable `RESOURCE_CAPACITY_CONFLICT` HTTP 409 instead of exposing internal SQL text.

## Current Test Counts

### Full Resource Planning browser run

Command:

```bash
MES_E2E_USERNAME=plant.manager \
MES_E2E_PASSWORD='***' \
ALLOW_E2E_MUTATION=true \
MES_E2E_BASE_URL=http://100.68.50.41:13052 \
MES_E2E_API_BASE_URL=http://100.68.50.41:18000 \
MES_MASTER_DATA_DATABASE_URL=postgres://.../mes_master_data_db \
MES_EXECUTION_DATABASE_URL=postgres://.../mes_execution_db \
npm run test:e2e:resource-planning:all
```

Result from the verified run:

- Declared: 5
- Executed: 4
- Passed: 4
- Failed: 0
- Skipped: 1
- Cleanup passed: yes for all mutating tests

Executed and passed:

- RP-E2E-063 simultaneous exclusive-resource commit
- RP-E2E-001/041/042/046 Console Work Order and allocation smoke flow
- RP-E2E-003 invalid quantity validation
- RP-E2E-130/131 sequential and concurrent Work Order code uniqueness

Skipped:

- RP-E2E-101 authorization: `MES_E2E_VIEWER_USERNAME` and `MES_E2E_VIEWER_PASSWORD` are not configured. This is an external Keycloak fixture prerequisite, not a simulated pass.

## Remaining Scope

The broader process catalog still includes stale-state mutation, cancellation/replan, execution-start, maintenance/out-of-service unit cases, cross-site authorization, and UI state matrix cases. These are not claimed as implemented or passed because the repository does not yet provide isolated fixtures for each state transition. A dedicated Viewer account is also required to execute RP-E2E-101.

## Verification

- `go test ./...` in `services/mes-execution-service`: passed.
- MES execution service and MES Console rebuilt and restarted with the updated code.
- Concurrency command: passed with two exact-ID Work Orders cleaned.
- Numbering command: passed with four exact-ID Work Orders cleaned.
- Full Resource Planning command: 4 passed, 1 skipped, 0 failed.
