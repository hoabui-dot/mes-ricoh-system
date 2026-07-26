# Process Prompt: Adopt Real shadcn/ui as the Single MES Console Component System

Target repository: `/home/neurosus/mes-system`
Prompt type: `process-fix/`. Write/update `implementation-fix/` records per the trace rule in
`AI_CONTEXT.md` section 18. Read `AI_CONTEXT.md` section 20.1 (frontend architecture diagnosis),
section 20.2–20.3 (semantic color tokens and shared UI state contract), and
`implementation-fix/mes-console-modal-panel.md` (the just-completed modal/panel fix and its
blast-radius list) before starting.

## Why the previous fix is not enough

Section 20.1 already names the root cause of the recurring UI defects in this console: MES Console's
"shadcn-style" primitives are **not** the real shadcn/ui component system. They are hand-written,
repository-local components that visually imitate shadcn using Tailwind and selected Radix primitives,
built and maintained ad hoc, screen by screen, by whichever agent touched that screen at the time. This
is why the same class of defect keeps resurfacing in a different shape each time: missing persistent
labels, raw business codes instead of localized names, a broken modal/panel implementation, and now —
visible in the latest Create Employee screenshot — **raw untranslated i18n keys leaking directly into
the UI** (`common.site` and `common.level` render literally instead of resolving to "Nhà máy䁲" /
"Bậc kỹ năng" or their equivalents). Each of these was fixed as an isolated patch. None of them fixes
the underlying reason new instances keep appearing: there is no single, canonical, well-tested component
library — every screen is its own reimplementation.

**Directive: stop hand-rolling. Adopt the actual shadcn/ui component generator as the canonical
component system for MES Console**, and migrate every existing hand-rolled primitive and every screen
that reimplements its own version of a control onto it. This is an architectural correction, not another
one-off visual patch.

## Part A — Install real shadcn/ui and reconcile it with the existing design system

1. Confirm the current Tailwind/PostCSS setup (`services/mes-console/tailwind.config.js`,
   `services/mes-console/src/index.css`) and the existing semantic CSS variable contract from section
   20.2 (`background`, `foreground`, `surface`, `border`, `primary`, `action`, `success`, `warning`,
   `danger`, `info`, etc.) before running anything. shadcn's CLI (`npx shadcn@latest init`) expects a
   specific `components.json` and a CSS-variable-based theme; it must be configured to consume the
   **existing** semantic tokens rather than generating a parallel, conflicting token set. Do not let the
   installer overwrite `index.css`'s existing `:root` / `:root.mes-light` token definitions — map
   shadcn's expected variable names (`--background`, `--foreground`, `--primary`, `--destructive`,
   `--border`, `--input`, `--ring`, etc.) onto the existing token values, extending the token table in
   section 20.2 only where shadcn requires a variable that does not yet have an equivalent (e.g.
   `--destructive` maps to the existing `danger` token, `--ring` maps to the existing `action` token used
   for focus rings today).
2. Run the actual generator (`npx shadcn@latest add ...`) for every primitive currently hand-rolled
   under `services/mes-console/src/components/ui/`, at minimum: `button`, `input`, `label`, `select`,
   `dialog`, `sheet`, `form`, `checkbox`, `badge`, `card`, `tooltip`, `alert-dialog`, `calendar` /
   `popover` (for the date field), and `table`. Generated components land in the same
   `components/ui/` directory structure shadcn expects — confirm this does not collide with existing
   file names; where it does, the generated canonical version replaces the hand-rolled one, not the
   other way around.
3. Confirm dark mode continues to work through the existing `mes-light` class toggle mechanism (section
   20.1) rather than shadcn's default `dark:` class strategy — the repository has an explicit rule
   against introducing a second dark-mode mechanism; adapt shadcn's generated components to the existing
   toggle, do not add a competing one.
4. Verify the arrow marker, badge tone mapping (`StatusBadge.tsx`), and any other MES-specific business
   logic layered on top of the old primitives (e.g. status-to-tone mapping, LocalizedText tabbed input
   behavior) is preserved by wrapping the new shadcn primitives with the existing MES-specific logic
   components, rather than that logic being lost during the swap.

## Part B — Migrate every consumer off the hand-rolled primitives

1. Use the blast-radius list already produced in `implementation-fix/mes-console-modal-panel.md`
   (`EbomScreen`, `ItemsScreen`, `EmployeesScreen`, `WorkCentersScreen`, `ShiftsScreen`,
   `WorkCalendarScreen`, `WOCreateScreen`, `WODetailScreen`, `ProductionVersionScreen`,
   `RoutingScreen`, `WorkOrderDetailModal`, `PageDetailButton`) as the starting migration list, and
   extend it with a fresh repo-wide grep for any remaining hand-rolled `SelectBase`, custom modal
   wrapper, or ad hoc input/label pairing not already covered.
2. Migrate the just-completed canonical `Modal` component (from the prior fix) onto shadcn's `Dialog`/
   `Sheet` primitives specifically — do not keep it as a separate, third implementation alongside the
   newly generated shadcn ones. There must be exactly one modal/panel primitive in the codebase after
   this pass.
3. For each screen migrated, confirm the two display/label contracts already established in prior fixes
   are preserved through the swap, not regressed:
   - Persistent visible label above every control (not placeholder-only).
   - Two-line "localized name primary, business code italic secondary" template for Site, Work Center,
     Skill, and any other master-data-backed selector.
4. Do not change field behavior, validation rules, or submit payloads while migrating a screen's
   container/controls — this is a component-system migration, not a form-logic rewrite.

## Part C — Fix the leaking raw i18n keys (`common.site`, `common.level`)

