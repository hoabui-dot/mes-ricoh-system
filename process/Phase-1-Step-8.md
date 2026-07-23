# BUILD PROMPT — Phase 1, Step 8: i18n Platform Foundation (VI/EN/JA/KO) + MES Retrofit

**Project:** MOM Platform (MES / WMS / QMS) — Won Seal Tech
**Phase:** Phase 1, Step 8 — inserted before Phase 2 (WMS) begins
**Status before this prompt:** Steps 0–7 completed. This step establishes the platform-wide
internationalization (i18n) architecture and retrofits the already-built MES cluster onto it, so that
WMS (Phase 2) and QMS (Phase 3) inherit a proven pattern from day one instead of repeating the same
class of gap already corrected once for SSO (Phase 0) and Console UI (Step 6/7).

**Supported locales (final, do not add/remove without a new ADR):** `vi` (Vietnamese, default),
`en` (English), `ja` (Japanese), `ko` (Korean). Use these 4 lowercase BCP-47 primary-language codes as
the canonical locale identifiers everywhere in the system — do not use regional variants (`vi-VN`,
`en-US`) unless a genuine future requirement demands it.

---

## 0. Two translation domains — read this before writing any code

This step deliberately separates two concerns that are easy to conflate, and conflating them is the
single biggest cause of painful i18n migrations later:

| Domain | What it covers | Where it lives |
|---|---|---|
| **Static UI Translation** | Button labels, menu items, screen titles, system/validation error messages, status enum labels (`WO Status`, `OperationCode` display names, `RoleCode` display names) | Locale JSON bundles shipped with each frontend app — **never stored in a database** |
| **Dynamic Master Data Translation** | User-authored content that itself needs to exist in multiple languages: `ItemName`, `WorkCenterName`, `EquipmentName`, `SkillName`, `ReasonCode` description, `md_work_instruction` content, `md_label_template` static text | A `jsonb` column directly on the owning table, e.g. `item_name jsonb` shaped as `{"vi": "...", "en": "...", "ja": "...", "ko": "..."}` |

**Explicit non-translatable fields — do not put these in a multi-locale shape under any circumstance:**
codes (`ItemCode`, `WorkCenterCode`, `ShiftCode`, `OperationCode`), and personal names
(`md_employee.full_name`). Translating an identifier or a person's name is a design error, not a
missing feature.

---

## PART A — Shared Contracts (build first, everything else depends on this)

### A.1 `libs/shared-kernel` (TypeScript) additions

```typescript
export type SupportedLocale = 'vi' | 'en' | 'ja' | 'ko';
export const SUPPORTED_LOCALES: SupportedLocale[] = ['vi', 'en', 'ja', 'ko'];
export const DEFAULT_LOCALE: SupportedLocale = 'vi';

// Stored shape for any dynamic master-data translatable field.
// `vi` is required on write (site's operational default); others are optional.
export type LocalizedText = Partial<Record<SupportedLocale, string>> & { vi: string };

// Resolves a LocalizedText to a single display string given a requested locale and a fallback chain.
// Fallback order: requested locale -> DEFAULT_LOCALE -> first available key in insertion order.
// This function is the ONLY place fallback logic should ever be implemented — every frontend app
// must import and use this, not re-implement the fallback chain locally.
export function resolveLocalizedText(
  value: LocalizedText,
  requestedLocale: SupportedLocale,
  fallback: SupportedLocale = DEFAULT_LOCALE,
): string;

// Zod schema for validating a LocalizedText object on write (used by every service's request
// validation for any translatable field) — requires `vi`, rejects empty strings, rejects locale
// keys outside SUPPORTED_LOCALES.
export const localizedTextSchema: ZodType<LocalizedText>;
```

### A.2 `libs/shared-kernel-go` additions (mirrors A.1 exactly — same fallback semantics, same required-`vi`-key rule)

```go
type SupportedLocale string

const (
    LocaleVI SupportedLocale = "vi"
    LocaleEN SupportedLocale = "en"
    LocaleJA SupportedLocale = "ja"
    LocaleKO SupportedLocale = "ko"
)

var SupportedLocales = []SupportedLocale{LocaleVI, LocaleEN, LocaleJA, LocaleKO}
const DefaultLocale = LocaleVI

// LocalizedText mirrors the TS shape exactly for JSON (de)serialization compatibility across the
// event bus — a LocalizedText value published by a Node service and consumed by a Go service (or
// vice versa) must round-trip without transformation.
type LocalizedText map[string]string

func ResolveLocalizedText(value LocalizedText, requested SupportedLocale, fallback SupportedLocale) string
```

