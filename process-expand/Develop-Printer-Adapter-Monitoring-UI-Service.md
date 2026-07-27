# Develop Printer Adapter Monitoring UI Service

## Background

The Printer Adapter is deployed as an independent service on a remote Print Station server.

It manages:

- physical printers
- CUPS printer queues
- direct TCP printers
- RabbitMQ command consumption
- RabbitMQ event publishing
- printer heartbeat polling
- printer status transitions
- print command execution
- print history
- SQLite persistence

The Printer Adapter currently connects to the Station Agent RabbitMQ broker remotely and communicates through the `station.events` exchange.

Current Printer Adapter responsibilities include:

```text
Consume:
- command.printer.print
- command.printer.print.batch

Publish:
- printer.printed
- printer.batch.printed
- printer.status.changed
- printer.heartbeat
- printer.error

A dedicated monitoring service is now required.

This service must provide an operational dashboard for developers, operators, and maintenance engineers to view the real-time connection state of Printer Adapter and all related printing infrastructure.

Objective

Create a new independently deployable service named:

printer-adapter-ui

Its primary purpose is operational monitoring.

It must show:

Printer Adapter process status
Printer Adapter HTTP API availability
Printer Adapter connection to RabbitMQ
RabbitMQ exchange, queue, binding, and consumer status
Printer Adapter connection to CUPS
CUPS queue status
TCP printer connection status
Registered printer/device status
Last printer heartbeat
Printer status transitions
Recent print jobs
Recent print failures
Printer Adapter logs or diagnostic events
Overall system health

The service should be read-only by default.

Do not add production printing actions unless explicitly required.

Mandatory Pre-Implementation Audit

Before writing code, inspect the existing repository.

Review at minimum:

services/printer-adapter
services/projection-service
services/kiosk-ui
docker-compose files
shared contracts
RabbitMQ consumers and publishers
Printer Adapter health endpoints
Printer Adapter printer APIs
Printer Adapter SQLite schema
existing frontend design system
existing authentication and RBAC

Determine:

whether Printer Adapter already exposes all required monitoring data
whether RabbitMQ connection state is currently exposed
whether CUPS status is exposed
whether printer heartbeat timestamps are exposed
whether queue and consumer information can be obtained safely
whether Projection Service already stores useful printer runtime state
whether an existing UI can be reused
whether the new service should directly call Printer Adapter or use Projection Service for some views

Use this evidence order:

Running source code
Runtime API responses
RabbitMQ topology
Docker configuration
SQLite schema
Tests
Documentation

If the requested UI requires insecure RabbitMQ admin credentials inside the browser, stop and redesign the integration.

The browser must never connect directly to RabbitMQ Management API using privileged credentials.

Recommended Architecture

Implement the new service as a backend-for-frontend application.

Browser
→ Printer Adapter UI backend
→ Printer Adapter HTTP APIs
→ RabbitMQ Management API or RabbitMQ diagnostics
→ Projection Service
→ optional local diagnostic storage

Do not use:

Browser
→ RabbitMQ directly

The backend must protect credentials.

Technology

Follow the repository’s existing conventions.

Preferred implementation:

ASP.NET Core backend
+
React / Vite / TypeScript frontend

The backend and frontend may be served from one container, similar to the existing Kiosk UI service.

Use the current shared UI components where practical.

Do not copy a large amount of Kiosk code if reusable packages already exist.

Suggested Directory

Create:

print-marking/station-agent/services/printer-adapter-ui

Suggested structure:

services/printer-adapter-ui/
├── src/
│   ├── ND.PrinterAdapterUi.Api/
│   ├── ND.PrinterAdapterUi.Application/
│   ├── ND.PrinterAdapterUi.Infrastructure/
│   └── frontend/
├── docker/
│   └── Dockerfile
├── tests/
└── README.md

Adapt to the current repository conventions.

Runtime Configuration

Support environment variables:

ASPNETCORE_URLS=http://+:5010

PRINTER_ADAPTER_URL=http://<remote-printer-adapter-host>:5003
PROJECTION_SERVICE_URL=http://projection-service:5009

RABBITMQ_MANAGEMENT_URL=http://rabbitmq-host:15672
RABBITMQ_HOST=rabbitmq-host
RABBITMQ_PORT=5672
RABBITMQ_USERNAME=<monitoring-user>
RABBITMQ_PASSWORD=<secret>
RABBITMQ_VHOST=/

MONITOR_REFRESH_INTERVAL_SECONDS=5
MONITOR_STALE_HEARTBEAT_SECONDS=45
MONITOR_HTTP_TIMEOUT_SECONDS=5

Do not hardcode passwords.

Support Docker secrets or environment-based secret injection.

Use a dedicated RabbitMQ monitoring account with read-only permissions where possible.

Backend Monitoring APIs

Implement APIs under:

/api/monitoring
Overall summary
GET /api/monitoring/summary

Example response:

{
  "status": "Degraded",
  "timestamp": "2026-07-27T12:00:00Z",
  "printerAdapter": {
    "status": "Online",
    "baseUrl": "http://printer-adapter-host:5003",
    "responseTimeMs": 32,
    "version": "1.0.0"
  },
  "rabbitMq": {
    "status": "Connected",
    "host": "100.68.50.41",
    "port": 5673,
    "connectionName": "PRINT-ADAPTER-01"
  },
  "cups": {
    "status": "Disconnected",
    "queueCount": 1
  },
  "printers": {
    "total": 1,
    "online": 0,
    "offline": 1,
    "error": 0
  }
}
Printer Adapter health
GET /api/monitoring/printer-adapter

Return:

HTTP availability
response time
service version
start time
uptime
environment
overall health
dependency health
last successful health check
latest error

Never expose secrets.

Registered printers
GET /api/monitoring/printers
GET /api/monitoring/printers/{printerCode}

Return:

printer code
display name
vendor
protocol
driver type
IP address
TCP port
CUPS queue
current status
active-for-work status
active template
last heartbeat
last status transition
last successful print
latest error
connection latency where available

The existing Printer Adapter database uses fields such as printer code, status, driver type, CUPS queue, active-for-work flag, active template, and last heartbeat. Reuse the actual contract and do not create an incompatible duplicate model.

CUPS status
GET /api/monitoring/cups
GET /api/monitoring/cups/queues
GET /api/monitoring/cups/queues/{queueName}

Show:

CUPS service connectivity
CUPS host
CUPS port
configured queue
queue state
accepting jobs
enabled or disabled
pending jobs
completed jobs if available
media-empty
cover-open
offline state
last successful CUPS probe
last CUPS error

Do not expose sensitive host credentials.

TCP printer connections
GET /api/monitoring/tcp-printers
GET /api/monitoring/tcp-printers/{printerCode}

Show:

target host
target port
DNS/IP resolution status
TCP connection result
response time
last successful check
latest failure

Do not continuously open high-frequency TCP connections that could affect production printing.

Use configurable and conservative polling intervals.

RabbitMQ connection status
GET /api/monitoring/rabbitmq

Show:

broker host
broker port
virtual host
TLS enabled
connection state
connection name
connection uptime
channel count
consumer count
messages published
messages acknowledged
messages unacknowledged
reconnect count
last reconnect
latest connection error

Never return username/password in API responses.

RabbitMQ topology
GET /api/monitoring/rabbitmq/exchanges
GET /api/monitoring/rabbitmq/queues
GET /api/monitoring/rabbitmq/bindings
GET /api/monitoring/rabbitmq/connections
GET /api/monitoring/rabbitmq/consumers

At minimum, highlight:

Exchange:
station.events

Printer Adapter queue:
printer-adapter.print-commands

Bindings:
command.printer.print
command.printer.print.batch

Display:

queue durability
consumer count
messages ready
messages unacknowledged
publish rate
delivery rate
redelivery count
queue state
binding routing keys

Do not allow the UI to purge queues, delete queues, or close RabbitMQ connections.

Printer heartbeat history
GET /api/monitoring/heartbeats
GET /api/monitoring/heartbeats/{printerCode}

Support filters:

from
to
printerCode
status
limit

Show:

timestamp
printer code
adapter ID
reported status
latency
event source
stale or current classification

Heartbeat status rules:

Current:
last heartbeat within configured threshold

Stale:
last heartbeat older than threshold

Missing:
no heartbeat has ever been observed
Printer status transitions
GET /api/monitoring/status-transitions

Show transitions such as:

UNKNOWN → ONLINE
ONLINE → OFFLINE
OFFLINE → ONLINE
ONLINE → ERROR
ERROR → ONLINE

Include:

printer code
previous state
new state
timestamp
reason
raw device message when safe
Print jobs
GET /api/monitoring/print-jobs
GET /api/monitoring/print-jobs/{jobId}

Show:

command ID
job ID
production order number
printer
template
driver
status
start time
completion time
duration
error
retry count
duplicate/idempotency result

Do not display full sensitive production payloads by default.

Recent errors
GET /api/monitoring/errors

Display:

source
category
severity
printer code
message
timestamp
correlation ID
resolved status

Categories:

Printer Adapter
RabbitMQ
CUPS
TCP Printer
Template
Print Execution
Projection
Data Sources

Use the safest existing sources.

Printer Adapter HTTP API

Prefer Printer Adapter HTTP endpoints for:

health
printer registry
active printers
print history
adapter-specific diagnostics
Projection Service

Use Projection Service for:

current projected printer status
last observed heartbeat
status events
operational activity visible to Station Agent
RabbitMQ Management API

Use RabbitMQ Management API for:

connection list
queue state
consumer count
message rates
bindings
channel details

Use a server-side HTTP client.

Do not expose Management API credentials to the frontend.

Printer Adapter SQLite

Do not directly mount Printer Adapter SQLite into this service across servers.

If required monitoring data exists only in SQLite, expose a safe read-only API from Printer Adapter instead.

Do not share databases between services.

Printer Adapter Diagnostic API Enhancements

If Printer Adapter does not expose enough runtime information, add safe read-only endpoints.

Suggested endpoints:

GET /api/diagnostics/health
GET /api/diagnostics/rabbitmq
GET /api/diagnostics/cups
GET /api/diagnostics/printers
GET /api/diagnostics/heartbeats
GET /api/diagnostics/print-jobs
GET /api/diagnostics/errors

These endpoints must:

be read-only
exclude credentials
avoid exposing stack traces
use bounded result limits
use cancellation tokens
use short dependency timeouts
avoid blocking print execution

Do not add monitoring code that changes the print command flow.

UI Requirements

Create a responsive operational dashboard.

Main overview page

Show summary cards:

Printer Adapter
RabbitMQ
CUPS
Printers Online
Printers Offline
Printers in Error
Last Heartbeat
Recent Print Success Rate

Use clear states:

Healthy
Degraded
Offline
Unknown
Connection topology view

Create a visual topology:

RabbitMQ
   ↕
Printer Adapter
   ↕
CUPS / TCP
   ↕
Physical Printers

Each node must show:

status
response time
last successful check
latest error

Do not require an advanced graph library if a clear card-and-line layout is sufficient.

Printers page

Display a table:

Printer Code
Display Name
Driver
Endpoint / Queue
Status
Active for Work
Template
Last Heartbeat
Last Print
Latest Error

Support:

search
filter by status
filter by driver
sorting
pagination
auto refresh
RabbitMQ page

Display:

connection status
connection name
queues
consumers
bindings
message rates
ready messages
unacknowledged messages

Highlight abnormal conditions:

No Printer Adapter consumer
Messages accumulating
Unacknowledged messages stuck
Connection reconnecting
Queue missing
Binding missing
CUPS page

Display:

service connectivity
queue name
accepting jobs
queue enabled
pending jobs
media state
cover state
offline state
last probe
latest error
Events page

Display recent:

heartbeats
status transitions
print results
RabbitMQ reconnects
CUPS errors
printer errors

Support filtering by:

event type
printer
severity
date range
Print history page

Display:

production order
command ID
printer
template
status
duration
timestamp
error

The page is read-only.

Real-Time Updates

Preferred approach:

Printer Adapter UI backend
→ SignalR
→ Browser

The backend may poll dependencies on a safe interval and push changed snapshots.

Alternatively, consume Printer Adapter RabbitMQ events through a dedicated monitoring queue.

If using RabbitMQ:

create a dedicated queue such as printer-adapter-ui.monitoring
use durable or transient configuration based on monitoring needs
bind only required printer events
never consume from the Printer Adapter command queue
never acknowledge messages belonging to another service

Suggested bindings:

printer.heartbeat
printer.status.changed
printer.error
printer.printed
printer.batch.printed

Do not use the command routes:

command.printer.print
command.printer.print.batch

for the monitoring consumer.

Monitoring Queue Isolation

The UI service must have its own queue.

Correct:

station.events
→ printer-adapter-ui.monitoring

Incorrect:

printer-adapter-ui
→ consumes printer-adapter.print-commands

The UI must never compete with Printer Adapter for print commands.

Overall Health Calculation

Use deterministic rules.

Healthy
Printer Adapter HTTP reachable
RabbitMQ connected
At least one valid printer connection available
Heartbeat is current
No critical connection failure
Degraded
Printer Adapter reachable
but RabbitMQ, CUPS, or some printers are unavailable
Offline
Printer Adapter HTTP unreachable
or process unavailable
Unknown
Not enough data collected yet

Do not mark the system healthy merely because the UI container is running.

Security

Implement:

authentication following repository conventions
read-only monitoring permission
optional admin-only diagnostic details
no broker password exposure
no RabbitMQ mutation actions
no printer configuration mutation by default
no arbitrary URL probing
HTTP timeouts
rate limiting for expensive diagnostics
input validation
log sanitisation

Suggested permission:

PRINTER_MONITOR_VIEW

Optional elevated permission:

PRINTER_MONITOR_DIAGNOSTICS
Docker

Create a production multi-stage Dockerfile.

The final image must:

serve the backend
serve the compiled frontend
run as a non-root user
expose port 5010
include a health check endpoint
avoid development dependencies
use the repository’s target architecture

Health endpoint:

GET /health

The container health check should verify the UI service itself.

Dependency failures should produce Degraded, not necessarily terminate the container.

Docker Compose

Add:

docker-compose.printer-adapter-ui.yml

Example:

name: printer-adapter-ui

services:
  printer-adapter-ui:
    image: vanhoadotbui2628/printer-adapter-ui:lastest
    container_name: printer-adapter-ui
    restart: unless-stopped
    ports:
      - "5010:5010"
    environment:
      ASPNETCORE_URLS: http://+:5010
      ASPNETCORE_ENVIRONMENT: Production

      PRINTER_ADAPTER_URL: http://<printer-adapter-host>:5003
      PROJECTION_SERVICE_URL: http://100.68.50.41:5009

      RABBITMQ_MANAGEMENT_URL: http://100.68.50.41:15673
      RABBITMQ_HOST: 100.68.50.41
      RABBITMQ_PORT: 5673
      RABBITMQ_VHOST: /
      RABBITMQ_USERNAME: ${RABBITMQ_MONITOR_USERNAME}
      RABBITMQ_PASSWORD: ${RABBITMQ_MONITOR_PASSWORD}

      MONITOR_REFRESH_INTERVAL_SECONDS: "5"
      MONITOR_STALE_HEARTBEAT_SECONDS: "45"

    healthcheck:
      test:
        - CMD-SHELL
        - >-
          exec 3<>/dev/tcp/127.0.0.1/5010 &&
          printf 'GET /health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n' >&3 &&
          grep -q 'printer-adapter-ui' <&3
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 20s

Do not commit secrets.

Tests

Add automated tests.

Backend tests
Printer Adapter available
Printer Adapter unavailable
RabbitMQ connected
RabbitMQ disconnected
CUPS connected
CUPS disconnected
printer online
printer offline
stale heartbeat
missing heartbeat
RabbitMQ API authentication failure
dependency timeout
sanitised error response
overall health calculation
RabbitMQ monitoring tests
monitoring queue declared
printer heartbeat consumed
printer status event consumed
print result consumed
command events not consumed
no competition with Printer Adapter queue
Frontend tests
overview cards render
degraded state renders
offline state renders
printer table filters
RabbitMQ queue state displays
CUPS queue state displays
real-time updates modify UI
errors are visible without exposing secrets
Runtime Verification

After implementation:

Build the backend.
Build the frontend.
Run unit tests.
Run integration tests.
Validate Docker Compose.
Start Printer Adapter UI.
Check service logs.
Open the UI on port 5010.
Verify Printer Adapter health is visible.
Verify RabbitMQ connection PRINT-ADAPTER-01 is visible.
Verify printer-adapter.print-commands consumer count is visible.
Verify CUPS status is visible.
Verify Zebra printer status is visible.
Verify latest heartbeat updates.
Verify recent print events are displayed.
Stop only a safe dependency if possible and confirm the UI becomes degraded.
Restore the dependency and confirm recovery.
Ensure monitoring does not interfere with production printing.

Do not claim success based only on compilation.

Docker Image Build and Push

Build the image:

docker build \
  -f services/printer-adapter-ui/docker/Dockerfile \
  -t vanhoadotbui2628/printer-adapter-ui:lastest \
  .

Push:

docker push vanhoadotbui2628/printer-adapter-ui:lastest

The requested tag is intentionally:

lastest

Do not silently change it.

However, also report that the conventional Docker tag is:

latest

Optionally push both tags only if Docker Hub authentication is available:

docker tag \
  vanhoadotbui2628/printer-adapter-ui:lastest \
  vanhoadotbui2628/printer-adapter-ui:latest

docker push vanhoadotbui2628/printer-adapter-ui:latest

The required acceptance tag remains:

vanhoadotbui2628/printer-adapter-ui:lastest

Report:

image name
architecture
tag
digest
push output
Docker Hub authentication result

Do not claim the image was pushed unless the registry confirms success.

Documentation

Create:

print-marking/implementation/printer-adapter-monitoring-ui.md
print-marking/station-agent/services/printer-adapter-ui/README.md

Update:

print-marking/AI_CONTEXT.md

Document:

purpose
architecture
backend APIs
UI pages
environment variables
RabbitMQ monitoring account
monitoring queue
Docker deployment
health semantics
security restrictions
build command
run command
Docker Hub image
known limitations
Stop Conditions

Stop implementation and provide feedback if:

the design requires exposing RabbitMQ credentials to the browser
the UI would consume from the Printer Adapter print command queue
Printer Adapter has no safe API for required diagnostics and adding one would disrupt print execution
RabbitMQ Management API cannot be accessed securely
the implementation would share Printer Adapter SQLite across services
the service would gain write access to production queues or printers without explicit approval
the monitoring polling frequency would materially affect production printing
required runtime endpoints cannot be determined from the source

Otherwise, proceed immediately.

Final Acceptance Criteria

The task is complete only when:

printer-adapter-ui service exists.
UI is accessible on port 5010.
Printer Adapter HTTP health is displayed.
RabbitMQ connectivity is displayed.
RabbitMQ connection name is displayed.
Command queue consumer count is displayed.
Queue messages ready and unacknowledged are displayed.
CUPS connectivity is displayed.
CUPS queue status is displayed.
TCP printer status is displayed where applicable.
Registered printers are displayed.
Last printer heartbeat is displayed.
Printer status changes update in real time.
Recent print results are displayed.
Recent errors are displayed.
No secrets are returned to the browser.
UI uses a dedicated monitoring queue if consuming RabbitMQ events.
UI does not consume print commands.
Unit and integration tests pass.
Docker image builds successfully.
Image is pushed successfully as:
vanhoadotbui2628/printer-adapter-ui:lastest
Image digest is reported.
Documentation is updated.
Final Report

Report:

Architecture
backend technology
frontend technology
data sources
RabbitMQ monitoring strategy
real-time update strategy
Monitoring Features
Printer Adapter status
RabbitMQ status
RabbitMQ topology
CUPS status
TCP printer status
printer list
heartbeats
status transitions
print history
errors
Runtime Verification
service status
UI URL
Printer Adapter connectivity
RabbitMQ connectivity
CUPS connectivity
visible printers
heartbeat result
real-time update result
Docker
image
tag
architecture
digest
push result
Files Changed

List every file created or modified.

Do not report “implemented and verified” unless the UI was run, real dependency statuses were displayed, tests passed, and the Docker image push completed successfully.


Lưu ý: tag chuẩn thường là `latest`, còn bạn đang yêu cầu `lastest`. Prompt trên giữ đúng `lastest` để AI không tự đổi, đồng thời yêu cầu push thêm `latest` nếu phù hợp. Context hiện tại cũng ghi trạng thái runtime gần nhất là RabbitMQ đã kết nối nhưng CUPS đang disconnected và Zebra printer đang `OFFLINE`, vì vậy UI phải thể hiện `Degraded`, không được chỉ dựa trên việc container đang chạy để hiển thị healthy. :contentReference[oaicite:1]{index=1}