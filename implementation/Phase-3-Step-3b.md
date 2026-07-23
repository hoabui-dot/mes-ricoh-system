# PROMPT — Phase 3 Step 3b: QMS Console UI/UX Hardening Audit

**Target audience:** an AI coding agent working directly in this repository. This is an **audit-then-fix**
task, not a rebuild. The Step 3 implementation trace (`implementation/phase-3-3-qms-console.md`) does not
document whether several mandatory UX requirements from the original build prompt were actually met — do
not trust that report. Open the real source files and verify each item below against what's actually
rendered; fix whatever fails.

**Repository:** `/home/neurosus/mes-system`

**Read first:**
1. `services/wms-console/` (entire source tree) — this is the **reference implementation** you must match.
   Per `AI_CONTEXT.md` §1/§7, it already has "shared `SelectBase` controls and CRUD confirmation dialogs,
   common paginated tables (10/50/100 rows), complete status/type i18n coverage." QMS Console was instructed
   to be built the same way. Confirm it actually was.
2. `services/qms-console/` (entire source tree) — the thing you're auditing.
3. `implementation/wms-console-selectbase-crud-confirmation.md` and
   `implementation/wms-console-datatable-pagination-status-i18n.md` — these document the exact shared
   patterns WMS Console built. If QMS Console doesn't have equivalents, that's the gap.

---

## 0. Audit method — do this before changing any code

For each requirement below, don't ask the previous trace whether it's done — grep/open the actual files and
answer for yourself:

1. **Component primitives.** Search `services/qms-console/src` for every `<select`, `<table`, `<button`
   used as raw native HTML elements outside of the `components/ui/` primitives folder. Any form control,
   dropdown, table, dialog, or button built directly from bare HTML tags with only Tailwind utility classes
   — instead of a Radix-based/shadcn-style wrapper component — is a violation and must be replaced.
2. **Pagination.** Open every list screen (`Inspection Plans`, `Defect Codes`, `Inspection Results`, `NCR`,
   `CAPA`). Confirm each renders through a shared paginated table component with selectable page size
   (10/50/100), not an unpaginated full-array render.
3. **Confirmation before mutation.** Trace every state-changing action in the UI — plan release, defect
   code create/update, inspection result record/submit, NCR disposition, CAPA link-NCR, CAPA verify, CAPA
   close — and confirm each is gated behind an `AlertDialog`-style confirmation step before the API call
   fires, not a single click straight to the network request.
4. **Theme tokens.** Open `services/qms-console/tailwind.config.ts` (or equivalent) and the primary layout
   components. Confirm the industrial navy/charcoal/amber palette is actually wired in and visibly used for
   brand surfaces, primary actions, and status highlights — not just Tailwind's stock default palette
   (`blue-600`, `gray-800`, etc.) left untouched.
5. **i18n governance.** Confirm whether the JA/KO English-fallback gap noted in the Step 3 trace has a
   corresponding `i18n_data_quality_flag`/Review Queue entry, per the governance mechanism already built in
   Phase 1 Step 8a, or whether it's just undocumented prose with no tracked follow-up.

Write down what you actually found for each of the 5 items **before** starting fixes, as the opening section
of your remediation trace — this audit record is as important as the fix itself, since it's what makes the
next agent trust this report more than it should have trusted the last one.

---

## 1. Required fixes (apply wherever the audit found a gap)

### 1.1 Component primitives — headless UI, not raw HTML
Every interactive control must be built on Radix primitives, matching `wms-console`'s exact component API:
- Dropdowns/selects → the same `SelectBase` component `wms-console` already built (`@radix-ui/react-select`
  underneath). Do not use a native `<select>` anywhere in this app, including inside filter bars.
- Dialogs/modals → `@radix-ui/react-dialog` / `@radix-ui/react-alert-dialog` wrappers, matching
  `wms-console`'s `Dialog`/`AlertDialog` component shape.
- Tables → the same shared `DataTable` wrapper (built on `@tanstack/react-table`) `wms-console` uses, not a
  hand-rolled `<table>` with manual `.map()`.
- Tooltips, dropdown menus, tabs → same Radix-based wrappers as `wms-console`.

**Strongly preferred approach:** rather than re-implementing these a third time, extract `wms-console`'s
`components/ui/` primitives (`SelectBase`, `DataTable`, `Dialog`, `AlertDialog`, `Badge`, `Tabs`, etc.) into
a new shared workspace package — e.g. `libs/console-ui-shared` — and have both `wms-console` and
`qms-console` import from it. This directly serves this repo's own anti-drift governance principle ("Shared
code that doesn't contain domain logic belongs in `libs/`, not copy-pasted between services"). If time-boxed
and extraction is out of scope for this pass, at minimum copy the components file-for-file with identical
API, and note the duplication as a follow-up in your trace — do not leave native HTML elements in place
either way.

### 1.2 Pagination on every list
Reuse (or extract, per §1.1) `wms-console`'s paginated table component with the 10/50/100 page-size
selector, applied to: Inspection Plans, Defect Codes, Inspection Results, NCR, CAPA. Keep filter/pagination
state in the URL query string, same convention as `wms-console`.

