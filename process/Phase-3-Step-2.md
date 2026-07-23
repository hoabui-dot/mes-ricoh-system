# PROMPT — Phase 3 Step 2: `qms-nonconformance-service` (NCR/CAPA)

**Target audience:** an AI coding agent working directly in this repository. Everything needed to execute
is in this document plus the source you're told to read. Do not build `qms-console` as part of this task —
that is Step 3, gated on user request, per this repo's own "build the next step when requested" convention.

**Repository:** `/home/neurosus/mes-system`

**Read first, in this order, before writing any code:**
1. `AI_CONTEXT.md` (root) — source-of-truth precedence rules, current ports/services table.
2. `process/PROJECT_WORKLOAD_PROGRESS.md`
3. `implementation/phase-3-1-qms-inspection-service.md` — **the actual Step 1 delivery record.** This is
   your primary contract reference for this task, not a hypothetical spec. In particular, confirm from this
   file and from live source: the exact final shape of `QMS.Inspection.InspectionFailed.v1`'s payload, the
   real port/DB assignments used (`qms-inspection-service` on `13110`/`3110`, `qms_inspection_db` on host
   port `15442`), and the Kong/JWT/role pattern actually implemented (`qms-client`, roles `QC_TECHNICIAN`,
   `PLANT_MANAGER`, `EXECUTIVE`).
4. `docs/adr/bounded-context-canvas-qms-inspection-service.md` — read the finalized `InspectionFailed`
   payload contract documented there; it was written specifically so this step wouldn't have to guess.
5. `services/qms-inspection-service/` (entire source tree) — this is your **structural pattern
   reference** for this new service: migrations/Drizzle schema shape, outbox implementation, LocalizedText
   field usage, numbering/sequence approach if any, `opossum` circuit-breaker usage, Kafka consumer
   idempotency pattern (keyed on source event ID), service.manifest.yaml shape, Dockerfile, OTel wiring.
   Copy its conventions directly — it was itself built to copy `wms-master-data-service`'s conventions, so
   by extension this service should look and behave like a sibling of both.
6. `services/mes-traceability-service/` — reference specifically for the **atomic numbering-rule pattern**
   (used there for lot/label codes). Reuse the same mechanism for NCR case numbers here; do not invent a
   second numbering approach in the same repository.
7. `implementation-fix/circuit-breaker-hardening.md` — the breaker baseline (`opossum`, 4-request volume,
   50% failure threshold, 30s reset, 10s timeout) already applied once in `qms-inspection-service`; reuse
   identically for any new synchronous call this service introduces.

---

## 0. Non-negotiable ground rules

- **Stack: Node.js, TypeScript, Express, Drizzle ORM, PostgreSQL, KafkaJS, OTel** — identical stack family
  to `qms-inspection-service`, per `process/TECH-STACK-DECISION.md`'s existing classification of this
  workload as CRUD/case-management. No deviation without an ADR.
- **One service = one database.** `qms-nonconformance-service` owns `qms_nonconformance_db`. It does not
  read `qms_inspection_db`, or any MES/WMS database, directly. All cross-service data comes from consumed
  events (primarily `QMS.Inspection.InspectionFailed.v1`) or explicit circuit-breaker-guarded API calls.
- **Bounded Context Canvas required before code.** Create
  `docs/adr/bounded-context-canvas-qms-nonconformance-service.md` before writing migrations or routes:
  Responsibility / Not-my-responsibility / Publishes / Consumes / Ubiquitous language. This is the same
  governance step Step 1 performed — don't skip it just because it feels like ceremony; it's what let this
  prompt reference a finalized event contract instead of a guessed one.
- **Auth pattern: identical to `qms-inspection-service`.** Native Kong JWT plugin verification, `qms-client`,
  no anonymous identity, missing token returns `401`. Role usage for this service specifically:
  `QC_TECHNICIAN` and `PLANT_MANAGER` can raise/update NCRs; **disposition decisions and CAPA closure require
  `PLANT_MANAGER` or `EXECUTIVE`** — this is a new, stricter rule versus Step 1, because dispositioning
  (deciding whether nonconforming material is scrapped, reworked, used-as-is, or returned) is a
  higher-consequence action than recording an inspection measurement. Enforce this server-side, not just in
  a future console's UI.
- **Event envelope and naming**: reuse the shared envelope and `<Cluster>.<BoundedContext>.<EventName>.v<N>`
  convention exactly. New events are specified in §5 below.
- **LocalizedText from day one** for every translatable field (NCR description, root cause, CAPA action
  plan text, disposition reason).
