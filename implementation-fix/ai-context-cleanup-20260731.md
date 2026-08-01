# AI Context Cleanup Report

## Scope

Audited and replaced the accumulated `AI_CONTEXT.md` with a single current context document. The source,
current Compose files, package scripts, and canonical MES ERD were used as the authority. This was a
documentation-only change; application code, migrations, and runtime data were not modified.

## Before and after

| Measure | Before | After |
|---|---:|---:|
| Lines | 5,955 | 423 |
| Words | 44,511 | 3,243 |
| Top-level content model | mixed canonical sections plus dated implementation ledger | 11 permanent topic sections |
| Historical/superseded headings | many | 0 |
| Broken internal links detected | not established before rewrite | 0 |

## Removed or consolidated

- Dated phase-by-phase implementation logs and repeated verification ledgers.
- Historical Print Adapter transport snapshots and incident/debug narratives.
- Migration-by-migration summaries that duplicated the migration source and ERD.
- Repeated MBOM, EBOM, Routing, Production Version, Work Order, resource-planning, and print-flow reports.
- Superseded temporary bypass descriptions that were presented as permanent business rules.
- Repeated UI change lists, individual translation fixes, and page-specific implementation notes.
- Stale claims about old transport or ownership models where current source uses Kafka, Production Version
  authority, or Routing Operation workstation ownership.

## Facts merged into permanent sections

- Service/database ownership and no cross-service database joins.
- Item Revision ownership of EBOM/MBOM/Routing and Production Version compatibility rules.
- EBOM engineering-only boundary.
- MBOM manufacturing semantics, derived UOM, and substitute multiplicity.
- Routing Operation direct Workstation ownership.
- Workstation requirements versus effective Resource Assignment versus WO allocation.
- Work Order snapshot, planning, execution, material-readiness, and print-job rules.
- Kafka/outbox/idempotency and remote Print Station boundaries.
- React/Vite, TanStack Query, Base UI, i18n, numeric, modal, table, API-error, and display conventions.
- Cleanup/seed commands, strict printer-readiness behavior, compatibility endpoints, and known limitations.

## Contradictions resolved

- Current Kafka-based Print Station integration is documented as active; older RabbitMQ/HTTP production-flow
  narratives were removed. HTTP is retained only as a management/diagnostic compatibility surface.
- Routing Operation's Workstation is documented as the authoring authority; Workstation Supported Operations is
  described only as a legacy compatibility surface where still present.
- EBOM is explicitly separated from manufacturing explosion, planning, staging, and execution.
- Production Version is the authoritative WO configuration; independent browser-selected MBOM/Routing values are
  not treated as authoritative.
- Strict Work Order validation is the baseline. `MES_DEMO_PRINT_ON_APPROVAL` is explicitly limited to the
  development/demo Compose configuration.
- The existing `stage-materials` endpoint is documented as a compatibility/manual recovery surface instead of
  being incorrectly described as the desired automatic lifecycle.

## Verification

Executed:

```bash
git diff --check
rg -n '^#{1,4} ' AI_CONTEXT.md
rg -n '2026-|Historical|superseded|Phase [0-9]|Last updated|Incident|incident|fix date|migration-by-migration' AI_CONTEXT.md
```

All checks passed. The historical-marker search returned only the word `Historical` in a permanent rule about
historical assignments. All five links in the new context were checked and exist.

No application build or Docker rebuild was run because this change only audits documentation. Runtime behavior
claims that depend on a remote printer, Cloudflare tunnel, or current container health are intentionally stated
as deployment-dependent limitations rather than recorded as permanent facts.
