# Circuit Breaker Hardening

Date: 2026-07-22

Source prompt: `implementation-fix/Circuit-breaker-audit.md`

Scope: harden every synchronous outbound business HTTP dependency found in MES/WMS source code. This is a process-fix task, so the implementation record lives in `implementation-fix/`.

## Audit Findings

| Caller | Dependency | Endpoint(s) | Before | Finding |
| --- | --- | --- | --- | --- |
| `mes-execution-service` | `mes-master-data-service` | approval freshness/permission check | gobreaker present, but used default config, no timeout-safe HTTP client, and connection errors were swallowed as success | Partially implemented |
| `mes-execution-service` | `mes-traceability-service` | label issue/split/consume calls for OP-MIX, OP-CUT, OP-MOLD, OP-QC | gobreaker present with low local threshold and 5s open timeout; no shared telemetry contract | Partially implemented |
| `mes-execution-service` | `wms-outbound-service` | `POST /api/wms/outbound/material-requests` | breaker present but consecutive-failure based, default open timeout, no shared retryable error/telemetry contract | Partially implemented |
| `wms-inbound-service` | `wms-inventory-service` | `POST /api/wms/inventory/movements/receipt` | plain `fetch` inside receipt confirmation | Missing |
| `wms-outbound-service` | `wms-inventory-service` | `GET /balances`, `POST /transfer-to-staging` | plain `http.Client` calls | Missing |
| `mes-kiosk-gateway-service` | `platform-keycloak` | token endpoint for terminal login | plain HTTP call to Keycloak | Missing |

Additional sync HTTP calls found but left outside this business dependency hardening:

- MES/WMS browser UI `fetch` calls to gateways/services. These are user-agent calls, not server-to-server dependencies.
- Schema Registry registration calls during producer/bootstrap setup. These are platform startup/infrastructure calls, not request-path business workflow calls. They should be handled separately if startup resilience policy is formalized.

## Shared Go Baseline

Added `libs/shared-kernel-go/circuit_breaker.go` with:

- `NewCircuitBreaker` wrapper over `github.com/sony/gobreaker`.
- Default minimum request volume: `4`.
- Default failure ratio threshold: `>= 50%`.
- Default open timeout: `30s`.
- Default half-open trial requests: `2`.
- `RetryableDependencyError` for explicit retryable failure propagation.
- OTel state-transition span `circuit_breaker.state_change`.
- OTel metric counter `circuit_breaker_state_changes_total`.

## Implemented Fixes

### MES Execution -> MES Master Data

- Reworked approval gate client to use the shared breaker baseline.
- Added a bounded HTTP client timeout.
- Stopped swallowing network errors; connection failures and 5xx now trip the breaker.
- Open/unavailable dependency returns `RetryableDependencyError`.
- HTTP router maps retryable approval dependency failures to `503 DEPENDENCY_UNAVAILABLE`.

### MES Execution -> MES Traceability

- Replaced local breaker settings with the shared Go breaker baseline.
- Network failures and 5xx responses now become retryable dependency failures.
- 4xx responses remain business validation failures and do not trip the breaker.
- OP-QC PASS-label issuance now propagates traceability dependency failure instead of silently continuing.
- Confirm-operation route maps retryable dependency failures to `503 DEPENDENCY_UNAVAILABLE`.

### MES Execution -> WMS Outbound

- Replaced local breaker settings with the shared Go breaker baseline.
- Network failures and 5xx responses now become retryable dependency failures.
- Shortage `409` remains a business result, not a breaker failure.
- Stage-materials route continues using the existing 503 retry UI pattern.

### WMS Outbound -> WMS Inventory

- Added shared Go breaker around both balance lookup and transfer-to-staging calls.
- Network failures and 5xx responses return retryable dependency errors.
- HTTP router maps retryable inventory failures to `503 INVENTORY_SERVICE_UNAVAILABLE`.
- Added duplicate staging protection:
  - Uses `pg_advisory_xact_lock(hashtext(idempotencyKey))` for `wo_id + work_center_ref + item_revision_id + required_qty`.
  - Checks existing `material_request` while the lock is held and returns it on repeated calls.
  - If a transfer succeeds but outbound persistence fails, a retry rechecks inventory balances first; already-staged stock is reused instead of transferred again.

### WMS Inbound -> WMS Inventory

- Added `opossum` breaker in `services/wms-inbound-service/src/infrastructure/client/inventory-receipt-client.ts`.
- Baseline:
  - `volumeThreshold: 4`
  - `errorThresholdPercentage: 50`
  - `resetTimeout: 30_000`
  - `timeout: 10_000`
- 4xx inventory responses are filtered as business errors and do not trip the breaker.
- Open/timeout/5xx dependency failures become HTTP 503 from receipt confirmation.
- Receipt confirmation remains transactional: if inventory receipt posting fails, the local receipt status update rolls back and remains `Draft`.
- Emits OTel span and metric counter for breaker state transitions.

### MES Kiosk Gateway -> Keycloak

- Added shared Go breaker around terminal login token calls to Keycloak.
- Keycloak 5xx/network/open breaker failures become retryable dependency errors.
- Invalid credentials and other non-5xx auth failures remain HTTP 401.
- HTTP router maps Keycloak dependency outage to `503 KEYCLOAK_UNAVAILABLE`.

## Manifest Updates

Updated synchronous dependency sections and breaker configuration in:

- `services/mes-execution-service/service.manifest.yaml`
- `services/wms-outbound-service/service.manifest.yaml`
- `services/wms-inbound-service/service.manifest.yaml`
- `services/mes-kiosk-gateway-service/service.manifest.yaml` (new manifest)

No Kong route or plugin changes were made.

## Tests Added

- `services/mes-execution-service/internal/infrastructure/client/traceability_client_test.go`
- `services/mes-execution-service/internal/infrastructure/client/wms_outbound_client_test.go`
- `services/wms-outbound-service/internal/application/usecase/material_request_test.go`
- `services/wms-inbound-service/src/infrastructure/client/inventory-receipt-client.test.ts`
- `services/mes-kiosk-gateway-service/internal/application/auth_service_test.go`

The tests simulate downstream 500 failures and verify the breaker opens after the minimum failure volume, preventing a fifth downstream call.

## Verification

Passed:

```bash
env GOCACHE=/tmp/go-build-cache /usr/local/go/bin/go test ./...
```

Run in:

- `libs/shared-kernel-go`
- `services/mes-execution-service`
- `services/wms-outbound-service`
- `services/mes-kiosk-gateway-service`

Passed:

```bash
npm run test --workspace=wms-inbound-service
npm run build --workspace=wms-inbound-service
```

Notes:

- The default Snap `go`/`gofmt` install fails in this sandbox, so `/usr/local/go/bin/go` and `/usr/local/go/bin/gofmt` were used.
- Go tests were written with fake `http.RoundTripper` implementations instead of `httptest.NewServer` because local port binding is blocked in this environment.
- `services/wms-outbound-service/go.sum` was owned by `nobody:nogroup`; it was replaced through patch so Go could normalize required checksums.
