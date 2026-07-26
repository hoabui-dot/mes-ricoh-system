# Shared Package

## Purpose
The `shared` package provides reusable base types, helper utilities, and HTTP middleware that are utilized across multiple modules.

## Folders & Responsibilities

- **`config/`**: Strongly-typed Viper loader for application settings.
- **`domain/`**: Base definitions for Domain-Driven Design (BaseEntity, AggregateRoot, DomainEvent interfaces).
- **`outbox/`**: Worker loop and GORM repositories for executing the Transactional Outbox pattern.
- **`middleware/`**: JWT authentication validation, request tracing context injection, structured API logging, and panic recovery.
- **`response/`**: Uniform REST API JSON envelope structure and HTTP status error mappings.
- **`pagination/`**: Offset-based request parameters parsing and math calculations.
