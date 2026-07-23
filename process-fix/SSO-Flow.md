# VERIFICATION & FIX PROMPT — SSO Flow Across Keycloak Realm + Unified Portal + MES/WMS/QMS Console

**Project:** MOM Platform (MES / WMS / QMS) — Won Seal Tech
**Type:** SSO/IAM regression verification and fix. Touches Phase 0 infrastructure
(`infra/keycloak/realm-export.json`, `portal/`) — **do not treat this as a new roadmap step**; this is
a correctness fix on already-`Completed ✅` Phase 0 work. Update the relevant implementation trace once
fixed, do not renumber `process/PROJECT_WORKLOAD_PROGRESS.md`.

---

## 0. Reported symptom (do not re-describe — verify and diagnose from here)

- A user account entitled to **2 or more** cluster apps (e.g. role `PLANT_MANAGER`, which per the
  original SSO design maps to MES + WMS) logs in and is taken **directly to MES Console**, never landing
  on the Unified Portal's app-chooser screen — the user has no opportunity to pick which system to enter.
- A user account entitled to **exactly 1** cluster app (e.g. role `OPERATOR`, MES only) being taken
  directly to that one app is **correct, intended behavior** — do not change this case.

**Business rule this system must satisfy (restate explicitly, this is the spec to verify against):**

> After authenticating through `portal-client`, resolve the full set of cluster apps the user's Keycloak
> realm roles entitle them to. If that set has exactly 1 member, redirect straight into that app with no
> intermediate screen. If the set has 2 or more members, the user must land on and remain on the Unified
> Portal's chooser screen showing a card per entitled app — auto-redirecting past this screen for a
> multi-app account is a bug regardless of which specific apps are involved or how many.

---

## 1. Mandatory diagnostic step — determine H1 vs. H2 before writing any fix

This symptom is consistent with **two different root causes** that require completely different fixes.
Do not guess — determine which one is actually happening first, and report which:

**H1 — Keycloak client misconfiguration**: `portal-client`'s redirect URI / Home URL in
`infra/keycloak/realm-export.json` (or however it's currently configured, check both the exported file
and the live Keycloak admin console since they may have drifted) is pointing at MES Console's URL
instead of back to the Portal app's own OIDC callback route. If this is the cause, **every** login
through `portal-client` — regardless of the account's role count — lands on MES; it only *looks* correct
for single-MES-role accounts by coincidence.

**H2 — Portal frontend chooser logic bug**: Keycloak correctly returns the user to Portal's own callback
URL, but the post-login code in `portal/` that decides "auto-redirect vs. show chooser" has an incorrect
condition (e.g. always takes `apps[0]` regardless of `apps.length`, or a truthy check on a non-empty
array instead of an explicit `=== 1` check).

**How to tell them apart:** log in as the `plant.manager` seed user (`PLANT_MANAGER` role — entitled to
2 apps per the original design) and watch the browser's address bar / Network tab immediately after
Keycloak's authorization response:
- If the browser **never shows the Portal's own domain/path** at any point — i.e. it goes straight from
  Keycloak's `/auth` response to MES Console's callback URL — that is **H1**.
- If the browser **does briefly load the Portal's own callback route** and only then client-side
  redirects to MES — that is **H2**.

Report which one was found before proceeding to the corresponding fix below. If both are present
(possible — they are independent), fix both.

---

## 2. Fix — H1 (Keycloak client configuration)

- Correct `portal-client`'s redirect URI(s) and Home URL in `infra/keycloak/realm-export.json` to point
  at Portal's own callback route (whatever `portal/`'s OIDC callback path actually is), not at any
  cluster app's URL.
- Re-import/apply the corrected realm config to the running Keycloak instance and confirm the live admin
  console reflects the fix (do not assume editing the exported JSON file alone updates a running
  instance — apply it and verify).
