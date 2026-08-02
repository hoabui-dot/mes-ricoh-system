# Phase 4 — Verify Product Definition, Routing and Work Order Snapshot Semantics

## Objective

Prove that Item, Item Revision, EBOM, MBOM, Routing, Routing Operation, Production Version and Work Order snapshots behave according to the canonical MES architecture before adding two-line eligibility.

## Required verification

### Item and Revision

Verify:

- stable Item identity;
- independent Item Revision lifecycle and effectivity;
- released/effective filtering;
- UOM ownership;
- new revision instead of historical mutation.

### EBOM

Verify:

- EBOM is an engineering baseline;
- EBOM lines are not copied into Work Order material requirements;
- EBOM does not drive staging, backflush, substitutes or execution readiness;
- optional EBOM identity can be snapshotted for audit.

### MBOM

Verify:

- MBOM owns manufacturing material requirements;
- substitutes are transactional;
- issue-operation mapping is preserved;
- UOM derives from component revision;
- released MBOM is immutable;
- Work Order material requirements come only from MBOM.

### Routing

Verify:

- Routing owns process sequence;
- Routing Operation points to logical Work Center under the current model;
- predecessors and scheduling attributes persist correctly;
- Routing is not duplicated merely because physical resources differ;
- released Routing is immutable.

### Production Version

Verify:

- Item Revision, MBOM and Routing ownership match;
- optional EBOM ownership matches;
- Production Version is the only Work Order creation authority;
- browser cannot independently submit conflicting MBOM or Routing IDs.

### Work Order snapshots

Verify:

- Work Order snapshots Product Version;
- Work Order snapshots Routing and operations;
- Work Order snapshots MBOM material requirements;
- Work Order snapshots committed runtime resources separately;
- later master-data changes do not modify an existing Work Order.

## Required tests

Add API and browser coverage for:

- mismatched Item Revision ownership;
- obsolete or expired revision;
- unreleased MBOM;
- unreleased Routing;
- mismatched Production Version;
- EBOM incorrectly used as manufacturing material;
- changed master data after WO creation;
- new Production Version used only by new Work Orders.

## Required report

Create:

`mes-system/process-expand/mes-enterprise/ai-report/phase-4/mes-product-definition-and-wo-snapshot-verification-YYYYMMDD.md`

## Completion gate

Do not proceed to two-line implementation until all product-definition ownership and snapshot invariants are verified.