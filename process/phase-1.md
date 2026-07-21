# PROMPT — Phase 1, Step 1: Build `mes-master-data-service`
**Trạng thái:** Completed ✅

## Context (read first — this is not a greenfield task)

Phase 0 (Platform Foundation) and Phase 1 (`mes-master-data-service`) are **already complete and verified** for the Won Seal Tech MOM Platform (MES/WMS/QMS). The following are already running:

- [x] **Kafka (KRaft) + Confluent Schema Registry** — broker and registry up and healthy.
- [x] **Keycloak**, Realm `wonsealtech`, 4 OIDC Clients (`mes-client`, `wms-client`, `qms-client`, `portal-client`), Global Roles (`EXECUTIVE`, `PLANT_MANAGER`, `OPERATOR`, `QC_TECHNICIAN`, `WAREHOUSE_STAFF`), Front-Channel Logout configured.
- [x] **Kong API Gateway** (declarative mode) — verifies JWT/tokens, extracts `UserID`/`RoleCode` and forwards them to backend services via `X-User-ID` and `X-Role-Code` headers, plus `X-Trace-ID` via correlation-ID plugin.
- [x] **Observability**: OpenTelemetry Collector, Loki, Tempo, Prometheus, Grafana — all provisioned, dashboards ready.
- [x] **`libs/shared-kernel`**:
  - `EventEnvelope<T>` type + factory + type guard
  - `OutboxRelayWorker` + `writeToOutbox()`
  - `audit-trigger.sql`
  - `lifecycle-state-machine.sql`
- [x] **`mes-master-data-service`**:
  - Built end-to-end with Drizzle schema for 26 tables (Layers 0–3 + Domain-Scoped Access).
  - Validation Engine rules 1–8 and 10 implemented and passing for `FG-WS-CM01`.
  - Event schemas registered in Schema Registry.
  - Outbox event publishing verified on Kafka topics.
  - Wired into Kong route `/api/mes/master-data/*`.

## Definition of Done Verification Status

- [x] `docker compose up -d` brings up `mes-master-data-service` healthy alongside Phase 0 infra.
- [x] All 26 tables created via Drizzle migrations, each with audit trigger + lifecycle trigger + row_version + no DELETE grant, verified.
- [x] Seed data loads cleanly and a full Production Version for `FG-WS-CM01` passes Validation Engine with zero errors (rules 1–8, 10).
- [x] Releasing an item/MBOM produces a `MES.MasterData.*` message visible via `kafka-console-consumer`, matching registered Schema Registry payload schema.
- [x] A request to `/api/mes/master-data/*` through Kong with valid token headers returns 200 with correct `X-User-ID`/`X-Role-Code` reflected in the audit trail.
- [x] Trace for a full create→release round trip is visible end-to-end in Grafana Tempo.