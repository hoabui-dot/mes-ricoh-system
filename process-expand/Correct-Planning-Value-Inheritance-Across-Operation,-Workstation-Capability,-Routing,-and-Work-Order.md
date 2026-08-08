# Correct Planning-Value Inheritance Across Operation, Workstation Capability, Routing, and Work Order

## Background

The recent ownership harmonization introduced engineering planning fields into the Operation Catalog and Routing-scoped Production Standards.

The current implementation must now be reviewed because the same planning concepts may exist in several contexts:

- Operation Catalog engineering defaults
- Workstation Operation Capability
- Routing-scoped Production Standard
- Work Order planning snapshot

The objective is not to force users to enter the same cycle time, setup time, base quantity, worker count, efficiency, and yield repeatedly.

The system must support inheritance and explicit overrides while preserving a single authoritative value for each context.

---

# Confirmed Domain Layers

## Operation Catalog

Operation Catalog owns generic engineering defaults that are independent of a specific Routing or physical Workstation.

Examples:

```text
Default Base Quantity
Default Setup Time
Default Estimated Cycle Time
Default Required Workers
Default Efficiency
Default Yield
Default Skill Requirements
```

These values answer:

> What is the normal engineering estimate for this Operation?

They are reusable defaults, not the final value for every Routing and every physical Workstation.

## Workstation Operation Capability

Workstation capability owns resource-specific estimates.

Examples:

```text
Workstation
Operation
Cycle Time
Setup Time
Base Quantity
Efficiency
Effective Period
```

These values answer:

> How is this specific Workstation expected to perform this Operation?

They are used for:

- eligibility;
- allocation guidance;
- resource comparison;
- Work Order allocation validation;
- resource-specific duration refinement where supported.

They must not automatically become the Routing value because Routing references a Work Center, not necessarily one physical Workstation.

## Routing Operation

Routing Operation owns process structure:

```text
Sequence
Operation
Default Work Center
Dependencies
Queue Time
Move Time
Scheduling Mode
Overlap
Transfer Batch
Milestone
```

## Routing-scoped Production Standard

A Routing-scoped Production Standard is an optional planning override for a specific Routing Operation.

It answers:

> What planning values should this Operation use in this specific Routing?

Examples:

```text
Base Quantity
Setup Time
Cycle Time
Required Workers
Efficiency
Yield
```

It must not be created merely by blindly copying Operation defaults.

## Work Order Snapshot

Work Order owns the immutable resolved planning values used for execution and calculation.

---

# Required Audit

Audit the complete implementation before modifying code.

Inspect:

- Operation Catalog schema and forms;
- Workstation Operation Capability schema and forms;
- Routing Operation schema;
- Production Standard schema;
- Routing create/edit/detail APIs;
- Routing release validation;
- Work Order creation;
- Compute & Check;
- resource readiness and allocation;
- migrations;
- seeds;
- tests;
- documentation.

For every planning field, determine:

```text
generic Operation default
resource-specific Workstation value
Routing-specific override
resolved Work Order value
```

Identify all places where the same value is copied without preserving its source.

---

# Planning Standard Source Model

Introduce an explicit planning source for every Routing Operation.

Supported states:

```text
INHERITED
ROUTING_OVERRIDE
```

A more detailed internal source may be returned by resolution:

```text
ROUTING_OVERRIDE
WORK_CENTER_STANDARD
OPERATION_DEFAULT
UNRESOLVED
```

Do not store duplicated values in Routing merely because a default exists.

---

# Routing Editor Behaviour

When adding an Operation to a Routing:

1. Load Operation business definition.
2. Display execution behaviour as read-only.
3. Load Operation engineering defaults.
4. Load valid Work Center-level Production Standards where available.
5. Load Workstation capability summaries for informational guidance.
6. Default the new Routing Operation to `INHERITED`.
7. Do not immediately create a duplicate Routing-scoped Production Standard.
8. Allow the planner to enable `Override for this Routing`.
9. Create or update a Routing-scoped Production Standard only when an override is explicitly saved.

