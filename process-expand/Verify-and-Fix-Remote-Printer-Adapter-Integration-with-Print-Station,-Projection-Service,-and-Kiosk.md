# Verify and Fix Remote Printer Adapter Integration with Print Station, Projection Service, and Kiosk

## Background

The Printer Adapter is now deployed independently on another server.

Current Printer Adapter deployment:

```yaml
name: print-adapter

services:
  printer-adapter:
    image: vanhoadotbui2628/printer-adapter:rabbitmq-remote-20260727
    container_name: printer-adapter
    restart: unless-stopped
    ports:
      - "5003:5003"
    environment:
      ASPNETCORE_URLS: http://+:5003
      ASPNETCORE_ENVIRONMENT: Production
      SQLITE_PRINTER_PATH: /data/printer.db
      CUPS_HEALTH_HOST: host.docker.internal
      CUPS_QUEUE: Zebra_Technologies_ZTC_GK420t

      RABBITMQ_HOST: 100.68.50.41
      RABBITMQ_PORT: 5673
      RABBITMQ_USERNAME: guest
      RABBITMQ_PASSWORD: guest
      RABBITMQ_VHOST: /
      RABBITMQ_USE_TLS: "false"
      RABBITMQ_CONNECTION_NAME: PRINT-ADAPTER-01

      PrinterAdapter__HeartbeatIntervalSeconds: "15"

    volumes:
      - printer-adapter-data:/data

    extra_hosts:
      - "host.docker.internal:host-gateway"

    healthcheck:
      test:
        - CMD-SHELL
        - >-
          exec 3<>/dev/tcp/127.0.0.1/5003 &&
          printf 'GET /api/health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n' >&3 &&
          grep -q 'printer-adapter' <&3
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 20s

volumes:
  printer-adapter-data:

The Printer Adapter connects remotely to RabbitMQ running on:

Host: 100.68.50.41
Port: 5673
Virtual host: /

The Printer Adapter server already has a physical Zebra printer connected through CUPS.

The printer is expected to be ready for a real print test.

Objective

Verify and fix the complete integration:

Remote Printer Adapter
→ RabbitMQ
→ Projection Service
→ SignalR
→ Kiosk UI

Also verify the production print command flow:

Job Engine
→ RabbitMQ
→ Remote Printer Adapter
→ CUPS
→ Physical Zebra Printer
→ RabbitMQ result event
→ Job Engine
→ Projection Service
→ Kiosk

The task is complete only when:

Printer Adapter is healthy.
Printer Adapter is connected to RabbitMQ.
Printer Adapter has discovered or registered the physical printer.
The printer status is ONLINE and ready.
Printer Adapter publishes heartbeat and status events.
Projection Service consumes these events.
Projection Service stores the printer device state.
Kiosk UI displays the printer and receives real-time state updates.
A controlled test label is printed successfully.
The print result reaches Job Engine and Projection Service.
Kiosk shows the print result without requiring direct polling from Printer Adapter.
Critical Safety Rules

Before changing code:

Inspect the actual source code.
Inspect running container logs.
Inspect RabbitMQ queues, bindings, consumers, and exchanges.
Inspect the Printer Adapter SQLite database.
Inspect the Projection Service SQLite database.
Inspect the Kiosk API and frontend stores.
Confirm the physical printer queue name before printing.

Do not assume documentation is fully current.

Use this evidence order:

Runtime logs and HTTP responses
RabbitMQ topology and live consumers
Source code
SQLite database contents
Docker Compose configuration
Tests
Documentation

Do not modify code until the current failure point is identified.

If the physical printer is not confirmed ready, stop before sending a test print and report the problem.

If there is a risk of duplicate printing, stop before triggering the test and fix idempotency first.

Phase 1 — Verify Remote Printer Adapter Runtime

Connect to the remote Printer Adapter server and inspect:

docker compose ps
docker compose logs --tail=300 printer-adapter
docker inspect printer-adapter

Confirm:

container is running
Docker health status is healthy
API is listening on port 5003
SQLite database is writable
no migration errors
no RabbitMQ authentication errors
no RabbitMQ reconnect loop
no CUPS connection errors
heartbeat worker is running
printer health polling is running

Call:

curl -v http://localhost:5003/api/health

Also call from the Print Station server:

curl -v http://<printer-adapter-server-ip>:5003/api/health

The health response must clearly report:

service status
RabbitMQ connection status
printer count
online printer count
offline printer count
CUPS status
last successful heartbeat publication, if available

If the current health endpoint does not include dependency details, improve it without changing the normal production flow.

Example expected response:

{
  "service": "printer-adapter",
  "status": "Healthy",
  "rabbitMq": {
    "status": "Connected",
    "host": "100.68.50.41",
    "port": 5673,
    "connectionName": "PRINT-ADAPTER-01"
  },
  "cups": {
    "status": "Connected",
    "queue": "Zebra_Technologies_ZTC_GK420t"
  },
  "printers": {
    "total": 1,
    "online": 1,
    "offline": 0,
    "error": 0
  }
}

Do not expose passwords in the response.

Phase 2 — Verify RabbitMQ Connectivity

On the RabbitMQ server at 100.68.50.41, inspect the broker.

Confirm that connection PRINT-ADAPTER-01 is visible.

Inspect:

docker compose logs --tail=300 rabbitmq

Use RabbitMQ CLI or Management API where available:

rabbitmqctl list_connections \
  name \
  peer_host \
  peer_port \
  user \
  vhost \
  state \
  channels

rabbitmqctl list_channels \
  connection \
  number \
  consumer_count \
  messages_unacknowledged

rabbitmqctl list_queues \
  name \
  durable \
  consumers \
  messages_ready \
  messages_unacknowledged

rabbitmqctl list_bindings

Verify at minimum:

Exchange:
station.events

Printer Adapter queue:
printer-adapter.print-commands

Bindings:
command.printer.print
command.printer.print.batch

Projection queue:
projection-service activity/device event queue

Projection bindings must include:
printer.heartbeat
printer.status.changed
printer.error
printer.printed
printer.batch.printed

If Projection Service currently uses a wildcard binding, verify that it truly matches these routing keys.

Confirm the Printer Adapter queue has an active consumer from the remote server.

If the remote connection is missing, identify whether the issue is:

firewall
Tailscale routing
RabbitMQ listener configuration
port mapping
username/password
vhost
RabbitMQ guest-user restriction
queue declaration failure
exchange mismatch
Important RabbitMQ Guest User Check

The current remote configuration uses:

RABBITMQ_USERNAME=guest
RABBITMQ_PASSWORD=guest

RabbitMQ commonly restricts the guest account to localhost connections.

Verify whether the current broker explicitly permits remote guest login.

If the remote Printer Adapter cannot authenticate because of this restriction:

Do not weaken RabbitMQ security globally.
Create a dedicated user instead.

Example:

rabbitmqctl add_user station-printer-adapter '<strong-password>'
rabbitmqctl set_permissions -p / station-printer-adapter \
  '^printer-adapter\..*|^amq\.gen.*' \
  '^station\.events$' \
  '^printer-adapter\..*'

Adapt permissions to the actual topology.

Update the Printer Adapter Compose configuration to use the dedicated account.

Do not commit the password into source control.

Phase 3 — Verify Printer Registration and Physical Connectivity

Call the actual Printer Adapter APIs.

Inspect the source to determine the exact routes.

Expected routes may include:

GET /api/printers
GET /api/printers/active
GET /api/health
GET /api/print-history

Run:

curl -s http://localhost:5003/api/printers | jq
curl -s http://localhost:5003/api/printers/active | jq

Confirm the physical printer exists with values equivalent to:

PrinterCode: Zebra-GK420t-CUPS
DriverType: cups
CupsQueueName: Zebra_Technologies_ZTC_GK420t
Status: ONLINE
IsActiveForWork: true

Inspect the Printer Adapter database:

docker exec printer-adapter \
  sqlite3 /data/printer.db \
  ".tables"

docker exec printer-adapter \
  sqlite3 -header -column /data/printer.db \
  "SELECT PrinterCode,
          DisplayName,
          Status,
          DriverType,
          CupsQueueName,
          IsActiveForWork,
          ActiveTemplateId,
          LastHeartbeatAt
   FROM printer_printers;"

Verify CUPS from the remote host:

lpstat -t
lpstat -p Zebra_Technologies_ZTC_GK420t
lpoptions -p Zebra_Technologies_ZTC_GK420t

Verify from inside the container where possible:

docker exec printer-adapter \
  sh -c 'getent hosts host.docker.internal || true'

docker exec printer-adapter \
  sh -c 'lpstat -h host.docker.internal -p Zebra_Technologies_ZTC_GK420t || true'

If the implementation uses IPP or a forwarded CUPS port, inspect the real configured host and port.

Do not report the printer as connected based only on the database row.

Confirm the physical queue is accepting jobs.

Phase 4 — Verify Printer Heartbeat and Status Events

The Printer Adapter is configured to publish a heartbeat every 15 seconds.

Observe Printer Adapter logs for at least 45 seconds.

Confirm at least three heartbeat cycles.

The expected routing keys are:

printer.heartbeat
printer.status.changed
printer.error

Temporarily use a diagnostic RabbitMQ consumer if needed.

Example using rabbitmqadmin:

rabbitmqadmin declare queue \
  name=debug.printer-events \
  durable=false \
  auto_delete=true

rabbitmqadmin declare binding \
  source=station.events \
  destination_type=queue \
  destination=debug.printer-events \
  routing_key='printer.#'

Read events:

rabbitmqadmin get \
  queue=debug.printer-events \
  ackmode=ack_requeue_false \
  count=20

Alternatively, create a repository-local diagnostic script.

Verify heartbeat payload includes enough identity for Projection Service:

{
  "printerId": "...",
  "printerCode": "Zebra-GK420t-CUPS",
  "adapterId": "PRINT-ADAPTER-01",
  "status": "ONLINE",
  "timestamp": "..."
}

Confirm that status events are only published on transitions and heartbeats are published periodically.

Remove or document any temporary debug queue after testing.

Phase 5 — Verify and Fix Projection Service

Inspect Projection Service:

RabbitMQ connection configuration
queue declaration
exchange binding
printer event deserialization
event-type or routing-key switching
printer device projection model
SQLite schema
SignalR publishing

Check logs:

docker compose logs --tail=500 projection-service

Look for:

RabbitMQ connection established
queue declared
bindings created
printer heartbeat received
printer status event received
deserialization errors
unknown event type
database update failures
SignalR publishing failures

Confirm Projection Service consumes:

printer.heartbeat
printer.status.changed
printer.error
printer.printed
printer.batch.printed

If it currently binds only to a broad wildcard, confirm the wildcard is correct for a topic exchange.

Remember:

* matches exactly one routing-key segment
# matches zero or more segments

For example, a binding such as:

*.*.*

will not match every routing key unless the routing key has exactly three segments.

The routing key:

printer.heartbeat

contains only two segments.

Therefore, carefully inspect the current binding.

If Projection Service is expected to consume all events, prefer:

#

or explicit bindings:

printer.heartbeat
printer.status.changed
printer.error
printer.printed
printer.batch.printed

Do not change the binding blindly. Verify all existing routing keys and avoid breaking other projections.

Phase 6 — Verify Projection Database

Inspect the Projection Service database schema.

Find the current table that stores device runtime state.

Possible names may include:

devices
device_states
printer_devices
printer_runtime_states
production_devices

Do not create a duplicate table if one already exists.

Run database queries to confirm that Printer Adapter events create or update a device record.

The projected record should include:

device code
device type = PRINTER
adapter or station identifier
status
last heartbeat
last status change
last error
current job, if any
last successful print
updated timestamp

Example verification:

docker exec station-projection-service \
  sqlite3 -header -column /data/projection.db \
  "SELECT *
   FROM <actual_device_table>
   WHERE device_code = 'Zebra-GK420t-CUPS';"

Wait for another heartbeat and confirm last_heartbeat_at changes.

Projection updates must be idempotent.

A heartbeat should update the existing row rather than insert duplicates.

Phase 7 — Verify Projection REST API

Find the current Kiosk-facing device API.

Expected possibilities:

GET /api/devices
GET /api/printers
GET /api/device-status
GET /api/projection/devices

Call the real endpoint from:

Projection Service host
Kiosk container
Browser-facing Kiosk URL

Example:

curl -s http://localhost:5009/api/devices | jq

The response should include:

{
  "deviceCode": "Zebra-GK420t-CUPS",
  "deviceType": "PRINTER",
  "status": "ONLINE",
  "lastHeartbeatAt": "...",
  "lastStatusChangedAt": "...",
  "adapterId": "PRINT-ADAPTER-01"
}

Do not make Kiosk query the remote Printer Adapter directly for live runtime status.

The source of truth for the UI should be Projection Service.

Phase 8 — Verify SignalR and Kiosk Real-Time Updates

Inspect the SignalR hub in Projection Service.

Confirm the actual hub URL, expected to be similar to:

http://projection-service:5009/hubs/production

Inspect SignalR events for printer state.

Expected events may include:

OnPrinterHeartbeat
OnPrinterStatusChanged
OnPrinterError
OnPrintCompleted
OnDeviceStatusChanged

Reuse existing event names if implemented.

Do not introduce duplicate SignalR event contracts unnecessarily.

Inspect Kiosk frontend:

usePrinterStore
SignalR connection setup
initial REST loading
printer/device page
printer cards or table
status badge mapping
reconnect behaviour

Verify the intended UI flow:

Kiosk page load
→ GET current printer/device state from Projection Service

After initial load
→ receive heartbeat/status changes through SignalR
→ update Zustand store
→ update UI without page refresh

Run Kiosk and inspect browser console:

SignalR connection established
no CORS error
no JSON contract mismatch
no unknown event error
no repeated reconnect loop

Open the Kiosk printer/device page and confirm:

Zebra printer is visible
status is ONLINE
last heartbeat updates
adapter code is visible where appropriate
errors are displayed correctly
no duplicate printer rows appear
Phase 9 — Fix Print Station Configuration

Inspect all Station Agent Compose files and application configuration.

The local Station Agent must not resolve Printer Adapter by Docker service name such as:

http://printer-adapter:5003

because Printer Adapter is now remote.

Find all remaining references to:

printer-adapter
PRINTER_ADAPTER_HOST
PRINTER_ADAPTER_PORT
PRINTER_ADAPTER_URL
http://printer-adapter:5003

Classify each usage.

Allowed remote HTTP usages

HTTP may still be used for:

active printer selection
printer registry
template management
print history
health diagnostics

Configure these components with the actual remote URL:

PRINTER_ADAPTER_URL=http://<remote-printer-adapter-ip>:5003

Do not assume the remote Printer Adapter server IP.

Inspect the deployment environment or ask for it only if it is not available anywhere in repository or server configuration.

RabbitMQ production flow

Normal printing must remain:

Job Engine
→ RabbitMQ command
→ Printer Adapter

Job Engine must not call POST /api/print for standard production printing.

Phase 10 — Create a Printer Integration Verification Script

Create:

print-marking/station-agent/scripts/verify-remote-printer-integration.sh

The script must be safe to run repeatedly.

It should perform:

Printer Adapter HTTP health check.
RabbitMQ TCP connectivity check.
RabbitMQ connection existence check for PRINT-ADAPTER-01.
Printer Adapter command queue consumer check.
Printer list API check.
Active printer API check.
Verify printer status is ONLINE.
Verify CUPS queue name matches:
Zebra_Technologies_ZTC_GK420t
Verify recent printer.heartbeat event.
Verify Projection Service has a printer device row.
Verify Projection REST API returns the printer.
Verify Kiosk API can access the projected printer state.
Optionally verify SignalR with a small client if practical.

Output must use:

PASS
FAIL
WARN
SKIPPED

Example:

[PASS] Printer Adapter HTTP health
[PASS] RabbitMQ TCP connection
[PASS] Remote connection PRINT-ADAPTER-01 found
[PASS] Printer command consumer active
[PASS] Printer Zebra-GK420t-CUPS registered
[PASS] Printer status ONLINE
[PASS] Recent heartbeat received
[PASS] Projection device state found
[PASS] Projection API exposes printer
[PASS] Kiosk reads projected printer

Do not print broker passwords.

Exit non-zero if any required check fails.

Phase 11 — Create a Controlled Physical Print Test Script

Create:

print-marking/station-agent/scripts/trigger-physical-printer-test.sh

The default test must use the normal RabbitMQ production command path.

Do not call POST /api/print unless explicitly invoked with a manual-test option.

The script should:

Run the verification script first.
Stop if printer status is not ONLINE.
Stop if the command queue has no active consumer.
Generate a unique:
command ID
job ID
production order number
idempotency key
Publish exactly one small test command.
Use a clearly identifiable test label.
Wait for the corresponding result event.
Verify print history.
Verify Projection Service received the result.
Print a final PASS or FAIL summary.

Recommended test label content:

REMOTE PRINTER TEST
Printer: Zebra-GK420t-CUPS
Adapter: PRINT-ADAPTER-01
Timestamp: <UTC timestamp>
Test ID: <unique ID>

Use a small label and one copy only.

Do not use a production barcode or real production serial number.

Suggested invocation:

./scripts/trigger-physical-printer-test.sh

Optional arguments:

./scripts/trigger-physical-printer-test.sh \
  --printer Zebra-GK420t-CUPS \
  --copies 1

Maximum copies for this script must be limited to one unless an explicit unsafe override is provided.

Phase 12 — Publish the Correct RabbitMQ Contract

Do not invent an event body.

Inspect the actual ProductionBatchPrintCommand contract in shared source code.

The script must serialize the exact contract expected by Printer Adapter.

It should use the actual:

exchange
routing key
envelope
headers
property naming convention
content type
correlation ID
message ID

Expected routing key:

command.printer.print.batch

Expected exchange:

station.events

The exact payload must come from current source code.

Do not copy an outdated documentation payload without checking the current contract.

Phase 13 — Verify Physical Print Result

After publishing the test command, verify all layers.

Printer Adapter

Check logs for:

command received
idempotency reservation created
printer selected
template rendered
CUPS command executed
print succeeded
result event published
RabbitMQ

Confirm:

command message acknowledged
printer.batch.printed published
no message stuck unacknowledged
no dead-letter message
Printer database

Verify:

printer command execution exists
print history exists
status = SUCCESS
one execution only
Job Engine

Confirm the result event was consumed.

If the test command uses a synthetic job that Job Engine does not know, do not force Job Engine to create invalid state.

Choose one of these safe approaches:

Trigger a complete test order through Station Gateway so Job Engine creates the job.
Provide a dedicated integration-test mode supported by Job Engine.
Verify Printer Adapter and Projection flow without requiring Job Engine state mutation.

Prefer the complete Station Gateway flow where practical.

Projection Service

Confirm:

printer status remains ONLINE
last successful print is updated
activity log contains the test
no duplicate device row
SignalR event is emitted
Kiosk

Confirm visually or through an automated browser/API check:

printer remains visible
latest print result appears
printer status is ONLINE
last heartbeat continues updating
no page refresh is required
Phase 14 — Optional Full Station Gateway Test

If the existing Device Simulator or Gateway API supports a safe test production order, create another script:

scripts/trigger-print-station-e2e-test.sh

Flow:

Test script
→ POST Station Gateway order
→ RabbitMQ
→ Job Engine
→ command.printer.print.batch
→ Remote Printer Adapter
→ Physical Zebra
→ printer.batch.printed
→ Job Engine
→ Projection Service
→ SignalR
→ Kiosk

Use:

JobType: PRINT_ONLY
PlannedQty: 1
SourceSystem: INTEGRATION_TEST

Do not trigger Laser, Vision, or PLC steps unless explicitly required.

Use a unique production order number.

Phase 15 — Runtime Recovery Test

After the successful print test, verify recovery without printing another label unnecessarily.

Test RabbitMQ reconnect:

Observe Printer Adapter connected.
Temporarily block or stop the connection only if safe.
Confirm Printer Adapter health becomes DEGRADED.
Restore RabbitMQ.
Confirm automatic reconnection.
Confirm heartbeat publishing resumes.
Confirm Projection Service updates the device again.
Do not publish another print command during this recovery test.

If stopping the shared broker would disrupt other running production services, skip this test and report:

SKIPPED — shared broker outage test is unsafe in the current environment
Phase 16 — Documentation

Create or update:

print-marking/implementation/remote-printer-adapter-runtime-verification.md
print-marking/station-agent/services/printer-adapter/README.md
print-marking/AI_CONTEXT.md

Document:

remote Printer Adapter server
Printer Adapter HTTP URL
RabbitMQ host and port
RabbitMQ user setup
queue and exchange names
printer code
CUPS queue
Projection Service flow
SignalR flow
Kiosk UI flow
verification script
physical print script
test result
known risks

Do not document passwords.

Required Final Report

Report all results separately.

Printer Adapter
container status
health response
RabbitMQ connection state
RabbitMQ connection name
CUPS state
printer count
printer code
printer status
active template
last heartbeat
RabbitMQ
connection found
queue found
consumer count
bindings
messages ready
messages unacknowledged
authentication changes, if any
Projection Service
printer heartbeat consumed
printer status event consumed
projected database row
last heartbeat timestamp
REST API result
SignalR event result
Kiosk
printer visible
status displayed
real-time update confirmed
browser/API errors
Print Test
test command ID
production order number
printer code
physical print result
RabbitMQ result event
print history result
Projection result
Kiosk result
duplicate execution check
Files Changed

List every changed file.

Scripts Added

List exact commands to run:

./scripts/verify-remote-printer-integration.sh
./scripts/trigger-physical-printer-test.sh
./scripts/trigger-print-station-e2e-test.sh

Do not report “fully verified” unless the physical printer produced the test label and the result was observed in Projection Service and Kiosk.