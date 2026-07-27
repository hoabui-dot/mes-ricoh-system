# Fix Production-Version Authority and Derived Site Handling in Work Order Creation

## Background

The Work Order creation workflow currently fails with an error similar to:

```text
no Production Version found for Item at Site ...
cannot scan NULL into *string

The MES Console already selects a specific Production Version, but the MES Execution workflow still appears to use obsolete logic:

Item Revision + Site
→ search for a Production Version

This is inconsistent with the confirmed domain model.

The correct model is:

User selects Production Version
→ backend loads that exact Production Version by ID
→ backend derives Item Revision
→ backend derives MBOM
→ backend derives Routing
→ backend derives execution Site
→ backend derives UOM and other execution context
→ backend creates immutable Work Order snapshots

Site remains useful as an execution snapshot for planning, Work Centers, shifts, calendars, permissions, resource allocation, numbering, and reporting.

However:

Site must not be selected independently in the Work Order form.
Site must not be trusted from the client.
Site must not be used together with Item Revision to guess a Production Version.
The selected production_version_id must be authoritative.

There is also a separate repository mapping defect where a nullable database column is scanned into a non-null Go string, and the resulting scan error is incorrectly presented as “Production Version not found”.

Objective

Audit and fix the complete Work Order creation workflow so that:

Production Version ID is the only authoritative production-configuration selection.
Item Revision, MBOM, Routing, Site, UOM, and display data are derived server-side.
Site remains an execution snapshot but is not independently user-controlled.
No repository query guesses a Production Version from Item Revision and Site.
Nullable database fields are mapped safely.
Database scan errors are not reported as business not found errors.
WO creation remains fully atomic.
Invalid or incomplete snapshots can never be committed.
Existing valid Work Orders remain readable.
API contracts, read models, events, frontend, tests, and documentation are made consistent.

Do not apply only a frontend patch.

Phase 1 — Audit the Current Code Path

Inspect the actual source before modifying it.

Review at minimum:

services/mes-console
services/mes-master-data-service
services/mes-execution-service
Production Version candidate endpoint
Work Order creation workflow endpoint
request DTOs
workflow handlers
repositories
SQL queries
execution read models
Kafka consumers
Production Version projection
Routing projection
WO transaction creation
WO detail hydration
database migrations
tests
AI_CONTEXT.md
implementation reports

Trace the exact flow:

MES Console selection
→ request payload
→ request validation
→ master-data readiness lookup
→ Production Version resolution
→ Site resolution
→ Routing snapshot
→ MBOM explosion
→ WO header insertion
→ outbox insertion
→ response hydration

Search for all obsolete patterns:

findProductionVersionByItemAndSite
item_revision_id AND site_id
no Production Version found for Item at Site
production-ready-item-revisions
site_id from client
ProductionVersionID optional
first Production Version for Item
default Production Version lookup

Also find every database scan involving nullable text fields in the Production Version and WO creation flow.

Phase 2 — Establish the Authoritative Request Contract

The preferred Work Order creation request must be Production Version-centred.

Example:

{
  "production_version_id": "6078638c-4e6f-4a1b-b235-9c1c1b09c164",
  "quantity": 2,
  "target_completion_date": "2026-08-01"
}

Include other genuinely user-authored values only when required.

The client must not authoritatively submit:

item_revision_id
mbom_id
routing_id
site_id
uom_id
item_code
item_name
production_version_name

These values must be resolved from the selected Production Version and snapshotted by the backend.

Backward compatibility

If old clients still submit derived fields:

load the selected Production Version first;
derive the authoritative values;
compare submitted legacy values;
reject any mismatch;
ignore matching redundant values after validation.

Return:

WORK_ORDER_PRODUCTION_VERSION_CONTEXT_MISMATCH

with structured details such as:

{
  "field": "site_id",
  "expected": "...",
  "received": "..."
}

Do not silently accept mismatched context.

Phase 3 — Load Production Version by ID Only

Replace any flow equivalent to:

SELECT ...
FROM production_version
WHERE item_revision_id = $1
  AND site_id = $2
LIMIT 1;

with:

SELECT ...
FROM production_version
WHERE id = $1;

Then validate:

Production Version exists
lifecycle = Released
effective for target date
quantity fits min/max lot size
Item Revision exists and is Released
MBOM exists and is Released
Routing exists and is Released
Routing contains valid Released operations
required planning standards exist

Do not fall back to another Production Version when the selected one is invalid.

Do not select the first or default Production Version for the same Item Revision.

Phase 4 — Define Site Ownership Correctly

Site is an execution context, not an independent WO configuration selector.

Use this ownership rule:

Production Version
→ references Released Routing
→ Routing Operations reference Work Centers
→ Work Centers resolve one consistent Site
→ that Site becomes Production Version execution Site
→ WO snapshots the same Site

The implementation must determine the current canonical source already established in the codebase.

Required validation:

every active Routing Operation has a Work Center;
every Work Center resolves to a Site;
all Routing Work Centers resolve to exactly one Site;
the Production Version execution Site matches that resolved Site;
MBOM Site, when MBOM remains site-scoped, is compatible with that Site;
the WO snapshots the resolved Site;
the frontend never chooses or overrides it.

If Routing Operations span multiple Sites, reject release or WO creation with:

ROUTING_SITE_CONTEXT_AMBIGUOUS

Do not choose the first Work Center Site.

Phase 5 — Update the Work Order Creation UI

The Create Work Order form must show:

Production Version
Quantity
Target Completion Date

After selecting a Production Version, display a read-only derived summary:

Production Version name/code
Item Revision
MBOM
Routing
Execution Site
Base UOM
Validity
Lot-size range
Readiness

Site may be displayed for transparency, but it must be clearly marked as:

Derived execution site

It must not be an editable selector or hidden user-authored form field.

Changing Production Version must atomically replace all derived context.

Do not retain stale Site, Item Revision, MBOM, Routing, or UOM state from the previously selected option.

Phase 6 — Fix Nullable Database Mapping

The error:

cannot scan NULL into *string

must be fixed at its actual source.

Audit every selected column in:

Production Version repository
candidate query
execution read-model query
WO creation readiness query
WO detail hydration
snapshot hydration

For every nullable database column, use the repository’s approved nullable mapping:

sql.NullString
*string
pgtype.Text

or COALESCE only when a real domain fallback is valid.

Do not use COALESCE(column, '') merely to hide inconsistent data.

Likely nullable candidates include:

localized name
description
valid_to
routing display context
site display fields
legacy snapshot fields
optional codes
optional event-projected metadata

Add tests with actual NULL values.

Phase 7 — Correct Error Semantics

Do not convert every repository error into:

Production Version not found

Handle errors separately.

No row
sql.ErrNoRows
→ PRODUCTION_VERSION_NOT_FOUND
→ HTTP 404 or project-standard business status
Invalid lifecycle or compatibility
PRODUCTION_VERSION_NOT_RELEASED
PRODUCTION_VERSION_NOT_EFFECTIVE
PRODUCTION_VERSION_LOT_SIZE_INVALID
PRODUCTION_VERSION_ROUTING_NOT_READY
PRODUCTION_VERSION_MBOM_NOT_READY
PRODUCTION_VERSION_SITE_CONTEXT_INVALID
Database mapping/query failure
WORK_ORDER_MASTER_DATA_QUERY_FAILED

Return HTTP 500 and preserve the underlying error in structured server logs.

Do not expose raw SQL internals to the end user.

The workflow UI should show a safe message and correlation/reference ID.

Phase 8 — Make WO Creation Fully Atomic

The Work Order transaction must include:

WO header
Production Version identity snapshot
Item Revision snapshot
MBOM identity snapshot
Routing identity snapshot
Routing Operation snapshots
planning snapshots
material requirements
workflow state
audit record
MES.Execution.WOCreated outbox event

All writes must commit together.

Rollback when:

Production Version cannot load
derived Site is unresolved
Routing has zero operations
an Operation cannot resolve
a planning standard is missing
MBOM explosion fails
nullable hydration fails
outbox insert fails

After rollback, there must be:

no wo_header
no wo_operation
no material requirement
no partial workflow
no outbox event

Idempotent retry must remain safe.

Phase 9 — Update Read Models and Events

Audit the Master Data → Execution Production Version event projection.

Ensure the execution read model contains enough data to resolve a Production Version by ID:

production_version_id
production_version_code
localized name
item_revision_id
mbom_id
routing_id
derived_site_id
base_uom_id
min_lot_size
max_lot_size
valid_from
valid_to
lifecycle_status

Nullable values must remain nullable in the consumer and database schema.

Verify event consumers accept PascalCase, camelCase, or the platform’s canonical envelope only as required by existing compatibility rules.

Do not insert empty UUID strings for missing values.

Use database NULL for optional UUIDs.

Add projection idempotency and ordering tests where relevant.

Phase 10 — Migration and Data Normalisation

Create a forward migration using the next real migration number.

The migration must audit:

Production Versions with missing derived Site
Production Versions whose Site differs from Routing Work Centers
Production Versions referencing missing Routing
Production Versions referencing Routing with zero operations
execution read-model rows with empty-string UUIDs
nullable text columns incorrectly declared non-null
legacy Work Orders with inconsistent PV/Site context

Required actions:

backfill Production Version execution Site only when Routing resolves exactly one Site;
report ambiguous rows instead of guessing;
convert legacy empty strings to NULL where columns are optional;
repair read-model nullability;
preserve valid historical WO snapshots;
do not rewrite approved/completed WO execution context;
do not patch structurally invalid Draft WOs into validity.

Invalid development WOs may be removed only through the existing guarded cleanup workflow, not silently inside a schema migration.

Produce pre/post counts.

Phase 11 — Fix Candidate and Readiness APIs

The Production Version candidate endpoint must return one row per actual Production Version.

It must not require the client to select or supply Site.

Example:

{
  "productionVersionId": "...",
  "productionVersionCode": "PV-FG-CM01-01",
  "productionVersionName": {},
  "itemRevision": {},
  "mbom": {},
  "routing": {},
  "executionSite": {
    "id": "...",
    "code": "SITE-01",
    "name": {}
  },
  "baseUom": {},
  "ready": true,
  "warnings": []
}

The readiness endpoint may validate Site compatibility internally, but the selected Production Version remains authoritative.

Do not expose an option whose Site cannot be derived consistently.

Phase 12 — Tests

Add or update automated tests.

Production Version resolution
loads exact selected Production Version ID;
does not search by Item Revision + Site;
supports multiple Production Versions for one Item Revision;
does not silently select the default or first row;
rejects unknown Production Version ID.
Derived context
derives Item Revision;
derives MBOM;
derives Routing;
derives Site from Routing Work Centers;
derives UOM;
rejects multi-Site Routing;
rejects MBOM/Routing Site incompatibility.
Client tampering
matching legacy derived IDs are accepted only for compatibility;
mismatched Item Revision rejected;
mismatched MBOM rejected;
mismatched Routing rejected;
mismatched Site rejected;
mismatched UOM rejected.
Nullable mapping
nullable Production Version name does not crash legacy hydration;
nullable valid_to works;
nullable optional display fields work;
scan errors return database failure, not not found.
Atomicity
zero Routing Operations rolls back;
missing planning standard rolls back;
MBOM explosion failure rolls back;
outbox failure rolls back;
retry with the same idempotency key creates one WO only.
Frontend
no editable Site field;
selector submits Production Version ID;
derived Site appears read-only;
changing Production Version clears stale context;
backend errors render with the correct workflow stage.
Phase 13 — Runtime Verification

Use a fresh controlled Production Version and WO.

Confirm the Production Version is Released.
Confirm its Routing has Released operations.
Confirm all Routing Work Centers resolve to one Site.
Confirm the candidate API returns the selected Production Version.
Open Create Work Order.
Select the Production Version.
Confirm Site is shown only as derived context.
Submit the WO.
Capture the exact request payload.
Confirm it contains production_version_id.
Confirm the backend loads that exact ID.
Confirm no Item + Site Production Version lookup occurs.
Confirm the WO is created.
Confirm Routing Operations are snapshotted.
Confirm MBOM materials are snapshotted.
Confirm wo_header.site_id equals the derived execution Site.
Confirm no raw nullable scan error occurs.
Run Compute & Check.
Approve in the intended mode.
Start execution.
Verify the Print Station flow still reaches the remote Printer Adapter.

Also test:

invalid Production Version ID
multi-Site Routing
Production Version with zero Routing Operations
nullable legacy localized name
client-supplied mismatched Site
Phase 14 — Documentation

Update the canonical WO section of:

AI_CONTEXT.md
MES Execution README
MES Console README
Production Version documentation
Work Order lifecycle documentation
implementation report
API documentation

Replace obsolete contracts such as:

client sends Item Revision + Site
backend finds Production Version

with:

client selects Production Version
backend derives Item Revision, MBOM, Routing, Site, and UOM

Document clearly:

Site remains an execution snapshot.
Site is not an independent Work Order selection.

Mark older conflicting sections as superseded.

Acceptance Criteria

The issue is fixed only when:

WO creation loads Production Version by selected ID.
No active code path guesses Production Version from Item Revision and Site.
Site is not editable or authoritative in the WO form.
Site is derived from the selected Production Version/Routing context.
WO still snapshots site_id for execution and planning.
Client-supplied mismatched context is rejected.
Nullable fields no longer cause scan failures.
not found and database scan errors are reported separately.
Routing with zero operations cannot create a WO.
Every failed creation rolls back completely.
Existing valid WOs remain readable.
Candidate/readiness APIs are Production Version-centred.
Automated tests pass.
Migrations pass.
Builds pass.
Browser/API runtime verification passes.
The remote physical-print flow has no regression.
Canonical documentation is updated.
Required Final Report

Provide:

Root causes

List:

obsolete Item + Site lookup
client-controlled Site
nullable scan failure
incorrect error wrapping
projection/schema mismatch
partial transaction risk
Contract changes

Show old and new request payloads.

Site ownership

Explain:

where Site is derived
where Site is stored
why Site is still needed
why users do not select it
Database and migration

Report:

migration number
rows audited
rows backfilled
ambiguous rows
nullability changes
legacy empty-string repairs
Runtime evidence

Provide:

selected Production Version ID
derived Item Revision
derived MBOM
derived Routing
derived Site
created WO ID
operation snapshot count
material requirement count
Compute & Check result
Error verification

Demonstrate that:

missing row
≠
nullable scan error
≠
invalid lifecycle
≠
site compatibility error

Do not report completion while the Work Order workflow still performs a Production Version lookup by Item Revision and Site or while raw nullable database values can be misreported as “Production Version not found”.