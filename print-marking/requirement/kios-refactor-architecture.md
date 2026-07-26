# Realtime Factory Kiosk Architecture Tracking Prompt

Analyze the current event-driven architecture and validate whether the service interactions follow CQRS, Outbox Pattern, and Event-Driven Projection principles.

Current flow:

Factory Gateway
→ MQTT Adapter Service
→ OrderRequest Database
→ Outbox Event (same transaction)
→ RabbitMQ
→ Job Engine Service
→ Device Simulator / Device Service
→ Vision Service
→ Job Status Updates

Requirements:

1. Kiosk UI must display realtime production status.
2. Kiosk UI must display current Work Order.
3. Kiosk UI must display current Product Code.
4. Kiosk UI must display current Job Status.
5. Kiosk UI must display device connectivity status.
6. Kiosk UI must display the latest 10 production activities.
7. Kiosk UI must receive updates with sub-second latency.
8. Services must remain loosely coupled.

Tasks:

* Review current architecture.
* Identify missing event flows.
* Define domain events required for realtime monitoring.
* Design a Projection Service (Read Model Service).
* Design SignalR integration for realtime UI updates.
* Define Read Model database schema.
* Define event contracts.
* Define RabbitMQ exchanges, queues, and routing keys.
* Validate event ordering and idempotency.
* Validate Outbox Pattern implementation.
* Ensure Kiosk UI never directly queries multiple microservices.
* Ensure Kiosk UI reads only from a dedicated Projection Database.
* Provide sequence diagrams and deployment diagrams.
* Highlight scalability and fault-tolerance considerations.

Target architecture patterns:

* Outbox Pattern
* Event-Driven Architecture
* CQRS
* Materialized View
* Event-Driven Projection
* SignalR Realtime Push

Expected outcome:

A production-grade realtime factory monitoring architecture that supports future expansion to Vision, OCR, Laser Marking, AI Inspection, and multiple production lines without introducing tight coupling between services.
