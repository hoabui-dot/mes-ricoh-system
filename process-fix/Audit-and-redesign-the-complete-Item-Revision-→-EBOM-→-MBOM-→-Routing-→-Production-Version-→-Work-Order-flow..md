Audit and redesign the complete Item Revision → EBOM → MBOM → Routing → Production Version → Work Order flow.

The main objective is to restore and enforce explicit product-revision ownership across engineering structure, manufacturing structure, routing, and execution.

This task must focus only on the required domain relationships, lifecycle rules, Work Order material-operation mapping, and controlled data migration.

Do not add unrelated fields, duplicate identifiers, speculative entities, or generic abstractions that are not required to enforce the confirmed manufacturing flow.

# 1. Business requirement

Each EBOM, MBOM, and Routing defines how one specific finished-good or semi-finished-good Item Revision is designed, manufactured, or executed.

The required ownership model is:

```text
Item
  └── Item Revision
        ├── EBOM versions
        ├── MBOM versions
        ├── Routing versions
        └── Production Versions

An Item Revision is the exact engineering version of the output product.

Therefore:

EBOM must identify the output Item Revision.
MBOM must identify the output Item Revision.
Routing must identify the output Item Revision.
Production Version must combine an Item Revision with an MBOM and Routing that belong to that same Item Revision.
A Work Order must be created from one authoritative Production Version.

Do not add a duplicate item_id to EBOM, MBOM, or Routing when item_revision_id already identifies the parent Item.

The canonical ownership field should be one Item Revision foreign key per header aggregate.

Use one consistent name according to the current codebase naming convention:

item_revision_id

or:

product_revision_id

Do not introduce both names for the same concept.

2. Mandatory revision rule

The current required business flow is strict:

Item Revision R1
  ├── EBOM for R1
  ├── MBOM for R1
  ├── Routing for R1
  └── Production Version for R1

Item Revision R2
  ├── new EBOM for R2
  ├── new MBOM for R2
  ├── new Routing for R2
  └── new Production Version for R2

A new Item Revision must not directly reuse the same EBOM, MBOM, or Routing records owned by the previous Item Revision.

The UI may support cloning from the previous revision, but cloning must create new Draft records with new primary keys and ownership pointing to the new Item Revision.

Do not repoint or mutate Released EBOMs, MBOMs, or Routings.

Historical Released records must remain immutable.

3. Known architecture conflict

The product-domain documentation defines:

MBOM Header as a manufacturing BOM for one product revision.
Routing Header as a process route for one product revision.
Production Version as the valid combination of Item Revision, MBOM, Routing, and Site.

However, later migrations deliberately removed direct Item Revision ownership from MBOM and Routing and made Production Version the only place where these independent records are combined.

The current model is effectively:

Item Revision ─┐
MBOM ──────────┼── Production Version
Routing ───────┘

The required target model is:

Item Revision
  ├── EBOM
  ├── MBOM
  └── Routing

Production Version
  └── validates and selects compatible versions owned by the same Item Revision

Treat this as a controlled correction of an existing architecture decision.

Do not silently change schema based only on documentation. Inspect and classify the current source, migrations, handlers, tests, runtime data, and execution projections first.

4. Source-of-truth procedure

Before implementing anything:

Read AI_CONTEXT.md.
Read the relevant product catalogs:
product and MBOM catalog
routing and standards catalog
ERD and validation matrix
Read the historical decoupling implementation and migration records.
Inspect current source code under:
services/mes-master-data-service
services/mes-execution-service
services/mes-console
Inspect:
Drizzle schemas
SQL migrations
database constraints and triggers
repositories
API handlers
release validators
Production Version readiness logic
EBOM-to-MBOM conversion
Work Order creation and explosion
execution read models and event consumers
seed scripts
reset and verification scripts
Inspect the running database before designing the migration.
Record all findings using the repository evidence statuses.
Running source and database schema override historical prompts.
5. Required current-state audit

Produce a matrix before implementation:

Aggregate	Current ownership field	Intended ownership	Current lifecycle	Production Version relationship	WO usage	Migration risk
Item Revision						
EBOM Header						
MBOM Header						
Routing Header						
Production Version						
Work Order snapshot						

Also enumerate:

all current foreign keys
all unique indexes
all triggers
all release guards
all API request and response contracts
all frontend selectors and filters
all events containing EBOM, MBOM, Routing, Production Version, or Item Revision references
all read models that must be updated
all seed and verification scripts depending on the decoupled model

Do not start schema migration until this inventory is complete.

6. Target aggregate model
6.1 Item Revision

Item Revision remains the authoritative version of a finished-good, semi-finished-good, or other Item.

Only finished-good and semi-finished-good revisions may be manufacturing outputs for:

EBOM
MBOM
Routing
Production Version
Work Order

Raw-material revisions must not be accepted as output products.

Do not add manufacturing structure ownership to the Item base record.

Ownership is revision-specific.

6.2 EBOM Header

EBOM must retain or enforce:

item_revision_id NOT NULL

Meaning:

This engineering BOM defines the engineering structure of this output Item Revision.

Requirements:

output revision must exist
output Item type must be finished good or semi-finished good
output revision must satisfy current site/lifecycle rules
Released EBOM is immutable
new Item Revision requires a new EBOM
tree lines continue to reference component Item Revisions
EBOM lines must not use the output ownership field as component identity
6.3 MBOM Header

Restore explicit output ownership:

item_revision_id NOT NULL

Meaning:

This manufacturing BOM defines the material structure and quantity basis required to produce this output Item Revision.

Do not add a second item_id.

Preserve existing MBOM fields that have separate business meaning:

Site
business version
purpose
base quantity
base UOM
effective dates
localized metadata
lifecycle
structure version

Requirements:

output revision must be FG or SFG
output revision must be consistent with Site rules
base UOM must be compatible with the output revision
Released MBOM is immutable
new output revision requires a new MBOM record
MBOM component lines continue to reference component Item Revisions
one output Item Revision may own multiple MBOM versions by Site, purpose, or business version

Do not remove Production Version.

Production Version still chooses which Released MBOM version is authoritative for a manufacturing configuration.

6.4 Routing Header

Restore explicit output ownership:

item_revision_id NOT NULL

Meaning:

This routing defines the manufacturing operation flow for this output Item Revision.

Do not add Item Revision ownership to the generic Operation Catalog.

Maintain the separation:

Operation Catalog
  = reusable operation definition

Routing
  = ordered operation flow for a specific output Item Revision

Requirements:

output revision must be FG or SFG
Routing must belong to one output revision
Released Routing is immutable
new output revision requires a new Routing
operations, predecessor graph, Work Centers, standards, capabilities, and skills remain under their current proper aggregates
do not duplicate Routing ownership into every Routing Operation unless already required by the parent foreign key
6.5 Production Version

Production Version remains the authoritative configuration selected for Work Order creation.

Retain the existing necessary references:

item_revision_id
mbom_header_id
routing_header_id
site_id

Do not add duplicate output fields.

Enforce:

production_version.item_revision_id
    = mbom_header.item_revision_id
    = routing_header.item_revision_id

Also enforce the authoritative Site relationship according to the audited current Site model.

Production Version responsibilities:

select one Released/effective Item Revision
select one Released/effective MBOM owned by that revision
select one Released/effective Routing owned by that revision
validate Site consistency
validate lot/effectivity/default rules already supported by the schema
validate material issue-operation mapping
act as the only configuration ID submitted by Work Order creation

Production Version must not be used to legitimize arbitrary combinations of unrelated MBOMs and Routings.

7. EBOM-to-MBOM conversion

Audit and correct the conversion flow.

Current required result:

EBOM for Item Revision R1
    → Convert
MBOM Draft for Item Revision R1

The created MBOM must inherit the same output Item Revision ownership from the source EBOM.

Do not infer the output revision from component lines.

Do not create an ownerless MBOM.

Preserve:

source EBOM identity
source EBOM line traceability
source immutability
Site derivation rules
new MBOM primary key
Draft lifecycle

The conversion must fail if the source EBOM output revision is invalid for manufacturing output.

8. issue_operation_id business meaning

Do not remove or rename issue_operation_id without first auditing every current dependency.

Its business meaning is:

The generic manufacturing Operation at which an MBOM component is issued, scanned, staged, or backflushed.

It is not automatically the same as a Routing Operation row.

Maintain the distinction:

md_operation.id
  = reusable Operation Catalog identity

md_routing_operation.id
  = one occurrence of an Operation inside one specific Routing

The MBOM field may remain a generic Operation reference if the selected Routing resolves it unambiguously.

9. Required issue-operation validation

When a Production Version combines an MBOM and Routing, validate every active MBOM line that has an issue operation.

For each MBOM line:

matchingRoutingOperations =
  selectedRouting.currentOperations
    where routingOperation.operation_id
      = mbomLine.issue_operation_id

Required result:

count(matchingRoutingOperations) = 1

Failure cases:

0 matches
  → the selected Routing does not contain the MBOM issue Operation

more than 1 match
  → the generic issue Operation is ambiguous in the selected Routing

Use stable errors such as:

MBOM_ISSUE_OPERATION_NOT_IN_ROUTING
MBOM_ISSUE_OPERATION_AMBIGUOUS_IN_ROUTING
MBOM_ISSUE_OPERATION_INACTIVE
MBOM_ISSUE_OPERATION_SITE_MISMATCH
MBOM_ISSUE_OPERATION_WORK_CENTER_MISSING

Reuse existing error conventions where equivalent codes already exist.

Do not introduce a new mapping table unless source audit proves that repeated Operation occurrences are a real supported requirement that cannot be handled by validation.

For the current scope, prefer a strict invariant over adding another aggregate.

10. Work Order creation and snapshot flow

Keep the Production-Version-centred Work Order API.

The client should submit only the currently authoritative minimal contract, such as:

production_version_id
quantity
target date

The backend must derive:

Item Revision
MBOM
Routing
Site
output UOM
Routing Operations
MBOM material requirements

Do not allow the client to independently submit and combine Item Revision, MBOM, Routing, or Site IDs.

During Work Order creation:

Load the exact Production Version.
Verify its Item Revision, MBOM, and Routing are still Released and effective.
Verify MBOM and Routing ownership matches the Production Version Item Revision.
Verify Site consistency.
Resolve every MBOM issue_operation_id to exactly one Routing Operation.
Create immutable Work Order operation snapshots.
Explode MBOM lines into immutable material requirement snapshots.
Link every material requirement to the resolved Work Order Operation context.
Store required business facts for staging, manual issue, backflush, traceability, and audit.
Write the Work Order and outbox atomically under the existing transaction boundary.

Audit current execution schema before adding any field.

Reuse existing fields when they already preserve:

generic Operation ID
Routing Operation ID
Work Order Operation ID
Work Center ID
sequence
component revision
MBOM line traceability

Only add a missing field when the current schema cannot preserve the required immutable relationship.

Every added field must have:

a documented business purpose
an identified source
a write path
a read path
a validation rule
a migration strategy
test coverage
11. Material staging and execution

Verify the complete use of issue-operation mapping.

Material staging

For each Work Order material requirement:

MBOM issue Operation
  → resolved Routing Operation
  → Work Order Operation
  → Work Center

WMS staging must use the resolved immutable Work Order context.

Do not perform a fresh ambiguous Operation lookup during staging.

Manual issue and scan

Manual material issue must be accepted only at the Work Order Operation to which the requirement was resolved.

Backflush

When a Work Order Operation is confirmed:

consume only material requirements mapped to that Work Order Operation
apply backflush only where backflush_flag = true
preserve component, lot/label, quantity, UOM, operation, and Work Order traceability
Phantom

Preserve current phantom explosion behavior.

Do not stage or consume a phantom parent as an independent physical demand when its children are the actual requirements, according to the current verified policy.

Do not change phantom semantics as part of this ownership correction unless an existing defect is proven.

12. Controlled migration strategy

This migration must be data-driven and reversible.

Do not create one migration that blindly adds NOT NULL columns and fills arbitrary values.

Use staged migrations.

Phase A — Audit-only

Create a read-only migration audit or script that reports:

MBOM

For every MBOM:

current MBOM ID/code
all Production Versions referencing it
distinct Item Revision IDs from those Production Versions
source EBOM references, if available
Work Order snapshot references
lifecycle
Site
whether ownership is:
uniquely inferable
unreferenced
conflicting
Routing

For every Routing:

current Routing ID/code
all Production Versions referencing it
distinct Item Revision IDs
Work Order snapshot references
lifecycle
resolved Site
whether ownership is:
uniquely inferable
unreferenced
conflicting

The script must write a machine-readable report before mutation.

Phase B — Add nullable ownership columns

Add the canonical Item Revision ownership foreign key to:

md_mbom_header
md_routing_header

Initially nullable.

Do not drop current constraints or old audit data yet.

Add indexes needed for:

owner lookup
owner plus Site
owner plus lifecycle/effectivity
Production Version selector filtering

Do not add indexes unrelated to current query paths.

Phase C — Deterministic backfill
Unique ownership

If all Production Versions referencing one MBOM or Routing point to exactly one Item Revision:

ownership = that unique Item Revision

This is a deterministic backfill.

EBOM-derived MBOM ownership

For an MBOM created from an EBOM, use source conversion trace only when it proves one output Item Revision unambiguously.

Unreferenced records

Do not assign an arbitrary Item Revision.

Classify as:

REQUIRES_MANUAL_REVIEW

or retain nullable ownership until a controlled resolution step.

Conflicting shared records

If one MBOM or Routing is referenced by Production Versions for multiple Item Revisions:

Do not choose one revision.

Perform controlled cloning:

Preserve the original record and audit identity.
Create one clone per distinct output Item Revision.
Clone only the required current structure and children.
Assign each clone to one Item Revision.
Repoint each Production Version to the matching clone.
Preserve lifecycle/effective data according to migration policy.
Record old ID → new ID mappings.
Do not rewrite historical Work Order snapshots.
Do not silently merge or delete records.

Determine whether cloned Released structures should remain Released or require Draft/re-release based on audit and business approval.

Do not make that decision implicitly in code.

Phase D — Validate all relationships

Before adding NOT NULL:

every current EBOM has valid ownership
every current MBOM has valid ownership
every current Routing has valid ownership
every Production Version references matching ownership
every Production Version has consistent Site
every MBOM issue Operation resolves exactly once in its selected Routing
all current Work Order snapshots remain readable
no historical Work Order is repointed

Output a validation report.

Phase E — Enforce constraints

Only after clean validation:

set ownership columns NOT NULL
add foreign keys
add database-level Production Version ownership protection where practical
add uniqueness rules supported by actual business requirements
update triggers that currently derive or validate Site
remove obsolete decoupling behavior only after all application code is migrated

Do not create an overly rigid uniqueness constraint such as one MBOM per Item Revision if multiple versions or Sites are valid.

Phase F — Cleanup

Only after runtime verification:

remove obsolete selectors and filters based on the ownerless model
remove obsolete migration compatibility code
retain migration audit tables and ID mappings according to repository audit policy
do not delete historical evidence needed to explain repointed Production Versions
13. Transaction and concurrency requirements

Any migration step that clones and repoints records must be transactional at the smallest safe ownership unit.

Use:

row locking
deterministic ordering
idempotent migration markers
conflict detection
pre/post counts
rollback on partial failure

Do not hold one uncontrolled transaction across the entire production dataset if it creates unacceptable locking risk.

Application writes during transitional deployment must not create new ownerless records.

Use a compatible deployment sequence:

additive nullable schema
dual-compatible backend
backfill and clone
validation
constraint enforcement
frontend rollout
cleanup

Document whether writes must be temporarily paused during the final enforcement phase.

14. API changes

Audit current API names before changing them.

Required behavior:

EBOM create/update
require output Item Revision
prevent changing output revision after release
filter/select only eligible FG/SFG revisions
MBOM create/update
require output Item Revision
return output Item Revision business identity
filter MBOM lists by output Item Revision when requested
prevent changing output revision after release
EBOM conversion must assign ownership automatically
Routing create/update
require output Item Revision
return output Item Revision business identity
prevent changing output revision after release
Production Version create/update

The backend must verify:

selectedItemRevision.id
  = selectedMBOM.item_revision_id
  = selectedRouting.item_revision_id

Do not rely only on frontend filtering.

15. MES Console changes

Update the UI only after backend contracts are authoritative.

EBOM

Display:

output Item
output Revision
Site
lifecycle
version or code
MBOM

Create and edit must require:

output Item Revision
only FG/SFG revisions
Site according to authoritative current rules
base output quantity and UOM

The detail screen must clearly distinguish:

Output Product Revision

from:

Component Revisions
Routing

Create and edit must require:

output Item Revision
Site or derived Site according to the audited model
Routing version/type
operation flow

Do not allow a Routing to exist without output product context.

Production Version

After selecting the Item Revision:

show only MBOMs owned by that Item Revision
show only Routings owned by that Item Revision
clear incompatible selections when Item Revision changes
refetch current lists
show validation errors when legacy or migrated data conflicts

Frontend filtering is UX assistance only.

Backend constraints remain authoritative.

Item Revision successor flow

When creating a successor Revision, optionally offer:

Clone EBOM
Clone MBOM
Clone Routing

Each selected option must create a new Draft owned by the successor Revision.

Do not reuse the old IDs.

Do not make cloning automatic without explicit user confirmation unless the product flow already mandates it.

16. Lifecycle rules

For EBOM, MBOM, and Routing:

Draft
editable
ownership required
structure/operations may change
may be deleted only according to current dependency policy
In Review
apply current permission and review policy
ownership cannot change
Released
immutable
ownership cannot change
cannot be repointed to another Item Revision
changes require a new version or successor copy
Obsolete/Inactive
not selectable for new Production Versions
historical references remain valid

Do not collapse lifecycle states or invent new lifecycle values.

17. Validation and stable errors

Use existing error conventions where possible.

Required categories include:

EBOM_OUTPUT_REVISION_REQUIRED
EBOM_OUTPUT_RAW_MATERIAL_NOT_ALLOWED
MBOM_OUTPUT_REVISION_REQUIRED
MBOM_OUTPUT_RAW_MATERIAL_NOT_ALLOWED
ROUTING_OUTPUT_REVISION_REQUIRED
ROUTING_OUTPUT_RAW_MATERIAL_NOT_ALLOWED

PRODUCTION_VERSION_MBOM_REVISION_MISMATCH
PRODUCTION_VERSION_ROUTING_REVISION_MISMATCH
PRODUCTION_VERSION_SITE_MISMATCH

MBOM_ISSUE_OPERATION_NOT_IN_ROUTING
MBOM_ISSUE_OPERATION_AMBIGUOUS_IN_ROUTING
MBOM_ISSUE_OPERATION_WORK_CENTER_MISSING

RELEASED_EBOM_IMMUTABLE
RELEASED_MBOM_IMMUTABLE
RELEASED_ROUTING_IMMUTABLE

Do not create duplicate error codes if equivalent stable codes already exist.

Return structured error details containing relevant IDs and business codes, but do not expose raw internal SQL errors to the UI.

18. Events and read models

Audit all existing master-data events.

Meaningful ownership changes must update event contracts while preserving compatibility.

Events for EBOM, MBOM, Routing, and Production Version should carry enough identity for consumers to know:

aggregate ID
output Item Revision ID
output Item code/revision code where current event conventions allow snapshots
Site
lifecycle
version
correlation and audit context

Do not modify an existing versioned event incompatibly.

Use additive fields only when schema compatibility allows them; otherwise publish a new event version.

Update execution read models so Work Order creation can validate ownership without cross-service database access.

Do not introduce direct execution-service reads of the master-data database.

19. Seeds and test data

Update seeds so every production-ready fixture has a complete coherent set:

Released Item Revision
Released EBOM owned by that Revision
Released MBOM owned by that Revision
Released Routing owned by that Revision
Released Production Version combining the same Revision
valid issue-operation mapping
valid Production Standards
valid capabilities/resources/calendars

Do not preserve old ownerless demo fixtures as valid production-ready data.

Reset scripts must:

preserve historical production records
clean only documented development fixtures
record pre/post counts
never guess ownership for ambiguous records
20. Required tests
Ownership tests
Create EBOM without output revision → rejected.
Create MBOM without output revision → rejected.
Create Routing without output revision → rejected.
Raw-material revision as output → rejected.
Released ownership cannot be changed.
Item Revision R2 cannot select R1 MBOM in Production Version.
Item Revision R2 cannot select R1 Routing in Production Version.
Production Version with matching ownership succeeds.
EBOM conversion tests
Convert EBOM R1 → MBOM Draft owned by R1.
Conversion preserves source-line traceability.
Conversion does not mutate source EBOM.
Invalid output revision blocks conversion.
Issue-operation tests
MBOM issue Operation exists exactly once in Routing → valid.
Issue Operation absent from Routing → rejected.
Issue Operation appears twice in Routing → rejected as ambiguous.
Resolved Routing Operation lacks Work Center → rejected.
Work Order material snapshot links to the correct WO Operation.
Manual issue at the wrong WO Operation → rejected.
Backflush consumes only requirements mapped to the confirmed operation.
WMS staging uses the resolved Work Center snapshot.
Revision tests
Create successor Item Revision.
Clone EBOM → new ID, new owner, Draft.
Clone MBOM → new ID, new owner, Draft.
Clone Routing → new ID, new owner, Draft.
Original Released structures remain unchanged.
New Production Version uses only successor-owned structures.
Migration tests
Unique referenced owner is backfilled deterministically.
Unreferenced record remains unresolved instead of receiving a guessed owner.
Shared MBOM is cloned per Item Revision and Production Versions are repointed.
Shared Routing is cloned per Item Revision and Production Versions are repointed.
Migration is idempotent.
Migration rollback leaves no partial clone/repoint state.
Historical Work Order snapshots are unchanged.
Pre/post row counts and ID mappings are recorded.
Constraint enforcement fails when unresolved rows remain.
Regression tests
Existing valid Work Order creation still succeeds using only production_version_id.
Production readiness remains strict.
MBOM component/substitute CRUD still works.
Routing standards and resource planning still work.
Released master data remains immutable.
MES Console selectors refresh immediately after create/clone/release.
21. Verification procedure

After implementation:

Run master-data typecheck/tests.
Run execution Go tests.
Run MES Console typecheck/build.
Run migration dry-run against a database copy.
Review the generated ownership audit.
Run deterministic migration in development/demo.
Run post-migration validation.
Verify foreign keys, indexes, triggers, and row counts.
Rebuild and recreate affected containers.
Verify service health.
Verify live APIs.
Run Item Revision → EBOM → MBOM → Routing → Production Version → WO E2E.
Verify material staging and operation backflush.
Run git diff --check.
Record exact evidence and unresolved gaps.

Do not report the redesign as fully verified from compilation alone.

22. Deliverables
Current-state ownership and dependency audit.
Architecture decision record explaining why explicit Item Revision ownership is restored.
Controlled migration plan and dry-run audit script.
Additive ownership schema migration.
Deterministic backfill and clone/repoint migration.
Post-migration validation script.
Updated EBOM contracts.
Updated MBOM contracts.
Updated Routing contracts.
Updated Production Version validation.
Correct issue-operation-to-Routing-operation validation.
Correct immutable Work Order material-operation snapshots.
MES Console selector and workflow updates.
Updated events/read models.
Updated seeds and reset scripts.
Automated regression and E2E tests.
Implementation report under implementation-fix/.
Updated AI_CONTEXT.md containing only implemented and verified facts.
23. Non-goals and prohibited changes

Do not:

add item_id when item_revision_id already identifies the Item
add both product_revision_id and item_revision_id
add a new Product Recipe aggregate
merge EBOM and MBOM
attach product ownership to the generic Operation Catalog
replace Production Version
allow the client to assemble arbitrary WO configuration IDs
change phantom or substitute semantics without proven need
add a Production Version material mapping table unless ambiguity is proven as a supported requirement
rewrite historical Work Order snapshots
assign arbitrary owners during migration
delete ambiguous legacy data
bypass lifecycle validation
weaken Production Version readiness to make migration pass
add unrelated planning, purchasing, costing, warehouse, or quality fields
redesign unrelated UI modules
perform cross-service database reads

Every schema field added or restored must directly support one of these confirmed invariants:

EBOM belongs to one output Item Revision.
MBOM belongs to one output Item Revision.
Routing belongs to one output Item Revision.
Production Version combines matching ownership.
Work Order snapshots the resolved configuration.
MBOM material requirements resolve to one concrete WO Operation.
24. Acceptance criteria

The work is accepted only when:

every current EBOM has explicit output Item Revision ownership
every current MBOM has explicit output Item Revision ownership
every current Routing has explicit output Item Revision ownership
no new ownerless EBOM, MBOM, or Routing can be created
Production Version rejects mismatched ownership
a successor Item Revision cannot reuse the same structure IDs
cloning creates new Draft structures
EBOM conversion creates an MBOM owned by the same Item Revision
every MBOM issue Operation resolves exactly once in the selected Routing
Work Order material requirements are tied to concrete immutable WO Operation context
WMS staging and backflush use that resolved context
ambiguous legacy ownership is never guessed
shared legacy structures are cloned and repointed with audit mappings
historical Work Order snapshots remain unchanged
migration scripts are idempotent and produce audit evidence
no unrelated schema fields or aggregates are introduced
all affected tests, builds, migrations, runtime checks, and E2E flows pass