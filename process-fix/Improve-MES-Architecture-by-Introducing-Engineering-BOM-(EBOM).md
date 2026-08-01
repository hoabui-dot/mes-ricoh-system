# Improve MES Architecture by Introducing Engineering BOM (EBOM)

## Objective

Audit the current MES architecture and extend it to support **Engineering BOM (EBOM)** as a first-class engineering object while preserving the existing Manufacturing BOM (MBOM) architecture.

The goal is to separate:

- Engineering product definition
- Manufacturing product definition
- Production execution

without duplicating responsibilities.

The implementation must follow enterprise MES/PLM practices where:

```text
Engineering
        │
        ▼
      EBOM
        │
        ▼
 Manufacturing Review
        │
        ▼
      MBOM
        │
        ▼
     Routing
        │
        ▼
 Production Version
        │
        ▼
    Work Order
        │
        ▼
Execution & Traceability
```

EBOM must **NOT** replace MBOM.

MBOM must **NOT** become a copy of EBOM.

Each object has its own responsibility.

---

# 1. Audit the Existing Architecture

First audit the current implementation.

Review:

```
Item
Item Revision
MBOM
Routing
Production Version
Work Order
Execution
Traceability
Master Data
Console UI
Backend Services
API Contracts
Database Schema
Product Documentation
AI_CONTEXT.md
```

Identify:

- where Item Revision owns MBOM
- where Production Version references MBOM
- where Work Order snapshots MBOM
- where traceability resolves manufacturing structure
- assumptions that "MBOM == Product Structure"

Create an architecture report describing:

```
Current State
Problem
Required Changes
Migration Impact
Compatibility Risk
```

Do not start implementing before completing the architecture audit.

---

# 2. Define Engineering BOM

Introduce a new bounded context:

```
Engineering BOM
```

Purpose:

> Describe how a product is engineered.

An EBOM represents:

- engineering structure
- product composition
- quantities
- design intent

EBOM does NOT describe manufacturing.

---

An EBOM contains:

```
Header
Lines
Hierarchy
Quantity
UOM
```

It does NOT contain manufacturing attributes.

---

# 3. Relationship Between Item Revision and EBOM

Each Finished Good or Semi Finished Item Revision may own one released EBOM.

Architecture:

```
Item Revision

├── EBOM
├── MBOM
├── Production Versions
```

Important:

EBOM and MBOM are siblings.

Neither owns the other.

Neither is a child of the other.

---

# 4. Define Responsibilities

Engineering BOM

Responsible for:

- engineering hierarchy
- engineering quantities
- product composition
- design documentation
- engineering revisions

NOT responsible for:

```
Substitutes
Issue Operations
Backflush
Scrap
Phantom
Routing
Production Standards
Resources
Equipment
Workstations
```

---

Manufacturing BOM

Responsible for:

- manufacturing hierarchy
- manufacturing quantities
- substitutes
- scrap
- phantom
- issue operation
- optional components
- production-specific structure

---

Routing

Responsible for:

```
Operations
Sequence
Resources
Capabilities
Execution Flow
```

---

Production Version

Responsible for freezing:

```
Item Revision
EBOM
MBOM
Routing
Site
```

---

# 5. EBOM Data Model

Create:

```
EBOM Header
EBOM Line
```

The hierarchy should closely resemble MBOM to minimise UI complexity.

Header:

```
EBOM ID
Item Revision ID
Version
Status
Description
Effective From
Effective To
Created By
Released By
```

Line:

```
Parent Line
Sequence
Component Revision
Quantity Per
UOM
```

Do NOT include:

```
Substitutes
Issue Operation
Scrap
Phantom
Backflush
Optional
Maximum Usage
```

Engineering BOM must remain engineering-only.

---

# 6. Tree Structure

EBOM supports unlimited hierarchy.

Example:

```
Robot

├── Body

├── Arm

│     ├── Motor
│     ├── Gear
│     └── Sensor

└── Controller
```

Use the same tree component used by MBOM where appropriate.

Avoid implementing two different hierarchy frameworks.

---

# 7. MES Console

Improve Item Revision Detail.

Current:

```
General
MBOM
Production Version
History
```

New:

```
General

EBOM

MBOM

Production Version

History
```

---

EBOM screen should mirror MBOM UI where possible.

Sections:

```
Header

Component Tree

Component List

Validation

Release
```

The user experience should remain consistent across EBOM and MBOM.

---

# 8. EBOM Line Editor

Create a simplified component editor.

Fields:

```
Component Revision
Parent
Quantity
UOM
Sequence
```

Do NOT expose:

```
Issue Operation

Substitutes

Scrap

Backflush

Phantom

Optional
```

This should feel like a lightweight version of MBOM.

---

# 9. Validation

EBOM Release Validation

Validate:

```
At least one line

Positive quantities

Released Component Revision

Released UOM

No circular references

Tree integrity

Duplicate sequence detection

Parent validity
```

Do NOT validate:

```
Routing

Workstations

Resources

Equipment

Capabilities

Production Standards
```

---

# 10. Relationship Between EBOM and MBOM

EBOM is the engineering baseline.

MBOM is the manufacturing implementation.

Do NOT automatically synchronise them.

Instead introduce:

```
Import from EBOM

Compare with EBOM

Engineering Differences
```

MBOM may:

- merge components
- split components
- introduce kits
- introduce manufacturing assemblies
- add substitutes
- add scrap

Example

Engineering

```
Housing

PCB

Motor
```

Manufacturing

