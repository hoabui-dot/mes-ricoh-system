# ICP 03 EVENT CONTRACT — Canonical Event Contract

## 1. Meaning of This Phase

Defines the shared event families, envelopes, payloads, topics, keys, and result semantics.

## 2. Purpose

Create source-controlled contracts that both MES and WMS can implement without guessing.

## 3. Why This Phase Exists

This phase exists to remove ambiguity before MES and WMS implementation agents perform dependent work.

It is a shared integration-contract phase and does not belong exclusively to either repository.

## 4. Scope

- `MES.Execution.MaterialStagingRequested`
- `WMS.Outbound.MaterialStaged`
- `WMS.Outbound.MaterialShortageDeclared`
- PDA/WMS execution result families
- event envelope
- payload schema
- topic mapping
- partition key
- required fields
- error/result semantics

## 5. Architecture Constraints

- Follow `GLOBAL_RULE.md`.
- Preserve verified runtime transport unless this phase explicitly approves a contract change.
- Do not modify application code during contract-definition work unless the phase explicitly requires evidence-generation tooling.
- Do not invent missing product, platform, mapping, or ownership decisions.
- Keep MES and WMS independently deployable.
- Do not use direct cross-database access.

## 6. Required Deliverables

- canonical event catalog
- canonical envelope contract
- sample JSON payloads
- topic-event matrix
- producer/consumer matrix
- Schema Registry subject matrix
- `reports/ICP_03_EVENT_CONTRACT_REPORT.md`

## 7. Verification

Verification must be source-backed and must distinguish:

- runtime evidence;
- runtime smoke evidence;
- static evidence;
- proposed behavior;
- unresolved decisions;
- external blockers;
- not-applicable dependencies.

## 8. Acceptance Criteria

- [ ] every event has a stable event ID and logical aggregate/request identity
- [ ] topic and event type are consistent
- [ ] required and optional fields are explicit
- [ ] quantity and UOM semantics are explicit
- [ ] current runtime events remain compatible or are versioned correctly

## 9. Stop Conditions

Stop and create an architecture blocker report when:

- an existing `v1` requires incompatible semantic change
- the producer and consumer disagree on identity or quantity meaning
- an event lacks sufficient data for durable reconciliation

## 10. Final Status

Use one of:

```text
APPROVED_AND_FROZEN
PARTIALLY_APPROVED
BLOCKED_BY_DECISION
BLOCKED_BY_CONTRACT_CONFLICT
BLOCKED_BY_ARCHITECTURE_CONFLICT
```

## 11. Downstream Dependency

Later phases must not assume this phase is complete unless its status is `APPROVED_AND_FROZEN`.
