# Process Prompt: MES Console Modal/Panel Layout Root-Cause Fix (Height, Positioning, Header Overlap)

Target repository: `/home/neurosus/mes-system`
Prompt type: `process-fix/`. Write/update `implementation-fix/` records per the trace rule in
`AI_CONTEXT.md` section 18. Read `AI_CONTEXT.md` section 20.1 (repository/frontend architecture
diagnosis — it already documents that MES Console's "shadcn-style" primitives are repository-owned
local components built with Tailwind and selected Radix primitives, **not** an installed shadcn
package) and section 20.3 (shared UI state contract) before starting. Read the actual source of
whatever component renders the "Create EBOM" form (and any Dialog/Sheet/Modal primitive it is built
on) before writing any fix — do not assume shadcn's real `Dialog`/`Sheet` semantics are actually being
followed just because the visual style looks similar.

## Problem statement

The attached screenshot of the "Create EBOM" screen shows a broken modal/panel layout with several
compounding defects:

1. **Header overlap / clipping.** The panel's own title ("Create EBOM") and its "Back" button render
   partially underneath the fixed top navbar ("S-Factory — MES Console" bar), instead of appearing
   fully below it. This is a stacking/positioning defect — either an incorrect `z-index`, an incorrect
   `position: fixed`/`sticky` top offset, or the panel not accounting for the navbar's height at all.
2. **Inconsistent top margin relative to the viewport.** There is a visible, seemingly arbitrary gap
   between the top of the visible content area and the first form field, that does not correspond to
   any deliberate spacing token — suggesting the panel's height/position is not computed from the
   actual viewport or from its content, but from a stale or hardcoded value.
3. **Not flexible height.** The panel does not appear to size itself to its content. Large sections of
   apparent empty space and cramped/overlapping regions coexist in the same view, which is the classic
   symptom of a component using a fixed `height` (or an incorrect `min-height`/`max-height` combination)
   instead of `height: auto` with a sane viewport-relative cap (`max-height: ~90vh`) and internal
   scrolling for overflow.
4. **Unclear whether this is even the intended component.** The panel currently reads as a right-hand
   full-height sheet-like surface rather than a centered dialog, but it is not clear from the screenshot
   alone whether this is the deliberate design (a large "sheet" for multi-locale EBOM forms) that is
   merely mispositioned, or an accidental fallback/crash state of a component that was meant to render
   as a normal centered modal. **Do not guess — read the source and confirm which one it is before
   fixing anything.**

This must be fixed as a systemic pattern, not a one-off patch on the EBOM screen. Given section 20.1's
finding that MES Console's primitives are locally duplicated rather than centrally shared, it is likely
that multiple create/edit/detail modals across the console (Item, MBOM, Routing, Production Version,
Employee, Work Center, and others) either share this same broken component or have independently
reimplemented similar broken positioning. Confirm the actual blast radius before fixing.

## Required investigation (do this before writing any fix)

1. Identify the exact component file(s) that render the "Create EBOM" panel — the modal/sheet
   primitive itself (likely under `services/mes-console/src/components/ui/`) and the form container
   that wraps it (likely under `services/mes-console/src/routes/master-data/`).
2. Determine the current CSS/layout mechanism in use: is it `position: fixed` with manual top/height
   values, a flex/grid-based full-screen overlay, or a Radix `Dialog`/`Sheet`-based primitive with
   custom Tailwind classes layered on top? Read the actual class names and any inline styles — do not
   infer from the "shadcn" naming alone.
3. Determine why the navbar and the panel are competing for the same visual space: compare the navbar's
   `z-index`/`position` against the panel's. Confirm whether the navbar is `position: sticky`/`fixed`
   and whether the panel container correctly offsets `top` (or is rendered as a sibling that should sit
   below the navbar in normal document flow but currently does not).
