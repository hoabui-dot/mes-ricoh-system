# MES Platform — RabbitMQ Design

This document describes RabbitMQ exchanges, topologies, routing rules, and queue bindings.

## 1. Exchange Topology

We maintain a single primary topic exchange for all MES platform internal and external events.

- **Exchange Name**: `mes.events`
- **Exchange Type**: `topic`
- **Durable**: `true`
- **Auto-Delete**: `false`

### Decoupling from Station Agent
- The Station Agent uses `station.events` (Topic, port `5673:5672`).
- The MES Platform uses its own RabbitMQ instance (durable exchange `mes.events`, ports `5674:5672`).
- Cross-broker bridges (e.g. RabbitMQ federation or an application-level consumer service) will sync events like `job.completed` and `job.failed` from the Station Agent's broker to the MES broker for the real-time projection dashboard.

---

## 2. Queue Configuration & Bindings

Every subscriber module declares its own durable queues and binds to the exchange using specific routing key patterns:

```
                                  +-------------------+
                                  |    mes.events     |
                                  | (Topic Exchange)  |
                                  +-------------------+
                                    /               \
            mes.identity.*         /                 \    mes.production.*
                                  /                   \
                                 v                     v
                        +-----------------+   +-------------------+
                        |  identity-queue |   |  production-queue |
                        +-----------------+   +-------------------+
```

### 1. Identity Module Queues
- **Queue Name**: `mes.identity.user-actions`
- **Durable**: `true`
- **Binding Pattern**: `mes.identity.*`
- **Role**: Process identity logs, invalidate cache sessions.

### 2. Notification Module Queues
- **Queue Name**: `mes.notification.email-dispatch`
- **Durable**: `true`
- **Binding Pattern**: `mes.identity.UserRegistered`
- **Role**: Consumes user registration events to send welcome email notifications.

### 3. Audit Module Queues
- **Queue Name**: `mes.audit.tracker`
- **Durable**: `true`
- **Binding Pattern**: `mes.*`
- **Role**: Log all events to audit table.

---

## 3. Publisher and Consumer Guidelines

### Publishing
- Always use the **Outbox Pattern** background worker to publish.
- Message properties must include `delivery_mode: 2` (persistent).
- Content type must be `application/json`.

### Consuming
- Acknowledge messages manually (`auto_ack: false`) only AFTER processing completes.
- On handler failure, reject (`Nack` or `Reject` with `requeue: false`) and route to a dead-letter exchange (DLX) to prevent infinite loops.
- Configure client QOS prefetch limit to avoid broker overload (recommended: `prefetch = 100` per worker).
