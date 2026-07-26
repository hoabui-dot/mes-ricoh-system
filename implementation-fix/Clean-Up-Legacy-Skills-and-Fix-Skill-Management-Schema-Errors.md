# Legacy Skill Cleanup and Canonical Scope Fix

## Root cause

The resource-skill migration created `scope_type` on `md_skill` and
`md_skill_group`, while the deployed schema/API contract expected a canonical
`scope` field. The Skill Management screen also loaded unfiltered skills and
sent `scope_type`, so the legacy `LEGACY` group and Employee-scope rows could
appear in Machine, Workstation, and WorkCenter tabs.

## Implementation

- Added migration `0026_canonical_skill_scope_and_legacy_cleanup_support`.
- Renamed or merged `scope_type` into `scope` for `md_skill` and
  `md_skill_group` without editing migrations 0024 or 0025.
- Added `legacy_flag` to both central skill tables.
- Added `md_legacy_skill_migration_map` for idempotent source-to-target
  mappings.
- Added active scoped-name uniqueness indexes.
- Updated Drizzle schema, generic registry reads, skill-group endpoints,
  skill creation validation, and resource-skill assignment reads to use
  `scope`.
- Accepted `scope_type` only as a request alias; responses and SQL use `scope`.
- Rejected invalid group scopes and group/skill scope mismatches.
- Excluded legacy and archived skills from normal list APIs.
- Updated Skill Management tabs to request their scope from the backend and
  removed client-side legacy fallback filtering.
- Added translated UI errors for scope mismatch, inactive group, duplicate,
  invalid scope, and generic save failures.
- Replaced legacy seed codes with scoped central groups and localized skill
  definitions.

## Migration script

`npm run migrate:mes:legacy-skills -- --dry-run` reports candidates and
ambiguities without writing. `--apply` runs in a transaction, creates/reuses
scoped groups and definitions, migrates mutable assignments, updates the
mapping table, and archives retained legacy rows. Released production-standard
and operation-requirement rows are deliberately left unchanged because the
audit trigger protects historical master data.

## Verification

- MES master-data service TypeScript build: passed.
- MES Console production build: passed.
- Migration 0026: applied successfully in the live database.
- Legacy migration dry-run: completed with 3 legacy source skills and no
  ambiguous records.
- Legacy migration apply: completed successfully.
- Repeat apply: idempotent; reused existing mappings and created no duplicates.
- `GET /api/mes/master-data/skill-groups?scope=WorkCenter`: returns only
  `SKG-WC-PROCESS` and `SKG-WC-QUALITY`, both `legacy_flag=false`.
- `GET /api/mes/master-data/skills?scope=WorkCenter`: returns only
  `SK-WC-INSPECTION`, `SK-WC-MIX-MASTER`, and `SK-WC-VULCAN-OPERATOR`.
- Invalid Employee-scope group creation returns `SKILL_GROUP_SCOPE_REQUIRED`.

The `LEGACY` group remains retained only while immutable historical references
exist; it is excluded from active APIs and is deleted automatically once empty.
