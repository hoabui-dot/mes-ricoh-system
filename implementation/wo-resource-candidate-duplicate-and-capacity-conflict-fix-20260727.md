# WO Resource Candidate Audit and Fix

Date: 2026-07-27

## Scope

Audited Work Order `WO-20260727-0037` (`03e17085-88a5-48d4-8ddf-3ea00a64a87b`) and the resource-planning flow in MES Console, MES Execution, and MES Master Data.

## Root cause

The screen showed `MG-20260727-0004 / test aa` for each of the three routing operations. This was not three active duplicate machine groups. The database contained one active group for the relevant workstation and Work Center; the older groups were Inactive. The same group is eligible for multiple operations and may be reused sequentially.

The data-quality issue was that this group was `Draft`, while the readiness query accepted every status except `Inactive` and `Obsolete`. The seed script also did not own or validate machine-group master data, so an older manually-created group could enter the demo flow.

The capacity error was caused by two independent issues:

1. A direct candidate request without `planned_start_at` evaluated every operation at the Work Order start, overlapping the existing operation 10 reservation.
2. Candidate capacity preview initially included the current operation's own allocation and did not consistently use the top-level estimated duration.

## Changes

- MES Master Data readiness now proposes only `Released` machine groups and `Released` workstations.
- The deterministic seed validates `MG-20260727-0004`, requires exactly one active primary member, and promotes that valid demo group to `Released` when the seed baseline is run. It records the group in the planning seed artifact.
- The current valid demo group was promoted from `Draft` to `Released`; its one active primary member was preserved.
- The trial name `test aa` was normalized to localized `E2E label printing machine group` / `Nhóm máy demo in nhãn` without changing the group identity or its allocation.
- MES Execution candidate preview excludes the current allocation from capacity checks.
- MES Execution uses the candidate top-level `estimated_duration_min` for conflict windows.
- When an API caller omits `planned_start_at`, MES Execution starts an operation after the latest active predecessor allocation. This prevents false overlap for sequential operation planning.
- MES Console cards now label the Machine Group and Readiness fields, and translate warning and capacity-conflict keys. Labor assignments already use translated labels and now have an explanatory translated description.

## Database audit result

- Active group for this Work Center/workstation: 1 (`MG-20260727-0004`).
- Active members: 1.
- Active primary members: 1.
- Previous `MG-20260727-0001..0003` records: Inactive.
- Previous `MG-20260726-0001..0005` records: Inactive.
- No three-way active duplicate was found.

## Runtime verification

After rebuilding `mes-master-data-service`, `mes-execution-service`, and `mes-console`:

| Operation | Candidate count | Group | Duration | Capacity conflicts |
|---|---:|---|---:|---:|
| 10 | 1 | MG-20260727-0004 | 12 min | 0 |
| 20 | 1 | MG-20260727-0004 | 9 min | 0 |
| 30 | 1 | MG-20260727-0004 | 10 min | 0 |

The direct API verification returned operation 20's default start at the end of operation 10 (`2026-07-27T19:19:52Z`) and no capacity conflict. Go tests, MES Console typecheck, Docker builds, service health, and `git diff --check` passed.

## Remaining domain rule

The same machine group can be proposed for several operations because capability is operation-specific and allocation is time-window based. It can only be committed repeatedly when the windows do not overlap. If a future flow requires one group to be reserved exclusively for one Work Order, that is a separate scheduling policy and should not be implemented by hiding valid candidates.
