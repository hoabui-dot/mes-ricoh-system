# MES Platform — Architecture Document

This document outlines the architectural patterns, layers, communication, and design choices of the MES Platform.

## 1. Architectural Style: Modular Monolith

To support clean domain boundaries and prepare the system for eventual scaling into microservices, we implement a **Modular Monolith** pattern. 

### Key Properties
1. **Module Independence**: Every business capability is encapsulated in a dedicated module directory under `/modules/`.
2. **Database Isolation**: No module is allowed to query the database tables of another module. Cross-module data dependencies are resolved through **Application-level aggregation** (queries) or **Asynchronous Events** (mutations).
3. **Internal Interface boundaries**: Modules interact internally via public service methods or published RabbitMQ events.

```
+-------------------------------------------------------------------+
|                        MES Platform Monolith                      |
|                                                                   |
|  +------------------+   +------------------+   +---------------+  |
|  |     Identity     |   |    Workforce     |   |   Planning    |  |
|  |                  |   |                  |   |               |  |
|  | - Users, Auth    |   | - Workers, Skills|   | - Shifts      |  |
|  +------------------+   +------------------+   +---------------+  |
|           |                      ^                     ^          |
|           +---[Domain Events]----+---------------------+          |
|                                                                   |
+-------------------------------------------------------------------+
```

---

## 2. Decoupled Communication: Event-Driven Architecture

MES communicates with the edge computing system (**Station Agent**) and coordinate internal module actions using **Event-Driven Architecture (EDA)**.

- **Broker**: RabbitMQ
- **Routing exchange**: `mes.events` (Topic Exchange) for MES internal/external events.
- **Station exchange**: `station.events` (Topic Exchange) for Edge Station Agent events.
- **Guaranteed Delivery**: To prevent lost events due to network crashes, we use the **Transactional Outbox Pattern** (see Section 4).

---

## 3. Modular Directory Structure (DDD Layering)

Every module implements **Domain Driven Design (DDD)** layers to isolate business models from execution frameworks:

```
modules/<module_name>/
├── domain/
│   ├── entity/      # Aggregates, Entities, Value Objects, Domain Events
│   └── repository/  # Repository interfaces (ports)
├── application/
│   ├── service/     # Use case services (orchestrators)
│   └── dto/         # Request/Response Data Transfer Objects
├── infrastructure/
│   ├── persistence/ # GORM Repository implementations (adapters)
│   ├── model/       # GORM physical models
│   └── rbac/        # Module-specific security (e.g. Casbin setup)
└── presentation/
    ├── handler/     # HTTP Controller handlers
    └── route/       # Gin router registration
```

---

## 4. Transactional Outbox Pattern

To ensure database writes and message publishing are atomic, we avoid publishing directly to RabbitMQ inside business transactions.

### Workflow
1. **Write Transaction**: The application service mutates business aggregates. Domain events are recorded. The service persists the aggregates AND inserts the serialized events into the local `<module>_outbox_events` table within a single PostgreSQL database transaction.
2. **Asynchronous Polling**: A background `OutboxWorker` queries the outbox table for `pending` or `failed` events (under 5 retries).
3. **Dispatch**: The worker publishes the event to RabbitMQ.
4. **Mark Published**: Upon successful publish, the worker marks the event as `published` with a timestamp.

```
Service -> DB Transaction [ Save Business Data + Save Outbox Event ]
                              ↓
Background Worker -> Read Pending Events -> Publish to RabbitMQ -> Mark Published
```

---

## 5. Command Query Responsibility Segregation (CQRS)

While keeping a unified database per module, we segregate read and write concerns where performance is critical.

- **Commands (Writes)**: Processed by Application Services which mutate domain entities and persist via GORM.
- **Queries (Reads)**: Fetch thin DTOs or project records using raw SQL or lightweight database mappings (GORM preloads) directly, bypassing complex domain rules.

---

## 6. Technology Stack & Key Libraries

- **Go 1.24+**: Main programming language.
- **Gin**: High-performance HTTP web framework.
- **GORM**: Object Relational Mapper for PostgreSQL.
- **Redis**: Caching, Rate Limiting, Idempotency, Session management.
- **RabbitMQ**: AMQP message broker.
- **Casbin**: Permission-based Attribute/Role-Based Access Control (RBAC).
- **Zap**: Structured logging.
- **Viper**: Configuration loading.
- **golang-migrate**: Database migrations version control.
- **Testcontainers**: Isolated Docker dependencies for integration tests.


