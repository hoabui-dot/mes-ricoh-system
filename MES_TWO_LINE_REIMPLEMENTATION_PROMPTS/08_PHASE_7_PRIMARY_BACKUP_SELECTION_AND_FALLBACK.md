# Phase 7 — Primary/Backup Line Selection, Fallback, and RESOURCE_HOLD

## Objective

Integrate the complete-line feasibility evaluator into Work Order line selection.

## Expected algorithm

Use Production Version line eligibility and deterministic priority/role ordering.

```text
eligible lines ordered by approved policy
        ↓
evaluate Primary
        ├── READY -> select Primary
        └── BLOCKED -> evaluate Backup
                        ├── READY -> select Backup
                        └── BLOCKED -> evaluate next eligible line if supported
                                      or RESOURCE_HOLD
```

For the current two-line business flow, Primary/Backup must be explicit and deterministic.

## Required persisted state

Persist or snapshot enough information to explain:

- selection mode (`AUTO` where appropriate),
- selected line,
- selection status,
- evaluated lines,
- Primary blocker,
- fallback line,
- fallback reason,
- evaluation timestamp/version if required by current audit model.

Do not persist transient candidate internals that are not required for diagnostics/history.

## Required behavior

1. Primary READY => Primary selected.
2. Primary has one bad resource but another candidate => Primary still selected.
3. Primary has zero feasible candidates for one mandatory operation => Backup evaluated.
4. Backup READY => Backup selected with fallback reason.
5. Primary + Backup BLOCKED => Work Order enters `RESOURCE_HOLD`.
6. Replan can reevaluate lines before execution according to current lifecycle rules.
7. Do not silently switch lines after execution has started.

## Error and hold reasons

Use stable backend reason codes suitable for UI and test assertions. Examples only if aligned with current conventions:

- `NO_FEASIBLE_RESOURCE_CANDIDATE`
- `PRIMARY_LINE_BLOCKED`
- `NO_COMPLETE_ELIGIBLE_LINE`

Do not introduce new codes without checking existing error conventions.

## Tests

Add focused use-case/integration tests for all five core outcomes above.

Also prove deterministic ordering when multiple eligible lines are configured.

## Deliverable

Create:

`AI_document/two-line/PHASE_7_PRIMARY_BACKUP_SELECTION_REPORT.md`

## Phase gate

PASS when Work Order auto-selection chooses Primary, falls back to Backup, or enters `RESOURCE_HOLD` exactly according to complete-line feasibility.
