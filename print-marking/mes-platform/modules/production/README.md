# Production Module

## Purpose
The Production module manages the full lifecycle of manufacturing production orders including routing definitions, work order execution, priority management, and manufacturing workflow coordination.

## Responsibilities
- Define factory **Routing Templates** with ordered **Operations** (steps), machine types, estimated durations, and required skill codes.
- Create and manage **Production Orders** (order number, product name, quantity, priority 1–100, due date).
- Control Production Order lifecycle: `draft` → `released` → `in_progress` → `completed` / `cancelled`.
- Create **Work Orders** tied to a Production Order and a Routing (only if order is released or in-progress).
- Control Work Order lifecycle: `pending` → `in_progress` → `completed`.
- Publish domain events to RabbitMQ via transactional outbox worker.
- List orders filtered by status, priority; list work orders by production order ID and status.

## Status Lifecycles

### Production Order
```
draft → released → in_progress → completed
         ↓              ↓
      cancelled       (cannot cancel once in_progress)
```

### Work Order
```
pending → in_progress → completed
    ↓
cancelled
```

## Directory Structure
- `/domain/entity/`: ProductionOrder, WorkOrder aggregates, Routing entity, Operation value object, domain events.
- `/domain/repository/`: Abstract port interfaces.
- `/application/dto/`: Input/output API payload structures.
- `/application/service/`: Business orchestration and validations.
- `/infrastructure/model/`: GORM database schemas.
- `/infrastructure/persistence/`: GORM repository implementations.
- `/presentation/handler/`: Gin HTTP controller actions.
- `/presentation/route/`: JWT-protected route registration.

## API Routes
All endpoints prefixed under `/api/v1/` and protected by JWT:

| Method | Path | Description |
|---|---|---|
| POST | `/routings` | Create routing with operations |
| GET | `/routings` | List all routings |
| GET | `/routings/:id` | Get routing details |
| POST | `/production-orders` | Create production order |
| GET | `/production-orders` | List orders (filter: status) |
| GET | `/production-orders/:id` | Get order details |
| PATCH | `/production-orders/:id/release` | Release order (draft → released) |
| PATCH | `/production-orders/:id/cancel` | Cancel order (draft/released → cancelled) |
| PATCH | `/production-orders/:id/priority` | Update order priority |
| POST | `/work-orders` | Create work order (requires released order) |
| GET | `/work-orders` | List work orders (filter: production_order_id, status) |
| GET | `/work-orders/:id` | Get work order details |
| PATCH | `/work-orders/:id/start` | Start work order (pending → in_progress) |
| PATCH | `/work-orders/:id/complete` | Complete work order (in_progress → completed) |

## Domain Events Published

| Event | Trigger |
|---|---|
| `mes.production.ProductionOrderCreated` | New production order created |
| `mes.production.ProductionOrderReleased` | Order released for execution |
| `mes.production.ProductionOrderCompleted` | All work orders done |
| `mes.production.ProductionOrderCancelled` | Order cancelled |
| `mes.production.WorkOrderCreated` | Work order created |
| `mes.production.WorkOrderStarted` | Work order execution began |
| `mes.production.WorkOrderCompleted` | Work order finished |
