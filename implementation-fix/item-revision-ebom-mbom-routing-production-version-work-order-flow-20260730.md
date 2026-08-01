# Item Revision -> EBOM -> MBOM -> Routing -> Production Version -> Work Order

Date: 2026-07-30
Status: Implemented with controlled legacy reconciliation; full browser E2E remains pending for a newly created EBOM-backed configuration.

## Scope and architecture decision

The two process documents were reconciled before changing the schema:

```text
Item
  -> Item Revision
       -> EBOM  (engineering definition)
       -> MBOM  (manufacturing structure/material policy)
       -> Routing (manufacturing process/resource flow)
            -> Production Version (frozen configuration identity)
                 -> Work Order (execution snapshot)
```

EBOM is an independent engineering aggregate owned by one Item Revision. It is not used for material explosion, capacity planning, WMS staging, issue operation resolution, substitutes, scrap, phantom handling, backflush, Production Standards, execution, or Work Order readiness. MBOM and Routing remain the authoritative execution inputs. Production Version can optionally reference an EBOM baseline for audit and traceability; when selected, the EBOM owner must match the Production Version Item Revision. EBOM lines are never copied into Work Order material requirements.

`issue_operation_id` remains an MBOM material issue/backflush reference to the reusable Operation Catalog. It is not a Routing Operation identity. Production Version validation resolves it to exactly one occurrence in the selected Routing; execution uses the resulting immutable Work Order Operation context.

## Audit findings

Before the migration, the live development database had:

| Aggregate | Rows | Existing owner column | Finding |
|---|---:|---|---|
| EBOM Header | 0 | `item_revision_id` required | No current EBOM fixture existed |
| MBOM Header | 4 | Removed by migration 0039 | 1 shared by two PV revisions, 1 uniquely referenced, 2 unreferenced |
| Routing Header | 5 | Removed by migration 0030 | 1 shared by two PV revisions, 1 uniquely referenced, 3 draft/unreferenced |
| Production Version | 3 | `item_revision_id`, MBOM, Routing | Two PVs shared the same legacy MBOM/Routing |

The old migrations explicitly removed MBOM/Routing ownership. The existing generic list API also intentionally skipped `item_revision_id` filters for these two aggregates, and the MES Console Production Version form loaded all Released MBOM/Routing rows without enforcing same-revision filtering.

## Database changes

### Migration 0054

`0054_restore_item_revision_ownership_and_audit_ambiguity`:

- adds nullable `item_revision_id` to `md_mbom_header` and `md_routing_header` as an additive compatibility step;
- adds owner/lifecycle lookup indexes;
- creates `md_structure_ownership_reconciliation` for deterministic audit evidence;
- backfills only when all Production Versions referencing a structure agree on one Item Revision;
- clones shared legacy MBOM and Routing structures per conflicting Production Version owner;
- copies current MBOM lines, substitutes, and Routing operations into clones;
- repoints only current Production Version references;
- leaves historical Work Order snapshots untouched;
- records unreferenced structures as `UNREFERENCED` rather than guessing an owner;
- adds database triggers that reject new ownerless MBOM/Routing inserts.

### Migration 0055

`0055_optional_production_version_ebom_baseline` adds nullable `md_production_version.ebom_header_id` with a foreign key and index. This is intentionally optional under the current business policy. If supplied, the API requires the EBOM owner to equal the PV Item Revision.

The Drizzle schema was updated to reflect the live PostgreSQL contract. Released structure ownership remains immutable through the existing lifecycle protection.

## API changes

Updated `services/mes-master-data-service/src/infrastructure/http/master-data.router.ts`:

- MBOM and Routing list queries accept `item_revision_id` and return output Item Revision identity (`item_code`, localized `item_name`, `revision_code`).
- MBOM and Routing create requests require an output Item Revision and reject RM output revisions with stable errors.
- Production Version creation/update validates Item Revision/MBOM/Routing ownership equality.
- Optional PV EBOM selection validates existence, lifecycle, and matching Item Revision ownership.
- EBOM-to-MBOM conversion writes the source EBOM `item_revision_id` into the new MBOM.
- Event payloads include MBOM/Routing ownership and optional PV EBOM identity.
- Existing issue-operation validation remains strict and separate from EBOM.

