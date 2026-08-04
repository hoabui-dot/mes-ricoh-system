# AI Execution Prompt — ICP 04 DATA MAPPING MANIFEST: MES–WMS Data Mapping Manifest

## Prompt Meaning

Defines exact identifier and field mappings between MES, WMS, PDA Backend, and Platform contracts.

This prompt instructs an AI agent to execute the shared integration-contract phase. It does not authorize unilateral changes in MES or WMS.

## Required Reading

Before execution, read:

```text
../GLOBAL_RULE.md
../phase/ICP_04_DATA_MAPPING_MANIFEST.md
all previously approved Integration Contract Pack phases
```

## Role

Act as:

- senior enterprise integration architect;
- MES domain architect;
- WMS domain architect;
- Kafka and event-contract architect;
- data-consistency and migration reviewer;
- production-readiness and recovery reviewer;
- technical documentation author.

## Objective

Prevent random identifiers, hidden assumptions, and cross-system lookup hacks.

## Execution Instructions

1. Inspect current MES, WMS, PDA Backend, platform, contract, migration, test, and runtime evidence relevant to this phase.
2. Preserve verified behavior.
3. Separate implementation facts from proposed contracts.
4. Create every required deliverable listed in the phase document.
5. Register unresolved issues in ICP-09 rather than guessing.
6. Record source files, runtime evidence, assumptions, and blockers.
7. Do not modify application code unless explicitly required by an approved contract or evidence harness.
8. Do not change shared event semantics unilaterally.
9. Do not introduce cross-database access, shared business tables, or undocumented Redis coupling.
10. Stop when a major architectural contradiction is discovered.

## Scope

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

## Required Acceptance

- all cross-system identifiers have explicit meaning and owner
- `work_center_ref` format is approved
- item revision and UOM mappings are reproducible
- fixture values can be created without direct database reads

## Mandatory Stop Conditions

- mapping requires direct database access
- one identifier has multiple incompatible meanings
- environment-specific values cannot be supplied through configuration or fixture manifest

## Required Output

Produce the phase report and all artifacts defined in:

```text
../phase/ICP_04_DATA_MAPPING_MANIFEST.md
```

End with one final status:

```text
APPROVED_AND_FROZEN
PARTIALLY_APPROVED
BLOCKED_BY_DECISION
BLOCKED_BY_CONTRACT_CONFLICT
BLOCKED_BY_ARCHITECTURE_CONFLICT
```

Do not claim approval without evidence.
