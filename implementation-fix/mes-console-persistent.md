# Process Prompt: MES Console Persistent Field Labels and Localized Display Name Completeness

Target repository: `/home/neurosus/mes-system`
Prompt type: `process-fix/`. Write/update `implementation-fix/` records per the trace rule in
`AI_CONTEXT.md` section 18. Read `AI_CONTEXT.md` section 13 (i18n platform and governance), section
20.2–20.3 (semantic tokens and shared UI components), section 31/38/42/43 (existing precedents for
localized-name-primary display and required-Vietnamese-name validation) before starting. Read the
actual `EmployeesScreen.tsx` (or equivalent workforce create-employee form) source before changing
anything — do not assume field names or handler behavior from the screenshot alone.

Apply the source-of-truth precedence in section 0 throughout, and classify every claim with the
evidence-status vocabulary.

## Problem statement

The attached screenshot of the "Tạo nhân công" (Create Employee) form shows two distinct, related
defects that are very likely repeated across other MES Console forms, not unique to this screen:

1. **No persistent field labels.** Several controls — the Site select, Work Center select, status
   select, and date field — show only a value or a bare placeholder inside the control itself, with
   no label rendered above or beside it. Once a value is selected (e.g. `SITE-KZ3`, `WC-CUTTING`), the
   user has no way to tell what that field represents, because nothing distinguishes "this control is
   labeled Site" from "this control just happens to contain the text SITE-KZ3."
2. **Raw business codes shown instead of localized display names.** The Site select
   (`SITE-KZ3`), Work Center select (`WC-CUTTING`), and the skill preview list
   (`SK_INSPECTION`, `SK_MIX_MASTER`, `SK_VULCAN_OPERATOR`) all render the internal code as if it were
   the display value. This is the same class of defect the repository already fixed once for Item Base
   UOM (section 42: `Full name (SIGN)`) and for `md_item_revision` (section 43: joined localized
   `item_name` alongside `item_code`) — it has simply not been applied to Site, Work Center, and Skill
   yet.

Both defects must be fixed as a systemic pattern in shared components and in the underlying data, not
patched ad hoc on this one screen. Patch the shared components first, then verify every consumer,
starting with the Employee create form since it is the confirmed reproduction case.

## Part A — Persistent visible labels on every form control

1. Audit the shared `Input`, `SelectBase`, date-picker, and any checkbox/list-row components under
   `services/mes-console/src/components/ui/` for whether they currently support a `label` prop that
   renders as persistent text above (or beside, per the existing design token) the control — not only
   as placeholder text inside it. If a `label` prop already exists but is optional and frequently
   omitted, that is the actual defect: treat this as a call-site audit problem, not a missing-feature
   problem.
2. Make `label` an effectively required prop going forward for these shared components (TypeScript
   prop typing, and if the repo has an existing lint/audit script pattern like `npm run i18n:scan`,
   consider whether a similar static check can flag a `SelectBase`/`Input` usage with no `label`).
   Placeholder text becomes secondary hint content shown only while the field is empty; it must never
   be the only way to identify a filled field.
3. Fix `EmployeesScreen.tsx` (or the actual file, confirm exact path first) as the primary reproduction
   case: add persistent labels for Employee code (Mã nhân viên), Full name (Họ và tên), Site, Work
   Center, Status (Trạng thái / Đang làm việc), the date field (confirm its exact business meaning —
   hire date, effective date, or something else — from the create handler before labeling it), and the
   skill-level select (`L2`, `L3`) inside the skill preview rows.
4. Repo-wide audit: search every create/edit modal in MES Console for `SelectBase`, `Input`, and
   date-picker usages missing a visible label, and fix each one found. Record the full list of affected
   screens in the trace file — do not silently fix only the reproduction case and imply the rest were
   checked if they were not.

## Part B — Localized-name-primary, code-secondary display contract

Establish one canonical two-line option/value template, matching the precedent already set for Item
Base UOM and Item Revision:

- **Primary line**: the localized display name for the current locale (VI/EN/JA/KO with the existing
  fallback chain), normal weight, `text-primary` token.
- **Secondary line**: the business code (e.g. `SITE-KZ3`, `WC-CUTTING`, `SK_INSPECTION`), italic,
  smaller/muted (`text-muted` or `ts` token), directly under the name — not appended in parentheses
  after the name on the same line.

1. Extend the shared `SelectBase` option renderer (and any other dropdown/list-row renderer used for
   these fields) to support this two-line template as a reusable pattern, not a one-off per screen.
2. Apply it to, at minimum:
   - Site selector (currently `SITE-KZ3`).
   - Work Center selector (currently `WC-CUTTING`).
   - Skill preview list rows (currently `SK_INSPECTION`, `SK_MIX_MASTER`, `SK_VULCAN_OPERATOR`).