Stable validation categories now used by the ownership path include:

`MBOM_OUTPUT_REVISION_REQUIRED`, `ROUTING_OUTPUT_REVISION_REQUIRED`, `MBOM_OUTPUT_RAW_MATERIAL_NOT_ALLOWED`, `ROUTING_OUTPUT_RAW_MATERIAL_NOT_ALLOWED`, `PRODUCTION_VERSION_MBOM_REVISION_MISMATCH`, `PRODUCTION_VERSION_ROUTING_REVISION_MISMATCH`, `PRODUCTION_VERSION_EBOM_INVALID`, and `PRODUCTION_VERSION_EBOM_REVISION_MISMATCH`.

## MES Console changes

Updated:

- `services/mes-console/src/routes/master-data/MbomCreateScreen.tsx`
- `services/mes-console/src/routes/master-data/RoutingCreateScreen.tsx`
- `services/mes-console/src/routes/master-data/ProductionVersionCrudScreen.tsx`
- `services/mes-console/src/routes/master-data/ProductionVersionScreen.tsx`
- `services/mes-console/src/i18n.ts`

The MBOM and Routing create forms now require an output Item Revision selector limited to FG/SFG revisions. Production Version now:

1. selects Item Revision first;
2. filters EBOM, MBOM, and Routing selectors by that Item Revision;
3. clears dependent selections when the Item Revision changes;
4. displays localized name first and code/revision as secondary text;
5. shows an optional Released EBOM baseline;
6. shows EBOM identity in the Production Version detail view when present.

The Work Order contract remains Production-Version-centred: the client submits the PV identity and quantity/date inputs, not an arbitrary Item Revision/EBOM/MBOM/Routing combination.

## Seed and documentation changes

`services/mes-master-data-service/src/infrastructure/db/seed.ts` now assigns the canonical FG/SFG output revisions to the seeded MBOM and Routing headers. `AI_CONTEXT.md`, `product-doc/product-doc.md`, `product-doc/II-PRODUCTS-&-MBOM-CATALOG.md`, and `product-doc/III-ROUTING-&-STANDARDS-CATALOG.md` were reconciled so they no longer describe MBOM/Routing as ownerless and no longer imply EBOM is an execution input.

This is the single implementation report for this change.

## Runtime verification

Executed:

- `npm --prefix services/mes-master-data-service run build` passed.
- `npm --prefix services/mes-console run build` passed.
- `git diff --check` passed.
- Rebuilt and recreated `mes-master-data-service` and `mes-console` with the platform/MES Compose files.
- Migrations 0054 and 0055 applied successfully to the live development database.
- Master Data service started on port 3020 and registered its runtime Kafka consumers.
- Gateway request for a matching Released MBOM returned HTTP 200 and only the MBOM owned by the selected Item Revision.
- The database confirmed the legacy shared E2E MBOM/Routing were separated into owner-specific clones and PV references were repointed.

Post-migration development result:

- Shared E2E configuration was split by Item Revision without rewriting Work Order snapshots.
- Unique referenced MBOM/Routing ownership was backfilled deterministically.
- Three unreferenced legacy/draft structures remain recorded as `UNREFERENCED`; no owner was guessed and they are not valid choices for new Production Versions.

## Remaining limitations and next verification

- The current database has no EBOM rows, so a fresh browser E2E must first create/release an EBOM, then create/release an owned MBOM and Routing, then create a PV with the optional EBOM baseline.
- The additive migration intentionally leaves legacy unreferenced structures nullable for controlled review. They must be resolved or retired before a final `NOT NULL` constraint can be added safely.
- Full Work Order browser execution, WMS staging, and physical print verification were not rerun in this change because EBOM is an optional traceability baseline and must not alter the already verified MBOM/Routing execution path.
