# Phase 1 Step 8a — i18n Coverage & Data Quality Hotfix

Date: 2026-07-22

## Scope

Retroactive hotfix for `process/HOTFIX-PROMPT—i18n-Static-Coverage-Gap.md`.

## Implemented

- Wired QA-reported MES Console static strings into i18n bundles for `vi`, `en`, `ja`, and `ko`.
- Added `i18n_data_quality_flag` sidecar table in `mes-master-data-service` migration `0005`.
- Added master-data API endpoints:
  - `GET /api/mes/master-data/i18n-quality-flags?status=OPEN`
  - `PATCH /api/mes/master-data/i18n-quality-flags/:id`
- Added `scripts/i18n-audit/detect-mislabeled-vi.ts`.
- Added curated seed-data language enrichment for known MES seed `LocalizedText` rows:
  - shared seed map: `services/mes-master-data-service/src/infrastructure/db/seed-i18n.ts`
  - manual backfill command: `npm run i18n:seed:enrich:mes`
  - startup migration: `0006_seed_i18n_enrichment`
- Added MES Console Translation Review Queue at `/console/mes/i18n-review`.
- Added static i18n scanner command `npm run i18n:scan`.
- Added governance docs:
  - `docs/i18n/coverage-checklist.md`
  - `docs/adr/0002-i18n-completeness-governance.md`
- Updated `AI_CONTEXT.md`, `process/stragegy.md`, and `process/PROJECT_WORKLOAD_PROGRESS.md`.

## Verification

- `npm run i18n:scan` passes.
- `npm run build --workspace=mes-console` passes.
- `npm run build --workspace=mes-master-data-service` passes.
- `npm run build --workspace=@mom-platform/i18n-ui-shared` passes.
- `npm run i18n:seed:enrich:mes` updated 22 known seed rows and resolved 5 open quality flags.
- `npm run i18n:audit:mes` ran against local MES master-data DB and opened/refreshed 0 flags after seed enrichment.
- `GET /api/mes/master-data/i18n-quality-flags?status=OPEN` returns `{"data":[]}`.
- `schema_migrations` contains `0006_seed_i18n_enrichment`.
- Docker rebuild/restart passed for:
  - `mes-master-data-service`
  - `mes-console`

## Seed Enrichment Scope

The enrichment covers only Step 8 JSONB `LocalizedText` columns:

- `md_item.name`
- `md_item_revision.name`
- `md_work_center.name`
- `md_equipment.name`
- `md_skill.name`
- `md_reason_code.name`
- `md_operation.name`
- `md_work_instruction.instruction_text`

`md_shift.name` is intentionally excluded because it remains a varchar column in the current schema.
