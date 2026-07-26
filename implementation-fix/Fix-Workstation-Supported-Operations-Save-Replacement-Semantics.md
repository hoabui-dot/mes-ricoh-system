# Workstation Repeatable Section Replacement Semantics

## Root cause

The Workstation detail projection returned historical supported-operation capability rows without filtering
`active_flag` and `effective_to`. The edit form treated those historical rows as current defaults and submitted
duplicate `operation_id` values. The capability endpoint then correctly rejected the invalid payload as
`WORKSTATION_CAPABILITY_DUPLICATE`, even though the user had not added a duplicate.

Workstation Skill replacement also used a keep-current/insert-missing algorithm. Although its resulting set was often
correct, it merged database state with the submitted form instead of treating the submitted list as the complete
desired state.

## Implementation

### Supported Operations

- Workstation detail and capability list endpoints return only active, currently effective capabilities.
- Capability PUT locks the Workstation, validates duplicate `operation_id` values within the submitted payload, ends
  every current effective capability row, inserts each submitted row exactly once, and commits atomically.
- Current and historical effective dates are not replayed as replacements; current/past dates receive a new effective
  timestamp while explicit future dates are preserved.
- Unchanged submissions succeed. Removed Operations remain inactive and are absent from the next edit hydration.
- Database unique violations remain mapped to `WORKSTATION_CAPABILITY_DUPLICATE` as a defensive stable error.

### Machine Groups

- Machine Group list/detail projections return only current effective groups for editable Workstation configuration.
- Existing group PUT already uses complete replacement: it ends active assignments, requirements, and groups before
  inserting the submitted complete group list in one transaction. It never appends submitted groups to active rows.

### Workstation Skills

- Skill assignment reads now filter to active, currently effective assignments.
- Skill PUT validates the complete submitted ID set, locks current assignments, ends all current effective rows, inserts
  every submitted skill exactly once, and returns the new current set in one transaction.
- An empty Workstation Skill list is a valid complete desired state and ends all current Workstation skills. Machine
  Skills retain their existing non-empty business rule.

## Verification

- `npm run build --workspace=services/mes-master-data-service` passed.
- `npm run build --workspace=services/mes-console` passed.
- Both Docker images were rebuilt with `docker compose build --no-cache` and restarted.
- `WORKSTATION_ID=261110cd-b878-46ae-856b-b7556ed056d5 npm run verify:mes:workstation-replacements` passed:
  unchanged Supported Operations, add-one Operation, remove-and-restore Operation, unchanged Machine Groups, and
  unchanged Workstation Skills all replaced successfully without duplicate errors.
- The rebuilt master-data service is healthy; the MES Workstation edit route returned HTTP 200.
- Existing Schema Registry compatibility warning is non-fatal and unrelated to this replacement flow.
- `git diff --check` passed.