**Contract rule (critical for event compatibility):** any event payload field that used to be a plain
string for a translatable concept (e.g. `item_name` in `MES.MasterData.ItemRevisionReleased.v1`) is now
a `LocalizedText` object in the payload. This is a breaking change to those event schemas — bump every
affected event to `.v2` in Schema Registry (do not silently reshape a `.v1` payload; consumers must be
able to tell from the version that the shape changed) and update every consumer (`mes-execution-service`,
`mes-traceability-service`, `mes-kiosk-gateway-service`) in this same step, not deferred.

### A.3 `libs/i18n-ui-shared` (new frontend package, npm workspace — shared by every Console/Kiosk/Portal app)

- Common locale JSON bundles for vocabulary that repeats across every frontend app: `WO Status` labels,
  the 6 `OperationCode` display names, `RoleCode` display names, common buttons ("Lưu"/"Save"/"保存"/"저장",
  "Hủy"/"Cancel"/"キャンセル"/"취소", etc.), and the shared validation `error_code` → message-template
  mapping described in §B.2. Every app imports this package rather than re-translating the same fixed
  vocabulary independently — re-translating it per-app is exactly the kind of drift this step exists to
  prevent.
- A factory function `createI18nConfig(appNamespace: string)` wrapping `i18next` setup identically for
  every app — locale detection order: (1) explicit user selection in this session, (2) Keycloak user
  attribute `locale` (§A.4), (3) `md_employee.preferred_locale` for Kiosk sessions, (4) `md_site.default_locale`,
  (5) hardcoded `vi`.
- A `useLocalizedText()` React hook wrapping `resolveLocalizedText` bound to the current active locale
  from context, so every component displaying a `LocalizedText` field does `useLocalizedText()(item.name)`
  consistently.
- Native `Intl.NumberFormat`/`Intl.DateTimeFormat` wrappers for locale-aware number/date display —
  backend continues to send raw ISO dates and plain numbers; formatting for display is a frontend-only
  concern, do not add date/number formatting logic to any backend service.

### A.4 Keycloak configuration change

Add a custom user attribute `locale` (string, one of `SUPPORTED_LOCALES`) to the `wonsealtech` realm's
user profile. This is the source of truth for office-user (Console/Portal) locale preference — do not
build a separate preference-storage service for this single field.

### A.5 Non-Goals for Part A

- Do not implement RTL layout support — all 4 supported locales are LTR; this is out of scope unless a
  future locale requires it.
- Do not integrate a translation-management vendor/service (Lokalise, Crowdin, etc.) or machine
  translation auto-fill — translators (planners/engineers) enter each locale manually through Console UI
  fields for now; this can be revisited later as a separate, explicitly-requested enhancement.
- Do not build per-currency formatting — this platform does not currently handle monetary values in
  any workflow; skip currency formatting entirely rather than building unused infrastructure.

---

## PART B — `mes-master-data-service` retrofit

### B.1 Schema migration — convert translatable fields from `varchar` to `jsonb`

Apply the `LocalizedText` shape (§A.1) to exactly these existing columns, migrating existing Vietnamese
data into the `vi` key (a straightforward `UPDATE table SET name = jsonb_build_object('vi', name)`-style
backfill per column, run once, in this step, while data volume is still MVP-seed-scale — this is
deliberately being done now rather than after WMS/QMS go live with real production data, to avoid a
much larger 3-cluster migration later):

- `md_item.item_name`
- `md_item_revision` — any translatable description/spec-note fields
- `md_work_center.work_center_name`
- `md_equipment.equipment_name`
- `md_skill.skill_name`
- `md_reason_code` — description field
- `md_operation` — display name field (if separate from `OperationCode`)
- `md_work_instruction` — content field
- Add `default_locale` (`enum SUPPORTED_LOCALES, default 'vi'`) to `md_site`
- Add `preferred_locale` (`enum SUPPORTED_LOCALES, nullable`) to `md_employee` (Step 7 table)

