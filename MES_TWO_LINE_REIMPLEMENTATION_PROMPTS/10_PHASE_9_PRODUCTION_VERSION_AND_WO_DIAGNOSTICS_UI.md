# Phase 9 — Production Version Eligibility and Work Order Diagnostics UI

## Objective

Make the Primary/Backup model understandable and operable in MES Console without duplicating backend logic.

## Production Version UI

Enhance Production Version detail/configuration to clearly show eligible lines:

```text
LINE-1  PRIMARY  priority 1
LINE-2  BACKUP   priority 2
```

Show business labels and effective configuration.

Where practical, show structural readiness summary for each referenced line using backend APIs.

## Work Order list

Add concise fields/badges where supported by the approved UI contract:

- selected line,
- line selection mode,
- line selection status,
- fallback indicator,
- `RESOURCE_HOLD` indicator.

Avoid overcrowding the list; use detail page for full diagnostics.

## Work Order detail

Add a backend-driven evaluated-line comparison matrix.

Example shape:

| Dimension / Operation | Primary LINE-1 | Backup LINE-2 |
|---|---|---|
| Eligibility | READY | READY |
| OP10 BIND | 2 candidates | 1 candidate |
| OP20 TEST5 | BLOCKED: 0 candidates | READY: 1 candidate |
| OP30 AIRTEST | READY | READY |
| Final | BLOCKED | READY |
| Decision | Rejected | Selected fallback |

Use actual backend diagnostic fields, not fabricated frontend calculations.

## Status wording

Do not show misleading generic labels such as `Not evaluated` when the backend intentionally defers a dimension. Use wording such as:

- `Evaluated during line feasibility`,
- `Deferred to exact resource allocation`,
- `Warning only`,

only when the backend contract exposes that meaning.

## Actions

Preserve and clarify:

- compute/check,
- candidate viewing,
- exact allocation commit,
- reallocate/cancel,
- revalidate,
- line replan,
- approve/reject,
- start execution.

Actions must respect backend permissions and lifecycle guards.

## Tests

Add UI tests for:

- Primary selected,
- fallback selected,
- `RESOURCE_HOLD`,
- diagnostic matrix rendering,
- selected-line candidate restriction,
- blocked action feedback,
- i18n keys.

Run frontend typecheck/build/lint/test.

## Deliverable

Create:

`AI_document/two-line/PHASE_9_WO_DIAGNOSTICS_UI_REPORT.md`

## Phase gate

PASS when an operator can understand exactly why Primary was selected, why Backup was selected, or why the WO is on `RESOURCE_HOLD`.
