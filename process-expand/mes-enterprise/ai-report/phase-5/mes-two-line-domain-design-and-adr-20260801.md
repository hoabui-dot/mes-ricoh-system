# MES Two-Line Domain Design and ADR - Phase 5

Date: 2026-08-01
Status: PASS

## Scope

Phase 5 is architecture and schema design only. No migrations, runtime code, seed data, or UI behavior were implemented in this phase.

Required guardrail source:

- `process-expand/mes-enterprise/docs/23_PHASE_IMPLEMENTATION_GUARDRAILS.md`
- `process-expand/mes-enterprise/docs/Phase-5-—-Two-Line-Domain-Design-and-ADR.md`

## Source Audit

Audited existing ownership before proposing new tables:

- Site, Production Area, Work Center, Workstation: MES Master Data hierarchy.
- Resource Assignment: existing authority for Work Center, Workstation, Equipment, Machine Group, and Machine Unit assignment/effectivity.
- Machine Group and machine requirements: existing Workstation-owned machine demand model.
- Resource Capability, Resource Calendar, Production Standard: existing planning inputs.
- Work Order Operation: existing execution-owned runtime operation snapshot.
- Work Order Resource Allocation and Capacity Reservation: existing execution-owned runtime commitments.

Result:

- No `WorkstationEquipmentMap` is proposed because `md_resource_assignment` already owns that relationship.
- No `OperationJob` aggregate is proposed because `wo_operation` already owns the runtime operation concept.
- Routing duplication for equivalent physical lines is rejected.

## Deliverables

Created:

- `docs/adr/ADR-009-two-production-line-selection-and-resource-planning.md`

Updated:

- `AI_document/07_DATABASE_DESIGN.md`
- `AI_document/08_EVENT_DRIVEN_ARCHITECTURE.md`
- `AI_document/10_API_CONVENTIONS.md`
- `AI_document/12_FRONTEND_ARCHITECTURE.md`
- `AI_document/14_WORKFLOW_AND_USECASES.md`
- `AI_document/16_TESTING_STRATEGY.md`
- `AI_document/19_KNOWN_LIMITATIONS.md`
- `AI_document/20_ARCHITECTURE_DECISIONS.md`

## Required Design Coverage

The ADR covers:

- Production Line aggregate.
- Work Center to Production Line ownership.
- Production Version Line Eligibility.
- Line selection mode and policy.
- Line readiness result.
- Line score.
- Selected line snapshot.
- Fallback reason.
- Line lock.
- `RESOURCE_HOLD` reason.
- Replan/change-line policy.
- Event changes.
- API changes.
- UI changes.
- Migration and compatibility strategy.

## Required Diagrams

The ADR includes Mermaid diagrams for:

- Aggregate relationships.
- Work Order creation and line selection.
- Line-wide resource planning.
- Primary-to-backup fallback.
- Allocation commit.
- Pre-release line change.
- Post-release restrictions.

## Verification

Command:

```bash
git diff --check
```

Result:

- Declared: documentation whitespace verification.
- Executed: 1
- Passed: 1
- Failed: 0
- Skipped: 0

Runtime tests:

- Declared: 0
- Executed: 0
- Passed: 0
- Failed: 0
- Skipped: 0
- Skip reason: Phase 5 is explicitly design-only and includes no code, migration, seed, or runtime behavior changes.

Cleanup verification:

- No Phase 5 database writes were performed.
- No Phase 5 seed data was created.

## Gate Decision

Phase 5 gate: PASS.

The design explicitly preserves existing ownership boundaries, avoids duplicate Routing and duplicate resource-assignment ownership, and defines how line-wide invariants can be enforced later inside MES Execution transactions after Master Data line eligibility is projected or fetched through owned APIs.