- Explicitly check `mes-client`/`wms-client`/`qms-client` for the same class of misconfiguration (e.g. a
  copy-paste error where `mes-client`'s redirect URI was accidentally reused for `portal-client`) even if
  it's not the cause of this specific symptom — this is a good opportunity to audit all 4 clients while
  already in the realm config.

## 3. Fix — H2 (Portal frontend logic)

- Locate the post-login "resolve accessible apps and decide redirect vs. chooser" logic in `portal/`.
- Fix the branch condition to be an explicit `resolvedApps.length === 1` check for auto-redirect,
  `resolvedApps.length >= 2` for showing the chooser, and `resolvedApps.length === 0` for an explicit
  "no access" screen (see §4 for whether this last case currently exists at all — if not, add it; a
  blank page or silent failure for a zero-entitlement account is its own bug worth catching here).
- Add a unit test (or equivalent) for this branch specifically covering all 3 counts (0, 1, 2+) so this
  exact class of regression is caught automatically if touched again later when WMS/QMS Console ship and
  the app list grows.

---

## 4. A related policy decision to make explicit while here (does not block the H1/H2 fix, but must be resolved)

`WMS Console` and `QMS Console` are not deployed yet (Phase 2/3 pending). If a `PLANT_MANAGER` account's
entitled-app resolution counts WMS as one of their "2 apps" purely from the Keycloak role mapping,
without checking whether WMS Console is actually deployed/reachable, then **today**, before WMS ships,
that account's *effectively reachable* app count is really just 1 (MES) — which would make the H2
auto-redirect logic "technically correct" by its own count, while still being the wrong UX, since the
account legitimately holds WMS entitlement that should be visible as a pending/disabled option, not
silently excluded from the count.

**Resolve this explicitly, do not leave it ambiguous:** decide and implement one of:
- **(a)** Portal's app-resolution counts only apps with a real, currently-deployed URL — a
  `PLANT_MANAGER` today sees only the MES card and is correctly auto-redirected to it, with this
  behavior expected to change automatically (start showing the chooser) the moment WMS Console is
  deployed and wired into Portal's app registry. No visual indication of the pending WMS entitlement is
  shown today.
- **(b)** Portal's app-resolution always counts role-entitled apps regardless of deployment status, and
  renders a card for WMS today in a disabled/"Sắp ra mắt" state — so a `PLANT_MANAGER` account already
  sees the chooser screen now (2 cards: MES clickable, WMS disabled), and nothing changes visually when
  WMS later ships except the card becoming clickable.

Recommendation: **(b)** is safer long-term — it means this exact symptom (multi-role account confused
about why they auto-redirected) can never recur when WMS/QMS ship, since the chooser is already the
default experience for any multi-role account from day one. But this is a product decision, not purely
technical — implement whichever the team confirms, and **document the choice** in `AI_CONTEXT.md` so
whoever builds the WMS Console's Portal card registration later knows which model is in effect.

---

## 5. Additional SSO regression checks while verifying this flow (per the original Phase 0 Definition of Done — re-confirm these still hold, do not assume they're unaffected)

- **SSO session reuse**: after logging in via Portal (or directly into MES Console), navigating to
  another already-entitled app must **not** re-prompt for username/password — confirm this still works
  for both directions (Portal → MES, and MES visited directly → then Portal).
- **Direct URL access remains valid**: a user bookmarking/directly navigating to MES Console's URL
  (bypassing Portal entirely) must still be able to log in and use MES Console standalone — this is
  intentional and must not be broken by the H1/H2 fix. Do not force all logins through Portal.
- **Front-Channel Logout**: logging out from any one app (MES Console) must still end the session on
  the others (Portal, and WMS/QMS once they exist) — re-verify this against the corrected `portal-client`
  config from §2, since redirect URI changes can sometimes interact with logout redirect behavior.
- **Seed user coverage**: the currently seeded test users (`admin` = `EXECUTIVE`, `plant.manager` =
  `PLANT_MANAGER`, `operator01` = `OPERATOR`) cover the 1-app and (today, per §4) 1-or-2-app cases. There
  is no seeded `QC_TECHNICIAN` or `WAREHOUSE_STAFF` user yet — flag this as a follow-up for when WMS/QMS
  roles need real end-to-end testing, not required to fix in this pass.

---

## 6. Definition of Done

| # | Item | Verification |
|---|---|---|
| 1 | Root cause determined and reported: H1, H2, or both | Diagnostic trace (Network tab / redirect sequence) attached to the fix report |
| 2 | `plant.manager` login lands on and stays on the Portal chooser screen (or shows the agreed §4 model), never auto-redirects | Manual test |
| 3 | `operator01` login still auto-redirects straight to MES Console with no chooser screen | Manual test (regression check) |
| 4 | `admin` (`EXECUTIVE`) login behavior matches the §4 policy decision made | Manual test |
| 5 | Policy decision from §4 documented in `AI_CONTEXT.md` | Doc review |
| 6 | SSO session reuse, direct-URL access, and Front-Channel Logout all still verified working post-fix | Manual test of all 3, per §5 |
| 7 | If H2 was found, a unit test covering the 0/1/2+ app-count branch exists and passes | Test run output |
| 8 | If H1 was found, corrected `realm-export.json` matches the live Keycloak admin console configuration | Diff/comparison |

---

## 7. Process Reminder

Update whichever implementation trace document covers Phase 0/Portal (or create
`implementation/sso-portal-redirect-hotfix.md` if none exists) documenting the root cause found, the fix
applied, and the §4 policy decision. This does not change `process/PROJECT_WORKLOAD_PROGRESS.md`'s
step numbering — it's a correctness fix on already-completed platform foundation work.