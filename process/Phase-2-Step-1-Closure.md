# ADDENDUM PROMPT — Phase 2, Step 1 Closure: Close DoD Gaps Before Marking Complete

**Project:** MOM Platform (MES / WMS / QMS) — Won Seal Tech
**Trigger:** Implementation report for `wms-master-data-service` reviewed against the original Step 1
Definition of Done (11 items). 6 items have clear verification evidence; **1 item raises a security
concern that must be resolved, not just documented**; **4 items are missing evidence entirely**. Per
this project's own governance principle (never mark a Cluster/Step done on assumption — see the i18n
hotfix and Console/UI Readiness precedents), **do not update `PROJECT_WORKLOAD_PROGRESS.md` to
`Completed ✅` until every item below is closed with actual evidence, not a restated intention.**

---

## 0. Do not re-architect — this is a closure pass, not new scope

Nothing in this addendum changes the domain model, API surface, or event contracts already built. Every
task below is either (a) a verification that should already be trivially true and just needs evidence
captured, or (b) in the one security case, a fix that must not require any schema/API change — only the
Kong route's auth wiring.

---

## PART A — Critical: verify Kong auth is not bypassed on the new WMS route

The implementation report states the new route forwards identity headers **"with default
`WAREHOUSE_STAFF`"**. This phrasing is ambiguous in a way that matters:

- **Acceptable interpretation:** Kong verifies the JWT exactly as it already does for `/api/mes/*`
  (via the existing pre-function plugin extracting real `UserID`/`RoleCode` from the token), and
  `WAREHOUSE_STAFF` merely happened to be the role on the test user used during manual verification.
- **Unacceptable interpretation:** the new route config sets a **static/default** `X-Role-Code` value
  when no token — or any token — is presented, bypassing the JWT verification that Phase 0's own
  Definition of Done (`docker-compose.platform.yml` DoD item 7) already established as mandatory for
  every route behind Kong.

### A.1 Required verification (do this first, before anything else in this addendum)

1. Inspect the actual Kong declarative config (`infra/kong/kong.yml`) diff for `/api/wms/master-data/*`.
   Confirm it uses the **same JWT-verification plugin chain** already applied to `/api/mes/*` — same
   plugin, same Keycloak JWKS source, same pre-function header-extraction logic. It must not be a
   separate, weaker auth chain "for now."
2. Run two manual tests with **two different real Keycloak users holding two different roles** (e.g.
   one `WAREHOUSE_STAFF`, one `PLANT_MANAGER` or any other seeded role) and confirm `X-Role-Code`
   forwarded to the service reflects each user's actual role — not the same value regardless of who
   authenticated.
3. Run a third test with **no token at all** (or an invalid/expired token) against
   `/api/wms/master-data/warehouses` and confirm Kong rejects the request (401/403) **before** it
   reaches `wms-master-data-service` — the service must not be reachable unauthenticated.
4. If any of the three checks above fails — i.e. if a default role is in fact being assigned regardless
   of authentication — **fix the Kong route config to match the `/api/mes/*` pattern exactly** and
   re-run all three checks until they pass. Do not add a workaround inside application code
   (`wms-master-data-service` must keep trusting Kong-forwarded headers exactly as `mes-master-data-service`
   already does — see Phase 0 §3 "services do not verify JWTs themselves").

Document the outcome of all three checks explicitly in the implementation report, including which two
roles were used and what `X-Role-Code` value each produced.

---

## PART B — Close the 4 missing/partial DoD items

### B.1 (DoD #3, partial) Full 4-locale round trip

- Create one entity (any of Warehouse/Zone/Location/Bin) with **all 4 locales filled**
  (`{"vi": "...", "en": "...", "ja": "...", "ko": "..."}`).
- `GET` it back and confirm all 4 keys are returned unchanged, byte-for-byte, in the response — this is
  the actual contract guarantee (`LocalizedText` round-trips without transformation), not just that
  `vi`-only creation succeeds and `vi`-missing creation fails (both of which are already verified).

### B.2 (DoD #9, missing) Distributed trace visibility