---

# Planning UI

For each Routing Operation, display:

```text
Planning Standard Source

○ Inherit automatically
○ Override for this Routing
```

## Inherited mode

Display resolved values as read-only:

```text
Base Quantity
Setup Time
Cycle Time
Required Workers
Efficiency
Yield
```

Also display the source:

```text
Source: Work Center Standard
```

or:

```text
Source: Operation Engineering Default
```

Example:

```text
Cycle Time: 60 sec / 1 PCS
Source: Operation Engineering Default
```

## Override mode

Enable editable inputs:

```text
Base Quantity
Setup Time
Cycle Time
Required Workers
Efficiency
Yield
```

Preload current resolved values only as initial suggestions.

Saving an override must create or replace the current Routing-scoped Production Standard.

It must never update:

- Operation Catalog;
- Workstation capability;
- another Routing.

---

# Workstation Capability Guidance

After selecting a Work Center, return a summary of active Workstation capabilities for the selected Operation.

Example:

```json
{
  "supportedWorkstationCount": 3,
  "cycleTimeSeconds": {
    "minimum": 45,
    "maximum": 65,
    "average": 56.7
  },
  "setupTimeMinutes": {
    "minimum": 2,
    "maximum": 5
  }
}
```

Display this as guidance:

```text
Supported Workstations: 3
Estimated Workstation cycle range: 45–65 sec
```

Do not automatically choose:

- the fastest Workstation;
- the slowest Workstation;
- an arbitrary average;

as the authoritative Routing value.

A Workstation-specific value becomes relevant only when the Work Order is allocated to that Workstation.

---

# Planning Resolution Precedence

Define a deterministic resolution function.

At Routing release and Work Order creation, resolve planning values using:

```text
1. Released Routing-scoped Production Standard
2. Released effective Work Center-level Production Standard
3. Operation engineering default
4. Unresolved
```

Do not resolve directly from a random Workstation capability while the Routing only identifies a Work Center.

If required values remain unresolved, block Routing release with stable validation errors.

Examples:

```text
ROUTING_CYCLE_TIME_UNRESOLVED
ROUTING_BASE_QUANTITY_UNRESOLVED
ROUTING_REQUIRED_WORKERS_UNRESOLVED
ROUTING_EFFICIENCY_UNRESOLVED
ROUTING_YIELD_UNRESOLVED
```

---

# Resource Allocation Behaviour

When a Work Order Operation is later allocated to a concrete Workstation:

1. retain the Routing planning baseline;
2. load the selected Workstation capability;
3. compare it with the Routing baseline;
4. report differences;
5. use resource-specific standards only according to an explicitly documented duration policy.

Do not silently replace an already-approved Work Order snapshot.

If allocation-time recalculation is supported, it must be:

- explicit;
- versioned;
- audited;
- completed before final approval or release;
- stored in the Work Order snapshot.

---

# Routing Detail

Update Routing detail to show only real current fields.

For each Routing Operation display:

## Operation definition

Read-only values inherited from Operation Catalog:

```text
Confirmation Mode
Quantity Reporting
Material Scan
Output Label
Partial Completion
Planning Enabled
```

## Planning values

```text
Base Quantity
Setup Time
Cycle Time
Required Workers
Efficiency
Yield
```

For every planning value show its source:

```text
Routing Override
Work Center Standard
Operation Default
Unresolved
```

Example:

```text
Cycle Time: 75 sec / 1 PCS
Source: Routing Override
```

or:

```text
Cycle Time: 60 sec / 1 PCS
Source: Operation Default
```

## Workstation capability guidance

Optionally display:

```text
Supported Workstations: 3
Capability cycle range: 45–65 sec
```

This information is advisory and must be visually separated from the resolved Routing planning value.

