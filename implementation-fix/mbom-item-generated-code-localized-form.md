# MBOM and Item Creation Form Refinement

**Date:** 2026-07-23  
**Status:** Implemented and build-verified

## Changes

- MBOM creation no longer exposes an editable Version input. The MBOM header keeps the backend
  default business version `1`, while the UI shows an automatically generated, read-only MBOM code
  preview.
- Item creation now generates a read-only Item code preview when the modal opens. The generated code
  is still submitted as the required backend `code` field.
- Item Name now uses the shared `LocalizedTextFields` component and submits VI/EN/JA/KO LocalizedText.
  Vietnamese remains required.
- `LocalizedTextFields` supports a reusable `Apply for all` action. A user can enter one language and
  copy it to all four locale fields without changing the field contract.
- Item Type now has an information tooltip and translated descriptions for Finished Good, Semi-Finished
  Good, and Raw Material in VI/EN/JA/KO.

## Technical notes

Code previews are generated client-side with a date and random suffix for demo-form identity. They are
display-only; the backend remains authoritative for persistence and uniqueness validation. Stable IDs,
item type values, and API payload semantics are unchanged.

## Verification

- `npm run build` in `services/mes-console`: passed.
- `git diff --check`: passed.
