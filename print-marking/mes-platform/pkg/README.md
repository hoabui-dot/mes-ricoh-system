# Pkg Package

## Purpose
The `pkg` directory contains low-level, pure infrastructure libraries that are utility wrappers around third-party clients (DB, Redis, RabbitMQ, JWT, Logger). These packages are independent of the core business logic and could theoretically be shared with other applications.

## Folders & Responsibilities

- **`logger/`**: Context-scoped structured logger wrapper around Zap.
- **`postgres/`**: PostgreSQL connection pool setup and GORM driver wiring.
- **`redis/`**: Redis client with operations for caching, locking, rate limiting, and session tokens.
- **`rabbitmq/`**: Connection and channel manager for publishing/subscribing with auto-durable exchange declarations.
- **`jwt/`**: Tokens pair generation and validation.
