# Task: Integrate Zebra Label Studio into the Existing Device Simulator and Print Adapter Architecture

## Background

Analyze the entire codebase, Product Documentation, AI Documentation, and current system architecture before making any implementation.

The project is an Industrial Edge Station following Clean Architecture, CQRS, Event-Driven Architecture, RabbitMQ, Outbox Pattern, Projection Service, and SignalR.

Current services include:

* MQTT Adapter
* Job Engine
* Print Adapter
* Laser Adapter
* Vision Adapter
* PLC Adapter
* Projection Service
* Kiosk UI
* Device Simulator

The Device Simulator already emulates Factory Gateway, Printer, Laser, Vision, and PLC devices.

Do **NOT** introduce a new microservice for label management.

The Label Designer must become a module inside the existing Print Adapter Service, while the frontend development tool must be integrated as a new tab inside Device Simulator.

---

# Objective

Implement a complete **Zebra Label Studio** for development and testing.

The studio must allow developers to:

* Design label templates visually.
* Store templates as JSON.
* Preview labels.
* Render JSON into ZPL.
* Test printing against the Printer Simulator.
* Inspect generated ZPL.
* View TCP communication logs.
* View print history.

This is a development tool, not an operator feature.

---

# Device Simulator

Add a new top-level tab:

* Zebra Label Studio

The existing tabs remain unchanged.

---

# Zebra Label Studio Structure

Implement four sections.

## 1. Templates

Template management.

Features:

* List templates
* Create template
* Duplicate template
* Delete template
* Import JSON
* Export JSON
* Version management
* Search
* Filter

Each template stores:

* Name
* Description
* Printer DPI
* Label Size
* Version
* Created Date
* Modified Date

Only JSON is stored.

Never store generated ZPL.

---

## 2. Label Designer

Build a visual drag-and-drop designer using:

* React
* TypeScript
* react-konva
* konva
* Zustand
* Tailwind
* shadcn/ui

Support the following elements:

* Text
* Barcode
* QR Code
* Rectangle
* Circle
* Line
* Logo
* Image

Support:

* Drag
* Resize
* Rotate
* Zoom
* Multi Select
* Layer
* Group
* Snap to Grid
* Alignment

The property panel should expose:

* Position
* Width
* Height
* Rotation
* Font
* Barcode Type
* QR Configuration
* Binding Field
* Layer

The frontend must never generate ZPL.

It only edits JSON.

---

## 3. Preview

Create a three-panel preview page.

Panel 1

Template JSON

Panel 2

Generated ZPL

Panel 3

Printer Preview

Workflow:

Template JSON

↓

Runtime Data

↓

Render

↓

Generated ZPL

↓

Printer Preview

Buttons:

* Render
* Validate
* Copy ZPL
* Download ZPL
* Print Test

---

## 4. Print History

Display all print executions.

Columns:

* Time
* Template
* Template Version
* Printer
* Duration
* Status
* Retry Count
* TraceId
* CorrelationId

Clicking a row opens a detailed dialog showing:

* Runtime Data
* Template JSON
* Generated ZPL
* TCP Request
* TCP Response
* Printer Result
* Exception
* Full Timeline

---

# Runtime Preview

Provide editable runtime data.

Example:

{
"ProductName":"Coffee",
"Barcode":"123456789",
"Batch":"B001",
"Lot":"L0008",
"Serial":"SN998877"
}

Changing runtime data should immediately update the rendered ZPL preview.

No Job Engine interaction is required.

---

# Print Adapter Improvements

Extend the current Print Adapter.

Add:

* Template Repository
* Template Versioning
* JSON Model
* FluentValidation
* Strategy-based Renderer
* ZPL Renderer
* Print Queue using Channel<PrintJob>
* TCP Printer Client (Port 9100)
* Print History
* Audit Trail
* Metrics
* Structured Logging

Only JSON templates are persisted.

ZPL must always be generated dynamically.

---

# Rendering Architecture

Use Strategy Pattern.

ILabelRenderer

↓

ZPLRenderer

Future renderers should be easy to add:

* PDF Renderer
* PNG Renderer
* Honeywell EPL Renderer
* Brother Renderer

Frontend must remain unchanged.

---

# Template Versioning

Support template version history.

Every production job must reference:

* Template ID
* Template Version

Historical jobs must always render with the template version that was used when the job was executed.

Never overwrite historical template versions.

---

# Printer Simulator Improvements

Extend the Printer Simulator to emulate realistic Zebra printer behavior.

Support:

* Success
* Printer Busy
* Offline
* Paper Out
* Ribbon Out
* Head Open
* Invalid ZPL
* Invalid Barcode
* TCP Timeout
* TCP Connection Refused
* Memory Full

Each simulated state should produce realistic logs and responses.

This allows retry and fault-handling workflows to be validated.

---

# Integration with Existing Workflow

The overall architecture must become:

Device Simulator (Zebra Label Studio)

↓

Print Adapter

↓

JSON Template Repository

↓

Runtime Data Injection

↓

ZPL Renderer

↓

Print Queue

↓

TCP Port 9100

↓

Printer Simulator

↓

Job Engine

↓

Projection Service

↓

SignalR

↓

Kiosk UI

Maintain all existing architectural principles:

* Clean Architecture
* CQRS
* Event-Driven Architecture
* RabbitMQ
* Outbox Pattern
* Projection Pattern
* SignalR
* Structured Logging
* Audit Trail

Do not introduce unnecessary services. Keep ownership of template management inside the Print Adapter Service while using Device Simulator as the complete development and testing environment.
