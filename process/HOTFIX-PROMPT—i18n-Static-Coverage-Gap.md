# HOTFIX PROMPT — i18n Static Coverage Gap & `vi`-Key Data Quality Remediation
### (Retroactive fix to Phase 1, Step 8 — inserted before Phase 2 continues)

**Project:** MOM Platform (MES / WMS / QMS) — Won Seal Tech
**Trigger:** Manual QA on `mes-console` (Work Calendar screen, WorkCenter list) found two distinct
defects while switching locale to `ja`. Both are documented below with root cause. **Do not treat this
as one bug — it is two independent defects requiring two independent remediations, plus a shared
governance gate so neither class of defect can silently reappear when WMS/QMS build their own i18n
data in later phases.**

---

## 0. Root Cause — read this before touching any code

### 0.1 Defect A — Static UI string coverage gap (execution defect)

Step 8's Definition of Done (`process/PROJECT_WORKLOAD_PROGRESS.md` Step 8 DoD #6) only tested that
*"locale switcher changes displayed language instantly"* — it verified the **mechanism** works, not
that **every screen** was actually wired to it. The implementation wired the shell (sidebar, page
titles) and stopped short of full-screen coverage. Confirmed unwired strings on the Work Calendar
screen alone: `WorkCenter filter`, `Shift`, `Employees`, `Start date`, `Period`, `Days of week`,
`Assign Schedule`, `Bulk Result`, `No bulk assignment run yet.`, and the `HEADCOUNT` column header on
the WorkCenter list. Worst instance: the bulk-assignment preview sentence (*"Sẽ tạo lịch cho N nhân
viên x M ngày..."*) is a **hardcoded Vietnamese template string interpolated directly in component
code**, not sourced from any locale bundle — it renders in Vietnamese even when the active locale is
`ja`. This is a coverage/execution gap: the pattern (`useLocalizedText()`, shared bundle) is correct and
already proven elsewhere in the same screen (sidebar/header) — it simply wasn't applied everywhere.

### 0.2 Defect B — `vi`-key data quality (this prompt's original design gap, not an execution error)

The Step 8 B.1 backfill (`UPDATE table SET name = jsonb_build_object('vi', name)`) assumed all
pre-existing seed values were genuinely Vietnamese text and moved them into the `vi` key verbatim. In
reality, Step 1's seed data already mixed English and Vietnamese values in the same columns (e.g.
`Rubber Cutting Work Center` alongside `Cụm máy ép thủy lực gia nhiệt`). The backfill preserved this
mix unchanged inside `vi`. `resolveLocalizedText`'s fallback chain (`requested locale → DEFAULT_LOCALE
('vi') → first available key`) is working exactly as designed — with no `en`/`ja`/`ko` values ever
entered, every locale falls back to `vi`, and `vi` itself contains whatever language the original
seed happened to use. **The screenshot is fallback logic behaving correctly on top of unaudited data.**
The Step 8 prompt is at fault here: it specified a mechanical backfill with no data-quality gate before
or after the migration.

---

## 1. Fixed Principles for This Hotfix (non-negotiable)

1. **Never auto-translate or auto-guess a correct value.** If a `vi`-key value is suspected to actually
   be English, the fix is **not** to silently move it to the `en` key — that replaces one unaudited
   assumption with another. Suspected rows must be flagged for **human review** by whoever the source
   system already trusts to author this data (planner/engineer, via the Console UI editor already built
   in Step 8 §D.1).
2. **Do not modify the `LocalizedText` contract shape** (`libs/shared-kernel`, `libs/shared-kernel-go`)
   to carry review-status metadata. That type is a wire contract shared across TS/Go/Kafka events — a
   round-trip-critical shape defined in Step 8 §A.1/A.2. Track review status in a **separate sidecar
   table**, not inside the `jsonb` value itself.
3. **Both defect classes get a permanent, automated, CI-enforced gate**, not just a one-time fix. A
   fix without a gate is not accepted as complete for this hotfix.

---

## PART A — Defect B: `vi`-key data quality remediation

### A.1 Build a one-time audit script (`scripts/i18n-audit/detect-mislabeled-vi.ts`)

For every column converted to `LocalizedText` in Step 8 §B.1 (all 9 listed `md_*` columns), scan every
row's `vi` value and apply a **heuristic, not a translation**, language check:

- **Vietnamese-signal check:** does the string contain at least one Vietnamese-specific diacritic
  character (the full set of Vietnamese combining/precomposed vowels + `đ`/`Đ`)? If yes → very likely
  genuinely Vietnamese, do not flag.
- **No-diacritic strings:** a `vi` value with zero Vietnamese diacritics is not automatically wrong
  (short codes, numbers, or genuinely diacritic-free Vietnamese words exist) — but it is exactly the
  ambiguous case that caused this bug, so route it through a **secondary check**: run a lightweight
  language-detection library (e.g. `franc` or equivalent already permissible under the project's
  dependency policy) against the string. If it confidently detects `eng` (English) with no Vietnamese
  diacritics present → flag as `SUSPECT_NOT_VI`.
- Write results to a new table (not a file — must be queryable from Console UI, see §A.3):

```sql
create table i18n_data_quality_flag (
  flag_id uuid primary key default gen_random_uuid(),
  table_name varchar(100) not null,
  column_name varchar(100) not null,
  row_id uuid not null,
  flagged_locale varchar(5) not null default 'vi',
  current_value text not null,           -- snapshot of the suspect value at flag time
  detected_language_guess varchar(10),   -- e.g. 'eng', best-effort, informational only
  confidence decimal(4,3),
  status varchar(20) not null default 'OPEN',  -- OPEN | RESOLVED | DISMISSED
  flagged_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
);
```

This table lives in `mes_master_data_db` (owned by `mes-master-data-service`, since it's auditing that
service's data) but is a pure audit/workflow table — it does **not** alter `md_item.item_name` or any
other production column, and it is not part of the `LocalizedText` contract.

### A.2 Run the audit, do not auto-fix

Run the script once against production data. Expected output: a populated `i18n_data_quality_flag`
table with `status = 'OPEN'` rows. **Do not** write any code path that reads this table and
auto-populates the `en` key from the flagged `vi` value — that is precisely the mistake being corrected.
The flag exists to route the row to a human, nothing else.

### A.3 Console UI — Translation Review Queue (minimal addition to `mes-console`)

- New screen `/console/mes/i18n-review` (visible to roles that already have master-data Edit
  permission — reuse existing role gating, do not invent a new permission scope for this).
- List view: every `OPEN` row from `i18n_data_quality_flag`, grouped by `table_name`, showing
  `current_value` and `detected_language_guess` for context.
- Each row links directly into that entity's **existing** edit screen (Item / WorkCenter / Equipment /
  Skill / ReasonCode / etc. — whichever the `table_name` maps to) with the 4-tab `VI | EN | JA | KO`
  locale editor already built in Step 8 §D.1, deep-linked to the flagged field. Do not build a
  standalone edit form here — reuse what exists.
- A "Mark Resolved" / "Dismiss (false positive)" action on the review screen updates
  `i18n_data_quality_flag.status` — does **not** touch the underlying entity table; the actual data fix
  happens through the entity's own edit form and its own existing `PUT` endpoint (which is already
  `localizedTextSchema`-validated per Step 8 §B.4).
- This queue is a **workflow aid**, not a blocking mechanism — the platform continues operating
  normally on the existing fallback chain while the queue is worked through. Do not gate any other
  functionality on this queue reaching zero.

### A.4 Make this check recurring, not one-time

Add the same heuristic scan as a **required step in every future `varchar → LocalizedText` migration**
(WMS/QMS master data, when they retrofit or newly build translatable fields): the migration script
itself must run the diacritic/language-detection heuristic as part of the backfill, populate
`i18n_data_quality_flag` (create the cluster-local equivalent table in `wms_master_data_db`/
`qms_*_db` when those services reach this point) **in the same transaction as the backfill**, not as an
afterthought run later. This closes the exact gap that caused Defect B: the original Step 8 prompt
described the backfill mechanism but never required a quality check to run *alongside* it.

---

## PART B — Defect A: static UI string coverage remediation

### B.1 Immediate fixes (this hotfix)

Wire every currently-unwired string found in QA to the shared/app-local i18n bundle, across all 4
locales (`vi`/`en`/`ja`/`ko`):

- Work Calendar screen: `WorkCenter filter`, `Shift`, `Employees`, `Start date`, `Period`,
  `Days of week`, `Assign Schedule`, `Bulk Result`, `No bulk assignment run yet.`
- WorkCenter list: `HEADCOUNT` column header.
- **The bulk-assignment preview sentence** — move out of hardcoded Vietnamese template code entirely
  into the shared bundle as an interpolated key, e.g.:
  ```
  workCalendar.bulkPreview: "Will create schedule for {{employeeCount}} employees × {{dayCount}} days..."
  ```
  translated into all 4 locales, called via `t('workCalendar.bulkPreview', { employeeCount, dayCount })`
  (or the project's equivalent `i18next` interpolation call) — **never** string-concatenated or
  hardcoded in any single locale again, since this was the most severe instance (visibly wrong
  regardless of which locale is active).

### B.2 Full manual sweep of every screen built in Steps 5–7

Before closing this hotfix, walk every route already shipped in `kiosk-operator-ui` and `mes-console`
(both built before the i18n retrofit) and confirm each visible string is sourced from a bundle, not
hardcoded. Produce a per-screen checklist artifact (`docs/i18n/coverage-checklist.md` or equivalent) —
this is a one-time manual sweep to establish a clean baseline; §B.3 is what prevents regression from
here forward.

### B.3 Permanent CI gate — hardcoded-string scanner (this is the recurrence-prevention mechanism)

- Add an automated lint/static-analysis check (an `eslint` rule such as `eslint-plugin-i18next`'s
  `no-literal-string`, or an equivalent custom AST scanner if that package doesn't fit the project's
  existing lint setup) to `mes-console`, `kiosk-operator-ui`, and `portal`'s CI pipeline.
- The rule flags any JSX text node or user-facing string literal that is **not** passed through
  `t()`/`useLocalizedText()`/a bundle reference.
- **Exemptions must be explicit and visible**, never silent: a genuinely non-translatable string (a
  code value, a log line, a developer-facing console message) requires an inline
  `// i18n-exempt: <reason>` comment directly above it. A scan with zero unexplained flags is required
  to pass CI — an exemption with no reason comment is treated as a failure, not a pass.
