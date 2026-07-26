# Feature: Integrate Physical Zebra GK420t Printer (macOS + CUPS)

Before writing any code, analyze the current Station Agent architecture, especially:

- Device Simulator
- MQTT Adapter
- Job Engine
- Print Adapter Service
- Projection Service
- Kiosk UI
- Existing ZPL Generator
- RabbitMQ topology

The implementation must integrate a real Zebra GK420t printer connected via USB on macOS using the native CUPS subsystem, while preserving the current Event-Driven Architecture.

---

# Architecture Constraints

The following rules are mandatory.

## DO NOT

- Do not let Job Engine communicate directly with CUPS.
- Do not let Device Simulator invoke lp/lpr commands.
- Do not embed printer-specific logic inside Job Engine.
- Do not break Database-per-Service.
- Do not bypass RabbitMQ.

The only service allowed to communicate with CUPS is

Print Adapter Service.

---

# Current Flow

Current flow is

Device Simulator

↓

RabbitMQ

↓

Job Engine

↓

Print Adapter

↓

Projection

↓

SignalR

↓

Kiosk UI

Maintain this architecture.

---

# New Printing Flow

The physical printer should replace only the final printing layer.

Business flow becomes

Production Order

↓

Job Engine

↓

Print Job

↓

RabbitMQ

↓

Print Adapter

↓

Generate ZPL

↓

CUPS

↓

USB

↓

Zebra GK420t

↓

Printer Status

↓

Projection

↓

Kiosk UI

Nothing above Print Adapter should know whether the printer is simulated or physical.

---

# Printer Driver Layer

Inside Print Adapter create a Printer Driver abstraction.

Example

IPrinterDriver

```
Connect()

Print()

GetStatus()

Discover()

HealthCheck()

Disconnect()
```

Implement

SimulationPrinterDriver

(current implementation)

and

CupsPrinterDriver

(new implementation)

Both drivers implement the same interface.

The Job Engine must not know which driver is currently active.

---

# Printer Configuration

Printer configuration should be stored centrally.

Example

```
Printing

Driver

Simulation

or

CUPS

QueueName

Zebra_GK420t

DefaultDpi

203

Darkness

20

Speed

4

Copies

1

```

Switching from Simulation to Physical Printer should require only configuration.

No source code changes.

---

# CUPS Integration

Implement a new

CupsPrinterDriver

Responsibilities

- Discover printers
- Verify printer availability
- Send raw ZPL
- Read printer status
- Handle failures

---

# Printer Discovery

Use

```
lpstat -p -d
```

to enumerate printers.

Example

```
printer Zebra_GK420t is idle.
system default destination: Zebra_GK420t
```

Expose

```
GET /api/printers
```

Return

```
[
{
id,
name,
queueName,
driver,
status,
isDefault
}
]
```

---

# Print Execution

The Print Adapter should execute

```
lpr

-o raw

-P Zebra_GK420t

label.zpl
```

or

pipe directly

```
echo "^XA...^XZ"

|

lpr

-o raw

-P Zebra_GK420t
```

Never rasterize.

Always send raw ZPL.

---

# Temporary File Handling

Do not permanently store ZPL files.

Generate

```
Temp

↓

Send

↓

Delete
```

Support in-memory piping whenever possible.

---

# Print Job Pipeline

When Print Adapter receives

PrintJob

↓

Generate ZPL

↓

Validate ZPL

↓

Send to CUPS

↓

Receive OS response

↓

Publish

PrintStarted

↓

Publish

PrintCompleted

or

PrintFailed

Projection updates UI.

---

# Error Handling

Detect

Printer Offline

Queue Missing

USB Disconnected

Paper Out

Ribbon Out

CUPS Timeout

Permission Denied

Invalid Queue

Invalid ZPL

Each error should publish

PrintFailed

with

```
ErrorCode

ErrorMessage

Recoverable

Retryable
```

---

# Retry Policy

Recoverable

Retry automatically.

Examples

Printer Busy

USB Reconnect

Temporary CUPS failure

Non Recoverable

Require operator intervention.

Examples

Queue Missing

Invalid Printer

Corrupted ZPL

---

# Health Check

Every 15 seconds

Print Adapter checks

```
lpstat

```

Status

Idle

Printing

Stopped

Offline

Disconnected

Publish

PrinterHealthChanged

Projection updates Dashboard.

---

# Dashboard

