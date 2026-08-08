# Work Calendar Calendar View and Bulk Assignment

## Decision

`work-calendar` now opens in a Work Center calendar view. The calendar is empty until a Work Center is selected. Selecting a Work Center loads its employees and schedule data for the visible month.

The existing bulk assignment form is a secondary workflow opened by `Phân ca làm việc`. Saving the form returns to the calendar view, keeps the selected Work Center, moves the calendar to the assignment start month, and reloads the data for verification.

## Calendar UX

- Uses the repository's existing `react-day-picker`/shadcn calendar wrapper.
- Dates containing schedules are highlighted.
- Selecting a date shows employee name, shift name, and `HH:mm - HH:mm` in the detail panel.
- Shift codes are intentionally hidden from operational scheduling choices.
- Work Center options show translated names with the code as the secondary identity.
- Shift options show `Name (start-end)`.

## Validation

- Work Center, shift, and at least one employee are required.
- Employees must be active and assigned to the selected Work Center.
- The selected shift must be actively assigned to that Work Center.
- Server-side range validation rejects any employee schedule that overlaps an existing scheduled shift and returns `409 EMPLOYEE_SCHEDULE_TIME_CONFLICT` with employee, date, and conflicting shift details.
- The database trigger remains the final protection for employee schedule time conflicts.
- The complete bulk operation is transactional.

## API

`GET /api/mes/master-data/employee-schedules` accepts `work_center_id`, `from`, and `to` for calendar range loading. The legacy `date` query remains supported.

## Verification

- `services/mes-master-data-service`: 41 unit tests pass.
- `e2e/resource-planning/labor-calendar-smoke.spec.ts`: pass, including Work Center filtering, calendar loading, conflict validation, form entry, and return to calendar.
- `e2e/resource-planning/resource-planning-flow.spec.ts`: authorization/resource-planning smoke remains passing; skipped scenarios were fixture-gated by the existing test.
- Docker services rebuilt and redeployed; `mes-master-data-service` health is `ok`, Kafka and print-station runtime connections are connected, and the console returns HTTP 200.
