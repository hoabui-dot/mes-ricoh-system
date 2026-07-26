# MES Resource Planning Constraints - Phase 2

Date: 2026-07-24
Process source: `process-fix/Complete-MES-Resource-Planning-Constraints-phase-2.md`

## Goal

Phase 1 established the resource hierarchy and effective assignments. Phase 2 adds the planning
configuration needed to answer whether a Routing Operation can run on an eligible resource for a
Product Revision, quantity, date, and shift. It does not allocate a machine or persist a Work Order
resource assignment.

## Audit

| Area | Before Phase 2 | Result |
|---|---|---|
| Resource Capability | Existing table only had Work Center, Operation, capability type, and legacy cycle time | Expanded and verified |
| Resource Calendar | Existing range-based Work Center/Equipment record; no date/shift inheritance | Expanded and verified for the new daily model |
| Production Standard | Existing partial timing/labor fields | Expanded and verified with Equipment/Work Center precedence |
| Skill | Existing catalog and employee skill assignments | Existing and reused |
| Operation Skill Requirement | Existing Operation + Skill + level only | Expanded and verified with Routing Operation/person/mandatory scope |
| Planning readiness | Missing | Implemented and runtime verified |
| Automatic scheduling/allocation | Missing by design | Phase 3 dependency |

## Database

Migration `0019_resource_planning_constraints_phase_2` adds:

- Capability Site/product revision or item-group scope, eligibility, priority, speed factor, lot limits,
  setup family, effective resolution indexes, and database relationship validation.
- Calendar resource type/id, Work Center/Workstation/Equipment support, date, shift, availability status,
  available minutes, capacity factor, reason, note, uniqueness, indexes, and inheritance validation.
- Production Standard Site/routing-operation context, base quantity, yield, source method, sample size,
  valid period, review date, numeric checks, and resolution indexes.
- Operation Skill Requirement Site/routing-operation context, required persons, mandatory flag, active
  flag, effective uniqueness, and resolution indexes.

Migration `0020_resource_planning_demo_fixture_alignment` aligns the existing deterministic demo fixture:
the molding presses are planning resources, the effective calendar covers `2026-08-05`, and the molding
operation requires two people. Existing IDs and released standard records are preserved. Released-standard
backfills temporarily disable user governance triggers within the migration transaction and restore them
before the migration completes.

## Resolution behavior

Capability precedence is deterministic:

1. Product Revision + Operation + Equipment
2. Product Revision + Operation + Work Center
3. Item Group + Operation + Equipment
4. Item Group + Operation + Work Center

An equipment-specific explicit denial is retained as a blocking candidate result. Candidates are ordered
by readiness, capability priority, descending speed factor, then stable equipment/workstation business code.

Calendar resolution is Equipment, then Workstation, then Work Center for the requested date and shift.
No calendar record uses an advisory default-shift fallback of 480 minutes and capacity factor 1.0. A
specific PlannedDown/Holiday record blocks the candidate and never adds capacity to a broader record.

Production Standard resolution is Equipment-specific first, then Work Center-level. Only Released and
effective standards are considered. A Work Center fallback is returned as a warning.

Duration uses decimal numeric values and the formula:

`setup minutes + ((quantity / base quantity) * cycle seconds / capability speed / standard efficiency / equipment efficiency / calendar capacity factor) / 60 + routing queue minutes + routing move minutes`

The readiness response includes the adjusted cycle time, run duration, setup, queue, move, and formula
for diagnostics. The standard efficiency is applied once.

## API

Existing generic CRUD projections now enrich:

- `GET /api/mes/master-data/resource-capabilities`
- `GET /api/mes/master-data/resource-calendars`
- `GET /api/mes/master-data/production-standards`
- `GET /api/mes/master-data/operation-skill-requirements`

The backend-owned planning endpoint is:

`POST /api/mes/master-data/resource-planning/readiness`

It returns `Ready`, `ReadyWithWarnings`, or `Blocked`, the Work Center/Operation identity, candidate
Workstation/Equipment/Assignment, selected Capability, inherited Calendar, selected Production Standard,
skill requirements, duration calculation, blocking error codes, and warnings. It never persists allocation.

Stable blocking codes include `NO_EFFECTIVE_ASSIGNMENT`, `NO_EFFECTIVE_CAPABILITY`,
`CAPABILITY_EXPLICIT_DENY`, `LOT_SIZE_BELOW_MINIMUM`, `LOT_SIZE_ABOVE_MAXIMUM`,
`EQUIPMENT_NOT_AVAILABLE`, `EQUIPMENT_NOT_PLANNING_RESOURCE`, `CALENDAR_UNAVAILABLE`,
`CALENDAR_HOLIDAY`, and `NO_EFFECTIVE_PRODUCTION_STANDARD`.

## Console

Added the following routes and navigation:

- `/master-data/resource-capabilities`
- `/master-data/resource-calendars`
- `/master-data/production-standards`
- `/master-data/operation-skill-requirements`

Each route supports list, create, detail, and edit URL shapes. The shared planning screen uses localized
names as primary identity, business codes as secondary context, shared SelectBase/Button/Card primitives,
backend validation errors, empty/loading/error states, and resource selectors rather than raw UUID inputs.
The resource calendar form distinguishes resource type, resource, date, shift, availability, minutes,
capacity factor, and reason. Employee Schedule remains a separate workflow.

## Verification

- MES master-data build: passed.
- MES master-data unit tests: 2 files, 3 tests passed.
- MES Console build: passed.
- i18n static scan: passed.
- Docker migration `0019` and demo alignment `0020`: applied successfully.
- `mes-master-data-service`: running healthy.
- Capability, Calendar, Production Standard, and Skill Requirement list APIs: HTTP 200.
- Readiness probe for seeded molding operation: HTTP 200, `Ready`.
- Probe returned effective Equipment calendar, Equipment Production Standard, capability, two-person
  skill requirement, deterministic candidate, and duration diagnostics.
- Pre-existing Schema Registry incompatibility warning for `ItemRevisionReleased.v1` remains non-fatal.
- Console test script created at `scripts/test-mes-resource-planning-constraints.mjs`; it performs
  non-destructive health/API/readiness checks and explicitly reports mutation scenarios as documented
  skips when run against the shared demo database.
- Browser visual/click-through review is unavailable in this environment.

## Phase 3 dependencies and exclusions

Not implemented in Phase 2: persistent Work Order resource allocation, automatic finite-capacity
scheduling, machine reservation, operator assignment, kiosk enforcement, actual Equipment confirmation,
OEE calculation, and proof of employee availability. Calendar month rendering, bulk overwrite workflows,
and an isolated destructive test database remain follow-up UX/test hardening; the table CRUD and backend
daily calendar contract are implemented.
