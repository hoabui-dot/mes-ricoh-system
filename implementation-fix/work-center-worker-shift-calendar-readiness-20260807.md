# Work Center Worker, Shift Calendar and LINE Readiness

## Business decision

- Employee is owned directly by one required Work Center. Site is derived from that Work Center.
- `md_shift` remains a reusable time template because one Work Order shift can span a LINE containing multiple Work Centers.
- `md_work_center_shift_set` defines the aggregate shift set for each Work Center; `md_work_center_shift` contains its child shifts.
- The Console creates or edits the aggregate in one form, with a read-only generated set code and a table of named `HH:mm - HH:mm` rows. Rows save atomically and cannot overlap within one day.
- Employee work calendar is always scoped to one Work Center.

## Implemented controls

- Migration `0075_work_center_labor_calendar` adds Work Center shift assignments, backfills current data, and makes Employee/Schedule Work Center mandatory.
- Database triggers reject Site mismatch, Shift/Work Center mismatch, Employee/Work Center mismatch and overlapping schedules, including overnight ranges.
- Bulk schedule API validates the complete request before insert and returns HTTP 409 with conflict details. It no longer silently skips conflicting rows.
- Employee create/edit derives Site from required Work Center.
- Shift Console allows each Work Center to have any number of named shifts. The user supplies the shift name; the backend generates a Work Center-specific read-only code such as `WC-MIXING-SHIFT-01` and `WC-MIXING-SHIFT-02`.
- Shift creation and edit reject overlapping time ranges within the affected Work Center, including overnight ranges. There is no artificial one-shift-per-Work-Center limit.
- The create form shows a Work Center-specific code preview and keeps the code read-only. The final code is allocated transactionally by the master-data service.
- Work Calendar requires Work Center first and only loads its Employees and Shifts.
- Master-data LINE readiness and execution `ComputeAndCheck` require exact Work Center, Shift, date, active worker and minimum skill level.

## Verification

- Master-data TypeScript build and 41 unit tests passed.
- MES Console production build passed.
- MES execution full Go test suite passed.
- Migration applied on the running MES database: 12 active Work Centers, 12 configured shift sets, zero Employees or Schedules without Work Center.
- Duplicate schedule API test returned `409 EMPLOYEE_SCHEDULE_TIME_CONFLICT` with employee, date and conflicting shift details.
- Playwright labor/calendar smoke flow passed against the rebuilt Docker deployment.
- Worker Skill domain/UX regressions passed (2/2). The disposable full resource-planning flow created two WOs and returned 4/4 Ready candidates, confirming the stricter labor gate accepts the canonical LINE.
- Live shift API verification generated `WC-MIXING-SHIFT-01` without accepting a client code; the test record was closed after verification. An overlapping `08:30-09:30` request returned `409 SHIFT_TIME_CONFLICT` against `SHIFT-A`.

## Residual outside this change

The disposable resource-planning script continued past labor readiness but failed its existing machine snapshot assertion (`primary_units=0`). Both disposable WOs were cleaned up. This is a machine-unit allocation snapshot issue, not a worker/skill/shift/calendar failure, and was not changed as part of this labor contract.
