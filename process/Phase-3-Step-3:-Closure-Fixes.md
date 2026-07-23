# PROMPT — Phase 3 Step 3: Closure Fixes + `qms-console`

**Target audience:** an AI coding agent working directly in this repository. This prompt has two parts,
execute in order: **Part A (mandatory closure fixes)** must be done and verified before **Part B (Console
build)** starts, because Part B's design decisions depend on Part A's fixed contracts being real, not
assumed.

**Repository:** `/home/neurosus/mes-system`

**Read first:**
1. `AI_CONTEXT.md` — current state, ports, services.
2. `implementation/phase-3-1-qms-inspection-service.md` and `implementation/phase-3-2-qms-nonconformance-service.md`
   — the actual delivered state, including their own self-reported "Known Boundary" sections. Part A below
   exists specifically to close those boundaries.
3. `docs/adr/bounded-context-canvas-qms-inspection-service.md` and
   `docs/adr/bounded-context-canvas-qms-nonconformance-service.md`.
4. `PHASE-2-STEP-3-WMS-CONSOLE-PROMPT.md` (already in this repo/workspace from the WMS Console task) —
   Part B reuses this as its structural and UX reference, verbatim where noted.
5. `AI_CONTEXT.md` §9 — current Keycloak realm/client/seed-user state, which Part A must extend.

---

## PART A — Mandatory closure fixes (do first)

### A.1 Add `site_id` to `QMS.Inspection.InspectionFailed.v1`

`qms-nonconformance-service`'s own implementation trace documents that this field is missing and that a
"demo-site fallback" is currently used instead. Fix it at the source:

- In `qms-inspection-service`, extend the `InspectionFailed` (and, for consistency, `InspectionResultRecorded`)
  event payload to include the real `site_id` already available on `qms_inspection_result`/`qms_inspection_plan`.
- This is an **additive** field on an existing event type. Per this repo's own precedent
  (`WMS.MasterData.LocationCreated.v1`'s additive-field handling, documented in `AI_CONTEXT.md` §17 as "dev
  Schema Registry may reject additive fields under current compatibility mode; treated as a warning because
  no live external consumer existed before"), check the Schema Registry compatibility mode actually
  configured for this event type before deciding whether a `.v1` additive change is safe or whether you need
  to bump to `.v2`. **`qms-nonconformance-service` is now a live, real consumer of this event** — unlike the
  WMS precedent, you cannot casually treat a registry rejection as a no-op warning here, because there is a
  genuine downstream consumer depending on payload shape. If Schema Registry rejects the additive field
  under strict compatibility mode, bump to `.v2`, update the publisher, and update the consumer — don't
  paper over a real compatibility failure the way the WMS case was allowed to for a then-nonexistent
  consumer.
- Update `qms-nonconformance-service`'s consumer to read the real `site_id` and remove the demo-site
  fallback for newly-arriving events. Keep the fallback path only for already-consumed historical events if
  any exist in a lower environment, clearly commented as a one-time migration concern, not standing logic.
- Update both services' implementation traces and the bounded-context canvases to reflect the corrected
  contract.

### A.2 Make the `Major`-severity default an explicit, documented decision

Currently `qms-nonconformance-service` defaults every auto-created NCR's severity to `Major` because the
upstream event carries no defect-category classification. Two acceptable paths — pick one and document it,
don't leave it as an undocumented "known boundary":

- **Preferred:** extend `InspectionFailed`'s payload (same additive-field exercise as A.1) to carry the
  worst `DefectCategory` among the failed characteristics' linked defect codes (`Critical`/`Major`/`Minor`
  from `qms_defect_code`), and have `qms-nonconformance-service` map it directly instead of hardcoding
  `Major`.
- **Fallback, only if the above is out of scope for this pass:** keep the `Major` default, but add a
  short ADR note explaining it's a deliberate conservative choice (under-severity is worse than
  over-severity in a quality system) rather than an oversight, and surface it visibly wherever severity is
  displayed later in the Console (Part B must show "Major (auto default)" vs a human-entered severity
  differently — see §B.4).

### A.3 Run a real end-to-end verification (not a mechanism-exists check)

Both prior implementation traces stop short of proving the full chain actually works with real data. Before
starting Part B, run and document, with real evidence (request/response bodies, DB row counts, log excerpts
— not just "consumer joined the topic"):

1. Create and release a real Inspection Plan in `qms-inspection-service` for an existing MES item
   revision/operation.
2. Trigger a real MES `OP-QC` (or whichever inspection-type operation exists in seed data) confirmation
   through `mes-execution-service`, producing a real `OperationFinished` event with the enriched payload.