4. Determine why height is not flexible: check for any hardcoded `height`, `min-height` set to a
   viewport unit without a corresponding `max-height`/`overflow-y: auto`, or a parent flex container
   with `flex: 1` fighting against the panel's own sizing.
5. Grep the repository for every other screen using the same modal/sheet primitive (or a copy-pasted
   variant of it) to confirm the actual blast radius. List every affected screen in the trace file —
   Item create/edit, MBOM header create, Routing create, Production Version create/edit, Employee
   create/edit, Work Center create/edit, and any others found.
6. Record the root cause explicitly in the trace file before proposing the fix. A fix that patches the
   symptom (e.g. manually nudging a margin value on the EBOM screen only) without identifying why the
   underlying primitive misbehaves must not be accepted as the final fix.

## Required fix

1. Establish (or correct, if one already exists but is misused) **one canonical modal/sheet primitive**
   in the shared UI components directory, with:
   - Correct stacking above the fixed navbar (`z-index` above the navbar's, and/or rendered through a
     portal that is not a descendant of any container the navbar's stacking context could clip).
   - `height: auto` sized to content, capped at a sane viewport-relative maximum (e.g.
     `max-height: 90vh`) with `overflow-y: auto` on the scrollable content region only — the
     header/footer action bar (Back, Create) should stay pinned while the body scrolls, matching normal
     dialog/sheet UX.
   - Correct centering (for dialog-style usage) or correct full-height docking with a proper top offset
     equal to the navbar's actual rendered height (for sheet-style usage) — whichever the investigation
     in step 4 above confirms is the intended design.
   - No hardcoded pixel values for offsets that should instead be derived from the actual layout (the
     navbar's height, the design system's spacing tokens).
2. Migrate every screen identified in the investigation's blast-radius list to this single canonical
   primitive. Do not leave a second, independently-styled modal/sheet implementation coexisting with
   the fixed one — that recreates the exact drift section 20.1 already flagged as a risk for MES/WMS/QMS
   primitive duplication.
3. Preserve all existing functional behavior of each migrated screen (locale tabs, "Apply for all",
   validation messages, save/cancel actions) — this is a layout/positioning fix, not a form-logic
   rewrite. Do not alter field behavior, validation rules, or submit payloads while migrating the
   container.
4. Use existing semantic tokens (per section 20.2) for any spacing/color introduced by the fix; do not
   add new hardcoded colors or one-off spacing values.

## Verification

1. Before/after screenshots of the EBOM create screen, and of at least two other migrated screens
   (e.g. Item create, Production Version create), confirming: no header overlap, no unexplained top
   gap, and content-sized height with internal scrolling when content is long.
2. Resize/viewport check: confirm the panel behaves correctly at a shorter viewport height (e.g. a
   laptop screen) where content would previously have overflowed — internal scroll should engage
   instead of the panel overflowing the viewport or clipping under the navbar.
3. Confirm the header/footer action bar (Back button, Create/Save button) remains visible and usable
   while the body content scrolls, for a form long enough to require scrolling (EBOM's multi-locale
   Name/Description fields are a good test case).
4. MES Console typecheck and production build pass.
5. Repo-wide grep confirms no remaining screen still uses the old, broken modal/sheet implementation.

## Deliverables checklist

- [ ] Root cause of the header-overlap and non-flexible-height defect identified and recorded in the
      trace file, with the specific CSS/positioning mechanism at fault named explicitly.
- [ ] Full blast-radius list of affected screens produced before any fix is written.
- [ ] One canonical modal/sheet primitive established or corrected, with proper z-index/stacking,
      content-sized height capped by viewport, internal scroll, and a pinned header/footer action bar.
- [ ] Every affected screen migrated to the canonical primitive with no functional regression.
- [ ] Before/after evidence for at least three screens, plus a short-viewport resize check.
- [ ] `implementation-fix/` trace file written with root cause, blast-radius list, and verification
      evidence; `AI_CONTEXT.md` updated; `git status --short` checked before starting; no unrelated
      changes reverted.