| Layer              | Current Technology                    | Future Recommendation                      | Notes                      |
| ------------------ | ------------------------------------- | ------------------------------------------ | -------------------------- |
| Frontend           | React 19 + TypeScript                 | React + Micro Frontend (Module Federation) | Current is enough          |
| UI                 | TailwindCSS v4 + shadcn/ui + Radix UI | Keep                                       | Enterprise UI              |
| State Management   | TanStack Query + Zustand              | Keep                                       | Server State + Local State |
| Form               | React Hook Form + Zod                 | Keep                                       | Validation                 |
| Table              | TanStack Table                        | Keep                                       | Enterprise Grid            |
| Chart              | Recharts                              | Apache ECharts                             | Advanced dashboard         |
| Drag & Drop        | dnd-kit                               | Keep                                       | Workflow editor            |
| Routing            | React Router v7                       | Keep                                       | SPA                        |
| Backend API        | Go (Gin)                              | Go + gRPC Internal                         | High Performance           |
| Realtime           | Gorilla WebSocket                     | NATS / WebSocket Gateway                   | Factory realtime           |
| Authentication     | JWT                                   | JWT + Refresh Token                        | Current                    |
| Authorization      | RBAC                                  | RBAC + ABAC                                | Factory permission         |
| SSO                | —                                     | Keycloak / Authentik                       | Enterprise Login           |
| Database           | PostgreSQL                            | PostgreSQL Cluster                         | Main DB                    |
| ORM                | GORM                                  | Keep                                       |                            |
| Cache              | Redis                                 | Redis Cluster                              | Performance                |
| Queue              | MQTT                                  | MQTT + NATS                                | Manufacturing Event        |
| Message Broker     | MQTT                                  | Kafka (optional)                           | Analytics                  |
| Event Architecture | Event Driven                          | Event Sourcing (partial)                   | Future                     |
| CDC                | —                                     | Debezium                                   | Sync ERP/WMS               |Attachment                 |
| Logging            | Zap                                   | Loki                                       | Central Log                |
| Monitoring         | Prometheus                            | Prometheus + Grafana                       | Factory monitoring         |
| Tracing            | —                                     | OpenTelemetry                              | Distributed tracing        |
| API Gateway        | Gin Reverse Proxy                     | Kong / APISIX                              | Enterprise                 |
| Config             | ENV                                   | Consul                                     | Multi Factory              |
| Deployment         | Docker Compose                        | Keep                                 | HA                         |
| CI/CD              | GitHub Actions                        | Keep                                     | GitOps                     |
| Translation        | i18next                               | Keep                                       | Multi-language             |



## print marking
| Layer                | Current              |
| -------------------- | -------------------- |
| UI                   | React                |
| Backend              | .NET 9               |
| API                  | ASP.NET Minimal API  |
| Print Library        | Raw ZPL              |
| Device Communication | MQTT                 |
| PLC                  | Modbus / OPC-UA      |
| Database             | SQLite               |
| ORM                  | EF Core              |
| Realtime             | SignalR              |
| Configuration        | JSON                 |
| Deployment           | Docker               |










-------


| Layer                                        | Current Tech Stack                                                                                                   |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Frontend (MES Platform)**                  | React 19, TypeScript, Vite, TailwindCSS v4, shadcn/ui, TanStack Query, TanStack Table, React Hook Form, Zod, Zustand |
| **Frontend (Station Agent / Kiosk UI)**      | React, TypeScript, Vite, TailwindCSS, shadcn/ui, SignalR                                                             |
| **Frontend (Device Simulator)**              | React, TypeScript, Vite, TailwindCSS, shadcn/ui, SignalR, React Flow, React-Konva                                    |
| **Backend API (MES, WMS, QMS)**                        | Go 1.24+, Gin, GORM, PostgreSQL, Redis, DDD, CQRS                              |
| **Backend API (ERP Integration)**            | Go Integration Gateway, REST API, RabbitMQ Connector                                                          |
| **    Industrial Edge Platform (Station Agent)** | .NET 9 Worker Services, ASP.NET Core, EF Core, SQLite                                                                |
| **Industrial Device Adapters**               | .NET 9, TCP Socket, MQTT, BackgroundService, Native SDK Integration                                                  |
| **Authentication**                           | JWT, Refresh Token                                                                                                   |
| **Authorization**                            | RBAC, ABAC                                                                                                                 |
| **Single Sign-On (SSO)**                     | Keycloak (OpenID Connect, OAuth2)                                                                                    |
| **Database (Enterprise Applications)**       | PostgreSQL                                                                                                           |
| **Database (Industrial Edge)**               | SQLite                                                                                                               |
| **Distributed Cache**                        | Redis                                                                                                                |
| **Message Broker**                           | RabbitMQ, MQTT                                                                                                       |
| **Real-Time Communication**                  | SignalR, MQTT                                                                                                        |
| **Industrial Communication Protocols**       | MQTT, TCP/IP, OPC UA, Modbus TCP                                                                         |
| **API Gateway / Reverse Proxy**              | Nginx                                                                                                                |
| **Container Platform**                       | Docker, Kubernetes                                                                                               |
| **CI/CD**                                    | GitHub Actions                                                                                                       |
| **Monitoring**                               | Prometheus, Grafana                                                                                                  |
| **Centralized Logging**                      | Serilog, Zap, Loki                                                                                                   |
| **Distributed Tracing**                      | OpenTelemetry, Jaeger                                                                                                |
| **Health Monitoring**                        | ASP.NET Health Checks, Go Health Endpoints                                                                           |
| **Configuration Management**                 | Environment Variables, Consul                                                                                        |
| **Search Engine**                            | Elasticsearch / OpenSearch                                                                                           |
| **Notification Platform**                    | SignalR, Email, Microsoft Teams, Slack                                                                               |
| **Business Rule Engine**                     | Custom Rule Engine                                                                                                   |
| **Change Data Capture (CDC)**                | Debezium                                                                                                             |
| **Enterprise Event Streaming**               | Apache Kafka                                                                                                         |
| **ETL / Data Integration**                   | Airbyte                                                                                                              |
| **Data Lake**                                | Apache Iceberg, MinIO                                                                                                |
| **Data Warehouse**                           | ClickHouse                                                                                                           |
| **Business Intelligence (BI)**               | Apache Superset, Power BI                                                                                            |

