# Harmonize Operation Catalog, Routing Operation, and Production Standard Ownership

## Background

The current Routing implementation is being expanded to support production planning, Production Standards, and Work Order duration calculation.

During the review, a design inconsistency was identified.

The current Operation Catalog already contains execution-related metadata, including:

- Confirmation Mode
- Quantity Reporting Mode
- Allow Partial Completion
- Planning Enabled
- Material Scan Requirement
- Output Label Requirement
- Default Skill Requirements
- Default Required Persons
- Estimated Cycle Time (Engineering Estimate)

The Routing editor is now being enhanced to capture planning data such as:

- Cycle Time
- Setup Time
- Base Quantity
- Required Workers
- Work Center
- Efficiency
- Yield
- Dependency
- Queue Time
- Move Time

If every Operation field is duplicated inside Routing, the system will eventually have multiple conflicting sources of truth.

The objective of this task is **not** to copy Operation data into Routing.

The objective is to clearly define ownership of every field and implement a consistent data model across Operation Catalog, Routing Operation, Production Standard, and Work Order calculation.

---

# Objective

Perform a complete architectural review and refactor the ownership of Operation-related data.

The final system must distinguish between:

1. Business Definition
2. Engineering Defaults
3. Routing Planning Overrides

Each field must have exactly one authoritative owner.

The Routing editor should preload defaults where appropriate, allow planning overrides where appropriate, and keep immutable business definitions read-only.

No duplicated ownership may remain.

---

# Target Ownership Model

The ownership hierarchy must become:

```text
Operation Catalog
│
├── Business Definition
├── Engineering Defaults
│
▼
Routing
│
├── Planning Overrides
│
▼
Production Standard
│
▼
Work Order Snapshot
```

Business Definitions flow downward.

Engineering Defaults preload Routing.

Routing stores planning-specific overrides.

Work Orders snapshot Routing values at approval time.

Changes to Routing must never modify Operation Catalog.

Changes to Operation Catalog must never silently modify existing Routing standards.

---

# Phase 1 — Audit Existing Ownership

Audit every Operation-related field currently stored across:

- Operation Catalog
- Routing Operation
- Production Standard
- Supported Operation on Workstation
- Work Order Snapshot
- APIs
- DTOs
- Database schema
- Migrations
- Frontend forms
- Validation logic
- Compute & Check
- Documentation

For every field answer:

- Who owns it?
- Is it duplicated?
- Is it default data?
- Is it planning data?
- Is it execution behaviour?
- Should Routing edit it?
- Should Routing only display it?
- Should Work Orders snapshot it?

Produce an ownership matrix before refactoring.

---

# Phase 2 — Define Business Definition

The following fields belong to Operation Catalog only.

They represent the business definition of an Operation.

They must not be editable inside Routing.

Examples include:

- Confirmation Mode
- Quantity Reporting Mode
- Allow Partial Completion
- Planning Enabled
- Material Scan Requirement
- Output Label Requirement

Routing should display these values for planner reference only.

Example:

```text
Operation

Print Barcode

--------------------------------

Confirmation Mode

Start / Finish

(read only)

Quantity Reporting

Good Only

(read only)

Material Scan

No

(read only)

Output Label

Yes

(read only)
```

Editing a Routing must never change these values.

---

# Phase 3 — Define Engineering Defaults

Some Operation fields are engineering recommendations rather than planning decisions.

These should remain owned by Operation Catalog but act as defaults when creating a Routing.

Examples include:

- Estimated Cycle Time
- Default Required Persons
- Default Skill Requirements
- Default Setup Time (if introduced later)
- Default Base Quantity (if introduced later)

Rename or document the meaning of Estimated Cycle Time as:

```text
Default Estimated Cycle Time
```

or

```text
Engineering Estimated Cycle Time
```

to avoid confusion with Routing planning standards.

When an Operation is selected in Routing:

- preload these values;
- allow the planner to override them;
- save overrides only inside Routing / Production Standard;
- never update the Operation Catalog.

---

# Phase 4 — Define Routing Planning Data

Routing owns production-planning values.

These values are specific to one Routing.

They may differ from engineering defaults.

Examples:

- Work Center
- Base Quantity
- Setup Time
- Cycle Time
- Required Workers
- Queue Time
- Move Time
- Yield
- Efficiency
- Dependency
- Scheduling Parameters
- Transfer Batch
- Milestone

These values must be editable.

They must be used for planning and Work Order calculation.

They must not overwrite Operation defaults.

Example:

Operation:

```text
Estimated Cycle Time

5 sec
```

Routing A:

```text
Cycle Time

7 sec
```

Routing B:

```text
Cycle Time

3 sec
```

Operation remains unchanged.

---

# Phase 5 — Skill Requirement Behaviour

Operation Catalog defines the default skills required to execute an Operation.

Example:

```text
Printer Operator

Minimum Level: L1

Required Persons: 1
```

When an Operation is added into a Routing:

- preload these default skill requirements;
- allow planners to add skills;
- allow planners to remove skills;
- allow planners to increase minimum level;
- allow planners to change required persons.

These become Routing-specific planning requirements.

Editing Routing must never modify the Operation Catalog.

---

# Phase 6 — Routing Editor UX

When selecting an Operation, the editor should automatically populate:

Business Definition (read only)

- Confirmation Mode
- Quantity Reporting
- Material Scan
- Output Label
- Allow Partial Completion
- Planning Enabled

Planning Standard (editable)