Dashboard should display

Printer

Online

Offline

Printing

Queue Length

Last Print

Current Job

Temperature (future)

Ribbon Status (future)

Paper Status (future)

---

# Print History

Store

Printer Name

Queue Name

Driver

Print Time

Execution Time

ZPL Version

Result

Operator

Machine

Serial Number

Barcode

---

# Device Simulator

Device Simulator behavior must remain unchanged.

It still publishes

Print Request

through RabbitMQ.

The simulator must never know whether

Print Adapter

is

Simulation

or

Physical.

---

# Local Development

Support two modes

Simulation

(default)

Physical Printer

(configuration only)

Example

```
PRINT_DRIVER=simulation

```

or

```
PRINT_DRIVER=cups

CUPS_QUEUE=Zebra_GK420t
```

No recompilation required.

---

# Logging

Every print operation must be logged.

Example

```
Print Request Received

↓

ZPL Generated

↓

Printer Queue Selected

↓

Sent to CUPS

↓

CUPS Accepted

↓

Completed

```

Log the execution duration.

---

# Testing

Verify

✓ Printer discovered

✓ Queue detected

✓ Raw ZPL accepted

✓ Barcode printed correctly

✓ QR printed correctly

✓ Long text wraps correctly

✓ UTF-8 handled correctly

✓ Print failure handled

✓ USB unplug handled

✓ Queue missing handled

✓ Dashboard updates

✓ Projection updates

✓ Print history stored

✓ Retry works

✓ Simulation mode still works

---

# Deliverables

Implement

- CupsPrinterDriver
- Printer Driver abstraction
- Physical printer configuration
- Printer discovery API
- Health Check Service
- CUPS raw printing
- Error handling
- Retry policy
- Dashboard printer status
- Projection updates
- Print history enhancements
- Unit tests
- Integration tests
- Update AI_DOCUMENT.md
- Update PRODUCT_DOCUMENT.md

The final implementation must allow the Station Agent to switch between the existing simulated printer and a real Zebra GK420t connected via USB on macOS by changing configuration only, without modifying any business logic.

---

# Refactored CUPS Health Check Architecture

To resolve the issue where the Kiosk UI incorrectly reported status or failed to change to Online when the physical device went online, the health check architecture was completely refactored.

## 1. The Core Architecture
Instead of relying on a simple TCP ping to port `631` (which only checks if the CUPS service is running, not the physical printer itself), we now query the **IPP (Internet Printing Protocol)** API exposed by CUPS over HTTP:
```
CupsPrinterDriver.GetStatusAsync()
  → CupsPrinterStateAggregator.GetStateAsync()
    → HTTP POST to http://{host.docker.internal}:{CUPS_PORT}/printers/{QueueName}
      [Payload: binary IPP Get-Printer-Attributes request]
```

## 2. Dynamic Port Mapping and Environment Config
Since the station runs inside Docker, macOS host's CUPS port `631` is forwarded to container port `8631` via `socat`.
The system now parses the `CUPS_SERVER` environment variable (e.g., `127.0.0.1:8631`) to dynamically extract the correct host and port for checking health, instead of assuming port `631` is directly open.

## 3. Normalized Device States & UI Mapping
The raw status flags returned by IPP are aggregated and mapped to the standard Kiosk UI display:
- **Idle** (No active jobs, no error reasons) → `Online` (Emerald pulse dot)
- **Processing + Printing** → `Printing` (Indigo pulse printer icon)
- **Processing + Idle (spooling)** → `Busy` (Blue spinning ring)
- **Stopped + Pending Jobs** → `Waiting` (Amber hourglass dot)
- **Warning Reasons** (e.g. `toner-low`, `media-low`) → `Warning` (Yellow warning icon)
- **Offline / Disconnected** → `Offline` (Red X dot)
- **Stopped / Hard Error** (e.g. `media-empty`, `cover-open`) → `Error` (Red warning dot)

## 4. Anti-Flapping Retry Policy
When checking printer health, the driver queries the state aggregator with a retry policy:
- **Max Retries:** 3 attempts
- **Delay:** 200 milliseconds between attempts
- **Fallback:** If IPP querying fails completely (e.g., due to temporary network socket exhaustion), the aggregator falls back to a TCP ping of the port. If TCP is reachable, it reports `Online` as an optimistic fallback. Only if both IPP and TCP checks fail does it report the printer as `Offline`.
