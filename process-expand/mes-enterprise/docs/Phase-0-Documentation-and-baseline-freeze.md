# Phase 0 — Freeze and Audit the Current MES Resource Planning Baseline

You are working inside the existing S-Factory MES enterprise microservice repository.

This phase is documentation and verification only.

Do not implement the two-production-line model yet.

## Objective

Establish an authoritative baseline of the current MES Resource Planning implementation before any domain or schema changes are introduced.

## Required inspection scope

Inspect:

- MES Master Data service
- MES Execution service
- MES Console
- Resource Planning APIs
- database migrations
- current seed/reset scripts
- API integration tests
- browser E2E tests
- Kafka events and outbox records related to resources
- AI_CONTEXT.md
- UI_AI_CONTEXT.md
- AI_document/
- product and implementation documents

## Produce an authoritative inventory

Document:

1. Current factory/resource hierarchy.
2. Routing Operation to Work Center relationship.
3. Workstation candidate resolution.
4. Machine Requirement and Resource Assignment ownership.
5. Machine Unit availability and planning eligibility.
6. Resource Calendar and Shift checks.
7. Production Standard checks.
8. Capacity reservation behavior.
9. Resource allocation transaction boundaries.
10. Reallocation and cancellation behavior.
11. Idempotency behavior.
12. Approval revalidation.
13. Execution start guards.
14. Existing APIs.
15. Existing database tables.
16. Existing Kafka events.
17. Existing API tests.
18. Existing browser E2E coverage.
19. Demo-only paths.
20. Deprecated or compatibility surfaces.

## Classify every capability

Use exactly one classification:

- IMPLEMENTED_AND_VERIFIED
- IMPLEMENTED_NOT_FULLY_VERIFIED
- PARTIALLY_IMPLEMENTED
- DEMO_ONLY
- DEPRECATED_COMPATIBILITY
- NOT_IMPLEMENTED
- UNKNOWN_REQUIRES_SOURCE_CONFIRMATION

## Required reports

Create:

- `mes-system/process-expand/mes-enterprise/ai-report/phase-0/mes-resource-planning-baseline-audit-YYYYMMDD.md`
- `mes-system/process-expand/mes-enterprise/ai-report/phase-0/mes-resource-planning-api-inventory-YYYYMMDD.md`
- `mes-system/process-expand/mes-enterprise/ai-report/phase-0/mes-resource-planning-test-coverage-matrix-YYYYMMDD.md`

## Verification rules

- Do not claim a feature is implemented because it exists in a product document.
- Running code, migrations and tests are authoritative.
- Do not modify source code.
- Do not modify migrations.
- Do not change seed data.
- Report inconsistencies instead of hiding them.

## Phase completion gate

This phase passes only when:

- every current Resource Planning API is mapped;
- every relevant database table is mapped to its owner;
- every current test is listed;
- all known gaps have a classification;
- no unverified assumption is described as current behavior.