# Phase 3 — Production Line Resource Scope and Execution-Candidate Boundaries

## Objective

Complete the backend model/API that determines which execution resources belong to a Production Line, especially when one Work Center contains multiple Workstations or resources shared across lines.

## Design rule

Inspect and prefer the existing `md_production_line_resource_scope` abstraction before creating any new join table.

A new `production_line_workstation` table is allowed only if source analysis proves Resource Assignment scope cannot represent the required semantics.

## Required behavior

Support line-scoped resources through the existing resource model, including where applicable:

```text
Production Line
  -> Resource Scope
     -> Resource Assignment
        -> Workstation
        -> Machine Unit / Equipment relation
```

The API must support:

- list resource scopes for a line,
- create/update/remove resource scopes,
- optional operation-specific scope via `routing_operation_id` when already supported,
- priority/primary semantics only if source uses them,
- effectivity,
- validation that scoped resources logically belong to the configured Work Center topology,
- prevention of cross-line accidental leakage.

## Important scenario

Support this safely:

```text
WC-TEST5
├── WS-01 -> LINE-1
├── WS-02 -> LINE-1
├── WS-03 -> LINE-2
└── WS-04 -> LINE-2
```

A Work Center alone is insufficient here; candidate generation must honor Line Resource Scope.

## Tests

Prove:

1. resources scoped to LINE-1 never appear as LINE-2 candidates,
2. shared Work Center can safely serve multiple lines through different resource scopes,
3. expired/inactive scopes are excluded,
4. invalid scope hierarchy is rejected,
5. operation-specific scope works if supported,
6. no cross-service DB access is introduced.

## Deliverable

Create:

`AI_document/two-line/PHASE_3_LINE_RESOURCE_SCOPE_REPORT.md`

## Phase gate

PASS when backend candidate boundaries can represent both dedicated-per-line Work Centers and shared Work Centers with line-specific Workstations/resources.