**Do not** convert: any `*Code` field, `md_employee.full_name`, any UUID/enum/status/boolean column.

### B.2 Validation Engine output — switch from hardcoded message to `error_code` + `params`

The Validation Engine built in Step 1 (10 release-checklist rules, extended informally by later steps'
"complete list of errors" pattern in `CheckMasterDataReadiness`/MBOM release) currently returns
human-readable Vietnamese strings. Change the output shape to:

```typescript
type ValidationError = {
  code: string;        // stable, namespaced, e.g. "MBOM.PHANTOM_MISSING_CHILD", "ITEM_REVISION.NOT_RELEASED"
  params?: Record<string, string | number>;  // interpolation values, e.g. { lineSeq: 50, componentCode: "SFG-ROLL-EPDM-R1" }
};
```

Do not change any validation *logic* — only the shape of what gets returned when a rule fails. Build the
corresponding `code → message template` mapping for all 10 rules (plus any error codes already in use
by `CheckMasterDataReadiness` and MBOM release) into `libs/i18n-ui-shared`'s shared bundle (§A.3), in all
4 locales, so every Console screen that renders validation errors (Item/MBOM/Routing/Production Version
Release, WO `CheckMasterDataReadiness`) gets translated messages automatically without each screen
re-implementing message formatting.

### B.3 Event schema version bump

Bump to `.v2` and update payload shape for every event carrying a now-`LocalizedText` field:
`MES.MasterData.ItemRevisionReleased.v2`, `MES.MasterData.MBOMReleased.v2` (if it carries names),
`MES.MasterData.WorkCenterActivated.v2`, `MES.MasterData.EquipmentActivated.v2`. Register the new
versions in Schema Registry alongside — do not delete — the `.v1` versions (standard backward-compatible
evolution per the platform's existing event-versioning convention).

### B.4 API surface changes

- Every `GET`/`POST`/`PUT` endpoint that reads/writes a translatable field now accepts/returns the full
  `LocalizedText` object for that field, not a plain string. Validate incoming writes with
  `localizedTextSchema` (§A.1) — reject a write missing the `vi` key.
- Do **not** add an `Accept-Language`-based resolution layer to any read endpoint — per the strategy
  decision in §0, resolution is a frontend concern. The API always returns the full multi-locale object.

---

## PART C — Consumers in Go services (read-models must carry `LocalizedText`, not resolve it)

`mes-execution-service`, `mes-traceability-service`, and `mes-kiosk-gateway-service` each maintain local
read-model tables (`rm_item_revision`, etc.) populated from consumed Master Data events. Update:

- Read-model table columns for any previously-plain-string translatable field become `jsonb`, storing
  the full `LocalizedText` object exactly as received in the event payload — these services do not
  resolve a locale server-side; they pass the object through to whatever renders it (a printed label,
  an API response consumed by Console/Kiosk UI).
- `mes-traceability-service`'s `md_label_template` gains locale support for static template text (field
  labels printed on physical labels) — dynamic content (lot codes, QR data) is not translatable and
  stays as-is; only the static surrounding text on the label template needs a `LocalizedText` treatment.
  Which locale prints on a given label is determined by the terminal/operator's `preferred_locale` at
  print time, passed through from `mes-kiosk-gateway-service`.
- Update event consumers for the `.v2` schema versions from §B.3 — consume `.v2` going forward; keep
  `.v1` consumer compatibility only if any currently-live consumer cannot be updated in this same step
  (there should not be any, since all 3 Go services are being updated together here).

---

## PART D — Frontend retrofit (`mes-console`, `kiosk-operator-ui`, `portal`)

### D.1 `mes-console`

- Wire `libs/i18n-ui-shared`'s `createI18nConfig`, add a locale switcher (4-option dropdown, flag or
  language-name labeled) in the top nav, persisting the choice to the Keycloak `locale` attribute (§A.4)
  on change so it follows the user across sessions and across future WMS/QMS Console apps once they
  exist.
- Every screen displaying a translatable master-data field (Item, MBOM line component names, WorkCenter,
  Equipment, Skill, ReasonCode, WorkInstruction) uses `useLocalizedText()` instead of rendering the raw
  field.
