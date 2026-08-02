# MES Enterprise Console Remediation Master Rules

Version: 1.0

Status: ACTIVE

Owner:
Enterprise Architecture

Target System:
S-Factory MES Enterprise

Applies To:

- MES Console
- MES Master Data
- MES Execution
- MES Traceability
- MES Gateway
- Canonical Seed
- Browser E2E
- API Integration Test
- AI Implementation

---

# 1. Purpose

This document defines the mandatory implementation rules that every AI implementation phase must follow.

Every remediation phase MUST comply with this document.

No phase is allowed to override these rules.

If a phase conflicts with this document, this document wins.

---

# 2. Mission

The objective of this remediation is NOT to redesign MES.

The objective is to align the current MES Console with:

- current backend implementation
- current database
- current API contracts
- current enterprise domain
- current Production Version architecture
- current Resource Planning model
- current Two Production Line model
- current Worker Skill model
- current Authorization model
- current Canonical Seed

while preserving enterprise stability.

---

# 3. Source of Truth Priority

When conflicts exist, use the following priority.

Priority 1

Current source code

Priority 2

Database schema

Priority 3

Current API

Priority 4

Current migrations

Priority 5

Current canonical seed

Priority 6

Current API integration tests

Priority 7

Current Browser E2E tests

Priority 8

Approved AI reports

Priority 9

AI_CONTEXT.md

Priority 10

Historical documentation

Never implement historical behavior over current source.

---

# 4. Enterprise Architecture Rules

The following architecture must never be violated.

Frontend

↓

Gateway

↓

Microservice

↓

Database

Frontend is never the business authority.

Frontend must never calculate:

- Resource Readiness
- Capacity
- Line Selection
- Allocation Decision
- Calendar Availability
- Production Standard
- Authorization
- Work Order State

Those belong to backend.

---

# 5. Domain Ownership Rules

Every business object has exactly one owner.

Examples

Production Version

Owner

MES Master Data

Work Order

Owner

MES Execution

Allocation

Owner

MES Execution

Employee Skill

Owner

MES Master Data

Worker Skill

Owner

MES Master Data

Never duplicate ownership.

Never create frontend authority.

---

# 6. UI Principles

MES Console is an Enterprise Application.

Do not redesign it into a consumer application.

The UI must prioritize

- information density
- workflow efficiency
- clarity
- auditability

over visual effects.

Avoid unnecessary animation.

Avoid oversized cards.

Avoid hidden information.

---

# 7. Shared Components

All new pages must reuse shared components.

Mandatory wrappers

BaseDataTable

BaseModal

BaseTabs

BaseForm

BaseStatusBadge

BaseFilterBar

BasePagination

BaseDrawer

BaseWarningPanel

BaseAuditTimeline

Do not create duplicate implementations.

---

# 8. Routing Rules

Never delete routes immediately.

When removing a page

Step 1

Deprecate

↓

Step 2

Redirect

↓

Step 3

Verify no consumer

↓

Step 4

Remove

Legacy aliases must remain for at least one release unless explicitly approved.

---

# 9. CRUD Rules

Every CRUD page must support

List

Create

Edit

View

Lifecycle

Dependencies

Audit

if required by domain.

Never expose raw UUID as primary identifier.

Prefer

Business Code

↓

Localized Name

↓

Status

↓

Lifecycle

---

# 10. Table Rules

Every table must support

Search

Sort

Pagination

Column visibility

Responsive width

Loading

Error

Empty state

Selection

where appropriate.

Never display

[object Object]

Never display

raw enum

Never display

database UUID

unless diagnostic.

---

# 11. Form Rules

Every field must define

Business meaning

Backend field

Validation

Required

Optional

Generated

Read Only

Lifecycle

Dependencies

Option source

No field may exist without backend ownership.

---

# 12. Backend Rules

Do not duplicate backend validation.

Do not bypass backend validation.

Never trust browser state.

Backend is authoritative.

---

# 13. Database Rules

No migration may

Rename production tables without compatibility

Delete production data

Break foreign keys

Break audit

Break outbox

Break historical snapshots

Every migration must be reversible.

---

# 14. Seed Rules

Canonical Seed is production documentation.

Seed must be deterministic.

Seed must be idempotent.

Seed must never require manual SQL.

Seed must generate

Master Data

↓

Execution Ready Data

↓

Verification Data

↓

UAT Data

---

# 15. Worker Skill Rules

Canonical Worker Skill Scope

Employee

Never WorkCenter.

Employee Skill

must reference

Employee Scope Worker Skill.

Operation Skill Requirement

must reference

Employee Scope Worker Skill.

No exception.

---

# 16. Production Line Rules

Routing

must remain

Line Independent.

Production Version

determines

eligible lines.

Backend

selects

one line.

Resource Planning

uses

selected line.

Planner

chooses

exact resource.

Never mix resources from multiple lines.

---

# 17. Testing Rules

Every phase must execute

Build

↓

Type Check

↓

API Integration Test

↓

Browser E2E

↓

Regression

↓

Manual Verification

No skipped mandatory tests.

---

# 18. Phase Workflow

Every phase must follow

Inspection

↓

Analysis

↓

Implementation

↓

Verification

↓

Fix

↓

Regression

↓

Report

↓

Gate

↓

Next Phase

Never skip.

---

# 19. Definition of Ready

A phase is READY only if

Scope approved

Dependencies satisfied

Previous phase passed

Seed valid

Build green

Tests available

---

# 20. Definition of Done

Done means

Implementation complete

Tests passing

Report generated

Regression passed

No critical defects

Documentation updated

Gate passed

---

# 21. Completion Gate

A phase may finish only when

Frontend Build PASS

Backend Build PASS

TypeScript PASS

Go PASS

API PASS

E2E PASS

Regression PASS

Documentation PASS

Report PASS

Otherwise

Status

BLOCKED

---

# 22. AI Behavior Rules

AI must not

Refactor unrelated modules

Change architecture

Delete pages

Change APIs

Change migrations

Modify seed

outside current phase.

Stay inside phase scope.

---

# 23. Reporting Rules

Every phase must generate

REPORT_PHASE_xx.md

Mandatory sections

Summary

Objectives

Implementation

Files Changed

API

Database

Seed

Frontend

Backend

Tests

Known Issues

Risks

Next Phase

Final Status

---

# 24. Final Rule

No implementation is considered complete until

API Integration Tests PASS

Browser E2E PASS

Regression PASS

Phase Report generated

Gate Status = READY

Otherwise

Implementation is considered incomplete.