- **Outbox pattern mandatory** for every event-producing write.
- **Idempotency on event consumption is mandatory**, same discipline as Step 1's `SourceEventID` uniqueness
  constraint on `OperationFinished` — apply the identical pattern here for `InspectionFailed` consumption
  (key on that event's `event_id`), so Kafka redelivery cannot create duplicate NCRs.
- **Implementation trace rule**: write/update `implementation/phase-3-2-qms-nonconformance-service.md`.
  Update `process/PROJECT_WORKLOAD_PROGRESS.md` — flip milestone `12b` (or whatever sub-row Step 1 created)
  from `Pending` to `Completed` with the trace link. Update `AI_CONTEXT.md` §7 (tech stack), §11 (services
  and ownership), §15 (ports), and §1 (executive summary) the same way Step 1 did.

---

## 1. Service identity

| Property | Value |
|---|---|
| Service name | `qms-nonconformance-service` |
| Location | `services/qms-nonconformance-service/` |
| Direct port | Host `13120` → internal `3120` |
| Kong route | `/api/qms/nonconformance` → `qms-nonconformance-service:3120`, same native JWT plugin
  configuration as `/api/qms/inspection` |
| Database | `qms_nonconformance_db`, container `qms-nonconformance-db`, host port `15443` |
| Compose file | Add the service block to the existing `infra/docker-compose.qms.yml` (created in Step 1) —
  do not create a second QMS compose file |

## 2. Purpose

Owns NCR (Nonconformance Report) and CAPA (Corrective and Preventive Action) case management. Primary
trigger is `QMS.Inspection.InspectionFailed.v1`, but the service must also support **manually-raised NCRs**
— e.g. a warehouse staff member finding a defect outside a formal inspection point. Do not design the schema
such that every NCR requires an upstream inspection result; `ResultID`/`SourceEventID` must be nullable.

## 3. Data model

### `qms_ncr_numbering_rule` / atomic sequence
Reuse the exact atomic-sequence mechanism from `mes-traceability-service` (read its source, don't
reimplement from first principles) to generate unique, gapless-enough `NCRCode` values, scoped per site.
Do not use a simple `SERIAL`/`gen_random_uuid()` for the human-facing case number — the whole point of
copying that pattern is atomic, collision-free, human-readable numbering under concurrent writes, exactly
the property the traceability service was built to guarantee.

### `qms_ncr` (header)
| Field | Meaning |
|---|---|
| `NCRID` | PK |
| `NCRCode` | Unique, generated via the numbering rule above |
| `Source` | `InspectionFailure` \| `Manual` |
| `SourceResultID` | Nullable — the `qms-inspection-service` `ResultID` from the triggering event's payload
  (stored as an opaque cross-cluster reference, not a local FK) |
| `SourceEventID` | Nullable — the triggering `InspectionFailed` event's `event_id`, used for idempotency |
| `ItemRevisionID` / `WorkOrderID` / `WorkCenterID` / `LotOrLabelRef` | Cross-cluster references carried
  through from the triggering event's payload, or entered manually when `Source = Manual` |
| `SiteID` | Site reference |
| `Severity` | `Critical`, `Major`, `Minor` — default from the inspection's defect category when
  auto-created; required input when raised manually |
| `Description` | LocalizedText |
| `Status` | `Open`, `UnderReview`, `Dispositioned`, `CAPARequired`, `Closed` |
| `RaisedByUserID` | From `X-User-ID` |
| `RaisedAt` | Timestamp |

### `qms_ncr_disposition`
| Field | Meaning |
|---|---|
| `DispositionID` | PK |
| `NCRID` | Parent NCR |
| `DispositionType` | `UseAsIs`, `Rework`, `Scrap`, `ReturnToSupplier` |
| `Reason` | LocalizedText |
| `DecidedByUserID` | Must hold `PLANT_MANAGER` or `EXECUTIVE` role at decision time — enforce server-side |
| `DecidedAt` | Timestamp |
| `RequiresCAPA` | Boolean — if true, the NCR must transition to `CAPARequired` and a CAPA case must exist
  before the NCR can reach `Closed` |

Validation: an NCR can have at most one **active** disposition; redispositioning (if ever needed) should
supersede rather than delete the prior record — no DELETE anywhere in this service either, consistent with
every other WMS/QMS table in this repository; corrections happen via a new disposition row or an explicit
status field, never a destructive update to history.

### `qms_capa`
| Field | Meaning |
|---|---|
| `CAPAID` | PK |
| `CAPACode` | Unique, generated via the same numbering-rule mechanism (separate entity type, same
  atomic-sequence infrastructure) |
| `LinkedNCRIDs` | One CAPA can link to multiple NCRs (e.g. a recurring defect pattern) — model as a join
  table `qms_capa_ncr_link`, not an array column |
| `RootCause` | LocalizedText |
| `ActionPlan` | LocalizedText |
| `OwnerUserID` | Assigned owner |
| `DueDate` | Date |
| `Status` | `Open`, `InProgress`, `Verified`, `Closed` |
| `VerifiedByUserID` / `VerifiedAt` | Nullable — closure verification, must hold `PLANT_MANAGER` or
  `EXECUTIVE` role |

Validation: `Status` cannot move to `Closed` without a prior `Verified` transition performed by an
authorized role; cannot verify your own `OwnerUserID` case without at least logging that as a
same-person-verification flag for audit visibility (don't hard-block it if the org is small, but don't
silently hide it either — surface it in the response/audit trail).

## 4. Event consumption

Consume `QMS.Inspection.InspectionFailed.v1`.

- On receipt, idempotently (keyed on `event_id`, same lock/check pattern as Step 1's
  `pg_advisory_xact_lock(hashtext(...))` idempotency guard) create a new `qms_ncr` row with
  `Source = InspectionFailure`, `Status = Open`, fields populated from the event payload exactly as
  documented in the bounded-context canvas from Step 1 — **read that payload shape from the actual
  finalized contract, do not re-derive field names from guesswork.**
- Severity default: map from the failed characteristic(s)' linked `DefectCode.DefectCategory` if the event
  payload carries it (verify against the real payload — if defect category wasn't included, note this as a
  gap in your implementation trace and default to `Major` rather than silently guessing `Minor`, since
  under-severity is the more dangerous silent failure mode in a quality system).

## 5. Events published

- `QMS.Nonconformance.NCRRaised.v1` — on every NCR creation (both sources)
- `QMS.Nonconformance.NCRDispositioned.v1` — on disposition decision
- `QMS.Nonconformance.CAPAClosed.v1` — on verified closure

No MES/WMS consumer exists for these yet — that wiring (hold/release decisions on lots/WOs) is Phase 4,
explicitly deferred. Publish correctly and completely now anyway, same discipline Step 1 followed for
`InspectionFailed` with no consumer at the time. Design payloads with enough context
(`NCRID`/`NCRCode`, `ItemRevisionID`, `WorkOrderID`, `WorkCenterID`, `LotOrLabelRef`, `DispositionType` /
`CAPA status`) that a future MES/WMS consumer can act without a synchronous callback into this service.

## 6. HTTP API

- `GET /api/qms/nonconformance/ncr` (filterable: `status`, `severity`, `source`, `item_revision_id`,
  `work_order_id`, date range), `GET /:id`, `POST` (manual creation), `PATCH /:id` (status/description
  updates short of disposition)
- `POST /api/qms/nonconformance/ncr/:id/disposition` — role-gated (`PLANT_MANAGER`/`EXECUTIVE`), creates the
  disposition record, transitions NCR status
- `GET /api/qms/nonconformance/capa`, `GET /:id`, `POST`, `PATCH /:id`
- `POST /api/qms/nonconformance/capa/:id/link-ncr` — attach an existing NCR to a CAPA
- `POST /api/qms/nonconformance/capa/:id/verify` — role-gated, transitions to `Verified`
- `POST /api/qms/nonconformance/capa/:id/close` — only reachable from `Verified`

## 7. Definition of Done

- [ ] Bounded Context Canvas written before code, referencing the real `InspectionFailed` payload from
      Step 1's finalized contract.
- [ ] NCR/CAPA numbering reuses the traceability service's atomic-sequence mechanism, not a new one.
- [ ] `InspectionFailed` consumption is idempotent on `event_id`; redelivery does not duplicate NCRs.
- [ ] Disposition and CAPA-verify/close actions are server-side role-gated
      (`PLANT_MANAGER`/`EXECUTIVE` only), independent of any future UI.
- [ ] No DELETE anywhere; corrections are new rows/status transitions, never destructive updates to
      disposition/CAPA history.
- [ ] `NCRRaised`, `NCRDispositioned`, `CAPAClosed` published via outbox with payloads rich enough for a
      future Phase 4 MES/WMS consumer.
- [ ] Kong route added under `/api/qms/nonconformance`, native JWT plugin, `401` on missing token verified.
- [ ] Service block added to the existing `infra/docker-compose.qms.yml`; container healthy on `13120`;
      database healthy on `15443`.
- [ ] `AI_CONTEXT.md` updated (ports, services, tech stack, executive summary,
      `PROJECT_WORKLOAD_PROGRESS.md` sub-row flipped to Completed).
- [ ] `implementation/phase-3-2-qms-nonconformance-service.md` written, following the exact structure of
      `implementation/phase-3-1-qms-inspection-service.md` (Delivered / Updated / Verification / Known
      Boundary sections).
- [ ] Verification includes: typecheck/build passing, an end-to-end test that a real `InspectionFailed`
      event (triggered by actually recording a failed inspection result through
      `qms-inspection-service`, not a synthetically published test event) produces exactly one NCR, and
      that a duplicate/redelivered event does not produce a second one.

After this step is complete and confirmed, `qms-console` (Step 3) remains the next and final step of
Phase 3 — build it only when requested, per this repository's own convention.