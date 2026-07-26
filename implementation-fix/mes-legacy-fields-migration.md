# MES Legacy Field Migration Script

Date: 2026-07-23  
Source request: legacy UI fields `item_code`, `item_name`, `version_code`, `item_id`, and
`production_version_id`

## Implementation

Added [`scripts/migrate-mes-legacy-fields.ts`](../scripts/migrate-mes-legacy-fields.ts) and the root
command:

```bash
npm run migrate:mes:legacy-fields
npm run migrate:mes:legacy-fields -- --apply
```

The first command is a dry-run. The second persists only safe, unambiguous backfills.

The script audits `md_item`, `md_item_revision`, and `md_production_version` using the live database
metadata. It backfills canonical fields only when the legacy alias exists and the canonical value is
empty:

| Legacy value | Canonical field | Rule |
|---|---|---|
| `item_code` | `md_item.code` | Direct copy when canonical code is empty. |
| `item_name` | `md_item.name` | Converts scalar text to `{ "vi": "..." }` when canonical name is empty. |
| `item_code` + `revision_code` | `md_item_revision.code` | Builds `ITEM-REVISION` when canonical code is empty. |
| `item_name` | `md_item_revision.name` | Converts scalar text to LocalizedText when canonical name is empty. |
| legacy `item_id` | `md_item_revision.item_id` | Copies only when the revision relationship is empty. |
| `version_code` | `md_production_version.code` | Direct copy when canonical code is empty. |

The script does not add duplicate UI-only columns and does not guess whether a legacy production-version
`item_id` means an Item or an Item Revision. Ambiguous relationships are reported for manual migration.

## Dry-Run Result

The live MES database was inspected in dry-run mode:

- `md_item`: 6 rows, no legacy alias columns, no changes.
- `md_item_revision`: 9 rows, no legacy alias columns, no changes.
- `md_production_version`: 2 rows, no legacy alias columns, no changes.
- Unresolved warnings: 0.

The database already contains the canonical values. The previous blank UI fields were caused by the
frontend reading obsolete aliases instead of `master_id`, `code`, `name`, `item_revision_id`,
`mbom_header_id`, and `routing_header_id`; those UI mappings were corrected in
`implementation-fix/ui-note-fix.md`.