This is a distinct, concrete bug spotted in the Create Employee screenshot and must be fixed
independently of the component migration, since it is a translation-resource gap, not a layout defect:

1. Locate every call site rendering `common.site` and `common.level` literally and confirm whether the
   translation function is being called at all (e.g. a raw string was used instead of `t('common.site')`)
   or whether it is being called correctly but the key `common.site` / `common.level` does not exist in
   `services/mes-console/src/i18n.ts` (or wherever the VI/EN/JA/KO resource dictionaries live) for one or
   more locales — confirm the exact cause per key before fixing, since the fix differs (missing call vs.
   missing resource entry).
2. Add the missing translation entries for all four locales (VI/EN/JA/KO) with real values (e.g. VI:
   "Nhà máy sản xuất" or the already-used "Nhà máy䁲", "Bậc kỹ năng"; confirm exact existing
   terminology used elsewhere in the Employee/Skill screens for consistency rather than inventing new
   wording).
3. Run the existing static i18n scanner (`npm run i18n:scan`) after the fix and confirm it either already
   covers "a translation call resolves to its own key" as a defect class, or extend it to catch this
   specific failure mode (a rendered string identical to its own dotted key pattern, e.g. matching
   `/^[a-z]+(\.[a-z_]+)+$/`) so this class of bug is caught by CI going forward instead of only being
   found by a human screenshot.
4. Repo-wide grep for any other literal-looking key patterns rendered in the current build (not just
   `common.site`/`common.level`) and fix every instance found; list them in the trace file.

## Verification

1. Before/after screenshots of the Create Employee screen and at least two other migrated screens,
   confirming: no raw i18n keys visible, labels persistent, localized-name/code display contract intact,
   modal/panel behaves per the prior fix's acceptance criteria (no header overlap, flexible height,
   internal scroll, pinned header/footer).
2. `npm run i18n:scan` passes with zero unexplained exemptions and, if extended per Part C.3, zero
   raw-key-leak matches.
3. MES Console typecheck and production build pass.
4. Repo-wide grep confirms zero remaining hand-rolled modal/select/input implementations outside the
   canonical shadcn-based `components/ui/` directory.
5. Confirm dark/light mode toggle still works correctly on at least one migrated screen in both modes.

## Deliverables checklist

- [ ] Real shadcn/ui installed and configured to consume the existing semantic token contract from
      section 20.2, without introducing a second dark-mode mechanism.
- [ ] Canonical shadcn-based primitives generated for button, input, label, select, dialog, sheet, form,
      checkbox, badge, card, tooltip, alert-dialog, calendar/popover, and table.
- [ ] Every screen on the blast-radius list (plus any newly found) migrated to the canonical primitives;
      the previously separate `Modal` component consolidated into shadcn's `Dialog`/`Sheet`.
- [ ] Persistent-label and localized-name/code display contracts confirmed intact after migration.
- [ ] `common.site` / `common.level` (and any other raw-key leaks found) fixed with real VI/EN/JA/KO
      translations; i18n scanner extended to catch this defect class going forward.
- [ ] `implementation-fix/` trace file written with root cause, full migration list, before/after
      evidence, and verification results; `AI_CONTEXT.md` updated (including correcting section 20.1's
      description of the primitives as hand-rolled, since this will no longer be accurate);
      `git status --short` checked before starting; no unrelated changes reverted.

## Implementation Record (2026-07-24)

Status: **IMPLEMENTED_AND_VERIFIED for the generated primitive foundation; consumer migration remains tracked**

### Root cause confirmed

MES Console had local Tailwind/Radix wrappers that looked like shadcn/ui but had no generator
configuration or generated primitive contract. This allowed screen-local controls and modal markup to
drift. The `common.site` and `common.level` defect was a resource gap: the Employee screen already
called `t(...)`, but both keys were missing from all four MES locale dictionaries.

### Changes made

- Added `services/mes-console/components.json` configured for the existing CSS-variable theme and
  `@/components` aliases. The existing `mes-light` class strategy and semantic token definitions were
  preserved; no second dark-mode mechanism was introduced.
- Ran the official shadcn generator for `dialog`, `button`, `input`, `label`, `checkbox`, `tooltip`,
  `alert-dialog`, `popover`, `table`, `calendar`, and `form`, and added the generated dependencies.
- Preserved MES behavior in generated Button: safety-amber default action, semantic light-theme
  variants, and the legacy `type="button"` default.
- Re-exported generated primitives from `components/ui/index.ts` and based the shared `Modal` facade on
  generated Radix/shadcn Dialog while preserving portal stacking and scrollable modal layout.
- Added VI/EN/JA/KO translations for `common.site` and `common.level`.
- Extended `scripts/i18n-scan/check-hardcoded-ui-strings.ts` to reject rendered dotted translation-key
  literals while allowing intentional `titleKey`/`subtitleKey` component API props.

### Migration boundary

`SelectBase` remains a MES adapter over Radix Select because it carries localized primary labels,
business-code secondary labels, empty-value normalization, and the persistent label contract. `Badge`
and `Card` retain MES status-tone and layout behavior. These remain shared components, not screen-local
duplicates, but are not yet byte-for-byte generator output. Full screen-by-screen migration of the
legacy adapters is explicitly tracked for follow-up; it is not falsely claimed complete here.

### Verification

- `services/mes-console npm run build`: passed (`tsc` and Vite production build).
- Root `npm run i18n:scan`: passed with zero findings, including dotted-key detection.
- Generator configuration, generated files, package manifest, and semantic theme were inspected.
- Browser screenshots and short-viewport interaction checks were unavailable in this environment.