```
Housing Kit

PCB Assembly

Motor
```

This is expected.

---

# 11. EBOM Diff

Provide an Engineering Comparison screen.

Highlight:

```
Added

Removed

Modified

Quantity Changed

Component Changed
```

Use a Git-style diff where appropriate.

This greatly improves Engineering / Manufacturing collaboration.

---

# 12. Production Version

Improve Production Version.

Current

```
Item Revision

MBOM

Routing
```

New

```
Item Revision

EBOM

MBOM

Routing

Site
```

Production Version becomes the frozen product definition.

At release time it snapshots:

```
Engineering Design

Manufacturing Design

Manufacturing Process
```

This becomes the authoritative production baseline.

---

# 13. Work Order

When a Work Order is created, snapshot:

```
Item Revision

Production Version

EBOM Version

MBOM Version

Routing Version
```

Execution still uses:

```
MBOM

Routing
```

EBOM is stored for traceability.

---

# 14. Traceability

Improve traceability.

Today:

```
WO

↓

MBOM

↓

Routing
```

New:

```
WO

↓

Production Version

├── Item Revision

├── EBOM

├── MBOM

└── Routing
```

Future investigations should answer:

```
What did Engineering design?

What did Manufacturing produce?

Which process was executed?
```

Example:

Engineering

```
Connector A
```

Manufacturing

```
Connector B

(Substitute)
```

The system must preserve both.

---

# 15. Lifecycle

Engineering Flow

```
Item Revision

↓

Create EBOM

↓

Validate

↓

Release
```

Manufacturing Flow

```
Released EBOM

↓

Review

↓

Create MBOM

↓

Validate

↓

Release
```

Production Flow

```
Released Item Revision

+

Released EBOM

+

Released MBOM

+

Released Routing

↓

Production Version

↓

Work Order

↓

Execution
```

---

# 16. Versioning

EBOM versioning must follow the same lifecycle principles as Item Revision and MBOM.

Support:

```
Draft

Released

Obsolete
```

Effective dates should use the same architecture:

```
effective_from

effective_to

[effective_from, effective_to)
```

Reuse the shared version management logic where possible.

---

# 17. Backend

Introduce:

```
Engineering BOM Aggregate
```

Services:

```
Create

Update

Release

Compare

Validate

Clone

New Version
```

Keep business rules separated from MBOM services.

Avoid sharing manufacturing validation logic.

---

# 18. APIs

Add APIs:

```
Create EBOM

Get EBOM

Update EBOM

Validate EBOM

Release EBOM

Compare EBOM MBOM

Import EBOM

Clone EBOM

Create New Version
```

Do not reuse MBOM endpoints.

---

# 19. Database

Introduce:

```
EBOM_HEADER

EBOM_LINE
```

Maintain:

```
Hierarchy

Optimistic Concurrency

Audit History

Version History
```

---

# 20. Documentation

Update product documentation.

New chapters:

```
Engineering BOM

Engineering Workflow

Engineering vs Manufacturing

EBOM Lifecycle

EBOM Validation

Production Version Architecture

Engineering Traceability
```

Update architecture diagrams.

Replace every statement implying:

```
MBOM = Product Structure
```

with:

```
Engineering Structure

↓

EBOM

Manufacturing Structure

↓

MBOM
```

---

# 21. AI_CONTEXT.md

Update AI_CONTEXT.md.

Document:

- EBOM bounded context
- relationship to Item Revision
- relationship to MBOM
- Production Version snapshots
- Traceability architecture
- lifecycle
- validation rules
- UI conventions
- backend aggregates
- API ownership
- documentation ownership

Future AI sessions must understand that:

```
EBOM

≠

MBOM
```

and must never merge their responsibilities.

---

# 22. Browser Verification

Verify:

✓ Create EBOM

✓ Add hierarchy

✓ Release EBOM

✓ Create MBOM independently

✓ Compare EBOM and MBOM

✓ Create Production Version

✓ Verify Production Version snapshots both EBOM and MBOM

✓ Create Work Order

✓ Verify Work Order snapshots:

```
Item Revision

EBOM

MBOM

Routing
```

Verify traceability can reconstruct:

```
Engineering Definition

↓

Manufacturing Definition

↓

Execution Definition
```

---

# Required Execution Order

```
1. Audit current architecture.
2. Introduce EBOM aggregate.
3. Implement database.
4. Implement backend services.
5. Implement APIs.
6. Implement Console UI.
7. Implement hierarchy editor.
8. Implement validation.
9. Implement release workflow.
10. Implement EBOM–MBOM comparison.
11. Integrate Production Version.
12. Integrate Work Order snapshots.
13. Integrate Traceability.
14. Update documentation.
15. Update AI_CONTEXT.md.
16. Execute browser verification.
17. Produce implementation report.
```

---

# Completion Criteria

The feature is NOT complete unless:

- EBOM exists as an independent engineering aggregate.
- Item Revision can own both EBOM and MBOM.
- EBOM and MBOM have clearly separated responsibilities.
- Production Version snapshots Item Revision, EBOM, MBOM, and Routing together.
- Work Orders snapshot the Production Version baseline including the EBOM reference.
- Traceability can reconstruct both the engineering definition and the manufacturing definition for any historical production.
- MES Console provides a consistent engineering workflow that mirrors MBOM where appropriate.
- Product documentation, architecture diagrams, API contracts, and AI_CONTEXT.md are updated and remain consistent with the implementation.
- Browser verification demonstrates the complete Engineering → Manufacturing → Production → Traceability lifecycle.
```