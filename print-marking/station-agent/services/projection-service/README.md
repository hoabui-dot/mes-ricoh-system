# Projection Service

Projection is the Print Station read-model service. It consumes Kafka events,
stores the current SQLite read model, and publishes real-time updates through
SignalR at `/hubs/production`.

## Canonical deployment

Run from the repository root:

```bash
npm run rebuild:print-station
npm run verify:print-station
npm run logs:print-station
```

The canonical Compose file is `infra/docker-compose.print-station.yml`. Kafka
comes from `infra/docker-compose.platform.yml` on `platform-net`. The physical
Printer Adapter is intentionally remote; management requests use Kafka
request/reply and no Adapter URL is required.

## Event flow

Projection consumes `MES.Execution.#` from `station.events.integration`, plus
printer/device topics. MES execution envelopes are projected into production
records, order views, activity logs, and SignalR events. Event IDs are claimed
in SQLite in the same transaction as projection writes, so Kafka redelivery is
safe. Status ranking prevents an older event from regressing a newer state.

## Diagnostics

- `GET /health` checks process availability.
- `GET /api/projection/diagnostics/health` reports SQLite, Kafka bootstrap
  endpoint, MQTT, and remote Printer Adapter dependency state.
- `GET /hubs/production/negotiate?negotiateVersion=1` verifies SignalR setup.

The service does not seed simulated devices. Device rows are created from real
heartbeat events. A remote Adapter outage makes printer diagnostics unhealthy,
but does not prevent Projection from starting or reconnecting to Kafka.
