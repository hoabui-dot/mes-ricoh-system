# Phase 3 Step 2 - QMS Nonconformance Service

Date: 2026-07-23  
Status: Implemented

## Delivered

- Added `services/qms-nonconformance-service` using Node.js, TypeScript, Express, PostgreSQL,
  Drizzle-compatible schema ownership, KafkaJS, and the platform OTel bootstrap.
- Added the bounded-context canvas before the database migration:
  `docs/adr/bounded-context-canvas-qms-nonconformance-service.md`.
- Added the owned database `qms_nonconformance_db` on host port `15443` and service port `13120`
  mapped to container port `3120`.
- Added migrations for:
  - NCR headers and localized descriptions.
  - Append-only disposition history with one active disposition per NCR.
  - CAPA records with root cause, action plan, ownership, due date, verification, and closure audit.
  - NCR/CAPA links with duplicate prevention.
  - Outbox and atomic per-site numbering rules/sequences.
- Implemented atomic human codes with PostgreSQL `INSERT ... ON CONFLICT ... RETURNING`:
  `NCR-YYYYMMDD-00001` and `CAPA-YYYYMMDD-00001`.
- Implemented NCR APIs for listing, detail, manual creation, update, and disposition. No DELETE
  endpoint or delete database privilege is provided.
- Implemented CAPA APIs for listing, detail, creation, update, NCR linking, verification, and closure.
  Closure is allowed only from `Verified`; same-person verification is retained as an audit flag.
- Implemented the `QMS.Inspection.InspectionFailed.v1` consumer. It uses a PostgreSQL advisory lock
  and unique `source_event_id`, so redelivery cannot create a second NCR.
- Automatic NCR severity maps the producer's worst failed defect category (`Critical` > `Major` > `Minor`).
  Legacy events without a category use an explicit conservative `Major` policy; failed characteristic and
  defect identifiers remain preserved for review.
- Added outbox events:
  `QMS.Nonconformance.NCRRaised.v1`, `QMS.Nonconformance.NCRDispositioned.v1`, and
  `QMS.Nonconformance.CAPAClosed.v1`.
- Added Kong route `/api/qms/nonconformance` with the existing QMS Keycloak JWT policy and
  `qms-client` application/role prefunction.
- Added the service to `infra/docker-compose.qms.yml` and the root Compose project.

## Verification

- `npm run typecheck --workspace=qms-nonconformance-service` passed.
- `npm run build --workspace=qms-nonconformance-service` passed.
- Docker Compose build completed for the QMS service and its dependency rebuilds.
- `qms-nonconformance-db` reported healthy on port `15443`.
- `qms-nonconformance-service` reported healthy from inside the container:
  `{"status":"ok","service":"qms-nonconformance-service"}`.
- Kafka logs confirmed the consumer joined `QMS.Inspection.InspectionFailed.v1` partition 0.
- Kong was force-recreated after configuration changes so the new route is loaded.
- Compose status showed QMS inspection, QMS nonconformance, both owned databases, Kafka, Schema Registry,
  and Kong running.

## End-to-end verification (closure)

- Created and released plan `IP-CLOSURE-20260723` (`4bc6e54a-1ad9-42d3-b66e-9a89953954f4`) for the real
  item revision `16e323c4-0cb8-41e6-ad57-3f2c4810a1bf`, operation `OP-QC`, and site
  `9f785cbd-98aa-4b2c-98ef-287a189e760c`.
- Ran the real MES execution flow for work order `WO-1010` (`8f9cde12-cea0-433f-96eb-d9c1a369425c`).
  The enriched `OperationFinished` event created draft result
  `f57ee9c8-7ad7-4474-8288-95c7330a908f` with source event
  `2583cbcc-909a-46cb-b460-6cd1176e6132` and output label
  `c352c02c-1eb2-4d70-8bd4-10405b1b7880`.
- Real QC technician `qc.tech01` submitted `POST /api/qms/inspection/results/f57ee9c8-7ad7-4474-8288-95c7330a908f/record`
  through Kong with `Fail`, defect `SURF-CRACK`, and response HTTP 200. The finalized result has
  `failed_qty=98.000000` and `overall_result=Fail`.
- The emitted `QMS.Inspection.InspectionFailed.v1` envelope contained the real site, `defect_category=Critical`,
  and the failed characteristic. Kong returned HTTP 200 for both inspection defect-code and nonconformance
  NCR routes with the real QC token.
- Nonconformance returned exactly one NCR `NCR-20260723-00001`, linked to the result and source event, with
  `site_id=9f785cbd-98aa-4b2c-98ef-287a189e760c` and `severity=Critical`.
- The exact envelope was replayed to Kafka. A subsequent NCR query still returned exactly one row with the
  same `source_event_id`, proving duplicate delivery idempotency.

## Known Boundary

- Historical events predate the enriched operation context and are intentionally ignored by the inspection
  consumer. Newly produced events and the operator-driven journey are verified above.
- External Kong verification succeeded with a real Keycloak `qms-client` bearer token: both QMS routes
  returned HTTP 200 from `100.68.50.41:18000`.
- Historical events without `site_id` are ignored with a migration warning rather than assigned to a
  demo site. Newly-produced events must carry the real site context.
- If a legacy event lacks `defect_category`, the consumer deliberately uses conservative `Major`
  severity because under-severity is more hazardous than an authorized quality-manager review reducing
  an over-severity classification.

## Next Step

Phase 3 Step 3 console implementation and closure evidence are recorded in
`implementation/phase-3-3-qms-console.md`.
