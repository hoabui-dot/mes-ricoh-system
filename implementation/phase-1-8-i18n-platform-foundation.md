# Phase 1 Step 8 — i18n Platform Foundation (VI/EN/JA/KO) + MES Retrofit

## Scope

- Added platform locale contracts for `vi`, `en`, `ja`, and `ko`, with `vi` as the default.
- Separated static UI translation from dynamic master-data translation.
- Retrofitted MES master data, event contracts, read-model projections, and the main frontends onto
  the shared i18n foundation before WMS/QMS implementation begins.

## Shared Contracts

- `libs/shared-kernel` now exports:
  - `SupportedLocale`
  - `SUPPORTED_LOCALES`
  - `DEFAULT_LOCALE`
  - `LocalizedText`
  - `localizedTextSchema`
  - `resolveLocalizedText`
- `libs/shared-kernel-go` mirrors the same `SupportedLocale`, `LocalizedText`, and fallback resolver.
- Added `libs/i18n-ui-shared` as the shared frontend i18n package:
  - common VI/EN/JA/KO bundles
  - status, role, operation, button, and validation message vocabulary
  - `createI18nConfig`
  - `I18nProvider`
  - `useLocalizedText`
  - `Intl` date/number wrappers

## MES Master Data Retrofit

- Added migration `0004_i18n_localized_text`:
  - creates `supported_locale`
  - adds `md_site.default_locale`
  - adds `md_employee.preferred_locale`
  - converts targeted translatable fields to `jsonb` with existing values backfilled into `vi`
- Generic `POST`/`PUT` writes validate localized fields with `localizedTextSchema`.
- Validation Engine now returns stable `{ code, params }` failures instead of hardcoded message strings.
- Affected Master Data events now publish `.v2`:
  - `MES.MasterData.ItemRevisionReleased.v2`
  - `MES.MasterData.MBOMReleased.v2`
  - `MES.MasterData.WorkCenterActivated.v2`
  - `MES.MasterData.EquipmentActivated.v2`
- `.v1` schemas remain registered for compatibility.

## Go Consumer Retrofit

- `mes-execution-service` subscribes to the affected `.v2` Master Data events and stores localized
  names as `jsonb` in local read-models.
- `mes-traceability-service` subscribes to `.v2` Item Revision and MBOM events and stores localized
  names as `jsonb`.
- `mes-traceability-service` label templates gained localized static template text support.
- Go services preserve `LocalizedText`; they do not resolve locale server-side.

## Frontend Retrofit

- `mes-console` uses `libs/i18n-ui-shared` and has a top-nav locale switcher.
- Core MES Console shell, shared error cards, Work Order list, Item, Employee, Shift, Work Calendar,
  WorkCenter, and MBOM validation rendering are wired into i18n.
- WorkCenter create/edit uses a four-locale tabbed `LocalizedTextInput`; `vi` is required.
- `portal` uses the shared i18n provider and exposes a locale switcher.
- `kiosk-operator-ui` uses the shared i18n provider and exposes a login-screen locale fallback selector.

## Remaining Manual Checks

- Persisting the office-user locale back to the Keycloak `locale` user attribute still requires the
  realm user-profile/admin update path to be verified against the live Keycloak configuration.
- Kiosk employee-driven locale selection depends on `md_employee.preferred_locale` being populated and
  included in the kiosk login response.
- Printed label locale selection depends on the print-time operator locale being passed into the label
  rendering path.
