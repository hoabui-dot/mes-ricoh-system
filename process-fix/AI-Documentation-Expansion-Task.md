# AI Documentation Expansion Task

You are working inside an enterprise-scale Manufacturing Execution System (MES) repository.

You have already read:

- AI_CONTEXT.md
- UI_AI_CONTEXT.md

Treat those two documents as the current canonical implementation context.

Your goal is NOT to modify source code.

Your goal is to make this repository understandable for a new Senior Software Engineer or AI Agent that has never seen this project before.

The current documentation is implementation-oriented, but it is still missing many architectural, business, operational, and design knowledge layers.

Your task is to create a comprehensive AI documentation library inside:

AI_document/

Every document must be written in Markdown.

Do NOT create placeholders.

Extract information from the source code whenever possible.

If something cannot be inferred from the current implementation, explicitly document it as:

> Not implemented
> Unknown
> Future work
> Requires product decision

Never invent architecture or business rules.

---

# Documentation Requirements

Create or update the following documents.

## 00_PROJECT_OVERVIEW.md

Explain:

- Project vision
- Manufacturing scope
- Product positioning
- Supported systems
- High-level architecture
- Technology stack
- Repository organization
- Main runtime components

---

## 01_BUSINESS_DOMAIN.md

Explain the manufacturing business.

Include:

- Manufacturing lifecycle
- End-to-end production flow
- Factory hierarchy
- Product lifecycle
- Material lifecycle
- Work Order lifecycle
- Execution lifecycle
- Inspection lifecycle
- Warehouse interaction
- Printing lifecycle

Explain every stage using business language.

---

## 02_BUSINESS_GLOSSARY.md

Explain every important manufacturing concept.

Examples:

- Work Order
- Routing
- Production Version
- MBOM
- EBOM
- Genealogy
- Traceability
- Resource Assignment
- Machine Unit
- Machine Group
- Work Center
- Workstation
- Backflush
- Scrap
- Rework
- NCR
- CAPA
- Lot
- Batch
- Reservation

Each term must include:

- Definition
- Owner
- Related modules
- Related database entities
- Related APIs

---

## 03_SYSTEM_ARCHITECTURE.md

Explain:

- Overall system architecture
- Bounded Context
- Ownership
- Communication
- Dependencies
- External systems
- Integration boundaries

---

## 04_C4_ARCHITECTURE.md

Provide:

- Context Diagram
- Container Diagram
- Component Diagram
- Deployment Diagram

Use Mermaid whenever possible.

---

## 05_DEPLOYMENT_ARCHITECTURE.md

Document:

- Docker Compose
- Services
- Infrastructure
- Kong
- Keycloak
- PostgreSQL
- Kafka
- Redis
- SignalR
- Print Station

Include deployment topology.

---

## 06_SERVICE_BOUNDARIES.md

For every microservice explain:

- Responsibilities
- Database ownership
- APIs
- Kafka topics
- Outbox usage
- Read models
- Projections
- Dependencies
- Anti-corruption rules

---

## 07_DATABASE_DESIGN.md

Document:

- ERD explanation
- Aggregate ownership
- Table ownership
- Relationships
- History strategy
- Soft delete
- Effective dating
- Versioning
- Audit
- Index strategy
- Transaction boundaries

Do NOT duplicate the ERD.

Explain it.

---

## 08_EVENT_DRIVEN_ARCHITECTURE.md

Explain:

- Event flow
- Outbox Pattern
- Idempotency
- Retry
- Event ordering
- Consumer responsibilities
- Producer responsibilities
- Failure recovery
- Event lifecycle

Provide sequence diagrams.

---

## 09_KAFKA_COMMUNICATION.md

Document:

- Every topic
- Producers
- Consumers
- Event payloads
- Retry policy
- Ordering
- DLQ
- Correlation IDs
- Event naming conventions
- Message lifecycle

---

## 10_API_CONVENTIONS.md

Explain:

- REST conventions
- DTO conventions
- Validation
- Error model
- Pagination
- Filtering
- Sorting
- Versioning
- Idempotency
- Correlation IDs

---

## 11_BACKEND_ARCHITECTURE.md

Document:

- Project structure
- Layer responsibilities
- Domain model
- Repository pattern
- Transaction boundaries
- Validation flow
- Authorization flow
- Dependency Injection
- Background jobs
- Migration strategy

---

## 12_FRONTEND_ARCHITECTURE.md

Document:

- Folder structure
- Feature architecture
- Base components
- TanStack Query strategy
- Cache strategy
- Routing
- Forms
- State management
- Error handling
- Loading strategy
- i18n architecture
- Theme architecture

---

## 13_SECURITY_MODEL.md

Explain:

- Authentication
- Authorization
- Keycloak
- RBAC
- ABAC
- JWT
- Internal service authentication
- Gateway
- Audit logging
- Zero Trust
- Security boundaries

---

## 14_WORKFLOW_AND_USECASES.md

Document every implemented workflow.

For each workflow include:

- Business objective
- Actors
- Preconditions
- Main flow
- Alternative flow
- Failure scenarios
- APIs
- Events
- UI screens

---

## 15_UI_DESIGN_SYSTEM.md

Document:

- Design language
- Base components
- Modal system
- Table system
- Form system
- Colors
- Typography
- Layout
- Responsive rules
- Accessibility
- Localization

---

## 16_TESTING_STRATEGY.md

Explain:

- Unit testing
- Integration testing
- Browser E2E
- Contract testing
- Seed strategy
- Mock strategy
- Test data
- CI verification
- Coverage

---

## 17_CODING_STANDARDS.md

Document:

- Naming
- Folder conventions
- API conventions
- Migration conventions
- DTO conventions
- Error conventions
- Logging conventions
- Event naming
- Commit style
- PR rules
- Review checklist

---

## 18_AI_DEVELOPMENT_RULES.md

Document all AI constraints.

Examples:

- Never bypass business validation.
- Never duplicate ownership.
- Never modify historical records.
- Never invent APIs.
- Never expose UUIDs to users.
- Never weaken lifecycle rules.

This document should define how future AI agents must safely modify the repository.

---

## 19_KNOWN_LIMITATIONS.md

Document:

- Temporary implementations
- Demo-only features
- Technical debt
- Deprecated APIs
- Runtime limitations
- Missing browser coverage
- Future migration areas

---

## 20_ARCHITECTURE_DECISIONS.md

Create an ADR-style document.

Explain WHY important architectural decisions were made.

If the rationale cannot be determined from the source code, explicitly state that it requires human input.

---

## 21_ROADMAP.md

Document:

- Completed modules
- In-progress modules
- Planned modules
- Deprecated modules
- Future architecture direction

Clearly separate implemented functionality from planned functionality.

---

## 22_GLOSSARY.md

Create a master glossary containing every important technical and manufacturing term used throughout the repository.

---

# General Rules

- Never invent missing information.
- Distinguish implemented behavior from planned behavior.
- Prefer Mermaid diagrams.
- Cross-reference related documents.
- Link to relevant source files.
- Explain "why", not only "what".
- Focus on helping future AI agents and Senior Engineers understand the system deeply.
- Treat the generated documentation as the canonical AI onboarding library for this repository.