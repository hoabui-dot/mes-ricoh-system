# Implement Won Seal Tech Machine Cleanup and Complete Seed Dataset

You are working inside the current MES codebase for **Won Seal Tech**.

Your task is to inspect the current Machine domain, database schema, APIs, seed conventions, and resource hierarchy, then implement a production-quality cleanup and seed script for the complete Machine domain.

Do not invent a new architecture. Follow the existing Machine Definition → Physical Machine Unit architecture already implemented in the codebase.

---

# 1. Inspect the Existing Architecture

Before writing any code, inspect and understand:

- Machine Definition (`md_equipment`)
- Physical Machine Unit (`md_machine_unit`)
- Machine Types / Equipment Types
- Work Centers
- Workstations
- Machine Requirement Groups
- Workstation Machine Requirements
- Resource Assignments
- Machine Skills
- Calendars
- Existing cleanup scripts
- Existing seed scripts
- Existing package.json conventions

Preserve the existing hierarchy:

```text
Site
  → Work Center
      → Workstation
          → Machine Requirements
          → Resource Assignments

Machine Definition
    → Physical Machine Units

WO Operation
    → Resource Allocation
```

Do not introduce a second ownership model.

---

# 2. Required Deliverables

Implement:

### A.

A cleanup script that removes the existing Won Seal Tech Machine demo dataset safely.

Suggested:

```text
scripts/cleanup-won-seal-tech-machines.ts
```

### B.

A complete seed script.

Suggested:

```text
scripts/seed-won-seal-tech-machines.ts
```

### C.

Add root package.json commands:

```json
{
  "scripts": {
    "machines:cleanup": "...",
    "machines:seed": "...",
    "machines:reset": "..."
  }
}
```

where

```text
machines:reset

=

cleanup
→ seed
→ verification
```

Follow the existing repository conventions.

---

# 3. Cleanup Rules

The cleanup must:

- remove only Won Seal Tech Machine seed data;
- preserve historical execution data;
- preserve Work Orders;
- preserve immutable history;
- end effective Resource Assignments correctly;
- remove seeded Machine Units;
- remove seeded Machine Definitions;
- remove seeded Machine Groups;
- remove seeded Machine Requirements;
- remove seeded Assignments;
- keep unrelated production data untouched.

The script must be idempotent.

Running cleanup multiple times must always succeed.

---

# 4. Complete Won Seal Tech Machine Dataset

Create a realistic manufacturing dataset for Won Seal Tech.

The generated dataset must represent the entire sealing manufacturing process.

Include realistic Machine Definitions and Physical Machine Units for:

- Raw Material Preparation
- Mixing
- Milling
- Preforming
- Compression Molding
- Injection Molding
- Transfer Molding (if supported)
- Vulcanization
- Post-Curing
- Deflashing
- Trimming
- Washing
- Drying
- Inspection
- Leak Testing (if supported)
- Packaging

Reuse existing Operations, Work Centers, Workstations, Skills and Calendars whenever possible.

Do not create invalid references.

---

# 5. Machine Definition Rules

Each Machine Definition represents one machine family.

Populate:

- localized name
- description
- manufacturer
- model
- equipment type
- default efficiency
- lifecycle
- planning policy
- technical specification

Do NOT store:

- physical serial numbers
- physical execution status
- physical availability
- current workstation

Those belong to Physical Machine Units.

---

# 6. Physical Machine Units

Generate approximately:

```text
35–50 Physical Machine Units
```

distributed across multiple Machine Definitions.

Each unit must have:

- unique asset code
- unique serial number
- lifecycle
- execution status
- planning eligibility
- current assignment (where appropriate)

Create realistic diversity:

- different models
- different capacities
- backup machines
- maintenance machines
- inactive machines
- obsolete examples
- shared equipment
- dedicated equipment

Do not generate identical records.

---

# 7. Machine Groups

Create meaningful Machine Groups representing interchangeable resources.

Examples:

- Internal Mixers
- Compression Presses
- Injection Machines
- Post Cure Ovens
- Deflashing Machines
- Packaging Machines

Follow the existing replacement/effectivity semantics.

---

# 8. Workstation Requirements

Connect Machine Groups and Machine Definitions to existing Workstations.

Create realistic requirements such as:

Mixing Workstation

- Internal Mixer ×1
- Cooling Line ×1

Compression Workstation

- Compression Press ×1

Inspection Workstation

- Visual Inspection Machine ×1

Do not directly pin every requirement to one Physical Machine Unit unless required by the current business rules.

---

# 9. Resource Assignments

Create effective Resource Assignments between Physical Machine Units and Workstations.

Respect:

- Site
- Work Center
- Workstation
- effectivity
- lifecycle
- uniqueness

Do not create duplicate active assignments.

Do not store Machine IDs directly inside Workstation.

---

# 10. Verification

After seeding, verify:

- Machine Definitions exist.
- Physical Machine Units exist.
- All serial numbers are unique.
- Asset codes are unique.
- Machine Groups are valid.
- Requirements are valid.
- Assignments are valid.
- Workstation relationships are correct.
- No duplicate effective assignments exist.
- Machine list loads.
- Machine detail loads.
- Physical Machine Unit list loads.
- Resource Assignment list loads.

Print a readable verification report.

Exit non-zero on failure.

---

# 11. Logging

Display progress such as:

```text
[1/7] Cleaning existing Machine dataset
[2/7] Creating Machine Definitions
[3/7] Creating Physical Machine Units
[4/7] Creating Machine Groups
[5/7] Creating Workstation Requirements
[6/7] Creating Resource Assignments
[7/7] Running verification
```

Finally print:

- Machine Definitions created
- Physical Units created
- Machine Groups created
- Requirements created
- Assignments created
- Verification result

---

# 12. Documentation

Create:

```text
docs/demo/won-seal-tech-machine-seed.md
```

Document:

- purpose
- generated Machine Definitions
- generated Physical Machine Units
- Machine Groups
- Workstation mapping
- Assignment rules
- cleanup behavior
- package.json commands
- verification steps

Keep the document concise.

---

# 13. Final Verification

Run:

```bash
npm run machines:reset
npm run typecheck
npm run build
```

Verify the seeded dataset from the running MES Console.

The implementation is complete only when cleanup, seed, package.json commands, verification, logging, idempotency, documentation, and browser validation all succeed.