- **This check is blocking.** A PR introducing a new hardcoded user-facing string fails CI. This is the
  direct answer to "no gate tested coverage" — from this hotfix forward, coverage is enforced
  automatically on every change, not just checked manually after the fact.

---

## 2. Governance Amendment (permanent, applies to WMS/QMS going forward)

Add to `stragegy.md` §7 (Anti-Drift Governance), alongside the existing Contract Testing gate:

> **i18n Completeness Check** (new, mandatory from this hotfix forward): before any Cluster or Console
> is marked `Completed ✅` in `PROJECT_WORKLOAD_PROGRESS.md`, two conditions must both hold:
> 1. The hardcoded-string CI scanner (§B.3) passes with zero unexplained exemptions on every frontend
>    app in that Cluster.
> 2. Any `varchar → LocalizedText` migration performed for that Cluster ran the language-quality
>    heuristic (§A.4) in the same transaction as the backfill, and either produced zero `OPEN` flags or
>    has a documented, reviewed remediation plan for the flags it did produce — "flags exist and are
>    silently ignored" is not an acceptable end state, but "flags exist, are tracked, and are being
>    worked through the Review Queue" is acceptable and does not block the Cluster's completion.

Write this as `docs/adr/000X-i18n-completeness-governance.md`, following the same ADR convention
already established for the Node-vs-Go decision.

