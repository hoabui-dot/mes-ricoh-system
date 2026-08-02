# MES Resource Planning Browser E2E Verification - Phase 3

Date: 2026-08-01
Status: PASS

## Scope

Phase 3 implemented and verified MES Console browser E2E coverage for resource planning. Production Line UI was not implemented.

Required guardrail source:

- `process-expand/mes-enterprise/docs/23_PHASE_IMPLEMENTATION_GUARDRAILS.md`
- `process-expand/mes-enterprise/docs/Phase-3-—-MES-Console-E2E-Verification.md`

## Implemented Coverage

Browser E2E command:

```bash
npm run test:e2e:resource-planning:phase3
```

Result:

- Declared: 6 tests
- Executed: 6 tests
- Passed: 6 tests
- Failed: 0 tests
- Skipped: 0 tests

Scenarios covered:

- Normal allocation through real Keycloak login, MES Console creation, async WO creation, detail open, Compute & Check, all operation candidate inspection, commit for every operation, refresh persistence, strict approval, execution start, logout/login persistence, and no raw UUID/backend enum rendering.
- Blocked candidate and capacity conflict rendering with translated error text.
- Allocation cancellation and reallocation from the Console.
- Stale candidate and maintenance/out-of-service resource rendering through backend readiness.
- Missing required allocation rejection before approval.
- Unauthorized Viewer and Operator cannot commit.
- Planner and Production Manager can commit after real Keycloak login.
- Cross-site shift denial returns stable `SHIFT_SITE_INVALID`.

## Product Changes

MES Console:

- Added revalidate allocation, start execution, allocation cancel, and reallocate controls to Work Order detail.
- Uses strict approval header `X-MES-Approval-Policy: Strict` so approval revalidates committed resource allocations.
- Renders candidate readiness and allocation statuses through translated labels rather than raw backend enum strings.
- Handles Compute & Check HTTP 409 advisory results as displayable warning results.
- Uses stable `data-testid="work-order-compute-result"` for the rendered Compute & Check panel.
- Selects MES business roles for `X-Role-Code` instead of non-business Keycloak roles such as `offline_access`.

Execution service and gateway:

- Work Order detail API now returns `planned_start_at` and `planned_end_at`.
- Work Order creation workflow derives `planned_start_at` from `target_date` at 08:00 UTC when no explicit planned start is supplied.
- Execution service and Kong CORS allow `X-MES-Approval-Policy`.

Browser E2E:

- Added `e2e/resource-planning/phase3-resource-planning.spec.ts`.
- Added `e2e/resource-planning/phase3-helpers.ts`.
- Added package script `test:e2e:resource-planning:phase3`.
- Keycloak fixture helper creates/repairs Phase 3 users and realm roles for Viewer, Planner, and Production Manager.
- Tests use exact work order IDs for cleanup and restore local fixture mutations.

## Verification Commands

Passed:

```bash
npm run test:e2e:resource-planning:phase3 -- --list
npm run test:e2e:resource-planning:phase3
npm --prefix services/mes-console run typecheck
npm --prefix services/mes-console run build
npm --prefix services/mes-master-data-service run typecheck
go test ./...
node --check e2e/resource-planning/phase3-helpers.ts
node --check e2e/resource-planning/phase3-resource-planning.spec.ts
git diff --check
```

Cleanup verification:

```sql
select count(*) as wo_header_count from wo_header;
-- 0

select count(*) as phase3_allocation_count
from wo_resource_allocation
where allocated_by in ('6b519e77-e3d0-44f1-a74d-00381b143e0d')
   or change_reason like '%Phase 3%';
-- 0
```

## Gate Decision

Phase 3 gate: PASS.

No required browser E2E scenario is skipped. No generated Phase 3 Work Orders or Phase 3 allocation rows remain after cleanup.
