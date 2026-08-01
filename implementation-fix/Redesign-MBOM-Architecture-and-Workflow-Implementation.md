# MES MBOM Architecture and Workflow Redesign

Date: 2026-07-29
Scope: `mes-master-data-service`, MES Console, MBOM schema, Production Version compatibility

## Initial audit

| Concern | Current finding | Status | Evidence |
|---|---|---|---|
| MBOM ownership | `md_mbom_header` is independent of Item Revision after migration `0039`; Production Version owns the product/MBOM/Routing combination. | IMPLEMENTED_AND_VERIFIED | `services/mes-master-data-service/src/infrastructure/db/migrate.ts` migrations `0030`, `0039` |
| Header and structure | Header and line tables are separate. Lines support `parent_line_id`, phantom, issue operation and UOM. | IMPLEMENTED_AND_VERIFIED | `schema.ts`, `migrate.ts`, live schema |
| Cycle protection | Database trigger `fn_check_mbom_line_cycle` exists. API validation now also checks parent ownership. | IMPLEMENTED_AND_VERIFIED | `migrate.ts`, `master-data.router.ts` |
| Line lifecycle | Existing E2E data had one Released header with a Draft current line. | REPAIRED | Migration `0049_reconcile_released_mbom_line_lifecycle` |
| Substitutes | Existing table only had identity, line, revision and priority. Conversion, approval and usage policy were stored only as untyped attributes by older UI code. | PARTIALLY_IMPLEMENTED | `schema.ts`, `migrate.ts` before `0048` |
| MBOM API | Generic resource CRUD existed, but there was no authoritative MBOM detail/validate/atomic structure endpoint. | PARTIALLY_IMPLEMENTED | `master-data.router.ts` |
| MBOM UI | Existing UI showed a header list and independent line/substitute forms; it did not use a single authoritative detail response or backend validation action. | PARTIALLY_IMPLEMENTED | `MbomScreen.tsx`, `MbomCreateScreen.tsx` |
| EBOM boundary | EBOM has its own aggregate and conversion-to-draft route. It is not treated as MBOM. | IMPLEMENTED_AND_VERIFIED | `ebom-headers/:id/create-mbom-draft` |
| Work Order authority | Production Version remains the only user-selected configuration; execution snapshots the selected MBOM. | IMPLEMENTED_AND_VERIFIED | `AI_CONTEXT.md`, execution service snapshot flow |

## Architecture decisions

1. Item Revision supports zero-to-many MBOM versions. No Item Revision foreign key was reintroduced on `md_mbom_header`; the running repository already made MBOM independent through migrations `0030` and `0039`.
2. No duplicated `MBOMType` column was added. Finished-good versus semi-finished meaning is derived from the output Item Revision at Production Version validation time. Raw-material Item Revisions are rejected as Production Version outputs with `MBOM_OUTPUT_RAW_MATERIAL`.
3. Production Version remains the authoritative selector for Item Revision, MBOM, Routing and Site. Work Orders must not choose an arbitrary MBOM or explode EBOM directly.
4. Released MBOM core structure is immutable. New changes use a new draft/version. Current line replacement preserves ended historical rows and inserts a new active structure.
5. The existing `effective_from/effective_to` columns are the repository's effective-dated fields; adding duplicate `valid_from/valid_to` columns would create two competing date contracts.

## Schema changes

Migration `0048_mbom_structure_and_substitute_controls`:

- adds `md_mbom_line.optional_flag`;
- changes active sibling sequence uniqueness from header-wide `(mbom_header_id, seq)` to `(mbom_header_id, parent_line_id, seq)` using a root sentinel;
- adds substitute `conversion_factor`, `max_usage_percent`, `requires_approval`, and `approval_status`;
- adds check constraints for scrap, conversion, maximum usage and approval status;
- adds active structure/substitute indexes.

Migration `0049_reconcile_released_mbom_line_lifecycle` promotes valid current lines under a Released header to Released. It preserves IDs, quantities, relationships and historical timestamps where already present. Live pre/post count was three headers and seven lines; no master header or line was deleted.

## Backend/API changes

Added:

- `GET /api/mes/master-data/mbom-headers/:id` with enriched header, current lines and substitutes;
- `GET /api/mes/master-data/mbom-headers/:id/lines`;
- `POST /api/mes/master-data/mbom-headers/:id/validate` with structured `{ valid, errors, warnings }`;
- `PUT /api/mes/master-data/mbom-headers/:id/lines/replace` for transactional complete desired-state replacement;
- `GET /api/mes/master-data/mbom-lines/:lineId/substitutes`;
- `POST /api/mes/master-data/mbom-lines/:lineId/substitutes`;
- `POST /api/mes/master-data/mbom-lines/:lineId/substitutes/:substituteId/approve`.

Generic MBOM writes now validate site, localized header name, positive base quantity, Released UOM, component revision lifecycle, parent ownership, sibling sequence, quantity precision, operation lifecycle, substitute identity, conversion factor, maximum usage and approval state. Stable duplicate errors are returned for active sibling sequence and substitute conflicts.

Release validates current structure and component/UOM integrity, promotes current valid lines to Released in the same transaction, publishes the MBOM event with line identity/business fields, and rejects empty or invalid structures. Production Version creation and validation reject a Raw Material output revision.

## UI changes

`MbomScreen` now hydrates detail from the authoritative MBOM detail endpoint, renders current hierarchical lines and substitutes, exposes a backend Validate Structure action, displays manufacturing-structure guidance, and captures the optional line flag. VI/EN/JA/KO translations were added for validation and structure guidance.

`masterDataApi.ts` now provides `fetchMbomDetail` and `validateMbom` helpers with no-cache reads and structured validation errors.

The current product model intentionally does not add an output Item Revision picker to the MBOM header form because the running schema decouples MBOM ownership. Product output is selected in Production Version. This is recorded as a deliberate reconciliation with the prompt's conflicting Step 1 wording.

## Runtime verification

- MES master-data TypeScript build passed.
- MES Console TypeScript/Vite build passed.
- Docker images for `mes-master-data-service` and `mes-console` rebuilt and force-recreated.
- Migration `0048_mbom_structure_and_substitute_controls` applied successfully.
- Migration `0049_reconcile_released_mbom_line_lifecycle` applied successfully.
- `mes-master-data-service` reached `healthy`; MES Console returned HTTP 200 on port `13052`.
- Live list returned three MBOM headers and seven lines.
- Live detail returned line/substitute enrichment for `E2E-WO-MBOM-01`.
- Live `POST /mbom-headers/{id}/validate` returned `{ "valid": true, "errors": [], "warnings": [] }` after lifecycle reconciliation.
- `git diff --check` passed.

## Remaining limitations

- The UI still uses the existing detail editor rather than a full drag-and-drop wizard/tree designer. The backend contract is ready for the complete desired-state editor, but visual reorder and per-line substitute edit/delete screens remain follow-up work.
- Technical group compatibility and UOM conversion lookup for substitutes are not yet enforced because the current Item Group/UOM conversion policy has no authoritative exception/approval aggregate. The backend enforces identity, lifecycle, numeric and approval-state rules now.
- Routing is also independent of Item Revision in the running schema. Production Version validates the released Routing, Work Center Site and selected Item Revision, but cannot compare to a Routing-owned product revision column that migrations removed.
- Schema Registry retains the pre-existing ItemRevision compatibility warning; it does not prevent master-data startup or MBOM API operation.

