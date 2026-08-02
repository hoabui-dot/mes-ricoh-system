# Phase 5 — Design the Canonical Two-Production-Line MES Model

This phase is architecture and schema design only.

Do not implement migrations or runtime behavior until the design is reviewed inside the repository.

## Objective

Design how one released Production Version can be eligible for two equivalent Production Lines while using one Item Revision, one MBOM and one Routing.

## Mandatory business invariants

1. One Work Order selects exactly one Production Line.
2. All Work Order Operations use resources from the selected line.
3. A Work Order must not mix lines operation by operation.
4. The primary line is evaluated first.
5. The backup line is evaluated only when the primary line is not feasible or policy explicitly chooses it.
6. If no complete line is feasible, the Work Order enters `RESOURCE_HOLD`.
7. Routing must not be duplicated only because Work Centers, Workstations or Equipment differ.
8. Existing Work Orders retain their selected-line and resource snapshots.
9. Cross-line movement after execution start is not part of the default flow.
10. Partial production line transfer requires a future explicit Execution Segment or Child Work Order design.

## Required source audit

Before proposing new tables, inspect whether existing concepts already provide the required ownership:

- Site
- Production Area
- Work Center
- Workstation
- Resource Assignment
- Machine Group
- Resource Capability
- Resource Calendar
- Production Standard
- Work Order operation
- Work Order resource allocation

Do not create `WorkstationEquipmentMap` if `md_resource_assignment` already owns that relationship.

Do not create a new `OperationJob` aggregate if `wo_operation` already owns that runtime concept.

## Required design outputs

Design:

- Production Line aggregate;
- Work Center to Production Line ownership;
- Production Version Line Eligibility;
- line selection mode;
- line selection policy;
- line readiness result;
- line score;
- selected line snapshot;
- fallback reason;
- line lock;
- RESOURCE_HOLD reason;
- replan/change-line policy;
- event changes;
- API changes;
- UI changes;
- migration and compatibility strategy.

## Required diagrams

Provide Mermaid diagrams for:

- aggregate relationships;
- Work Order creation and line selection;
- line-wide resource planning;
- primary-to-backup fallback;
- allocation commit;
- pre-release line change;
- post-release restrictions.

## Required ADR

Create:

`docs/adr/ADR-XXX-two-production-line-selection-and-resource-planning.md`

The ADR must include:

- context;
- problem;
- considered options;
- selected design;
- rejected designs;
- consequences;
- migration strategy;
- backward compatibility;
- unresolved product decisions.

## Completion gate

No implementation may begin until the design explicitly proves that ownership is not duplicated and all line-wide invariants can be transactionally or deterministically enforced.