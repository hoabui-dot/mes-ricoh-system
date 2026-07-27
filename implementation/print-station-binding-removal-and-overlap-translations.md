# Print Station Binding Removal and Overlap Error Translations

Date: 2026-07-27

## Root cause

The MES Print Station API already exposed a delete endpoint, but it rejected
any active binding with `PRINT_BINDING_ACTIVE_REQUIRES_SAFE_REALLOCATION`.
The Print Station Console also had no remove action and surfaced overlap error
codes such as `PRINT_PRIMARY_BINDING_OVERLAP` directly to the user.

## Changes

- Added VI, EN, JA, and KO translations for:
  - `PRINT_PRIMARY_BINDING_OVERLAP`
  - `PRINT_BINDING_OVERLAP`
  - `PRINT_BINDING_DUPLICATE`
  - binding removal and confirmation text.
- Added a translated error-code mapping in
  `services/mes-console/src/routes/master-data/PrintStationsScreen.tsx`.
- Added a trash-icon Remove Binding action for active bindings.
- Added the shared shadcn/Radix `Confirmation` dialog before removal.
- Changed `DELETE /api/mes/master-data/workstation-print-station-bindings/:bindingId`
  to end the effective period (`is_active = false`, `effective_to = NOW()`) and
  retain the binding row for audit and historical resolution.
- Inactive historical bindings remain visible in the detail list but cannot be
  removed again from the active-action control.

## Verification

- MES Console `npm run build`: passed.
- MES Master Data `npm run build`: passed.
- Docker rebuild/restart of `mes-console` and `mes-master-data-service`: passed.
- Runtime health after Kafka reconnect: `mes-master-data-service` returned
  `status=ok`, Kafka connected, and Print Station runtime consumer connected.
- Print Station list API returned the existing demo station successfully.
- No demo binding was deleted automatically during verification.

The endpoint was not invoked against a live binding during automated
verification to avoid changing demo master data without an explicit user
selection. The UI action is ready for the user-confirmed flow.
