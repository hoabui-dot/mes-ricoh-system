# WO Resource Allocation and Compute & Check Audit

Date: 2026-07-27

## Work Order audited

`WO-20260727-0037` (`03e17085-88a5-48d4-8ddf-3ea00a64a87b`) is Draft and has
three Work Order operations.

After the reported UI action, the database contained exactly one active
allocation:

- Operation 10: `MG-20260727-0004`, `Committed`, `Valid`, duration `12 min`.
- Operation 20: no committed allocation.
- Operation 30: no committed allocation.

The selected machine group was persisted correctly. The approval failure was
therefore correct: the backend requires one current valid committed allocation
for every Work Order operation, not one allocation for the whole Work Order.

## Root cause of the misleading UI

The execution API returns `total_duration_minutes`. `WODetailScreen` did not
read that field and fell through to a hardcoded `240` minute fallback. The
backend response for this WO is:

```text
Operation 10: 12 min
Operation 20: 9 min
Operation 30: 10 min
Total: 31 min
```

The resource candidate values are separate from the Work Order total:
`MG-20260727-0004` reports available calendar capacity `540 min` and the
selected operation allocation duration `12 min`. Capacity is not the same as
the total production duration across all three operations.

## Changes

- MES Console now reads `total_duration_minutes` and never falls back to `240`.
- Capacity status is shown only when the Compute & Check response provides an
  explicit status. Calendar warnings and “not evaluated” are distinguished.
- Resource planning shows committed progress, for example `1/3 operations`.
- Approve is disabled in the UI until every operation has a `Committed`
  allocation with validation status `Valid` or `ValidWithWarnings`.
- Added VI/EN/JA/KO translations for the allocation progress and approval
  blocking explanation.
- Backend approval validation is unchanged and remains authoritative. It
  continues to reject incomplete allocation sets with
  `WO_RESOURCE_ALLOCATION_INVALID`.

## Verification

- Direct execution API `POST /compute-check` returned HTTP 200 and
  `total_duration_minutes: 31`.
- Database query confirmed the selected group is stored on operation 10 and
  operations 20/30 are still unallocated.
- MES Console TypeScript/Vite build passed.
- Docker image `mom-platform-mes-console` rebuilt and `mes-console` recreated.
- `git diff --check` passed.

To approve this WO, open the resource candidate selector for operations 20 and
30 and commit a valid candidate for each. The backend should then accept the
approval without bypassing the allocation rule.
