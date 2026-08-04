# ICP 01 SYSTEM BOUNDARY — Canonical System Boundary

## 1. Meaning of This Phase

Defines where MES, WMS, PDA Backend, and Platform responsibilities begin and end.

## 2. Purpose

Eliminate cross-system responsibility ambiguity before aggregate-level ownership is defined.

## 3. Why This Phase Exists

This phase exists to remove ambiguity before MES and WMS implementation agents perform dependent work.

It is a shared integration-contract phase and does not belong exclusively to either repository.

## 4. Scope

- MES boundary
- WMS boundary
- Warehouse Execution boundary
- Shipping boundary
- PDA Backend boundary
- Platform boundary
- allowed communication paths
- forbidden communication paths
- data persistence boundaries

## 5. Architecture Constraints

- Follow `GLOBAL_RULE.md`.
- Preserve verified runtime transport unless this phase explicitly approves a contract change.
- Do not modify application code during contract-definition work unless the phase explicitly requires evidence-generation tooling.
- Do not invent missing product, platform, mapping, or ownership decisions.
- Keep MES and WMS independently deployable.
- Do not use direct cross-database access.

## 6. Required Deliverables

- system boundary matrix
- allowed dependency matrix
- forbidden coupling matrix
- system landscape diagram
- `reports/ICP_01_SYSTEM_BOUNDARY_REPORT.md`

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

- [ ] each system has explicit responsibilities, inputs, outputs, and persistence
- [ ] no system reads or writes another system's database
- [ ] PDA App calls PDA Backend only
- [ ] Kafka remains the approved asynchronous transport where defined

## 9. Stop Conditions

Stop and create an architecture blocker report when:

- a required capability has no system owner
- two systems claim authoritative persistence for the same state
- a boundary requires shared database access

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
