# MES Full Reset Audit - 2026-08-02

## Scope

Implemented guarded MES-owned data reset for local development/test/UAT use only.

## Reset Boundary

Reset includes MES-owned tables in:

- `mes_master_data_db`
- `mes_execution_db`
- `mes_traceability_db`
- `mes_kiosk_gateway_db`

Reset excludes platform and adjacent domains:

- Keycloak, Kong, Kafka, Schema Registry
- QMS, WMS, printer adapter/runtime infrastructure
- `schema_migrations`

## Safety Guards

The reset command refuses to run unless:

- `MES_ENV` is `development`, `test`, `uat`, or `local`
- `ALLOW_DESTRUCTIVE_SEED=true`
- `ALLOW_MES_FULL_RESET=true`
- `CONFIRM_MES_FULL_RESET=YES_RESET_ALL_MES_DATA`
- Database hosts are local/test hosts
- Database names match MES-owned database names
- Docker Compose project `mom-platform` is present

## Latest Passing Artifact

- Reset result: `artifacts/mes-canonical-reset/2026-08-02T09-59-11-600Z/reset-result.json`
- Status: PASS