---

## 3. Explicit Non-Goals for This Hotfix

- Do not attempt to auto-correct any flagged `vi` value — human review only, per §0's fixed principles.
- Do not retrofit this audit against WMS/QMS data — those clusters don't have master data yet; §A.4
  ensures the check runs when they do, this hotfix only cleans up the existing MES data.
- Do not change the `LocalizedText` wire contract or its fallback semantics — `resolveLocalizedText` is
  working correctly; nothing in Part A modifies it.
- Do not build a machine-translation auto-fill for missing `en`/`ja`/`ko` values — unchanged from Step
  8 §A.5's original non-goal; this hotfix does not reopen that decision.

---

## 4. Definition of Done

| # | Item | Verification |
|---|---|---|
| 1 | `i18n_data_quality_flag` table created, audit script run once against all 9 Step 8 columns | Row count check, spot-check a known mixed-language row (the `WorkCenter` example from QA) is flagged |
| 2 | Translation Review Queue screen live in `mes-console`, each flagged row deep-links to the correct entity's existing 4-tab locale editor | Manual test: open a flagged WorkCenter, correct `en`/`ja`/`ko`, mark resolved, confirm `status = RESOLVED` |
| 3 | Work Calendar screen fully wired — zero hardcoded strings remain, including the bulk-preview sentence, verified in all 4 locales | Manual test: switch to each of `vi`/`en`/`ja`/`ko`, screenshot every string on the screen |
| 4 | WorkCenter list `HEADCOUNT` header and all other previously-flagged strings wired | Same manual test across the WorkCenter screen |
| 5 | Full manual sweep checklist produced and attached for every Step 5–7 screen | `docs/i18n/coverage-checklist.md` present, one row per route, all marked clean |
| 6 | Hardcoded-string CI scanner added to all 3 frontend apps' pipelines, currently passing with zero unexplained exemptions | CI run, review exemption list |
| 7 | CI scanner **blocks** a deliberately introduced test hardcoded string in a throwaway branch | Negative test: add a raw string, confirm CI fails, revert |
| 8 | ADR `000X-i18n-completeness-governance.md` written, `stragegy.md` §7 updated | File review |
| 9 | `process/PROJECT_WORKLOAD_PROGRESS.md` updated with this hotfix entry | Tracker review |

---

## 5. Process Reminder

1. Update `process/PROJECT_WORKLOAD_PROGRESS.md`: insert this hotfix as an entry under Phase 1 Step 8
   (e.g. "Step 8a — i18n Coverage & Data Quality Hotfix"), status `Completed ✅` once DoD passes — do
   not renumber Phase 2/3 rows, this is a fix within Step 8's scope, not a new roadmap step.
2. Apply this hotfix **before or alongside** Phase 2 Step 1 (`wms-master-data-service`) — that service
   will be the first to write brand-new `LocalizedText` data, and the CI scanner (§B.3) plus the
   migration-time quality gate (§A.4) should already be active before `wms-console` (Phase 2 Step 3) is
   built, so WMS never accumulates the same class of defect in the first place.
3. Note in `AI_CONTEXT.md` §3 (Architectural Principles) that "backfilling existing string data into a
   new `LocalizedText` column requires a language-quality heuristic pass in the same migration, not a
   separate later step" — this is now a permanent platform rule, not a one-off Step 8 correction.