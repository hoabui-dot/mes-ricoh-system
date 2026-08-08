# Decouple MBOM from Item Revision

> Historical report. The running architecture was corrected again on 2026-08-06: MBOM has no Site, Production Version Site is derived solely from Routing Work Centers, and current ownership through `item_revision_id` was restored by migration `0054`.

## Scope

Implemented `process-fix/Decouple-MBOM-from-Item-Revision-Across-the-MES-Platform.md`.

## Dependencies removed

- `md_mbom_header.item_revision_id` was removed from the current Drizzle model and
  from the database by migration `0039_decouple_mbom_from_item_revision`.
- Legacy values are copied to `md_mbom_legacy_revision_audit` before the column is
  dropped. MBOM rows and Production Version `item_revision_id` values are not
  deleted or rewritten.
- MBOM create/edit/list/detail paths no longer require, persist, join, or expose
  an owning Item Revision.
- EBOM-to-MBOM conversion no longer copies `ebom.item_revision_id` into MBOM.
- Execution read-model migration `000012_decouple_mbom_read_model` removes the
  obsolete `rm_mbom_header.item_revision_id` field and the Kafka consumer no
  longer expects it in `MES.MasterData.MBOMReleased.v2`.

## Production Version rules

Item Revision, Released MBOM, and Released Routing are independent selectors.
The MBOM API request does not use `item_revision_id`, and changing Item Revision
does not clear the selected MBOM. The backend validates each selected entity
independently for Released/effective status.

Routing Work Center Site is the authoritative Production Version Site. The
backend requires one Routing Site and requires the selected MBOM Site to match
that Routing Site. This is an explicit Site compatibility rule and does not
create an Item Revision-to-MBOM relationship.

The Production Version validation engine now checks the independent MBOM header,
independent Item Revision, independent Released Routing, and explicit Site
compatibility. Phantom MBOM lines are not resolved by looking up an MBOM through
their component revision because no such ownership relationship exists.

## Documentation

Updated:

- `AI_CONTEXT.md` section 74
- `product-doc/II-PRODUCTS-&-MBOM-CATALOG.md`
- `product-doc/VII-ERD-MATRIX-&-DEV-VALIDATION.md`
- `product-doc/product-doc.md`
- `services/mes-master-data-service/service.manifest.yaml`

The previous implementation report
`implementation-fix/production-version-mbom-selection-and-derived-site.md` is
historical and superseded.

## Runtime startup hotfix

The first MES rebuild exposed a migration startup failure in the new
`0039_decouple_mbom_from_item_revision` trigger. PostgreSQL does not provide
`MIN(uuid)`, so the trigger function failed during master-data bootstrap even
though migration 0039 had already been recorded as applied.

The migration source now uses `COUNT(*)` plus a deterministic `LIMIT 1` query
for the single Routing Work Center Site, and forward migration
`0040_fix_production_version_site_trigger_uuid_aggregate` repairs the trigger
in databases where 0039 was already applied. The execution migration runner
also now registers `000012_decouple_mbom_read_model.up.sql`; the file existed
in the image but was previously omitted from the runner's hard-coded list.

## Verification

- MES Console build: passed.
- MES Master Data Service build: passed after the decoupling changes.
- `npm run rebuild:mes`: passed; all MES images built and containers were
  recreated.
- `mes-master-data-service`: healthy; migration 0040 applied and seed/bootstrap
  completed successfully.
- `mes-execution-service`: healthy; migration 000012 applied successfully.
- Execution database confirms `000012_decouple_mbom_read_model.up.sql` is
  recorded and `rm_mbom_header.item_revision_id` is absent.
- In-container execution health endpoint returned `{"service":"mes-execution-service","status":"ok"}`.
- Remaining non-blocking warning: Schema Registry returned compatibility 409
  warnings for existing event subjects; services continued running.
- Browser-level verification was not performed in this shell session.
