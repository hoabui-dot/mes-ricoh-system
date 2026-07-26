# MES MBOM and Routing Domain Model Enrichment

**Date:** 2026-07-23  
**Source requirement:** `implementation-fix/Enrich-MBOM-and-Routing-Domain-Models.md`  
**Status:** Implemented and runtime-verified for the current demo contract

## Root cause and scope

The former MBOM and Routing models were technically usable but too thin for engineering and
production users. Headers were mainly code, revision, relationships, quantity/status, and lifecycle
metadata. MBOM creation was an unlabeled inline toolbar form. Routing lists showed hardcoded operation
examples and technical codes without localized business meaning. Operations lacked localized
descriptions and execution behavior summaries.

## Database and migration

Migration `0007_enrich_mbom_routing_domain_models` in
`services/mes-master-data-service/src/infrastructure/db/migrate.ts` is forward-only and was applied
to the live MES database. It preserves primary keys, foreign keys, released statuses, production
version references, and existing relationships.

`md_mbom_header` now has JSONB LocalizedText fields for `name`, `description`, `change_reason`, and
`engineering_note`, plus `business_version`, `purpose`, and `reference_document`. Routing has the
corresponding fields plus `business_version`, `routing_type`, `production_purpose`, and
`reference_document`. Operations now include localized `description`, quantity-reporting,
partial-completion, operator-instruction, and quality-requirement fields.

The migration temporarily disables released-row protection triggers only during controlled backfill,
then restores them. Verified seed records receive domain-specific VI/EN/JA/KO values based on item,
revision, site, code, and operation-sequence evidence. Records without reliable evidence receive a
controlled code fallback in all four locales and remain translation-review candidates. The seed
normalizer was updated to write JSONB LocalizedText instead of legacy scalar names.

## API and event contract

`master-data.router.ts` validates Vietnamese `name` on creation, optional localized metadata, dates,
reference-document length, and MBOM/Routing enums. Partial updates validate only supplied fields.
Empty optional localized objects are omitted.

Responses expose stable IDs together with business display data:

- MBOM: product/revision/site/UOM codes and localized names.
- Routing: product/revision/site display fields and operation count.
- Routing operations: operation code/name/description, work-center code/name, and execution behavior.
- Production versions/readiness: MBOM/Routing codes and localized names.

Existing event names and versions remain unchanged. MBOM/Routing event payloads add optional domain
fields while retaining existing IDs, code, version, and lifecycle fields. This is backward-compatible
payload enrichment, so no event-version migration was required.

## Console UX

The MBOM list Create action navigates to `/master-data/mboms/new`; Routing uses
`/master-data/routings/new`. Dedicated forms use the reusable `LocalizedTextFields` editor for
VI/EN/JA/KO and cover basic information, product/site/version, quantity or type, validity, change
reason, engineering note, and reference document. Successful draft creation navigates to the next
engineering step.

Routing continues to `/master-data/routings/:id/operations`, where operation and work-center selects
show business codes plus localized names and the table shows sequence and confirmation/scan/output/
partial-completion behavior. MBOM and Routing lists now show localized business meaning, product/
revision/site context, purpose/type, UOM, and operation count. Inline MBOM header quick-create and
hardcoded routing operation examples were removed.

## Verification

- `npm run build` in `services/mes-master-data-service`: passed.
- `npm run build` in `services/mes-console`: passed; Vite production bundle completed.
- MES master-data and console Docker images were built and recreated.
- Startup applied/skipped migration 0007 correctly, applied localized seed data, and master-data
  listened on port 3020.
- Live MBOM, Routing, routing-operation, and production-readiness probes returned enriched fields.
- Existing IDs and released lifecycle records remained available after migration.
- Browser automation is not claimed because this repository has no Playwright, Puppeteer, Selenium, or
  equivalent browser driver. Production builds and live HTTP/API contracts were verified.

## Files changed

`services/mes-master-data-service/src/infrastructure/db/schema.ts`, `migrate.ts`, `seed-i18n.ts`,
`master-data.router.ts`; `services/mes-console/src/components/LocalizedTextFields.tsx`;
`MbomCreateScreen.tsx`, `RoutingCreateScreen.tsx`, `RoutingOperationsScreen.tsx`, `MbomScreen.tsx`,
`RoutingScreen.tsx`, `App.tsx`, and `i18n.ts`.