3. Confirm `qms-inspection-service` creates the draft result idempotently.
4. Record a FAIL result via `POST /:id/record`.
5. Confirm exactly one `InspectionFailed` event is published with the corrected payload from A.1/A.2.
6. Confirm `qms-nonconformance-service` creates exactly one NCR from it.
7. Manually redeliver/replay the same event (or restart the consumer to force reprocessing) and confirm no
   second NCR is created — real idempotency proof, not code inspection.

Record this as a new section in `implementation/phase-3-2-qms-nonconformance-service.md` (or a short
addendum file) titled "End-to-end verification (closure)."

### A.4 Verify the Kong route from outside the container, with a real token

Both prior traces note that host-level `curl` verification was incomplete or container-internal only.
Before Part B: obtain a real Keycloak bearer token (password grant against a `qms-client`-eligible user —
see A.5 for why one doesn't exist yet) and confirm `GET http://100.68.50.41:18000/api/qms/inspection/...`
and `.../api/qms/nonconformance/...` both return real data (not just `401` without a token — that alone was
already proven; now prove the **success** path from the actual gateway host).

### A.5 Add a `QC_TECHNICIAN` seed user (and confirm CAPA-role coverage)

`AI_CONTEXT.md` §9's seed user table has no account carrying `QC_TECHNICIAN` — the role this entire cluster
was built around has never been exercised end-to-end by an actual credentialed user. Add:

- A new seed user, e.g. `qc.tech01` / a generated password following the same convention as existing seed
  users (`Operator@123!`-style), with realm role `QC_TECHNICIAN`, in `infra/keycloak/realm-export.json`
  (and/or whatever bootstrap mechanism the other seed users were created through — check how `operator01`
  was actually provisioned and mirror it exactly).
- Confirm `plant.manager` (already exists) is sufficient for disposition/CAPA-verify testing — it should be,
  per the role table, but confirm live rather than assume.
- Update `AI_CONTEXT.md` §9's seed user table with the new entry.

### A.6 Fix `qms-client`'s redirect URL

`AI_CONTEXT.md` §9 still lists `qms-client`'s URL as the Phase-0-era placeholder `http://100.68.50.41:4002`.
Update it to `http://100.68.50.41:13130` (the real port Part B will deploy the console on — see §B.1) in
both the realm export and the docs table, **before** Part B's Keycloak/PKCE wiring, so you're not debugging
a redirect mismatch mid-console-build.

### Definition of Done — Part A
- [ ] `site_id` present and correct in `InspectionFailed` (and `InspectionResultRecorded`), consumer fallback removed for new events.
- [ ] Severity handling is either defect-category-driven or explicitly documented as a deliberate default, visible in a way Part B can render distinctly.
- [ ] Real end-to-end chain proven with evidence, including a real duplicate-delivery idempotency proof.
- [ ] Kong routes verified from outside the container with a real bearer token, success path (not just 401) confirmed.
- [ ] `QC_TECHNICIAN` seed user exists and can obtain a token.
- [ ] `qms-client` redirect URL corrected to `13130`.
- [ ] Both implementation traces and both bounded-context canvases updated to reflect the corrected contracts.

---

## PART B — `qms-console`

### B.1 Ground rule — reuse, don't re-derive

Do not re-derive the UI specification from scratch. `PHASE-2-STEP-3-WMS-CONSOLE-PROMPT.md` already
specifies, in full, the stack (React + Vite, not Remix — same reasoning applies: `mes-console` and
`wms-console` are both already built this way, this is now an established platform convention, not a
per-service choice), the exact package list (§2), theme tokens (§3), modal-vs-drawer-vs-page rules,
loading/empty/error conventions, data-fetching pattern (§12), auth/RBAC pattern (§13), and Definition-of-Done
shape (§15). Read `services/wms-console/`'s actual resulting source tree and copy its structure directly —
same relationship `wms-console` had to `mes-console`.

### B.2 Service identity

| Property | Value |
|---|---|
| Service name | `qms-console` |
| Direct port | Host `13130` → internal `80` |
| Auth | Keycloak `qms-client` (fixed in A.6), PKCE, roles `QC_TECHNICIAN` / `PLANT_MANAGER` / `EXECUTIVE` per §0 of the Step 1/2 prompts |
| Compose | Add to `infra/docker-compose.qms.yml` alongside the two backend services |

### B.3 Routes

```
/dashboard                          → KPI overview (open NCRs by severity, pending inspections, overdue CAPA)
/inspection/plans                    → list
/inspection/plans/:id                → detail (Tabs: Overview, Characteristics)
/inspection/defect-codes             → list + Dialog CRUD
/inspection/results                  → work queue, default filter status=pending
/inspection/results/:id              → full-page recording view (see B.5)
/nonconformance/ncr                  → list
/nonconformance/ncr/:id              → detail + disposition action
/nonconformance/capa                 → list
/nonconformance/capa/:id             → detail + link-NCR / verify / close actions
*                                    → 404 (reuse wms-console's pattern)
```

URL-persisted filters/pagination, app shell (sidebar/topbar/command palette/locale switcher), ErrorBoundary,
and idempotent Keycloak init — all identical to the WMS Console prompt's §4 and §11, no changes needed.

### B.4 Severity/source visual language

Because of A.2, severity on an auto-created NCR may be a real defect-category value or a conservative
default — these must look different in the UI, not identical badges:
- Human-entered or defect-category-derived severity: solid `Badge` (`Critical` = `--status-danger`,
  `Major` = `--status-warning`, `Minor` = `--status-info`).
- Auto-defaulted `Major` (the A.2 fallback path, if that's the one implemented): same amber badge, plus a
  small "auto" qualifier/icon with a tooltip explaining it's a conservative default pending manual review —
  don't let it look indistinguishable from a genuinely assessed Major severity.

### B.5 Inspection Results — work queue and recording view

This is the primary `QC_TECHNICIAN` screen, same complexity class as the WMS Console's Create-Receipt
wizard (full page, not a modal):
- List (`/inspection/results`): default filter `status=pending`, columns include item, WO, work center,
  plan, inspected qty, created-from-event timestamp. Row click → `/inspection/results/:id`.
- Recording view: renders every characteristic from the linked plan as an input row — `Attribute` type gets
  a Pass/Fail toggle, `Variable` type gets a numeric input plus a live spec-range indicator (in-range/out-of-range
  computed client-side against `SpecMin`/`SpecMax` for immediate feedback, but the server remains the source
  of truth for the final `ResultFlag`/`OverallResult`). Failing a `MandatoryFlag` characteristic must
  visibly warn before submit that this will fail the overall result. Submit is pessimistic (disable + spinner
  until the API confirms), same rule as every other consequential action in this platform. On success,
  route back to the work queue with a toast, and if the result failed, the toast should note "NCR will be
  raised automatically" so the technician isn't left wondering what happens next.

### B.6 NCR detail — disposition

`/nonconformance/ncr/:id`: header (code, source badge — `InspectionFailure` vs `Manual` — item/WO/lot
context, severity per §B.4), a "Disposition" primary action visible only to `PLANT_MANAGER`/`EXECUTIVE`
(check role client-side for UX, but the real enforcement is server-side per Part A/Step 2's rule — don't
rely on the UI hiding the button as the actual security boundary). Disposition action opens a Dialog:
`DispositionType` select, reason text, and a `RequiresCAPA` toggle — if toggled, after submit prompt
(via a follow-up Dialog or inline banner) to create/link a CAPA immediately, since the backend requires a
CAPA before the NCR can reach `Closed` when `RequiresCAPA = true`.

### B.7 CAPA detail — verify/close

`/nonconformance/capa/:id`: linked NCRs table, root cause/action plan (editable while `Open`/`InProgress`),
owner/due date, and role-gated `Verify`/`Close` actions matching the backend's `Verified`-before-`Closed`
sequencing — the UI must disable `Close` until status is `Verified`, and disable `Verify` if the current
user is the same as `OwnerUserID` unless they explicitly acknowledge the same-person-verification flag the
backend already surfaces (per Step 2's implementation).

### B.8 Definition of Done — Part B

Reuse the WMS Console prompt's Definition of Done checklist shape (§15 there), substituted for QMS
screens, plus this cluster's own acceptance bar: a `QC_TECHNICIAN` test user (created in A.5) can, through
the UI alone — no curl, no manually published test events —
1. See a pending inspection result that was created from a real MES `OP-QC` confirmation,
2. Record a failing result,
3. See a toast confirming an NCR will be raised,
4. Log out, log back in as `plant.manager`, find that NCR in `/nonconformance/ncr`, disposition it with
   `RequiresCAPA = true`, create/link a CAPA, verify it, and close it.

Do not mark Phase 3 `Completed` in `process/PROJECT_WORKLOAD_PROGRESS.md` until this exact flow has been
run and evidenced in `implementation/phase-3-3-qms-console.md`, per this repo's own "Console/UI Readiness
Check" governance rule — the same bar `wms-console` was held to.