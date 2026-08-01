# Audit and Improve Item Revision Effective Date-Time Handling

## Objective

Audit and improve the complete **Item & Revision** lifecycle so that revision validity is managed using precise effective date-time ranges, including:

```text
YYYY-MM-DD HH:mm:ss

Use a half-open validity interval:

[effective_from, effective_to)

This means:

effective_from <= target_time < effective_to

The previous revision must stop being effective at the exact moment the new revision starts.

Example:

Revision R1
effective_from = 2026-01-01 08:00:00
effective_to   = 2026-07-30 14:30:00

Revision R2
effective_from = 2026-07-30 14:30:00
effective_to   = NULL

At exactly:

2026-07-30 14:30:00

R1 is no longer effective and R2 becomes effective.

The user must only provide effective_from when creating a new revision. The backend must automatically maintain effective_to for the surrounding revision records.

The frontend and backend must use the same temporal rules, validation semantics, timezone policy, and precision.

1. Audit the Existing Item Revision Implementation

Inspect the complete Item & Revision flow across:

MES Console
mes-master-data-service
database schema
migrations
repositories
domain services
API request/response contracts
Item Revision selectors
Production Version
Work Order creation
Work Order snapshots
Kafka events
seed data
documentation
AI_CONTEXT.md

Search for:

effective_from
effective_to
EffectiveFrom
EffectiveTo
Date
DateTime
timestamp
timestamp with time zone
timestamp without time zone
new Date(
Date.parse
toISOString
startOfDay
endOfDay
CURRENT_DATE
CURRENT_TIMESTAMP
NOW()

Identify:

current database column types;
whether effective_to already exists;
whether time is currently discarded;
whether the UI sends local time or UTC;
whether the backend parses date-only values;
whether comparisons are inclusive or exclusive;
whether current-revision queries rely only on effective_to IS NULL;
whether multiple revisions can overlap;
whether a new revision closes the previous revision;
whether future-dated revisions are supported;
whether Item Revision dropdowns use current time correctly;
whether Production Version and Work Order flows resolve revisions consistently.

Create an audit matrix:

Layer
Current behaviour
Temporal precision
Timezone behaviour
Validation
Risk
Required change
Verification evidence

Do not assume the current UI and backend use the same timezone or boundary semantics. Verify them.

2. Define the Authoritative Temporal Model

Use this authoritative interval model:

[effective_from, effective_to)

Rules:

effective_from is inclusive.
effective_to is exclusive.
effective_to = NULL means the revision has no scheduled end.
Two revisions for the same Item must never overlap.
Adjacent revisions should normally share the same boundary:
previous.effective_to = next.effective_from
Do not subtract one second, one millisecond, or one day.
Store and compare with at least second-level precision.
Preserve higher database precision consistently if the platform stores microseconds, but the business UI may expose seconds only.
All authoritative boundary calculations must happen in the backend.
UI validation must mirror backend validation but cannot replace it.

Example:

R1: [2026-01-01 08:00:00, 2026-07-30 14:30:00)
R2: [2026-07-30 14:30:00, NULL)

At:

2026-07-30 14:29:59

R1 is effective.

At:

2026-07-30 14:30:00

R2 is effective.

3. Establish an Explicit Timezone Policy

Do not implement date-time support without defining timezone semantics.

Recommended policy:

UI input:
Site-local date and time

API:
ISO 8601 datetime with explicit offset

Backend/database:
UTC instant

Display:
Converted back to the configured Site timezone

Example UI value in Vietnam:

2026-07-30 14:30:00
Asia/Ho_Chi_Minh

API value:

2026-07-30T14:30:00+07:00

Persisted UTC value:

2026-07-30T07:30:00Z

Required rules:

Never send an ambiguous datetime such as:
2026-07-30T14:30:00

without a timezone or offset.

Do not assume browser timezone is the same as Site timezone.
Do not derive manufacturing effectivity from the developer machine or container timezone.
The Site timezone must be authoritative when the Item Revision belongs to a Site-specific context.
If Item Revision is globally managed rather than Site-specific, define and document one organisation-level timezone.
All backend comparisons must occur using normalised instants, preferably UTC.
API responses must include an explicit timezone offset or Z.

If the current architecture has no Site or organisation timezone configuration, add a clearly documented temporary default and mark it for configuration rather than silently using the server timezone.

4. Database Migration

Add or correct the Item Revision temporal columns.

Recommended schema:

effective_from TIMESTAMPTZ NOT NULL
effective_to   TIMESTAMPTZ NULL

If the current database uses another equivalent timezone-aware type, document the exact semantics.

Required constraint:

effective_to IS NULL
OR effective_to > effective_from

Do not allow:

effective_to = effective_from
effective_to < effective_from

unless a zero-duration historical record is explicitly supported, which is not recommended.

Existing data migration

For each Item:

Sort revisions by effective_from ASC.
Set each historical revision's effective_to to the next revision's effective_from.
Keep the last chronological revision's effective_to = NULL.
Preserve exact times if available.
If legacy records contain date-only values, use the documented default time consistently.
Generate a reconciliation report for duplicates, invalid ordering, and ambiguous records.

Example:

Before:

R1 effective_from = 2026-01-01 08:00:00
R2 effective_from = 2026-03-01 09:15:00
R3 effective_from = 2026-06-01 13:00:00

After:

R1 effective_to = 2026-03-01 09:15:00
R2 effective_to = 2026-06-01 13:00:00
R3 effective_to = NULL

Do not simply select the highest revision code. Chronology must be based on effective_from, subject to revision sequence validation.

Generate findings for:

duplicate effective_from values
multiple open-ended revisions
effective_to before effective_from
overlapping ranges
out-of-order revision codes
missing effective_from
ambiguous timezone data
date-only legacy values
revisions referenced by Production Versions or Work Orders

Do not silently rewrite Work Order snapshots or immutable historical event data.

5. New Revision Creation Transaction

Creating a revision must be an atomic backend operation.

The request should contain:

{
  "revision_code": "R2",
  "effective_from": "2026-07-30T14:30:00+07:00"
}

The user must not normally provide effective_to.

Within one database transaction:

1. Lock the Item and relevant Item Revision rows.
2. Validate the new effective_from.
3. Find the chronological previous revision.
4. Find the chronological next revision, if future revisions already exist.
5. Update surrounding effective_to boundaries.
6. Insert the new revision.
7. Revalidate that no intervals overlap.
8. Commit.

Do not perform:

update previous revision

and:

insert new revision

as separate non-transactional requests.

Use row locking, serialisable isolation, advisory locking, or another repository-approved concurrency strategy to prevent two users from creating overlapping revisions concurrently.

6. Support Both Append and Insert-in-the-Middle Cases

The implementation must not assume every new revision is later than all existing revisions.

Case A — Append after the latest revision

Existing:

R1: [2026-01-01 08:00:00, NULL)

Create:

R2 effective_from = 2026-07-30 14:30:00

Result:

R1: [2026-01-01 08:00:00, 2026-07-30 14:30:00)
R2: [2026-07-30 14:30:00, NULL)
Case B — Insert between two scheduled revisions

Existing:

R1: [2026-01-01 08:00:00, 2026-12-01 08:00:00)
R3: [2026-12-01 08:00:00, NULL)

Create:

R2 effective_from = 2026-07-01 12:00:00

Result:

R1: [2026-01-01 08:00:00, 2026-07-01 12:00:00)
R2: [2026-07-01 12:00:00, 2026-12-01 08:00:00)
R3: [2026-12-01 08:00:00, NULL)
Case C — Insert before the earliest revision

This should be handled explicitly.

Either:

allow historical insertion

with:

new.effective_to = old earliest.effective_from

or reject it according to the business policy.

Do not leave the behaviour undefined.

Case D — Duplicate boundary

Existing revision:

effective_from = 2026-07-30 14:30:00

Creating another revision at exactly the same instant must be rejected:

ITEM_REVISION_EFFECTIVE_FROM_CONFLICT

Two revisions cannot start at the same instant for the same Item.

7. Current, Future, and Historical Revision Semantics

Do not define “current” as only:

effective_to IS NULL

That identifies an open-ended revision, not necessarily the currently effective revision.

At a target instant T, a revision is effective when:

effective_from <= T
AND
(
  effective_to IS NULL
  OR T < effective_to
)

Classify revisions as:

Scheduled:
effective_from > now

Current:
effective_from <= now
AND (effective_to IS NULL OR now < effective_to)

Historical:
effective_to IS NOT NULL
AND effective_to <= now

Example:

R2 effective_from = tomorrow
effective_to = NULL

R2 is Scheduled, not Current.

If R1 is closed at R2's future start:

R1 effective_to = tomorrow

R1 remains Current until that precise boundary.

The UI, backend, APIs, selectors, badges, and reports must use these same rules.

8. Frontend UX Using shadcn

Audit and improve the Item Revision create/edit UI using existing shadcn components.

Use an appropriate combination of:

Popover
Calendar
Input
Button
Form
FormField
FormLabel
FormControl
FormDescription
FormMessage
Alert
Badge
Tooltip

Create or reuse a common date-time input component such as:

EffectiveDateTimePicker

Required fields:

Date
Time: HH:mm:ss
Timezone display

Example:

Effective From
30/07/2026

Time
14:30:00

Timezone
Asia/Ho_Chi_Minh (UTC+07:00)

Requirements:

Use 24-hour HH:mm:ss.
Seconds must be explicitly supported.
Default seconds may be 00, but the user can edit them.
Do not silently discard seconds.
Do not convert the selected local time using the browser timezone when the configured Site timezone differs.
Show the active timezone next to the field.
Serialise to ISO 8601 with an explicit offset.
Preserve the entered value when backend validation fails.
Avoid native browser datetime parsing inconsistencies.
Do not allow manual input formats that the backend interprets differently.

The create form should expose:

Revision Code
Effective From Date
Effective From Time
Timezone

It should not expose editable Effective To during normal new-revision creation.

Show Effective To as system-managed:

Effective To is calculated automatically from the next revision.
9. UI Rule and Backend Rule Mapping

Create one explicit mapping table and implement both sides consistently.

Business rule	UI behaviour	Backend authority
effective_from is required	Required field and FormMessage	Reject missing value
Date and HH:mm:ss are required	Date/time picker validates completeness	Reject invalid or incomplete datetime
Explicit timezone required	Display configured timezone and send offset	Reject ambiguous timestamp where contract requires offset
Duplicate start time is invalid	Pre-check and show field error	Transactionally reject conflict
New revision closes previous revision	Show impact preview	Update previous boundary atomically
New revision may inherit next boundary	Show calculated effective-to preview	Set new.effective_to = next.effective_from
No overlap allowed	Warn before submission	Enforce transactionally
User cannot manually set new effective_to	Do not render editable field	Ignore/reject unauthorised field
Scheduled revision is not Current	Show Scheduled badge	Query with interval predicate
Current boundary is second-precise	Show seconds	Compare full timestamp
Existing WO snapshot remains unchanged	Display informational note	Never rewrite snapshot
Existing Production Version remains linked to its revision	Display dependency warning	Do not remap automatically

Frontend error text and backend error codes must have a one-to-one mapping where possible.

Example:

ITEM_REVISION_EFFECTIVE_FROM_REQUIRED
ITEM_REVISION_EFFECTIVE_FROM_INVALID
ITEM_REVISION_EFFECTIVE_FROM_CONFLICT
ITEM_REVISION_EFFECTIVE_RANGE_OVERLAP
ITEM_REVISION_EFFECTIVE_RANGE_INVALID
ITEM_REVISION_TIMEZONE_REQUIRED
ITEM_REVISION_CONCURRENT_MODIFICATION
ITEM_REVISION_HISTORY_LOCKED

The UI must map these to the relevant field or form-level message rather than showing a generic toast only.

10. Impact Preview Before Creating a Revision

Before submission, the UI should show a read-only preview.

Example:

New revision:
R2 starts at 30/07/2026 14:30:00 Asia/Ho_Chi_Minh

System changes:
R1 Effective To will become 30/07/2026 14:30:00
R2 Effective To will remain open

For insertion between revisions:

R1 Effective To will become 01/07/2026 12:00:00
R2 will be effective until 01/12/2026 08:00:00
R3 will remain unchanged

The preview is advisory only. The backend must recalculate the impact inside the transaction because data may change before submission.

Do not trust previous/next revision IDs supplied by the client as authoritative.

11. Editing Existing Effective Dates

Audit whether effective dates can currently be edited.

Define strict rules.

Draft and unreferenced revision

It may be possible to change effective_from, but the backend must recalculate both neighbouring intervals atomically.

Released or referenced revision

Changing its effective interval can affect:

Production Versions
Work Orders
MBOM validation
material planning
traceability
historical reporting

Therefore:

do not allow unrestricted editing;
require explicit policy and dependency checks;
preserve immutable Work Order snapshots;
record audit history;
use optimistic concurrency;
potentially require a correction workflow instead of direct editing.

Do not support manual effective_to editing unless there is a documented administrative correction flow.

12. Current Revision Resolution API

Create or standardise an API/repository method:

GetEffectiveItemRevision(itemId, effectiveAt)

Predicate:

effective_from <= :effectiveAt
AND (
  effective_to IS NULL
  OR :effectiveAt < effective_to
)

Required behaviour:

zero matches:
return a stable not-effective error;
one match:
return the revision;
more than one match:
treat as a data-integrity incident, not a normal selection result.

Stable errors:

ITEM_REVISION_NOT_EFFECTIVE
ITEM_REVISION_OVERLAP_DETECTED

Do not implement current-revision selection independently in multiple services with slightly different predicates.

Move the canonical predicate into shared domain/repository logic where appropriate.

13. Production Version Integration

Audit Production Version validation and selection.

Production Version must reference a specific Item Revision.

Rules:

do not automatically change an existing Production Version from R1 to R2;
validate Revision effectivity at the appropriate Production Version effective instant;
future-dated R2 may be selected only when the Production Version's own effective context permits it;
do not resolve Revision by effective_to IS NULL;
use the full interval predicate;
show date, time, and timezone in selection details.

Example display:

R2
Scheduled from 30/07/2026 14:30:00
Asia/Ho_Chi_Minh
14. Work Order Integration

Audit Work Order creation and approval.

A Work Order must resolve the Item Revision based on a clearly defined instant, such as:

planned_start_at
release_at
approval_at

Do not use whichever timestamp happens to be available.

Document the selected rule.

Recommended example:

Resolve Production Version and Item Revision using planned_start_at.

Once created or approved, the Work Order must snapshot:

item_revision_id
revision_code
effective_from
effective_to
resolution_timestamp
timezone context

Creating a later Item Revision must never rewrite existing Work Order snapshots.

Test a boundary case:

R1 ends: 14:30:00
R2 starts: 14:30:00

WO at:

14:29:59 → R1
14:30:00 → R2
15. Concurrency and Optimistic Locking

Handle two users creating revisions for the same Item at nearly the same time.

Example:

User A creates R2 at 14:30:00
User B creates R3 at 15:00:00

The final intervals must remain deterministic and non-overlapping.

Use:

row lock
advisory lock
serialisable transaction
structure version
row version

as appropriate.

The backend must recalculate neighbours after acquiring the lock.

Return:

ITEM_REVISION_CONCURRENT_MODIFICATION

when the operation must be retried.

The UI should reload the revision timeline and preserve the user's proposed date-time where possible.

16. Audit and Timeline History

Every automatic boundary change must be auditable.

Record:

item_id
revision_id
old_effective_from
new_effective_from
old_effective_to
new_effective_to
change_reason
triggered_by_revision_id
changed_by
changed_at
correlation_id

Example reason:

AUTO_CLOSED_BY_NEW_REVISION

The Item Revision detail UI should present a timeline:

R1
01/01/2026 08:00:00
→
30/07/2026 14:30:00

R2
30/07/2026 14:30:00
→
Open-ended

Use the configured timezone consistently.

17. Required Automated Tests
Interval boundaries
T = effective_from
→ revision is effective

T = effective_to - 1 second
→ previous revision is effective

T = effective_to
→ previous revision is not effective
→ next revision is effective
Creation
first revision;
append after latest revision;
insert between two revisions;
optionally insert before earliest revision;
duplicate effective start;
past effective start;
future effective start;
second-level boundaries;
invalid date;
invalid time;
missing timezone;
daylight-saving transition for configurable timezones;
concurrent creation.
UI/API mapping
UI sends ISO 8601 with offset;
backend receives the intended UTC instant;
API returns explicit timezone;
UI displays the original Site-local instant;
seconds are preserved;
backend field errors map to the correct FormMessage.
Data integrity
no overlapping ranges;
at most one effective revision at any instant;
open-ended future revision is not incorrectly labelled Current;
previous revision closes exactly at the next start;
no minus one second workaround;
Work Order snapshots remain unchanged;
Production Versions remain attached to their original Revision.
18. Required Browser Verification
Scenario A — Append a new revision

Existing:

R1
Effective From: 01/01/2026 08:00:00
Effective To: Open-ended

Create:

R2
Effective From: 30/07/2026 14:30:15
Timezone: Asia/Ho_Chi_Minh

Expected:

R1 Effective To = 30/07/2026 14:30:15
R2 Effective From = 30/07/2026 14:30:15
R2 Effective To = Open-ended

Refresh the browser and verify seconds remain 15.

Scenario B — Future revision

Create R2 for tomorrow.

Expected:

R1 remains Current until the exact future boundary;
R2 shows Scheduled;
R2 may have effective_to = NULL;
current-revision API returns R1 before the boundary.
Scenario C — Exact boundary

Verify using API or controlled time:

14:30:14 → R1
14:30:15 → R2
Scenario D — Insert between revisions

Create R2 between R1 and R3.

Expected:

R1 closes at R2 start;
R2 closes at R3 start;
R3 start remains unchanged.
Scenario E — Duplicate time

Try to create another revision at the exact same second.

Expected:

ITEM_REVISION_EFFECTIVE_FROM_CONFLICT

with a field-level UI error.

Scenario F — Concurrent browser sessions

Create revisions from two browser sessions.

Expected:

no overlap;
one transaction succeeds or both are serialised correctly;
stale session receives a concurrency error and reloads the timeline.
Scenario G — Work Order snapshot

Create a WO using R1, then create R2.

Expected:

existing WO still references R1;
a WO resolved at or after the R2 boundary uses R2 according to the documented resolution timestamp.

Capture:

screenshots
network requests
API responses
database rows
audit records
service logs
19. Documentation

Create:

process-fix/Item-Revision-Effective-DateTime-Handling.md
implementation-fix/Item-Revision-Effective-DateTime-Implementation.md

Update:

Item & Revision product documentation
Production Version documentation
Work Order resolution documentation
API contracts
database schema documentation
AI_CONTEXT.md

Document explicitly:

Interval semantics: [effective_from, effective_to)
Precision: seconds
UI timezone: Site timezone
API representation: ISO 8601 with explicit offset
Persistence/comparison: UTC
Effective To: system-managed
Revision selection predicate
Concurrency strategy
Historical snapshot policy
Required Execution Order
1. Audit frontend, backend, database, and integrations.
2. Define and document timezone ownership.
3. Define the half-open interval rule.
4. Add or correct effective_to and timezone-aware schema.
5. Reconcile existing data.
6. Implement canonical backend interval utilities.
7. Implement transactional revision creation.
8. Handle previous and next revision boundaries.
9. Add concurrency protection.
10. Create the shared shadcn EffectiveDateTimePicker.
11. Map frontend rules to backend error codes.
12. Update the Item Revision timeline UI.
13. Update current/scheduled/historical status logic.
14. Update Production Version resolution.
15. Update Work Order resolution and snapshot verification.
16. Add unit, integration, migration, and concurrency tests.
17. Run browser verification.
18. Rebuild and recreate affected services.
19. Update documentation and AI_CONTEXT.md.
20. Produce an implementation report with runtime evidence.
Completion Criteria

Do not report completion unless:

effective_from and effective_to support full HH:mm:ss.
The system uses [effective_from, effective_to) consistently.
Previous Revision effective_to equals the new Revision effective_from exactly.
No one-second, millisecond, or one-day subtraction is used.
New Revision creation normally requires only effective_from.
effective_to is calculated by the backend.
Both append and insert-between cases are handled.
Current, Scheduled, and Historical statuses use the full interval predicate.
Future open-ended revisions are not incorrectly treated as Current.
UI sends an explicit timezone offset.
Backend stores and compares normalised instants consistently.
Browser timezone does not silently alter Site-local manufacturing time.
UI field validation maps correctly to backend domain errors.
Duplicate start times and overlaps are rejected transactionally.
Concurrent revision creation cannot corrupt the timeline.
Existing Work Orders retain their original Revision snapshots.
Existing Production Versions are not silently remapped.
Migration reconciles historical intervals and reports ambiguous records.
Automated and browser tests include exact second-level boundaries.
Documentation and AI_CONTEXT.md match the running implementation.

Keep the final status as:

PARTIALLY_IMPLEMENTED

if any Item Revision selector, Production Version flow, Work Order flow, API, or UI screen still uses date-only comparison, server-local timezone assumptions, effective_to IS NULL as the definition of Current, or inconsistent interval boundaries.