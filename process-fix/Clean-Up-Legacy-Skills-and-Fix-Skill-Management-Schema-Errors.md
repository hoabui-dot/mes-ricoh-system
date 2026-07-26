# Clean Up Legacy Skills and Fix Skill Management Schema Errors

## Objective

Remove the legacy Skill data and legacy Skill UI behaviour from the MES Console, migrate reusable historical Skills into the new central Skill Management model, and fix the runtime database error:

```text
column "scope_type" of relation "md_skill_group" does not exist

After this change, the MES must work only with the new Skill Management model:

Skill Group
→ Skill Definition
→ Resource Skill Assignment

Supported scopes:

Machine
Workstation
WorkCenter

Do not continue displaying or creating legacy Skill records.

1. Root Cause Audit

Inspect:

md_skill
md_skill_group
md_resource_skill_assignment
legacy employee/resource skill tables
migration 0024_resource_crud_capabilities_and_skill_scopes
migration 0025_work_center_composition_and_code_reservations
Skill Group registry mappings
Skill Management create/list APIs
Skill Management Console forms
seed data
demo fixtures
shared generic CRUD field mappings

The current UI shows a legacy group:

Kỹ năng cũ
LEGACY

This must no longer appear in the new Skill Management workspace.

Determine whether the current database column is named:

scope

or:

scope_type

Then make the database schema, ORM/query layer, registry metadata, API payloads, and frontend types use one consistent canonical field name.

Preferred canonical field:

scope

Allowed values:

Machine
Workstation
WorkCenter
Employee

Do not add a second duplicate field merely to hide the mismatch unless backward compatibility requires a temporary compatibility view.

2. Fix the scope_type Runtime Error

The current runtime error is:

column "scope_type" of relation "md_skill_group" does not exist

Fix the source of the mismatch.

Audit all of the following:

INSERT statements
UPDATE statements
SELECT projections
generic CRUD registry column mappings
request DTOs
response serializers
migration definitions
frontend request payloads

Use one canonical mapping:

API field: scope
Database column: scope

If existing deployed code already sends scope_type, temporarily accept it as an input alias:

scope_type
→ scope

but always persist and return:

scope

Do not expose both fields in normal API responses.

Add a forward migration only when the actual live database schema requires it.

3. Legacy Skill Cleanup Strategy

Create a safe cleanup and migration script.

Suggested location:

scripts/migrate-legacy-skills-to-central-skill-management.mjs

or:

scripts/migrate-legacy-skills-to-central-skill-management.ts

The script must:

Read all legacy Skill records.
Read all legacy Skill assignments and references.
Normalize localized names and descriptions.
Detect duplicate Skills by:
scope
normalized translated name
existing business meaning
Create the correct new Skill Groups.
Create or reuse new Skill Definitions.
Migrate valid resource assignments.
Preserve references where possible.
Report ambiguous records.
Remove or archive legacy-only records after successful migration.
Remove the generated LEGACY Skill Group after it becomes empty.
Be idempotent.
Run inside transactions where practical.
Refuse destructive execution without an explicit confirmation flag.

Example execution:

node scripts/migrate-legacy-skills-to-central-skill-management.mjs --dry-run
node scripts/migrate-legacy-skills-to-central-skill-management.mjs --apply
4. Migration Rules for Old Skills

Map legacy Skills into the new scopes based on their actual references.

Examples:

Skill referenced only by Machines
→ Machine scope
Skill referenced only by Workstations
→ Workstation scope
Skill referenced only by Work Centers
→ WorkCenter scope

When one legacy Skill is referenced by multiple resource types:

Do not reuse one cross-scope Skill Definition.
Create one Skill Definition per required scope.
Preserve the translated business name.
Record the migration mapping.

Example:

Legacy Skill: Welding

Migrated:
SK-MC-...  Welding · Machine
SK-WS-...  Welding · Workstation
SK-WC-...  Welding · WorkCenter

Do not guess a scope when the references are ambiguous.

Write ambiguous records to a migration report and leave them untouched until manually resolved.

5. Skill Group Creation During Migration

Create meaningful Skill Groups instead of one generic LEGACY group.

When an existing category or grouping is available, preserve it.

Examples:

Cutting Skills
Welding Skills
Molding Skills
Inspection Skills
Material Handling Skills

When no reliable category exists, use a neutral migrated group per scope:

Migrated Machine Skills
Migrated Workstation Skills
Migrated Work Center Skills

These are temporary but valid central Skill Groups.

Do not display:

Legacy Skills
LEGACY

in the final UI.

Generated codes must use the established prefixes:

SKG-MC
SKG-WS
SKG-WC

SK-MC
SK-WS
SK-WC
6. Preserve Existing References

The migration must preserve or recreate references from:

Machine resource skill assignments
Workstation resource skill assignments
Work Center resource skill assignments
Operation Skill Requirements
Employee Skills where relevant
Released or historical planning records where references must remain auditable

Do not delete a legacy Skill before all related references are migrated or explicitly retained.

For immutable historical snapshots:

Preserve the old text/code inside the snapshot.
Do not rewrite historical Work Order snapshots.
New master-data references must use the new Skill Definition IDs.
7. Remove Legacy Skill UI

Update the Skill Management screen so that it only renders:

Machine Skills
Workstation Skills
Work Center Skills

Remove:

LEGACY group rendering
Legacy Skills labels
legacy-only forms
compatibility cards
legacy filters
legacy create options
legacy fallback records in normal lists

The list APIs used by the new Skill Management page must exclude archived legacy records.

Suggested filter:

legacy_flag = false

or equivalent lifecycle/status rule.

Do not hide legacy rows only in the frontend while still returning them as normal active data.

8. Cleanup Legacy Columns and Compatibility Code

Audit and deprecate:

legacy Skill scope fields
legacy Skill Group fallback logic
legacy registry mappings
legacy seed normalization
legacy UI adapters
temporary compatibility columns introduced during previous phases

Do not remove a compatibility field while active backend or execution code still requires it.

Where immediate removal is unsafe:

mark it deprecated
stop writing new values
stop showing it in UI
document the remaining consumer
migrate the consumer to the new model
9. Skill Management Create Flow

The Skill Group form must persist:

{
  scope: "Machine" | "Workstation" | "WorkCenter";
  name: LocalizedText;
  description?: LocalizedText;
  status: "Active" | "Inactive";
}

The Skill Definition form must persist:

{
  scope: "Machine" | "Workstation" | "WorkCenter";
  skillGroupId: string;
  name: LocalizedText;
  description?: LocalizedText;
  status: "Active" | "Inactive";
}

The selected tab determines the scope.

Do not ask the user to choose an incompatible scope manually.

Example:

Machine Skills tab
→ scope is always Machine
Workstation Skills tab
→ scope is always Workstation
Work Center Skills tab
→ scope is always WorkCenter

The backend must still validate the scope.

10. Skill Group and Skill List Behaviour

Each tab must load only matching records.

Example:

GET /api/mes/master-data/skill-groups?scope=WorkCenter
GET /api/mes/master-data/skills?scope=WorkCenter

Every returned Skill must belong to a Skill Group with the same scope.

Reject invalid combinations with a stable error:

SKILL_GROUP_SCOPE_MISMATCH

Do not mix Machine, Workstation, and Work Center Skills in the same tab.

11. Remove Legacy Seed and Demo Data

Update seeds and fixtures so new environments do not recreate:

LEGACY
Legacy Skills
Kỹ năng cũ

Replace old demo Skill data with valid examples.

Suggested demo groups:

Machine
Machine Processing Capabilities
- Hydraulic Pressing
- CNC Cutting
- Automated Welding
Workstation
Workstation Process Capabilities
- Molding Operation
- Cutting Operation
- Final Inspection
Work Center
Work Center Capability Groups
- Cutting Skills
- Welding Skills
- Molding Skills

Use full VI/EN/JA/KO localized values.

12. Cleanup Script Output

The script must print a clear summary.

Example:

Legacy Skill Migration Summary

Legacy Skills found: 12
Migrated Skill Groups: 4
Migrated Skill Definitions: 10
Reused Skill Definitions: 2
Migrated Resource Assignments: 18
Ambiguous Skills: 1
Deleted legacy assignments: 18
Deleted legacy Skills: 11
Deleted LEGACY group: 1

For ambiguous records, print:

Legacy ID
Name
Existing references
Reason migration was not safe

Do not silently discard ambiguous data.

13. Idempotency

The cleanup script must be safe to run multiple times.

Use a migration mapping table or stable source metadata.

Suggested mapping table:

interface LegacySkillMigrationMap {
  legacySkillId: string;
  targetScope: string;
  newSkillId: string;
  migratedAt: string;
}

On repeated execution:

Do not create duplicate Skill Groups.
Do not create duplicate Skill Definitions.
Do not duplicate assignments.
Do not fail when already-clean records are absent.
14. Deletion Policy

After successful migration:

Delete temporary legacy assignments that have been replaced.
Delete unused legacy Skill rows.
Delete the LEGACY Skill Group only when empty.
Preserve historical rows that cannot legally be removed.
Mark retained historical legacy rows as archived and exclude them from active UI.

Do not use unrestricted cascading deletes.

15. UI Error Handling

When Skill Group or Skill creation fails:

Show a translated error toast.
Keep the form values.
Do not show a newly created card.
Do not leave an optimistic ghost record.
Allow retry.

For the current scope_type error, map the backend error to a clear message during the transition:

Skill Management configuration is temporarily inconsistent.
Please refresh after the schema update.

After the backend fix, this error must no longer occur.

Do not expose raw PostgreSQL column errors to normal users.

Log technical details server-side with trace ID.

16. Refresh Behaviour

After successfully creating:

Skill Group
Skill Definition
Resource Skill Assignment

Invalidate and refetch only the relevant scope query.

Example:

Work Center Skills tab
→ refresh WorkCenter groups and skills only

Do not refresh unrelated tabs or the entire page.

17. Required Business Rules

Enforce:

Skill Group scope is required.
Skill scope is required.
Skill scope must equal Skill Group scope.
Skill name is required in the configured primary locale.
Generated codes are unique.
Referenced Skills cannot be permanently deleted.
Inactive Skill Groups cannot accept new Skills.
Inactive Skills cannot be assigned to resources.
Legacy archived Skills cannot be selected.
Duplicate active Skills in the same group and scope must be rejected according to normalized business-name rules.
Audit actors come from authenticated context.

Stable errors:

SKILL_GROUP_SCOPE_MISMATCH
SKILL_GROUP_INACTIVE
SKILL_INACTIVE
SKILL_DUPLICATE
SKILL_REFERENCED
LEGACY_SKILL_ARCHIVED
18. Required API Adjustments

Ensure consistent endpoints:

GET /api/mes/master-data/skill-groups?scope=Machine
POST /api/mes/master-data/skill-groups

GET /api/mes/master-data/skills?scope=Machine
POST /api/mes/master-data/skills

GET /api/mes/master-data/resource-skill-assignments
POST /api/mes/master-data/resource-skill-assignments

Canonical payload property:

scope

Temporarily accept:

scope_type

only as a backward-compatible request alias when required.

Never generate SQL referencing a missing scope_type database column.

19. Required Migration Files

Create forward-only migrations as needed.

Example:

0026_fix_skill_scope_schema_and_legacy_cleanup_support

Possible responsibilities:

Align md_skill_group.scope
Align md_skill.scope
Add archived/legacy marker if needed
Add migration mapping table
Add uniqueness/indexes
Repair invalid scope values
Remove or deprecate inconsistent defaults

Do not edit already-applied migrations 0024 or 0025.

20. Acceptance Criteria

The task is complete only when:

The scope_type PostgreSQL error no longer occurs.
Database, API, registry, and frontend use one canonical scope field.
The Skill Management page no longer displays LEGACY or Legacy Skills.
Existing reusable old Skills are migrated into the new scoped Skill Management model.
Existing resource assignments are preserved or recreated.
Ambiguous legacy Skills are reported rather than guessed.
The cleanup script supports dry-run and apply modes.
The cleanup script is idempotent.
The LEGACY group is removed when empty.
Historical records that cannot be deleted are archived and excluded from active UI.
New seeds do not recreate legacy Skill data.
Machine, Workstation, and Work Center tabs return only their own scope.
Skill and Skill Group scope mismatches are rejected.
Skill create failures show translated user-friendly errors instead of raw SQL errors.
Successful create operations refresh only the affected scope.
No new legacy Skill records can be created.