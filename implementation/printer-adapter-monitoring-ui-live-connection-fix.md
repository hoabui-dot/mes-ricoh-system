# Printer Adapter Monitoring UI Live Connection Fix

Date: 2026-07-27

## Root cause

The Monitoring UI container was not running. Host port `5010` was occupied by
the unrelated `bonsai_llamacpp` container, while `5011` and `5012` were also
occupied by other model containers. Requests sent to `:5010` therefore reached
the wrong service and `/api/monitoring/*` returned `404`, which caused the
frontend to show default data.

The UI also used `http://printer-adapter:5003`, but the adapter was deployed
from a different Compose project as `station-printer-adapter`. The service DNS
name was therefore not a reliable cross-Compose connection.

## Fix

- Root `docker-compose.print-adapter.yml` now uses
  `PRINTER_ADAPTER_URL=http://100.68.50.41:5003`.
- Mac deployment uses the standard `5010:5010` mapping.
- This development host has ports `5010` through `5014` occupied by unrelated
  services, so verification used temporary host port `5015` only.
- The UI uses the fresh multi-platform image
  `vanhoadotbui2628/printer-adapter-ui:kafka-monitoring-20260727`.

## Verification

- `GET /health` on temporary `:5015`: HTTP 200.
- `GET /api/monitoring/summary` on temporary `:5015`: HTTP 200.
- `GET /api/monitoring/printers` on temporary `:5015`: HTTP 200 with
  `Zebra-GK420t-CUPS`.
- `GET /api/monitoring/kafka/queues` on temporary `:5015`: HTTP 200.
- Summary reports Kafka `Connected`, one registered printer, and adapter
  `Degraded` only because the configured CUPS queue is currently offline.
- Compose validation and `git diff --check`: passed.

On the Mac deployment host, access the UI at `http://<server-ip>:5010/`.
The temporary `5015` mapping was only used for verification on this crowded
development host.

The stale image logged `GetRabbitMqAsync`, `GetQueuesAsync`, and invalid
relative Management API URLs. The fresh image contains the Kafka-only code;
the summary endpoint was verified without those exceptions.
