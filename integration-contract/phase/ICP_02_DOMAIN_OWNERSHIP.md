# ICP 02 DOMAIN OWNERSHIP — Domain and Aggregate Ownership

## 1. Meaning of This Phase

Assigns one authoritative owner to every shared aggregate, command, projection, and audit state.

## 2. Purpose

Prevent duplicate business authority and define lifecycle responsibility.

## 3. Why This Phase Exists

This phase exists to remove ambiguity before MES and WMS implementation agents perform dependent work.

It is a shared integration-contract phase and does not belong exclusively to either repository.

## 4. Scope

- Work Order
- material requirement
- material staging request
- warehouse inventory
- lot, reservation, movement
- warehouse execution task
- shipment and package
- PDA operator/device/session
- outbox, inbox, DLQ, reconciliation
- master-data projections

## 5. Architecture Constraints

- Follow `GLOBAL_RULE.md`.
- Preserve verified runtime transport unless this phase explicitly approves a contract change.
- Do not modify application code during contract-definition work unless the phase explicitly requires evidence-generation tooling.
- Do not invent missing product, platform, mapping, or ownership decisions.
- Keep MES and WMS independently deployable.
- Do not use direct cross-database access.

## 6. Required Deliverables

- aggregate ownership matrix
- create/update/cancel authority matrix
- source-of-truth matrix
- projection ownership matrix
- `reports/ICP_02_DOMAIN_OWNERSHIP_REPORT.md`

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

- [ ] every aggregate has exactly one owner
- [ ] all non-owner copies are identified as projections, caches, or audit evidence
- [ ] inventory authority remains WMS
- [ ] Work Order and material requirement authority remain MES

## 9. Stop Conditions

Stop and create an architecture blocker report when:

- one aggregate requires two authoritative writers
- ownership contradicts current database-per-service architecture
- a projection is being used as authoritative state

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