3. Repo-wide audit: search for every other selector or list populated from a master-data resource that
   has a LocalizedText `name` field (Reason Codes, Equipment, Shifts, Routing Operations, Work
   Instructions, and any others) and confirm whether each one already resolves the localized name or
   also has this same raw-code defect. Fix every instance found; list them in the trace file.
4. Where a selector's underlying API response does not yet include the joined localized `name` (only
   `code`/`id`), fix the query/endpoint to join and return `name` alongside `code`, mirroring the
   `md_item_revision` join precedent in section 43. Do not solve this by making the frontend guess or
   title-case the code.

## Part C — Data completeness: backfill missing localized names

The display fix in Part B will surface any master-data rows that genuinely have no localized `name`
value at all (null, empty, or a name field that was silently seeded as a copy of the code). This is the
same class of defect the repository already built tooling for — reuse it, do not invent a parallel
mechanism.

1. Audit `md_site`, `md_work_center`, `md_skill`, and any other tables feeding the selectors identified
   in Part B for rows with missing, empty, or code-mirrored localized `name` JSONB.
2. Run the existing i18n audit script (`npm run i18n:audit:mes`) against these tables; extend the
   script if it does not yet cover them.
3. Backfill using the existing seed-data enrichment script pattern
   (`npm run i18n:seed:enrich:mes`), extending it to cover these tables if it does not already. Do not
   hand-write ad hoc `UPDATE` statements outside the governed enrichment tooling.
4. For any backfilled value the enrichment heuristic cannot confidently resolve, register it as a flag
   in the existing Translation Review Queue / `i18n_data_quality_flag` mechanism (section 13, section
   12c precedent for QMS JA/KO fallback registration) rather than silently guessing a translation and
   marking the row complete.
5. Going forward, require a non-empty Vietnamese primary localized name on create for Site, Work
   Center, and Skill — mirroring the rule already enforced for MBOM/Routing (section 29) and Item
   (section 31). Confirm by reading each resource's create handler whether this validation already
   exists before assuming it is missing; add it only where it is genuinely absent.

## Part D — Employee create form: concrete fix checklist

Since this screen is the confirmed reproduction case, verify each of the following explicitly, not just
generally:

1. Employee code, Full name, Site, Work Center, Status, and the date field each have a persistent
   visible label.
2. Site select shows the localized site name as primary text with `SITE-KZ3` as italic secondary text.
3. Work Center select shows the localized work center name as primary text with `WC-CUTTING` as italic
   secondary text.
4. Skill preview rows show the localized skill name as primary text with `SK_INSPECTION` /
   `SK_MIX_MASTER` / `SK_VULCAN_OPERATOR` as italic secondary text; the level select (`L2`, `L3`)
   retains a visible "Level" / "Bậc kỹ năng" label since it is not itself a translation gap.
5. If any Site, Work Center, or Skill row involved in this screen's demo data turns out to have no
   localized name in the database (per Part C's audit), confirm it was backfilled or flagged before
   claiming this screen is fixed — a UI fix that reveals an empty name is not a complete fix.

## Verification

1. Before/after screenshots of the Employee create form.
2. A repo-wide list (in the trace file) of every `SelectBase`/dropdown usage found rendering a raw
   code/id without a paired localized name, and its fix status.
3. `npm run i18n:scan` passes with zero new unexplained exemptions.
4. MES Console typecheck and production build pass.
5. At least one live API response for the Site, Work Center, and Skill list endpoints is captured in
   the trace file showing the joined localized `name` field is now present.
6. Confirm zero regressions: fields that already had correct labels/localized names before this pass
   must not be altered in a way that changes their existing correct behavior.

## Deliverables checklist

- [ ] Shared `Input`/`SelectBase`/date-picker components support and effectively require a persistent
      `label`; Employee create form and every other audited screen show visible labels on every field.
- [ ] Shared two-line "localized name primary, code italic secondary" option template implemented in
      `SelectBase` and applied to Site, Work Center, and Skill selectors; repo-wide audit list of other
      affected selectors produced and fixed.
- [ ] Underlying list/select API endpoints for Site, Work Center, and Skill confirmed to return joined
      localized `name` alongside `code`.
- [ ] Master-data rows with missing/empty/code-mirrored localized names audited, backfilled via the
      existing i18n enrichment tooling, and any low-confidence backfills registered in the Translation
      Review Queue.
- [ ] Create-time validation requiring a non-empty Vietnamese primary name confirmed or added for Site,
      Work Center, and Skill.
- [ ] All claims classified with the evidence-status vocabulary; `implementation-fix/` trace file
      written with the full audit list, before/after evidence, and verification commands/results;
      `AI_CONTEXT.md` updated; `git status --short` checked before starting; no unrelated changes
      reverted.