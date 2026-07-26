# MES Console Item UOM and Tabbed Localization UX

Date: 2026-07-24

## Changes

- Replaced the shared `LocalizedTextFields` four-column editor with the tabbed VI/EN/JA/KO pattern
  already used by Work Center forms. The active locale, locale name, required VI state, and Apply for
  all action are visible in one compact field card. MBOM, Routing, EBOM, and Item forms inherit this
  behavior without duplicate implementations.
- Item `Add New Item` now uses a dedicated Base UOM card with direct `Full name` and `Sign` inputs,
  for example `Kilogram` and `KG`, instead of a UOM selector.
- Saving an Item creates the UOM through the existing master-data API when the sign is new, or reuses an
  existing UOM with the same sign. The resulting UOM ID is then submitted as the required Item
  `base_uom_id`, preserving the database foreign-key contract.
- Item edit uses the same UOM name/sign card and create-or-reuse behavior. Item list/detail UOM values
  show `Full name (SIGN)`.
- Added VI/EN/JA/KO translations for the UOM card labels, guidance, reuse message, and validation.

## Verification

- `npm run typecheck --workspace=mes-console`: PASS.
- `npm run build --workspace=mes-console`: PASS; existing Vite chunk-size warning remains.
- `npm run i18n:scan`: PASS.
- `git diff --check`: PASS.
