# API Conventions

## REST Shape

APIs are exposed behind Kong under `/api/<domain>/<service-or-context>/...`. MES examples:

- `/api/mes/master-data/:resource`
- `/api/mes/execution/work-orders`
- `/api/mes/traceability/labels/issue`
- `/api/mes/kiosk-gateway/terminals/:id/login`

## DTO Conventions

- Business codes and localized names are user-facing.
- UUIDs are internal identifiers and must not be primary labels.
- Localized text is stored/published as JSON where implemented.
- Work Order creation uses `production_version_id` as authority, not independent MBOM/Routing picks.

## Validation

Backend validation is authoritative. UI filtering is only usability. Validation should return useful machine-readable codes and, where possible, all failed conditions rather than only the first.

Known validation categories include lifecycle/effectivity, same-site hierarchy, UOM precision/fraction, released immutability, resource readiness, capacity conflict, idempotency key mismatch, and dependency unavailable.

## Error Model

Observed patterns:

- JSON `{ "error": "...", "message": "..." }` in several Go routes.
- Express routes may return structured errors through middleware.
- Some traceability routes use `http.Error`; callers must handle non-JSON bodies.
- Resource allocation maps serialization conflicts to `RESOURCE_CAPACITY_CONFLICT`.
- Forbidden allocation mutation returns `RESOURCE_ALLOCATION_FORBIDDEN`.

Future work: standardize error envelopes across all services.

## Pagination, Filtering, Sorting

Master-data and console list APIs support query-driven filtering in places. QMS Console uses paginated lists. A single cross-service pagination contract is not fully proven; inspect each API before changing list behavior.

## Versioning

Event names are versioned. REST API path versioning is not consistently used. Resource lifecycle/version fields are separate from API versioning.

## Idempotency

Known idempotency headers/keys:

- `Idempotency-Key` allowed by MES execution CORS.
- Work Order creation workflows use user plus idempotency key.
- Resource allocation stores idempotency key and request hash.
- Traceability label issue supports idempotency key at persistence level.

Never reuse an idempotency key with a different payload.

## Correlation IDs

Services use `X-Trace-ID` and user/role headers such as `X-User-ID` and `X-Role-Code`. Kong should be the trusted boundary for browser-exposed traffic. Do not trust arbitrary client-provided role headers without gateway validation.

## CORS

MES execution explicitly allows `Authorization`, `X-User-ID`, `X-Role-Code`, `X-Trace-ID`, and `Idempotency-Key`. When adding headers, update CORS and client behavior together.

## Phase 5 Two-Line API Design

Status: PARTIALLY_IMPLEMENTED.

Phase 6 implemented Production Line CRUD/lifecycle, Work Center line assignment, Production Version Line Eligibility, and Production Version line-readiness preview APIs in MES Master Data.

Phase 7 implemented MES Execution line-selection API behavior:

- Work Order creation returns line-selection state and snapshots the selected line or `ResourceHold`.
- `GET /api/mes/execution/work-orders/{id}/line-readiness` returns the persisted line decision and evaluated line results.
- `POST /api/mes/execution/work-orders/{id}/line-replan` performs an audited replan before execution start and rejects in-place transfer after start.
- `GET resource-candidates` blocks `ResourceHold` or line-less Work Orders before calling advisory planner services.
- Allocation, approval, start-execution, and operation-start paths revalidate selected-line consistency.

Stable future error codes include:

- `WO_LINE_SELECTION_REQUIRED`
- `WO_LINE_RESOURCE_HOLD`
- `WO_LINE_NOT_ELIGIBLE`
- `WO_LINE_NOT_READY`
- `WO_LINE_MIXED_ALLOCATION_REJECTED`
- `WO_LINE_LOCKED`
- `WO_LINE_IDEMPOTENCY_MISMATCH`