Remove UI fields that:

- do not exist in the current schema;
- are not returned by the API;
- belong to obsolete models;
- use fabricated zero or null fallback values.

---

# Routing Form Layout

Each Routing Operation should contain:

## Structure

```text
Sequence
Operation
Work Center
Dependency
```

## Resolved planning summary

```text
Base Quantity
Setup Time
Cycle Time
Required Workers
Efficiency
Yield
Source
```

## Override control

```text
Override for this Routing
```

Only show editable planning inputs when override is enabled.

Do not force users to type values already inherited correctly.

---

# API Contract

Routing detail and edit APIs should return both resolved values and source metadata.

Example:

```json
{
  "routingOperationId": "...",
  "sequenceNo": 20,
  "operation": {
    "id": "...",
    "code": "OP-PRINT",
    "name": {},
    "engineeringDefaults": {
      "baseQuantity": 1,
      "setupTimeMinutes": 0,
      "cycleTimeSeconds": 60,
      "requiredWorkers": 1,
      "efficiency": 1,
      "yield": 1
    }
  },
  "workCenter": {
    "id": "...",
    "code": "WC-PRINT",
    "name": {}
  },
  "planning": {
    "mode": "ROUTING_OVERRIDE",
    "resolvedSource": "ROUTING_OVERRIDE",
    "resolvedValues": {
      "baseQuantity": 1,
      "setupTimeMinutes": 2,
      "cycleTimeSeconds": 75,
      "requiredWorkers": 2,
      "efficiency": 0.95,
      "yield": 0.98
    },
    "routingOverride": {
      "standardId": "...",
      "status": "Released"
    }
  },
  "workstationCapabilitySummary": {
    "supportedWorkstationCount": 3,
    "minimumCycleTimeSeconds": 45,
    "maximumCycleTimeSeconds": 65
  }
}
```

Do not require the frontend to infer the source by comparing numeric values.

---

# Persistence Rules

## Inherited mode

Persist:

- Routing Operation structure;
- planning mode = `INHERITED`.

Do not create a duplicate Production Standard containing copied Operation defaults.

## Override mode

Persist transactionally:

- Routing Operation;
- planning mode = `ROUTING_OVERRIDE`;
- current Routing-scoped Production Standard;
- Routing-specific skill requirements where applicable.

When switching from override back to inherited:

- end the current Routing-scoped standard effectively;
- retain its history;
- resolve values again from Work Center standard or Operation default.

Repeated save must not create duplicate current standards.

---

# Skill Requirements

Apply the same inheritance model to skills.

```text
Operation default skills
→ inherited by default

Routing-specific skills
→ created only when the planner overrides
```

Support:

```text
INHERITED
ROUTING_OVERRIDE
```

Do not copy all default skills into Routing persistence unless an override is required.

Routing detail must display the resolved requirements and their source.

---

# Compute & Check

Compute & Check must use the resolved planning values captured in the Work Order snapshot.

It must not directly query current Operation defaults on every calculation.

Resolution must happen at the controlled snapshot boundary.

Example:

```text
Operation default cycle time: 60 sec
Routing override: 75 sec
Selected Workstation capability: 50 sec
```

Before a Workstation-specific recalculation policy is explicitly applied:

```text
Work Order planning cycle time = 75 sec
```

The capability value is advisory, not an automatic replacement.

---

# Migration Review

Review migration `0041_harmonize_operation_routing_standard_ownership`.

Determine whether it mechanically created Routing-scoped Production Standards by copying Operation defaults.

If so:

1. identify copied standards that contain no intentional override;
2. classify them safely;
3. convert eligible rows to inherited mode;
4. end redundant Routing standards;
5. preserve standards that differ from their source defaults;
6. retain history and audit evidence.

Do not delete historical Production Standards blindly.

---

# Tests

Add tests for:

## Inheritance

