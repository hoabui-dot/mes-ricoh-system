# ICP 04 DATA MAPPING MANIFEST — MES–WMS Data Mapping Manifest

## 1. Meaning of This Phase

Defines exact identifier and field mappings between MES, WMS, PDA Backend, and Platform contracts.

## 2. Purpose

Prevent random identifiers, hidden assumptions, and cross-system lookup hacks.

## 3. Why This Phase Exists

This phase exists to remove ambiguity before MES and WMS implementation agents perform dependent work.

It is a shared integration-contract phase and does not belong exclusively to either repository.

## 4. Scope

- site/plant to warehouse
- Work Center to staging location
- item revision
- UOM
- Work Order
- material requirement
- logical demand
- WMS material request
- task
- LPN/pallet/package/shipment
- correlation and trace identifiers

## 5. Architecture Constraints

- Follow `GLOBAL_RULE.md`.
- Preserve verified runtime transport unless this phase explicitly approves a contract change.
- Do not modify application code during contract-definition work unless the phase explicitly requires evidence-generation tooling.
- Do not invent missing product, platform, mapping, or ownership decisions.
- Keep MES and WMS independently deployable.
- Do not use direct cross-database access.

## 6. Required Deliverables

- field-level mapping matrix
- environment mapping manifest template
- identifier ownership table
- nullability and transformation rules
- fixture mapping manifest
- `reports/ICP_04_DATA_MAPPING_REPORT.md`

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

- [ ] all cross-system identifiers have explicit meaning and owner
- [ ] `work_center_ref` format is approved
- [ ] item revision and UOM mappings are reproducible
- [ ] fixture values can be created without direct database reads

## 9. Stop Conditions

Stop and create an architecture blocker report when:

- mapping requires direct database access
- one identifier has multiple incompatible meanings
- environment-specific values cannot be supplied through configuration or fixture manifest

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
