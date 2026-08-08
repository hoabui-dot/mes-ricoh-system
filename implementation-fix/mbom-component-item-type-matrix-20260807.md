# MBOM Component Item Type Matrix - 2026-08-07

## Business rule

| MBOM output Item Type | Allowed component Item Types | Allowed substitute Item Types |
| --- | --- | --- |
| `FG` | `SFG`, `RM` | `SFG`, `RM` |
| `SFG` | `RM` | `RM` |
| `RM` | Not a valid MBOM output | Not a valid MBOM output |

An `FG` Item cannot be selected as an MBOM component or substitute. The rule is based on the Item owning the
selected Revision, not on a display label, material group, or UOM.

## Implementation

- The create and edit screens filter Item Revision choices with the same matrix.
- Both screens use the shared searchable Item + Revision selector for components and substitutes.
- MBOM Item options display `localized Item name (localized Item Type)` and keep the Item code on the second
  italic line. Search matches the name, code, translated type label, and technical `FG`/`SFG`/`RM` value.
- The create screen locks the output selection after a draft component exists, preventing an output-type change
  from silently invalidating the local structure.
- Client-side validation rejects stale or manipulated selections before an API request.
- The master-data service enforces the matrix for aggregate creation, line and substitute creation/replacement,
  line update, output Revision change, structure validation, and release.
- Validation and release also inspect existing active component and substitute records, preventing legacy invalid
  structures from becoming Released.
- The canonical child MBOM `MBOM-SFG-ROLL-EPDM-R1` now consumes the dedicated raw material
  `RM-EPDM-BASE-R1`; the previous seed incorrectly used its own SFG output Revision as a component.
- Migration `0071_repair_epdm_child_mbom_component_type` creates the missing canonical RM identity and repairs
  the already-Released historical seed line once. The regular seed remains idempotent and does not bypass the
  Released-structure protection trigger.

## Error contract

- `MBOM_COMPONENT_ITEM_TYPE_INVALID` (HTTP 422)
- `MBOM_SUBSTITUTE_ITEM_TYPE_INVALID` (HTTP 422)

Both errors are translated in Vietnamese, English, Japanese, and Korean in MES Console.

## Verification

- Master-data TypeScript typecheck.
- MES Console TypeScript typecheck and production build.
- Unit tests for the canonical matrix.
- Playwright MBOM create/edit selector coverage and API rejection coverage.
- Docker Compose rebuild, health check, and log inspection for MES Console and master-data service.

Final result: 16/16 master-data unit tests and 8/8 MBOM Playwright tests passed. The runtime audit found zero
active component or substitute rows outside the canonical Item Type matrix.
