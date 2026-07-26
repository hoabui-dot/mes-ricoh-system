# TASK: Build a Complete Manufacturing Execution System (MES) Platform (Go)

## Context

Before making any implementation, analyze the entire repository, including:

- Existing Station Agent architecture
- AI documentation
- Product documentation
- README files
- Existing RabbitMQ contracts
- Existing MQTT JSON protocol
- Existing Device Simulator
- Existing Kiosk UI
- Existing Projection Pattern
- Existing Outbox Pattern
- Existing CQRS implementation

The current repository already contains the complete Industrial Edge Station (Station Agent).

The new task is to build a completely separate Factory Application called **MES Platform**.

This MUST NOT modify the Station Agent architecture.

The MES Platform must live inside a completely new folder.

Example:

```
root/

station-agent/

factory-platform/
```

or

```
root/

station-agent/

mes-platform/
```

The new platform is completely independent.

Station Agent remains an Edge Computing System.

MES is an Enterprise Factory Application.

Both systems communicate only through APIs and asynchronous events.

---

# Primary Goal

Build a production-grade Manufacturing Execution System (MES).

This is NOT a demo project.

This must follow enterprise best practices.

Every implementation must prioritize:

- Maintainability
- Scalability
- High Performance
- Low Memory Usage
- Clear Domain Boundaries
- Production Readiness

---

# Technology Stack

Use Go for the entire backend.

Recommended stack:

Go 1.24+

Gin

GORM

PostgreSQL

Redis

RabbitMQ

JWT

Casbin (RBAC)

Zap Logger

Viper

Docker

Docker Compose

Air (development)

Testcontainers

OpenTelemetry

Swagger

golang-migrate

Never use global variables.

Prefer dependency injection.

Avoid reflection whenever possible.

---

# Frontend

React

TypeScript

Vite

TailwindCSS

shadcn/ui

TanStack Query

Zustand

React Hook Form

Zod

---

# Database

PostgreSQL

Database per service.

Never share database tables between services.

---

# Redis

Use Redis for:

- Cache
- Session
- Distributed Lock
- Idempotency
- Rate Limiter

---

# Event Bus

RabbitMQ

Continue using Event-Driven Architecture.

Follow the existing routing conventions used by Station Agent.

---

# Architecture

Use Modular Monolith initially.

NOT Microservices.

Each module must expose clear interfaces.

Every module can later become an independent service.

Architecture:

```
MES

modules/

identity

workforce

planning

production

assignment

notification

audit

projection

shared/
```

---

# CQRS

Implement CQRS where appropriate.

Commands

↓

RabbitMQ

↓

Projection

↓

SignalR

↓

Dashboard

---

# Outbox Pattern

Every write transaction must publish domain events through Outbox Pattern.

No direct RabbitMQ publishing inside business transactions.

---

# DDD

Follow Domain Driven Design.

Each module owns:

Domain

Application

Infrastructure

Presentation

No business logic inside handlers.

---

# Clean Code

Apply:

SOLID

DRY

KISS

YAGNI

Composition over inheritance

Small interfaces

No God Objects

No static helpers

---

# RBAC

Use Casbin.

Permission-based.

Never role-based hardcoded logic.

Permissions example:

Worker.Create

Worker.Update

Worker.Delete

Worker.View

Planning.Publish

Planning.Override

Production.Release

Dashboard.View

Audit.View

---

# Modules

Build incrementally.

---

## Phase 1

Identity

Users

Roles

Permissions

Authentication

JWT

Refresh Token

Password Policy

Audit Log

Profile

Password Reset

---

## Phase 2

Workforce

Workers

Departments

Workshops

Teams

Skills

Skill Matrix

Certificates

Availability

Status

---

## Phase 3

Planning

Shift

Monthly Calendar

Team Assignment

Worker Assignment

Shift Templates

Holiday

Leave

Overtime

---

## Phase 4

Production

Production Orders

Work Orders

Routing

Required Skills

Required Operators

Priority

Assignment

---

## Phase 5

Assignment Engine

Human-in-the-loop

Automatic Assignment

Skill Matching

Availability

Priority

Certification

Scoring

Override

Assignment History

---

## Phase 6

Projection

Read Models

Dashboard

Statistics

Realtime SignalR

---

## Phase 7

Notification

Email

In-App

RabbitMQ Consumer

Alert Center

---

## Phase 8

Audit

Every action

Every change

TraceId

CorrelationId

User

Timestamp

Old Value

New Value

---

# Human In The Loop

The assignment engine must support:

Automatic assignment

↓

Manager review

↓

Manual override

↓

Assignment revision

Never overwrite historical assignments.

Always create new revisions.

---

# API

REST API

Swagger

OpenAPI

Versioned

/api/v1/

---

# Logging

Structured Logging

TraceId

CorrelationId

RequestId

UserId

Duration

---

# Metrics

Prometheus

Health Check

OpenTelemetry

---

# Docker

Provide:

docker-compose.yml

Dockerfile

Development profile

Production profile

---

# Testing

Implement:

Unit Tests

Integration Tests

API Tests

Repository Tests

Assignment Engine Tests

RBAC Tests

Performance Tests

Use Testcontainers whenever database interaction is required.

---

# Documentation

This task is incomplete unless all documentation is generated.

Generate:

README.md

Product Document

AI Document

Architecture Document

Folder Structure Document

API Documentation

RBAC Documentation

Database Design

Assignment Engine Design

Event Contract Documentation

RabbitMQ Routing Documentation

Development Guide

Deployment Guide

Testing Guide

Coding Standards

---

# AI Documentation

Inside the MES folder create:

```
docs/

AI_GUIDE.md

PRODUCT.md

ARCHITECTURE.md

DATABASE.md

EVENTS.md

RABBITMQ.md

CODING_STANDARD.md

API_STYLE_GUIDE.md

README.md
```

The AI guide must explain:

- architecture
- module responsibilities
- folder responsibilities
- coding conventions
- naming conventions
- event naming
- API naming
- database ownership
- migration strategy
- testing strategy
- documentation strategy

This document is intended for AI coding assistants (Codex, Claude Code, Cursor, Antigravity).

---

# Product Documentation

Create a complete product document describing:

Business goals

Factory workflow

Production planning

Worker assignment

Human-in-the-loop

Skill Matrix

Shift Planning

Production Order lifecycle

Assignment lifecycle

Audit

Permissions

Realtime dashboard

Future expansion

---

# README

Each major folder must contain its own README.

Example:

modules/workforce/README.md

modules/planning/README.md

modules/production/README.md

shared/README.md

internal/README.md

pkg/README.md

docs/README.md

Each README must explain:

Purpose

Responsibilities

Dependencies

Coding Rules

Folder Structure

Best Practices

---

# IMPORTANT

Do NOT implement everything at once.

Work phase-by-phase.

At the end of every phase:

1. Build successfully.
2. Execute all tests.
3. Update all documentation.
4. Update AI documentation.
5. Update Product documentation.
6. Update README files.
7. Produce a short Vietnamese progress report summarizing what has been completed before continuing to the next phase.

No phase may begin until the previous phase is fully completed and documented.