- Perform the Warehouse → Zone → Location → Bin create walkthrough again (or reuse the existing test
  data's trace if `X-Trace-ID` was logged during the original run).
- Open Grafana Tempo (`http://<host>:13001` or whatever port Phase 0 provisioned) and locate the trace
  for this round trip by its `trace_id`.
- Confirm spans exist for: the HTTP request through Kong, each of the 4 create operations in
  `wms-master-data-service`, and the DB writes underneath them.
- Capture the trace ID (or a screenshot) and attach it to the implementation report. "The trace
  presumably exists because OTel is wired" is not evidence — it must be observed in Tempo directly, the
  same way Phase 0's own DoD item 8 and every subsequent service's DoD required.

### B.3 (DoD #2, partial) No DELETE grant confirmed

- Run a direct query against `wms_master_data_db` confirming the application's DB role has no `DELETE`
  privilege on the 5 new tables, e.g.:
  ```sql
  select grantee, table_name, privilege_type
  from information_schema.role_table_grants
  where table_schema = 'public' and privilege_type = 'DELETE';
  ```
  Expected result: zero rows for `wms_warehouse`, `wms_zone`, `wms_storage_location`, `wms_storage_bin`,
  `wms_item_uom_mapping`. Document the query and its (empty) result in the report.

### B.4 (DoD #11, missing) Explicit i18n Completeness Check statement

Per the Step 8 hotfix's governance amendment (`docs/adr/000X-i18n-completeness-governance.md`), every
service closing out its Definition of Done must **explicitly state**, not silently assume, its
compliance. Add this exact confirmation to the implementation report:

> "This service performed no `varchar → jsonb` backfill migration — every `LocalizedText` column
> (`warehouse_name`, `zone_name`, `location_name`, `bin_name`, `rm_item_revision.item_name`) was created
> as `jsonb` from its first migration. The `vi`-key language-quality heuristic from the Step 8 hotfix
> therefore does not apply to this service's own migrations. Seed data used for manual verification
> (e.g. `{"vi":"Kho kiểm thử WMS"}`) was reviewed and contains no mixed-language values inside a single
> `vi` key."

If seed data review turns up any mixed-language value (an English string sitting in a `vi` key,
mirroring the exact MES defect), fix it directly in the seed script before closing this addendum — do
not carry it forward as a known issue, since there is no legacy-data excuse here (this data was written
fresh, not backfilled).

---

## 1. Definition of Done for This Addendum

| # | Item | Verification |
|---|---|---|
| 1 | Kong route `/api/wms/master-data/*` verified to use the same JWT-verification chain as `/api/mes/*` — confirmed via config diff and 3 manual auth tests (two real roles + one no-token rejection) | §A.1, results documented with actual role values observed |
| 2 | Full 4-locale create→read round trip verified byte-for-byte | §B.1 |
| 3 | A real trace for the Warehouse→Zone→Location→Bin walkthrough observed in Grafana Tempo, trace ID/screenshot attached | §B.2 |
| 4 | `information_schema` query confirms zero `DELETE` grants on all 5 new tables | §B.3 |
| 5 | Explicit i18n Completeness Check statement added to the implementation report; any mixed-language seed value found is fixed, not just noted | §B.4 |

Only after all 5 rows above are closed with evidence should `process/PROJECT_WORKLOAD_PROGRESS.md` row
#9 be marked `Completed ✅`. If Part A reveals a genuine auth bypass, fixing it takes priority over
everything else in this addendum — do not proceed to Phase 2 Step 2 with an unauthenticated WMS route
live behind Kong.

---

## 2. Process Reminder

1. Append this addendum's results to the existing implementation trace document for Step 1 (do not
   create a separate disconnected report — the two together are the complete record for this step).
2. Only after this addendum's DoD passes: update `process/PROJECT_WORKLOAD_PROGRESS.md` row #9 to
   `Completed ✅` and set **Current Active Milestone** to Phase 2, Step 2 (WMS Inventory & Stock —
   `wms-inventory-service`, `wms-inbound-service`, `wms-outbound-service`).
3. If Part A required a Kong config fix, add one line to the Step 1 manifest/report noting the
   corrected auth wiring, so Step 2/3 services copying this route pattern copy the corrected version,
   not the original ambiguous one.