### 1.3 Confirmation before every mutating action
Add an `AlertDialog` confirmation step before the API call for:
- Inspection Plan release (`POST /:id/release`) — "Release this inspection plan? It will become active for
  new inspections."
- Defect code create/update — simple confirm on save if the pattern in `wms-console` also confirms simple
  master-data edits; otherwise at minimum confirm status changes (`Active`/`Inactive`).
- Inspection Result record/submit (`POST /:id/record`) — especially important when the technician is about
  to submit a result that will fail (`OverallResult = Fail`): the confirmation copy should say something
  like "Submit this result? Since it includes a failing characteristic, an NCR will be raised automatically
  and this cannot be undone." This is a genuinely irreversible, consequential action (no DELETE/undo exists
  anywhere in this platform) — it deserves the clearest confirmation copy in the whole app.
- NCR disposition — "Confirm disposition: {DispositionType}. This will change the NCR status and cannot be
  reversed; corrections require a new disposition record."
- CAPA verify / close / link-NCR — each its own confirmation, worded specifically (don't reuse one generic
  "Are you sure?" string for all five actions — specific copy is what actually prevents mis-clicks, which is
  the whole point of this requirement).

Every confirmation dialog remains pessimistic per this platform's existing rule: disable the confirm button
and show a spinner until the API responds, close only on success, surface the real error inline on failure.

### 1.4 Theme — apply the actual brand palette

Design brief (verbatim, for your reference):

> Deep industrial navy blue primary, dark slate charcoal structure, vibrant safety amber / rubber orange
> accent, high-contrast, optimized for dense data on tablets and workstations, styled with Tailwind CSS and
> shadcn/ui.

Concrete tokens — **these must match `wms-console`'s tokens exactly**, since both consoles belong to the same
platform and must look like siblings, not separately-branded products:

```css
--navy-950: #061421;
--navy-900: #0A1F33;
--navy-800: #0F2A47;   /* primary brand, sidebar background */
--navy-700: #15395C;
--navy-600: #1D4E7A;

--slate-900: #111827;
--slate-800: #1E293B;
--slate-700: #334155;
--slate-400: #94A3B8;
--slate-200: #E2E8F0;
--slate-100: #F1F5F9;
--slate-50:  #F8FAFC;  /* app background — light, dense surface */

--accent-600: #EA6B2C; /* rubber orange — primary buttons, active nav, key highlights */
--accent-500: #F2803F;
--accent-100: #FCE7D9;

--status-success: #16A34A;
--status-warning: #F59E0B;
--status-danger:  #DC2626;
--status-info:    #2563EB;
--status-neutral: #64748B;
```

If `wms-console`'s `tailwind.config.ts` already defines these under different variable names, use those
exact names/values instead of introducing a second naming convention — the goal is one consistent token set
across every console, not two consoles that happen to use similar-looking colors independently. If no such
shared config exists yet, this is another good candidate for extraction into `libs/console-ui-shared` (or a
Tailwind preset) alongside §1.1, so `mes-console` can eventually be reconciled to the same tokens too — note
that as a recommendation in your trace even if you don't execute it now.

Apply visibly: navy sidebar/topbar, amber for primary buttons and active nav state and key metric
highlights on the dashboard, semantic status colors for NCR severity/CAPA status/result pass-fail — not the
Tailwind stock palette left as default `blue`/`gray`.

### 1.5 i18n governance closure
For the JA/KO fallback gap: register it properly through the existing `i18n_data_quality_flag` / Translation
Review Queue mechanism (built in Phase 1 Step 8a) rather than leaving it as unstructured prose in an
implementation trace. If QMS Console's translation resources aren't wired into the same review-queue
tooling MES/WMS use, wire them in — this is exactly the kind of "silently skipped flag" the governance rule
in `process/stragegy.md` §7 item 6 was written to prevent.

---

## 2. Definition of Done

- [ ] Audit section (§0) written first, with concrete findings per item, before any fix.
- [ ] Zero native `<select>`/hand-rolled `<table>`/bare `<dialog>` patterns remain outside `components/ui/`.
- [ ] Every list screen paginated (10/50/100), URL-persisted state.
- [ ] Every mutating action (listed in §1.3) has a specific, action-worded `AlertDialog` confirmation,
      pessimistic submit.
- [ ] Theme tokens match `wms-console`'s exactly (same names/values, not independently-approximated
      colors); visibly applied to sidebar, primary actions, and status badges.
- [ ] JA/KO gap is tracked through the real i18n data-quality/review-queue mechanism, not prose-only.
- [ ] `implementation/phase-3-3-qms-console.md` updated with a new "UI/UX Hardening Audit" section
      documenting what was found and what was changed — don't create a separate file that leaves the
      original trace's now-outdated claims unaddressed.
- [ ] If `libs/console-ui-shared` extraction was performed, `wms-console` is updated to import from it too
      (don't leave two divergent copies after creating a shared one) and both consoles' builds/typechecks
      still pass. If extraction was deferred, say so explicitly and why.