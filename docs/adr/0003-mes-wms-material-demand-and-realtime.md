# ADR 0003: MES-WMS Material Demand Ownership and WMS Realtime

Date: 2026-07-24

## Status

Accepted

## Decision

MES Execution is the sole creator of WMS material demand through the explicit
`POST /api/mes/execution/work-orders/:id/stage-materials` command. Approval only changes MES lifecycle
state, writes the approval log, and publishes `MES.Execution.WOApproved.v1`; it does not create WMS
requests because no WMS consumer for that event exists.

MES groups positive non-phantom requirements by Work Order, Work Center, and Item Revision, skips
completed staging, and serializes the command per Work Order. WMS owns allocation, inventory transfer,
shortage state, request persistence, idempotency, and its transactional outbox. HTTP 5xx/timeouts remain
retryable; business validation and shortage results do not receive automatic transport retries.

WMS Outbound consumes its staged/shortage outbox events and exposes an authenticated WebSocket only for
UI notification. WMS Console refetches REST after connection/reconnect and targeted event invalidation;
REST remains the source of truth.

## Consequences

There is one durable material-demand creator and repeated staging is safe. Cross-service inventory
transfer and persistence remain eventually consistent and require reconciliation/failure-injection
testing. Valid-token browser delivery and role-scope verification remain pending because no live Work
Order/browser session was available during this implementation.
