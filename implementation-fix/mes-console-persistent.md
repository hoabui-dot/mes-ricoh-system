# MES Console Persistent Labels and Localized Selectors

Date: 2026-07-24
Status: **IMPLEMENTED_AND_VERIFIED for the confirmed Employee form and shared selector contract; broader legacy form cleanup remains tracked**

## Root cause

`EmployeesScreen.tsx` used `aria-label` and placeholders without visible labels for Site, Work
Center, Status, hire date, and skill level. Its option values were raw business codes. `SelectBase`
had no reusable secondary-code rendering contract. Site names were also stored as a varchar while
Work Center and Skill names were localized JSONB.

## Changes

- `SelectBase` now accepts an optional `label` and `secondaryLabel` option field. The rendered option
  uses localized name as the primary line and italic muted business code as the secondary line.
- Employee create/edit and filter controls now have persistent translated labels.
- Employee Site, Work Center, and Skill controls use the current locale with VI/EN/JA/KO fallback;
  codes are secondary text. Skill level has its own visible label.
- Migration `0014_site_localized_name` converts `md_site.name` to JSONB, backfills the known
  `SITE-KZ3` value, and enforces a non-empty Vietnamese name.
- Site, Work Center, and Skill create/update validation now requires a non-empty Vietnamese
  LocalizedText name. Existing `localizedTextSchema` remains the contract.
- The governed i18n audit now includes Site and flags missing or code-mirrored Vietnamese values.
  The existing seed enrichment script was extended through `seed-i18n.ts`; no low-confidence flags
  were opened in the live audit.

## Live evidence

The running API returned localized `name` values alongside `code` for:

- Site: `SITE-KZ3`, `{ vi: "S-Factory - Kizuna 3", en: "S-Factory - Kizuna 3", ja: "S-Factory - キズナ3", ko: "S-Factory - 키즈나 3" }`
- Work Center: `WC-CUTTING`, with localized Vietnamese/English/Japanese/Korean name values.
- Skill: `SK_INSPECTION`, with localized Vietnamese/English/Japanese/Korean name values.

The live migration applied successfully. `npm run i18n:audit:mes` reported zero suspect values;
`npm run i18n:seed:enrich:mes` updated one known Site row and resolved zero flags.

## Selector/form audit

Audited MES Console selector consumers: `EmployeesScreen`, `WorkCentersScreen`, `ShiftsScreen`,
`WorkCalendarScreen`, `ItemsScreen`, `MbomCreateScreen`, `MbomScreen`, `RoutingCreateScreen`,
`RoutingOperationsScreen`, `ProductionVersionCrudScreen`, and `EbomScreen`.

The confirmed Employee reproduction is complete. Existing controls already wrapped by translated
`label` elements retain their labels. Several older forms still use raw code-only option labels or
native controls and are not silently claimed as complete; they are the next cleanup scope for the
same `secondaryLabel` contract.

## Verification

- MES Console `npm run build`: PASS; existing Vite chunk-size warning remains.
- Master-data `npm run build`: PASS.
- Root `npm run i18n:scan`: PASS.
- Live migration `0014_site_localized_name`: PASS.
- Live Site/Work Center/Skill API evidence: PASS.
- Governed i18n audit: PASS, zero flags opened/refreshed.
- Existing unrelated Schema Registry compatibility warning remains non-fatal.
