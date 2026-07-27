# Independent Printer Adapter

The Printer Adapter is a separately deployable .NET 10 service for ZPL/TCP,
CUPS, and simulated printers. It listens on HTTP port `5003` for management,
diagnostics, and health checks. Production print commands use Kafka.

## Runtime topology

```text
Job Engine outbox
  -> Kafka station.events / command.printer.print.batch
  -> printer-adapter.print-commands
  -> render + TCP/CUPS
  -> station.events / printer.batch.printed
  -> Job Engine + Projection Service
  -> SignalR / Kiosk
```

The adapter may run on another server. It does not start Kafka or Redis in
its standalone compose file. It connects to the shared, private broker over
TCP/IP.

## Kafka configuration

Required environment variables:

| Variable | Meaning |
| --- | --- |
| `KAFKA_BOOTSTRAP_SERVERS` | Kafka broker bootstrap list, for example `100.68.50.41:19092` |
| `KAFKA_SECURITY_PROTOCOL` | `Plaintext` for trusted internal development or `SaslSsl`/`Ssl` in production |
| `KAFKA_SASL_USERNAME` | Dedicated Kafka principal, never `guest` in production |
| `KAFKA_SASL_PASSWORD` | Rotatable secret |
| `KAFKA_SASL_MECHANISM` | Kafka SASL mechanism when authentication is enabled |
| `KAFKA_CONNECTION_NAME` | Broker-visible client name |

The adapter declares the durable topic exchange `station.events` and queue
`printer-adapter.print-commands`, bound to:

- `command.printer.print.batch`
- `command.printer.print`

It publishes `printer.batch.printed`, `printer.error`,
`printer.heartbeat`, and `printer.status.changed`.

The `/api/health` endpoint reports the authenticated Kafka connection,
configured CUPS queue state, and printer counts. A reachable CUPS proxy is not
treated as a ready printer: the queue must return a valid IPP state. The
endpoint and Docker healthcheck therefore report `Degraded`/unhealthy when the
physical queue is unavailable.

## Reliability

The command `event_id` is the idempotency key. The adapter inserts a unique
row in `printer_command_executions` before rendering or printer I/O. A
redelivered completed command returns the stored result without printing
again. An in-flight duplicate is acknowledged without a second physical
print. Kafka acknowledgement happens only after command handling and
result publication complete; invalid or failed messages are nacked without
requeue for dead-letter handling configured by the broker.

The shared Kafka client enables automatic recovery and retries startup
connection attempts every ten seconds. HTTP health reports the broker and
printer states separately and returns `Degraded` when Kafka is unavailable
or no printer is online. Redis is intentionally `NotConfigured`: production
command idempotency is local and durable in SQLite, not cache-based.

## HTTP API role

HTTP remains available for printer/template management, diagnostics, and
health checks. `POST /api/print` is not a production Job Engine path; it
requires `X-Print-Source: MANUAL_TEST` or `ADMIN` and is intended for manual
testing/backward compatibility only.

## Standalone deployment

Use `docker-compose.printer-adapter.yml` from `station-agent`:

```bash
export KAFKA_BOOTSTRAP_SERVERS=10.0.0.20:19092
export KAFKA_SECURITY_PROTOCOL=SaslSsl
export KAFKA_SASL_USERNAME=station-printer-adapter
export KAFKA_SASL_PASSWORD='rotate-me'
export KAFKA_SASL_MECHANISM=Plain
docker compose -f docker-compose.printer-adapter.yml up -d
```

Do not add a Kafka container to this file. Allow only the adapter server's
private IP to reach the broker's AMQP port. Grant the adapter user only the
required vhost permissions: read on its command queue and write on the
station event exchange. Do not expose the broker or management UI publicly,
and do not use `guest/guest` outside local development.

## Build

```bash
docker build --platform linux/amd64 \
  -f services/printer-adapter/docker/Dockerfile \
  -t printer-adapter:kafka-remote-amd64 .
docker buildx build --platform linux/arm64 \
  -f services/printer-adapter/docker/Dockerfile \
  -t vanhoadotbui2628/printer-adapter:kafka-remote-20260727 \
  --push .
```

The final image tag is ARM64 for the remote ARM deployment target. The AMD64
build is for local verification only.

## Verification

From `station-agent`, run the read-only integration check before any print test:

```bash
./scripts/verify-remote-printer-integration.sh
```

The guarded physical test uses the normal Kafka command path and is limited
to one label:

```bash
./scripts/trigger-physical-printer-test.sh --printer Zebra-GK420t-CUPS --copies 1
```

It stops before publishing when Kafka, Projection, Kiosk, or the physical
CUPS queue is not ready. It never uses `POST /api/print`.

## Monitoring UI

The independent read-only monitoring service is implemented at
`services/printer-adapter-ui`. Build and run it with
`docker-compose.printer-adapter-ui.yml`, or use the repository-level
`/home/neurosus/mes-system/docker-compose.print-adapter.yml` which starts the
adapter and UI together.

The UI listens on port `5010` and reads adapter health/printers, Projection
Service read models, and Kafka Management API topology through its backend.
It never exposes broker credentials to the browser and never consumes or
mutates print-command queues. See
`print-marking/implementation/printer-adapter-monitoring-ui.md` for endpoint,
state, deployment, and verification details.