- Every create/edit form for a translatable field renders a small 4-tab sub-input (`VI | EN | JA | KO`)
  next to that field, `VI` required, others optional — this is the authoring UI for §B.1's `jsonb`
  columns. Do not build 4 separate top-level forms per locale; it's one form with a tabbed field, so a
  planner can fill all 4 without navigating away.
- Validation error rendering (already established in Step 6/7 as "render the complete list, not just
  the first") now maps each `error_code` through the shared bundle instead of displaying `params`-less
  raw text.

### D.2 `kiosk-operator-ui`

- Locale resolution defaults to the logged-in `md_employee.preferred_locale` (§B.1) rather than a
  browser-detected or manually-chosen locale — a shared kiosk tablet is used by many operators per
  shift, so the language must follow the employee's login, not the device. Provide a locale override
  control on the login/terminal screen only as a fallback for an employee without a saved preference.
- All operation-confirmation screen labels (`ConfirmationMode`, field prompts, reason-code descriptions)
  resolve through the same `libs/i18n-ui-shared` bundle and `LocalizedText` fields.

### D.3 `portal`

- Locale switcher wired the same way as Console (§D.1) — Portal is the first touchpoint after login for
  executive/multi-cluster users, so its locale choice (persisted to Keycloak) becomes every other app's
  starting locale via §A.3's detection order.

---

## 1. Non-Goals for this entire step

- Do not retrofit `hello-world-service` — it has no user-facing translatable content.
- Do not build WMS/QMS-specific translation content now — WMS/QMS don't exist yet (Phase 2/3). This
  step only ensures they inherit the pattern; do not pre-build placeholder `wms-console`/`qms-console`
  i18n wiring.
- Do not localize log messages, trace span names, or any internal observability output (Grafana/Tempo/
  Loki) — those remain English/technical for engineering use regardless of user-facing locale.
- Do not add locale-specific business logic (e.g. different validation rules per country) — locale here
  means display language only, never a change in business rule behavior.

---

## 2. Definition of Done

| # | Item | Verification |
|---|---|---|
| 1 | `libs/shared-kernel` and `libs/shared-kernel-go` both export matching `LocalizedText`/`SupportedLocale` shapes that round-trip identically over JSON | Unit test: serialize in TS, deserialize in Go, compare |
| 2 | All 9 listed `md_*` columns migrated to `jsonb`, existing data backfilled into `vi` key with zero data loss | Row-count and spot-check comparison pre/post migration |
| 3 | Validation Engine returns `{code, params}` for every one of the 10 release-checklist rules plus `CheckMasterDataReadiness` | Unit test per rule |
| 4 | Event schemas bumped to `.v2` for all 4 listed events, registered in Schema Registry, `.v1` still present | Schema Registry inspection |
| 5 | All 3 Go services' read-models store and pass through `LocalizedText` correctly, no server-side locale resolution present in any Go service | Code review + integration test: publish a `.v2` event, confirm read-model row has the full multi-locale object |
| 6 | `mes-console` locale switcher changes displayed language instantly with zero network requests, and persists across logout/login | Manual test |
| 7 | Creating an Item/WorkCenter/Skill with only `vi` filled succeeds; attempting to save with `vi` empty is rejected client- and server-side | Manual test both layers |
| 8 | `kiosk-operator-ui` shows the correct language automatically based on the logging-in employee's `preferred_locale`, without any manual selection needed for an employee with one on file | Manual test with 2 employees, 2 different preferred locales |
| 9 | A printed label (via `mes-traceability-service`) renders static template text in the printing operator's locale | Manual test at `OP-CUT`/`OP-MOLD` with 2 different operator locales |
| 10 | No `*Code` field or `md_employee.full_name` was converted to `LocalizedText` anywhere | Grep/schema review confirming these remain plain scalar columns |

---

## 3. Process Reminder

Update `process/PROJECT_WORKLOAD_PROGRESS.md`: insert this as **Phase 1, Step 8**, renumbering the
existing WMS/QMS/E2E steps down by one accordingly (old Step 8 `wms-master-data-service` becomes Step 9,
and so on). Update `AI_CONTEXT.md` §3 (Architectural Principles) to add the i18n contract rules from
Part A as permanent platform-wide rules, and §7 (Services and Ownership) with the new/changed event
versions and shared-kernel exports, so future WMS/QMS work in `AI_CONTEXT.md`'s "How To Continue Work"
section inherits this without needing to rediscover it.