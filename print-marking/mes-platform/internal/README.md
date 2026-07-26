# Internal Package

## Purpose
The `internal` directory contains packages that control the lifecycle, initialization, and composition structure of the application. By Go convention, packages under `/internal/` cannot be imported by external projects.

## Folders & Responsibilities

- **`bootstrap/`**: The **Composition Root** of the application. It loads configurations, instantiates PostgreSQL/Redis/RabbitMQ clients, configures JWT/Casbin dependencies, builds repositories, wires up services/handlers, registers routes, spawns background workers, and manages shutdown triggers.
- **`server/`**: Sets up the HTTP listener, sets Gin engine modes, binds global middleware (recovery, tracing, logger, CORS), exposes health checks, and starts the Prometheus `/metrics` server.