- Work Center
- Base Quantity
- Setup Time
- Cycle Time
- Required Workers
- Efficiency
- Yield
- Queue Time
- Move Time

Default Skill Requirements (editable)

loaded from Operation

Planner may override.

Separate these sections visually.

Users should clearly understand which data is inherited and which data is editable.

---

# Phase 7 — Work Center Workforce Guidance

When a Work Center is selected:

retrieve:

- active assigned worker count

Display:

```text
Assigned Active Workers

8
```

Validation:

```text
Required Workers

>= 1

<= Assigned Active Workers
```

This is only configuration validation.

Do not allocate shifts.

Do not reserve employees.

Do not create schedules.

Those workflows belong to a later phase.

---

# Phase 8 — Routing Dependency

Review the current "Previous Operation" field.

Determine whether:

- it should remain hidden for sequential routing;
- it should become automatic;
- it should support multiple predecessors;
- it should support parallel execution.

If the current implementation only supports sequential routing:

automatically derive dependency from sequence.

Hide unnecessary complexity.

Keep the database capable of future parallel routing.

Do not remove dependency support from the domain model.

---

# Phase 9 — Production Standard

Review the current Production Standard implementation.

Ensure Production Standard owns planning values including:

- Base Quantity
- Setup Time
- Cycle Time
- Labor Count
- Efficiency
- Yield

Routing should behave as a unified planning editor.

The planner should not need to know whether the backend persists values into:

- Routing Operation
- Production Standard

The persistence split should remain an implementation detail.

---

# Phase 10 — Compute & Check Refactor

Refactor Compute & Check to consume Routing planning overrides.

Never calculate production duration from Operation Catalog defaults.

Calculation order:

Production Version

↓

Routing

↓

Routing Operations

↓

Production Standards

↓

Work Order Quantity

↓

Operation Duration

↓

Routing Duration

↓

Approval Snapshot

Operation Catalog should only provide fallback defaults during Routing creation.

It must not participate in Work Order duration calculations after Routing planning is complete.

---

# Phase 11 — Work Order Snapshot

When approving a Work Order:

snapshot:

- Routing Version
- Routing Operations
- Production Standards
- Base Quantity
- Setup Time
- Cycle Time
- Required Workers
- Skill Requirements
- Efficiency
- Yield
- Dependency
- Queue Time
- Move Time
- Calculation Version

Future Operation or Routing edits must never modify approved Work Orders.

---

# Phase 12 — Documentation

Review and update every document that currently mixes:

Operation Definition

and

Routing Planning.

Update:

- AI_CONTEXT.md
- Operation Catalog documentation
- Routing documentation
- Production Standard documentation
- Work Order planning documentation
- Compute & Check documentation
- Architecture documents
- ERD
- README files

Clearly document:

Business Definition

↓

Engineering Defaults

↓

Routing Planning Override

↓

Work Order Snapshot

Explain ownership for every field.

Remove conflicting descriptions.

---

# Phase 13 — Tests

Add or update automated tests covering:

Business Definition

- Routing cannot modify Operation execution behaviour.

Engineering Defaults

- Routing preloads defaults.

Planning Override

- planner changes Routing values.

Ownership

- Operation remains unchanged after Routing edits.

Skills

- Routing overrides skills without changing Operation.

Compute & Check

- uses Routing planning values.

Snapshot

- approved Work Orders remain immutable.

Regression

- existing Routing continues working.

Migration

- existing data remains compatible.

---

# Phase 14 — Runtime Verification

Verify the complete flow:

1. Create an Operation with business definition and engineering defaults.
2. Add the Operation into a new Routing.
3. Confirm business definition is displayed read-only.
4. Confirm engineering defaults are preloaded.
5. Override Cycle Time.
6. Override Required Workers.
7. Override Skill Requirements.
8. Save Routing.
9. Verify Operation Catalog remains unchanged.
10. Verify Production Standard stores planning values.
11. Create a Production Version.
12. Create a Work Order.
13. Execute Compute & Check.
14. Confirm calculation uses Routing planning values.
15. Approve Work Order.
16. Confirm snapshot contains Routing planning values.
17. Edit Operation Catalog afterwards.
18. Confirm approved Work Order remains unchanged.

---

# Acceptance Criteria

The work is complete only when:

1. Every field has exactly one authoritative owner.
2. Operation Catalog owns business definitions.
3. Operation Catalog owns engineering defaults.
4. Routing owns planning overrides.
5. Production Standard stores planning values.
6. Work Orders snapshot planning values.
7. Routing displays inherited business definitions read-only.
8. Routing preloads engineering defaults.
9. Routing overrides never modify Operation Catalog.
10. Compute & Check uses Routing planning values only.
11. Approved Work Orders remain immutable.
12. Documentation is fully updated.
13. Database migrations succeed.
14. Frontend and backend builds pass.
15. Automated tests pass.
16. Runtime verification succeeds.

---

# Required Final Report

Provide:

## Ownership Matrix

Every field classified as:

- Business Definition
- Engineering Default
- Routing Planning
- Work Order Snapshot

## Refactoring Summary

List every backend, frontend, database, API, DTO, and documentation change.

## UI Changes

Explain how inherited values, editable planning values, and read-only business definitions are presented.

## Runtime Evidence

Demonstrate that:

- Operation defaults preload Routing.
- Routing overrides are stored correctly.
- Operation Catalog remains unchanged.
- Compute & Check uses Routing planning values.
- Approved Work Orders remain immutable.

Do not report completion until ownership is fully harmonized and there is no duplicated source of truth anywhere in the MES platform.