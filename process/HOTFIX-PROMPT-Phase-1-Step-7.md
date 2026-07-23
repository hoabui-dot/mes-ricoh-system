# HOTFIX PROMPT — Phase 1 Step 7 Regression: Employee & Work Calendar screens blank (404 on `/employees`)

**Project:** MOM Platform (MES / WMS / QMS) — Won Seal Tech
**Type:** Bug fix on an already-`Completed ✅` step (Phase 1, Step 7) — **does not change roadmap
numbering**, does not need a new `process/PROJECT_WORKLOAD_PROGRESS.md` entry, only an update to Step
7's implementation trace once fixed.
**Evidence:** Browser DevTools Network tab, `mes-console` (`PLANT_MANAGER` session):
`GET http://100.68.50.41:18000/api/mes/master-data/employees` → **404 Not Found**, while
`work-centers`, `shifts`, `sites` on the exact same registry all return `200 OK` in the same session.
Console renders a generic Layer-3 "Đã có lỗi hệ thống" card (incident `INC-cg12d0rh`) on both
`/employees` (Nhân Công) and `/work-calendar` (Lịch Làm Việc) — `/shifts` (Ca Làm Việc) works normally.

---

## 0. Root cause (confirmed, do not re-diagnose — verify and fix directly)

`mes-master-data-service`'s Step 7 implementation added the **special-purpose Employee endpoints**
(`GET /employees?work_center_id=`, `GET /employees/:id/skills`, `PUT /employees/:id/skills`,
`POST /employee-schedules/bulk`, `GET /employee-schedules?...`) but **never registered `employees` as
a base CRUD resource** in the same generic resource registry that already serves `items`, `shifts`,
`work-centers`, `mbom-headers`, etc. (per §7 "Key endpoints" pattern in `AI_CONTEXT.md`:
`GET /api/mes/master-data/:resource`, `POST /api/mes/master-data/:resource`,
`GET /api/mes/master-data/:resource/:id`, `PUT /api/mes/master-data/:resource/:id`).

Because `mes-console`'s Employee list screen calls the **unfiltered base list endpoint**
(`GET /employees`, no query params) on mount, and that route was never wired, every fetch 404s. The
Work Calendar screen fails for the identical reason — its employee multi-select also calls
`GET /employees` before anything else.

**This is a registration gap, not a logic gap** — `md_employee` table, its column shape, and the
special endpoints already work correctly (per the implementation trace). Do not rebuild any of the
domain logic; only add the missing registration.

---

## 1. Fix — Part A: register `employees` as a standard resource (backend)

In `mes-master-data-service`, find wherever `shifts` and `work-centers` are registered in the generic
resource registry (this is the reference implementation — `shifts` is confirmed working end-to-end in
production right now, use its exact registration shape as the template) and add `employees` alongside
them with the same 4 standard routes:

- `GET /api/mes/master-data/employees` — **must work with zero query params**, returning all employees
  (paginated per the existing convention used by `items`/`shifts`). This is the specific route
  currently 404ing and blocking both screens.
- `GET /api/mes/master-data/employees/:id`
- `POST /api/mes/master-data/employees`
- `PUT /api/mes/master-data/employees/:id`

Do not remove or change the already-working special endpoints (`?work_center_id=` filter,
`/employees/:id/skills`, `/employee-schedules/*`) — those stay exactly as built. This is additive.

**While in the registry, audit every other Step 7 resource for the same gap** — specifically confirm
`employee-schedules` also has a working base `GET /api/mes/master-data/employee-schedules` (no query
params) if the Work Calendar screen's "view existing schedule" list depends on it, since the same
mistake (special-endpoint-only, no base registration) may repeat there. Report what you find before
assuming only `employees` was affected.

## 2. Fix — Part B: `mes-console` error handling for this failure mode

Once Part A is fixed the blank-screen symptom disappears, but the underlying handling was still wrong
and must be corrected regardless, because the same class of bug (a missing/renamed backend route) will
recur and should never again present as a generic "Đã có lỗi hệ thống" full-page crash:

- On the Employee list and Work Calendar routes, a `404` from the data fetch is a **typed, anticipated
  error** (a resource genuinely not found / not yet available), not an unexpected exception. Per the
  3-layer error handling model already established for this project (Kiosk UI, carried into Console):
  render a **route-level, specific state** — an empty-state card ("Không tải được danh sách nhân công,
  vui lòng thử lại" + a retry button) — rather than falling through to the root/generic Layer 3
  boundary. Reserve the generic "Đã có lỗi hệ thống" card for genuinely unexpected exceptions only.
- Investigate the **duplicate fetch behavior** visible in the Network tab (`employees` requested
  multiple times in immediate succession before failing) — determine whether this is React
  double-invoke in development/StrictMode (benign) or an actual retry loop with no backoff/cap
  (needs a fix: cap retries, e.g. max 1 automatic retry, then require a manual "Thử lại" click).
  Report which one it is.

## 3. Definition of Done

| # | Item | Verification |
|---|---|---|
| 1 | `GET /api/mes/master-data/employees` (no params) returns `200` with a valid (possibly empty) list | `curl` through Kong |
| 2 | `/console/mes/employees` (Nhân Công) renders the employee list without error, including when the list is empty | Manual test |
| 3 | `/console/mes/work-calendar` (Lịch Làm Việc) loads the employee multi-select correctly | Manual test |
| 4 | Every other Step 7 resource audited per §1 confirmed to have working base CRUD routes, or gaps found and fixed | Written confirmation of audit result |
| 5 | A simulated 404 on the employees fetch (e.g. temporarily rename the route) now renders a specific empty/retry state on those two screens, not the generic Layer 3 card | Fault injection test |
| 6 | Duplicate-fetch behavior explained and, if it was an uncapped retry loop, fixed with a retry cap | Manual verification in Network tab, before/after |
| 7 | `npm run typecheck` / `npm run build` / `npm run test` pass for both `mes-master-data-service` and `mes-console` | CI/local run |

## 4. Process Reminder

Update `implementation/phase-1-7-labor-resource-management.md` with a short "Post-release hotfix"
section describing this fix (root cause + resolution), rather than editing the original record's
verification claims — keep the history of what was actually found and fixed visible, consistent with
this project's existing convention of treating implementation records as historical trace documents.