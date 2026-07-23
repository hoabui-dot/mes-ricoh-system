# Phase 1 Step 7 — Labor Resource Management + WorkCenter CRUD + MBOM Console Fix

## Pre-Work Audit

- MBOM 404 root cause: `mes-console` had a route for `/master-data/mboms`, but `MbomScreen.tsx`
  called `/api/mes/master-data/mboms`. `mes-master-data-service` exposes `mbom-headers` and
  `mbom-lines`, so Kong/backend returned 404. The React route itself was present.
- Related Tier 1 spot-check: `RoutingScreen.tsx` used the same alias mismatch (`routings` vs.
  `routing-headers`). Items and Production Versions already used valid resource names.
- WorkCenter API surface before Step 7: generic `GET`, `POST`, and optimistic `PATCH` existed through
  the resource registry. There was no `PUT`, no headcount endpoint, and the console used a read-only
  Tier2 table for WorkCenters.

## Backend Changes

- Added Step 7 labor resource tables to `mes-master-data-service`:
  - `md_employee`
  - `md_employee_skill`
  - `md_employee_shift_schedule`
- Extended `md_shift` with `crosses_midnight`.
- Added special API endpoints:
  - `GET /api/mes/master-data/employees?work_center_id=...`
  - `GET /api/mes/master-data/employees/:id/skills`
  - `PUT /api/mes/master-data/employees/:id/skills`
  - `POST /api/mes/master-data/employee-schedules/bulk`
  - `GET /api/mes/master-data/employee-schedules?work_center_id=&date=`
  - `GET /api/mes/master-data/work-centers/:id/headcount`
  - generic `PUT /api/mes/master-data/:resource/:id`
- Added backend aliases for `mboms -> mbom-headers` and `routings -> routing-headers` to avoid the
  same UI/backend resource naming drift.
- Added Step 7 events to outbox/schema registration:
  - `MES.MasterData.EmployeeCreated.v1`
  - `MES.MasterData.ShiftCreated.v1`
  - `MES.MasterData.EmployeeScheduleAssigned.v1`

## Console Changes

- Replaced WorkCenter read-only generic screen with `WorkCentersScreen`:
  - Create/Edit WorkCenter
  - headcount badge `{on_shift_now_count} / {default_headcount}`
  - detail modal with `Tất cả / Đang trong ca / Ngoài ca` filter
- Added labor screens:
  - `/employees` and `/console/mes/employees`
  - `/shifts` and `/console/mes/shifts`
  - `/work-calendar` and `/console/mes/work-calendar`
- Rebuilt `MbomScreen.tsx`:
  - lists MBOM headers via `mbom-headers`
  - supports detail route `/master-data/mboms/:id`
  - renders nested `MD_MBOM_LINE` tree using `parent_line_id`
  - supports adding lines and inline substitutes
  - release action displays all returned validation errors

## Verification

- `npm run typecheck --workspace=mes-master-data-service` passed.
- `npm run build --workspace=mes-master-data-service` passed.
- `npm run test --workspace=mes-master-data-service` passed.
- `npm run typecheck --workspace=mes-console` passed.
- `npm run build --workspace=mes-console` passed.

## Post-Release Hotfix — 2026-07-22

- Regression: `/console/mes/employees` and `/console/mes/work-calendar` rendered the generic Layer-3
  error card when `GET /api/mes/master-data/employees` returned 404 through Kong.
- Backend resolution: confirmed `employees` is registered in the generic master-data table registry
  (`md_employee`) and is served by the standard `GET`, `GET /:id`, `POST`, and `PUT` resource routes.
  The live 404 was consistent with a stale service image/container and requires rebuilding/restarting
  `mes-master-data-service` after the Step 7 backend changes.
- Step 7 resource audit: `employee-schedules` intentionally uses explicit schedule routes instead of
  the generic master-data registry because its primary key and behavior are schedule-specific. The
  base `GET /api/mes/master-data/employee-schedules` route exists and supports zero query params,
  defaulting to the current date and returning all schedules for that date. Existing special
  endpoints for employee skills, bulk schedule assignment, and WorkCenter headcount remain intact.
- Console resolution: `fetchResource` now throws a typed `MasterDataApiError` with HTTP status and
  resource name. Employee and Work Calendar screens handle an employees `404` as a route-level
  empty/retry state (`Không tải được danh sách nhân công`) instead of falling through to the generic
  Layer-3 error card.
- Duplicate fetch finding: neither affected screen contains an automatic retry loop. Each screen loads
  once from a `useEffect` keyed to the WorkCenter filter, so duplicate calls seen in a development
  Network tab are consistent with React StrictMode double-invocation, not an uncapped retry loop.

## Follow-Ups

- Wire employee schedules into `mes-execution-service` `ComputeAndCheck` labor capacity checks in a
  future step. Step 7 intentionally leaves execution capacity unchanged.
- Add a richer multi-WorkCenter eligibility table if cross-training needs grow beyond the MVP
  `default_work_center_id` model.
