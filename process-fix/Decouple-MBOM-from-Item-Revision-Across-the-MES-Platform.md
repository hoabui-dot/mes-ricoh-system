# Decouple MBOM from Item Revision Across the MES Platform

## Confirmed Target Domain Model

The target domain model is:

```text
Item Revision ─┐
MBOM ──────────┼──> Production Version
Routing ───────┘

Item Revision, MBOM, and Routing are independent master-data entities.

They do not have direct ownership relationships with each other.

Production Version is the only entity that connects:

one Item Revision;
one Released MBOM;
one Released Routing.

Therefore:

MBOM must not contain product_revision_id or item_revision_id;
Routing must not be filtered by Item Revision unless a separate explicit business rule exists;
MBOM selection must not depend on the selected Item Revision;
the backend must not derive or validate Item Revision through MBOM;
legacy data that still contains this relationship must not define the new model.
Current Problem

The current Production Version flow still assumes that MBOM belongs to an Item Revision.

Observed behaviour:

the Production Version form filters Released MBOMs by the selected Item Revision;
backend queries and validation may also filter MBOM by Item Revision;
historical MBOM data works because legacy rows still contain an old revision reference;
newly created MBOMs do not contain that field and therefore disappear from the selector;
existing documentation still describes MD_MBOM_HEADER as owning ProductRevisionID.

This is an obsolete domain assumption and must be removed across the complete system.

Required Work

First audit the actual implementation and identify every direct dependency between MBOM and Item Revision.

Inspect at minimum:

product and architecture documents;
AI context files;
database schemas;
Drizzle models;
SQL migrations;
seed data;
MBOM create/update/list/detail handlers;
Production Version create/update/list/detail handlers;
repositories and query filters;
request and response DTOs;
frontend types;
MES Console MBOM forms;
MES Console Production Version forms;
release validation;
Work Order creation;
execution and readiness logic;
automated tests.

Search for all variants of:

product_revision_id
productRevisionId
item_revision_id
itemRevisionId
ProductRevisionID
MBOM + Item Revision
MBOM belongs to Product Revision
Database and Schema Changes

Remove the direct Item Revision relationship from MBOM.

Update md_mbom_header so it no longer owns:

product_revision_id
item_revision_id

Remove related:

foreign keys;
indexes;
unique constraints;
joins;
validation rules;
generated schema fields.

Create a safe migration that:

audits legacy MBOM rows containing Item Revision references;
verifies that Production Version already preserves the required Item Revision relationship;
removes obsolete constraints and columns;
does not delete MBOMs;
does not modify historical Production Version relationships;
reports any legacy dependency that cannot be safely removed.

Do not copy the MBOM revision reference into another MBOM field.

MBOM CRUD Changes

Update MBOM create and edit flows.

The MBOM form must not ask for Item Revision.

MBOM should contain only its own independent master data, such as:

MBOM code;
version;
Site where applicable;
base quantity;
base UOM;
validity period;
lifecycle status;
component lines.

Update backend create and update handlers so they neither require nor persist Item Revision.

Update list and detail DTOs so they do not expose a direct MBOM Item Revision relationship.

Production Version Frontend Changes

In the Create and Edit Production Version forms, provide three independent selectors:

Item Revision
Released MBOM
Released Routing

The MBOM selector must:

load all eligible Released MBOMs;
not depend on selected Item Revision;
not apply a client-side Item Revision filter;
not send item_revision_id or product_revision_id as an MBOM query parameter;
not hide rows because of legacy or missing revision fields.

The Routing selector must follow the same independence rule unless another documented relationship explicitly requires filtering.

Changing Item Revision must not clear the selected MBOM merely because MBOM has no Item Revision relationship.

Only clear a selected value when it becomes invalid under an actual Production Version compatibility rule.

Backend Production Version Changes

Production Version create and update handlers must validate each selected entity independently:

Item Revision
exists;
is Released;
is effective.
MBOM
exists;
is Released;
is effective;
satisfies required Site or other explicit compatibility rules.
Routing
exists;
is Released;
is effective;
satisfies required Site or other explicit compatibility rules.

Do not validate:

MBOM.product_revision_id == ProductionVersion.product_revision_id

Do not derive:

ProductionVersion.product_revision_id

from MBOM.

The Item Revision selected in the Production Version request is authoritative for the Production Version relationship.

If Site is derived, define one consistent ownership rule. Do not reintroduce an Item Revision–MBOM relationship through Site derivation.

API and Repository Changes

Remove Item Revision filtering from:

MBOM list endpoints;
Released MBOM selector endpoints;
Production Version candidate endpoints;
repository queries;
frontend API clients;
cache/query keys.

For example, replace behaviour equivalent to:

GET /mboms?product_revision_id=...

with an eligibility query such as:

GET /mboms?status=Released

or a dedicated endpoint:

GET /production-versions/mbom-candidates

Candidate filtering may use only explicit valid rules such as:

Released status;
effective date;
Site compatibility;
lifecycle availability;
permission scope.

It must not use Item Revision.

Legacy Data Compatibility

Historical rows may still contain obsolete MBOM revision references.

The new code must not depend on those values.

Verify:

old MBOMs still display;
new MBOMs display;
MBOMs with null legacy revision display;
Production Versions retain their own Item Revision;
historical Work Orders retain their Production Version snapshot;
migration does not alter completed production history.

After migration, legacy and newly created MBOMs must behave identically.

Documentation Updates

Update every document that currently states or implies that MBOM owns Product Revision.

At minimum, review and update:

AI_CONTEXT.md
product-doc/II-PRODUCTS-&-MBOM-CATALOG.md
product-doc/VII-ERD-MATRIX-&-DEV-VALIDATION.md
Production Version implementation reports
MBOM implementation reports
MES master-data README
MES Console README
relevant process and architecture documents

Replace the obsolete relationship:

Item Revision → MBOM

with:

Item Revision ─┐
MBOM ──────────┼──> Production Version
Routing ───────┘

Update the MBOM definition so it no longer contains ProductRevisionID.

Update the Production Version definition so it is explicitly the only association between the three independent entities.

Mark older implementation reports as historical or superseded rather than silently leaving conflicting architecture statements.

Tests

Add or update automated tests for:

creating MBOM without Item Revision;
editing MBOM without Item Revision;
listing newly created MBOMs;
Production Version MBOM candidates independent of Item Revision;
changing Item Revision without removing a valid selected MBOM;
creating a Production Version from independently selected entities;
backend rejection of non-Released MBOM;
backend rejection of non-Released Item Revision;
backend rejection of non-Released Routing;
no remaining MBOM query filtered by Item Revision;
migration of legacy MBOM data;
historical Production Version and Work Order preservation.
Runtime Verification

Verify the complete live flow:

create a new MBOM without Item Revision;
add valid MBOM lines;
release the MBOM;
open Create Production Version;
select any Released Item Revision;
confirm the new Released MBOM appears;
change Item Revision;
confirm the MBOM remains available;
select a Released Routing independently;
create the Production Version;
read it back from the API;
confirm Item Revision, MBOM, and Routing are stored only on Production Version;
confirm the MBOM record contains no Item Revision relationship;
confirm old and new MBOMs behave consistently;
confirm Work Order creation still works.
Acceptance Criteria

The work is complete only when:

MBOM has no direct Item Revision field or foreign key.
MBOM create/edit does not request Item Revision.
Production Version MBOM selection does not filter by Item Revision.
Backend MBOM candidate queries do not filter by Item Revision.
Production Version does not derive Item Revision from MBOM.
Item Revision, MBOM, and Routing are selected independently.
Production Version remains their only relationship.
Newly created Released MBOMs appear in the Production Version form.
Historical Production Versions and Work Orders remain correct.
Legacy MBOM revision data is safely removed or ignored.
Automated tests pass.
MES Console and master-data service builds pass.
Database migration passes.
Runtime browser/API verification passes.
All conflicting documentation is updated.
Required Final Report

Report:

every obsolete Item Revision–MBOM dependency found;
database columns, foreign keys, and indexes removed;
frontend filters removed;
backend filters and validation removed;
migration and legacy-data results;
documentation files updated;
automated test results;
live verification evidence.

Do not report completion while any active code path, schema, API, frontend filter, or current architecture document still treats MBOM as belonging to Item Revision.