- a new Routing Operation uses Operation defaults without creating a duplicate standard;
- Work Center standard takes precedence over Operation default;
- unresolved required values block release.

## Override

- planner enables override;
- override values persist;
- Operation Catalog remains unchanged;
- Workstation capabilities remain unchanged;
- switching back to inherited ends the override.

## Detail

- resolved value and source are returned;
- Workstation capability range is advisory;
- obsolete fields are absent;
- zero values are only shown when actually persisted.

## Work Order

- Compute & Check uses the resolved Routing value;
- Workstation capability does not silently replace the snapshot;
- approved Work Orders remain immutable.

---

# Runtime Verification

Use a test Operation with:

```text
Operation default cycle time: 60 sec
```

Create two Workstation capabilities:

```text
WS-A: 45 sec
WS-B: 65 sec
```

Then verify:

1. Create a new Routing Operation.
2. Select the Operation and its Work Center.
3. Confirm inherited cycle time is `60 sec`.
4. Confirm capability guidance shows `45–65 sec`.
5. Confirm no duplicate Routing standard is created in inherited mode.
6. Enable Routing override.
7. Enter `75 sec`.
8. Save and reload.
9. Confirm resolved value is `75 sec`.
10. Confirm source is `Routing Override`.
11. Confirm Operation remains `60 sec`.
12. Confirm Workstation capabilities remain `45` and `65 sec`.
13. Create and Compute a Work Order.
14. Confirm snapshot uses `75 sec`.
15. Switch the Draft Routing back to inherited mode.
16. Confirm the override is ended and resolved value returns to the inherited source.

---

# Documentation

## Console authoring decision (2026-08-07)

The console now presents Operation, Work Center, planning source, and the
Routing-specific Production Standard fields in the Routing Operation form.
`Resource Capability` and the standalone `Production Standard` pages are no
longer authoring surfaces because they duplicate the Routing assignment. The
backend tables remain compatibility and resource-constraint surfaces. An
active Routing Operation + Work Center relationship is the default eligibility
link; explicit Capability rows still provide product/equipment restrictions,
priority, speed, lot limits, and denial rules.

Update:

```text
AI_CONTEXT.md
Operation Catalog documentation
Workstation capability documentation
Routing documentation
Production Standard documentation
Resource allocation documentation
Work Order Compute & Check documentation
ERD and ownership matrix
```

Clearly document:

```text
Operation default
≠ Workstation capability
≠ Routing override
≠ Work Order snapshot
```

And:

```text
Routing does not select a physical Workstation.
Routing references a Work Center.
Physical Workstation selection occurs during Work Order allocation.
```

---

# Acceptance Criteria

The task is complete only when:

1. Planning values are not blindly duplicated into every Routing.
2. Routing supports inherited and override modes.
3. Operation Catalog remains the owner of generic defaults.
4. Workstation capability remains the owner of resource-specific estimates.
5. Routing override is created only when intentionally configured.
6. Routing detail displays resolved values and source.
7. Workstation capability values are advisory at Routing level.
8. Routing release blocks unresolved required planning values.
9. Compute & Check uses the Work Order snapshot.
10. No allocation flow silently replaces approved planning values.
11. Redundant migrated standards are audited and repaired safely.
12. Builds, tests, migrations, and runtime verification pass.

# Required Final Report

Report:

## Audit

- duplicated fields found;
- copied standards found;
- ownership conflicts found.

## Resolution model

- precedence order;
- inherited mode;
- override mode;
- Workstation capability role.

## UI

- resolved values;
- source labels;
- override controls;
- capability guidance.

## Migration repair

- standards retained;
- standards converted to inherited mode;
- historical records ended.

## Runtime evidence

Demonstrate:

```text
Operation default = 60 sec
Workstation capabilities = 45–65 sec
Routing override = 75 sec
Work Order snapshot = 75 sec
```

Do not report completion while the system still forces duplicate planning entry or treats Workstation capability as the automatic Routing standard.
