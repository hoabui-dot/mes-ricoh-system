# MES Console Two-Line Work Order UI Gap Report

Date: 2026-08-02

Target work order: `ad71bae7-0252-46db-a1f0-e9e0fad3c468`

## Current Target State

| Field | Value |
| --- | --- |
| Work order code | `WO-20260802-0047` |
| Status | `ResourceHold` |
| Line selection mode | `AUTO` |
| Line selection status | `RESOURCE_HOLD` |
| Selected production line | None |
| Fallback reason | None |

## UI Result

The work order detail route can open this ID through `/work-orders/ad71bae7-0252-46db-a1f0-e9e0fad3c468`. The current state only validates the resource-hold UI path. It does not validate a selected primary line or backup-line fallback because no line is selected.

## Confirmed UI Coverage

| Requirement | UI status |
| --- | --- |
| Show selected production line | Implemented when backend selected line exists. |
| Show automatic line selection mode | Implemented. |
| Show line selection status | Implemented. |
| Show resource hold warning | Implemented. |
| Show fallback reason | Implemented when backend fallback exists. |
| Replan line before start | Implemented. |
| Fetch candidates in selected line context | Implemented. |
| Block planning when resource hold exists | Implemented through backend response and UI blockers. |
| Show complete evaluated-line results | Missing. |

## Required UAT Records

| Scenario | Required state |
| --- | --- |
| Primary line selected | Work order with `line_selection_status=READY`, selected line `WST-SEED-LINE-1`, no fallback reason. |
| Backup line selected | Work order with `line_selection_status=READY`, selected line `WST-SEED-LINE-2`, fallback reason present. |
| Resource hold | Work order with `line_selection_status=RESOURCE_HOLD`, no selected line, hold reason present. |

## Recommendation

Preserve one work order for each UAT state instead of relying on cleanup-heavy full-flow tests. Add a detail-page evaluated-line matrix so the UI can prove why primary was selected, why backup was selected, or why all lines were held.

