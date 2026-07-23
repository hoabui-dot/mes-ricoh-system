# i18n Static Coverage Checklist

Baseline date: 2026-07-22

Scope: screens shipped before or during Phase 1 Steps 5-7, plus MES Console Step 8 retrofit screens.

| App | Route / Screen | Status | Notes |
|---|---|---|---|
| `mes-console` | `/work-calendar` and `/console/mes/work-calendar` | Clean | QA-reported labels, bulk preview, confirmation modal, result title, empty state, and toast now use locale bundle keys. |
| `mes-console` | `/master-data/work-centers` and `/console/mes/work-centers` | Clean for hotfix scope | `HEADCOUNT`, detail title, filter labels, employee states, empty state, and save toast use locale bundle keys. |
| `mes-console` | `/console/mes/i18n-review` | Clean | New review queue screen uses i18n keys for all user-facing labels. |
| `mes-console` | `/work-orders`, `/work-orders/new`, `/work-orders/:id` | Baseline reviewed | Existing status/navigation shell is localized; remaining identifiers, operation codes, and domain codes are intentionally not translated. |
| `mes-console` | `/master-data/items` | Baseline reviewed | Page shell and common actions use bundle keys; item codes and enum-like values remain untranslated identifiers. |
| `mes-console` | `/master-data/mboms` | Baseline reviewed | MBOM codes, operation codes, and line identifiers remain untranslated identifiers. |
| `mes-console` | `/master-data/routings` | Baseline reviewed | Routing codes and operation codes remain untranslated identifiers. |
| `mes-console` | `/master-data/production-versions` | Baseline reviewed | PV/MBOM/Routing IDs remain untranslated identifiers. |
| `mes-console` | `/employees`, `/shifts` | Baseline reviewed | Employee names, shift codes, and persisted master-data values are dynamic data, not static UI copy. |
| `kiosk-operator-ui` | Login, WO list, operation execution | Baseline reviewed | Kiosk strings are covered by app/shared i18n bundles from Step 8; QR codes, terminal IDs, and operation codes are identifiers. |
| `portal` | App launcher | Baseline reviewed | Portal app labels and language switcher use shared/app i18n resources; app URLs and client IDs are identifiers. |

Automated gate: `npm run i18n:scan`.

Exemption rule: any future user-facing hardcoded literal must either move into a locale bundle or carry an adjacent `i18n-exempt: <reason>` comment. Codes, UUIDs, enum names, route paths, CSS classes, telemetry/log strings, and developer diagnostics are non-user-facing and are not translation targets.
