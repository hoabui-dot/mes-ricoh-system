# Task — Perform a Safe Full MES Data Reset, Rebuild the Canonical Seed Dataset, and Verify All Current Full Flows

You are working inside the existing S-Factory MES enterprise microservice repository.

The previous implementation phases are complete, but the current MES Docker Compose environment still contains old, mixed, historical, demo, partially migrated, or manually created MES data.

Before executing the final Vietnamese MES Console two-line UAT scenario, perform a complete controlled reset of all MES-owned business data, seed a new deterministic dataset that matches the current verified domain model, and run all maintained full-flow verification suites against the newly seeded data.

This task includes:

1. inspecting the currently running Docker Compose environment;
2. determining all MES-owned databases, projections, caches, and disposable runtime data;
3. safely deleting all MES business data in the allowed environment;
4. preserving infrastructure, credentials, schemas, migrations, and non-MES systems;
5. seeding a complete canonical MES dataset;
6. verifying database integrity;
7. running current API full flows;
8. running current MES Console browser E2E flows;
9. running the completed two-line Resource Planning flow;
10. fixing seed, migration, or implementation defects until every mandatory verification passes.

Do not begin the final manual UAT scenario until this task has passed.

---

# Primary Objective

Produce a clean and deterministic MES environment where all seeded data:

- matches the current codebase;
- matches the current database migrations;
- respects service ownership;
- follows the verified MES domain model;
- supports the current one-line Resource Planning flow;
- supports the completed two-production-line flow;
- supports Work Order creation from Production Version;
- supports Compute & Check;
- supports complete resource allocation;
- supports primary-to-backup line fallback;
- supports strict Work Order approval;
- supports execution start guards;
- supports current MES Console UI flows;
- can be recreated repeatedly from an empty MES environment.

The final result must not depend on old manually created data.

---

# Required Safety Model

This is a destructive task.

The reset must only run in an explicitly approved disposable environment.

## Mandatory guards

Require all applicable guards, including:

```text
MES_ENV=development | test | uat
ALLOW_DESTRUCTIVE_SEED=true
ALLOW_MES_FULL_RESET=true
```

Use the current repository naming conventions when equivalent guards already exist.

The reset must refuse execution when any of the following is true:

- environment is production;
- environment name is missing or ambiguous;
- database host is not explicitly approved;
- database name does not match an allowed MES database;
- target database points to a production-like host;
- destructive guards are missing;
- operator confirmation or required flag is absent;
- the current Compose project cannot be identified;
- ownership of a target database is unclear.

Do not provide an interactive prompt as the only protection.

The script must fail closed.

---

# Source Precedence

Use this order:

1. Running Docker Compose state.
2. Current source code.
3. Database migrations and schema.
4. Service manifests.
5. Docker Compose files.
6. Environment files and runtime variables.
7. Current seed/reset scripts.
8. Current API tests.
9. Current browser E2E tests.
10. Approved phase reports.
11. AI context and AI documentation.
12. Product documentation.

When source, migration, seed, and documentation conflict, report the conflict and make the seed conform to the running source and migrations.

Never weaken the source implementation to preserve obsolete seed data.

---

# Required Output Artifacts

Create or update:

```text
scripts/reset-mes-all-data.mjs
scripts/seed-mes-canonical-dataset.mjs
scripts/verify-mes-canonical-seed.mjs
scripts/test-mes-canonical-full-flow.mjs
```

Reuse or extend existing maintained scripts when that is safer than creating duplicates.

Add or update root commands similar to:

```text
npm run reset:mes:all-data
npm run seed:mes:canonical
npm run verify:mes:canonical-seed
npm run reset:seed:verify:mes:canonical
npm run test:mes:canonical-full-flow
```

Use actual repository command conventions.

Create reports:

```text
implementation-fix/mes-full-reset-audit-YYYYMMDD.md
implementation-fix/mes-canonical-seed-design-YYYYMMDD.md
implementation-fix/mes-canonical-seed-verification-YYYYMMDD.md
implementation-fix/mes-post-reset-full-flow-verification-YYYYMMDD.md
```

Create machine-readable artifacts:

```text
artifacts/mes-canonical-reset/<run-id>/pre-reset-inventory.json
artifacts/mes-canonical-reset/<run-id>/reset-result.json
artifacts/mes-canonical-reset/<run-id>/seed-result.json
artifacts/mes-canonical-reset/<run-id>/verification-result.json
artifacts/mes-canonical-reset/<run-id>/full-flow-result.json
```

---

# Phase A — Inspect the Current Docker Compose Environment

Before deleting any data, inspect the actual running environment.

## Required inspection

Identify:

- active Docker Compose projects;
- active Compose files;
- running MES containers;
- service names;
- container names;
- image versions;
- health status;
- networks;
- volumes;
- ports;
- database hosts;
- database names;
- database users;
- migration versions;
- Kafka brokers;
- Schema Registry;
- Redis instances;
- MES Console URL;
- Kong URL;
- Keycloak URL;
- current seed-related environment flags.

Inspect at least:

- MES Master Data Service;
- MES Execution Service;
- MES Traceability Service;
- MES Kiosk Gateway Service;
- MES Console;
- Kiosk Operator UI if MES-owned;
- MES-owned PostgreSQL databases;
- MES-owned Redis/cache data if applicable;
- MES-owned Kafka projections or consumer state only where explicitly disposable;
- MES-owned print master data, but not physical printer runtime ownership unless explicitly approved.

## Required pre-reset report

Create a table:

| Component | Container | Database/Store | Owner | Data classification | Reset? | Reason |
|---|---|---|---|---|---|---|

Use these reset classifications:

- `RESET_REQUIRED`
- `RESET_OPTIONAL`
- `PRESERVE`
- `UNKNOWN_REQUIRES_CONFIRMATION`

Do not delete any component marked unknown.

---

# Phase B — Define the Exact Reset Boundary

The task is to delete all MES business data, not all platform data.

## MES-owned data expected to be in scope

Inspect and confirm current ownership for:

### MES Master Data

- Site;
- Shopfloor;
- Production Area;
- Production Line;
- Work Center;
- Workstation;
- Equipment/Machine Definition;
- Physical Machine Unit;
- Machine Requirement;
- Machine Group;
- Resource Assignment;
- Resource Capability;
- Resource Calendar;
- Shift;
- Work Calendar;
- Production Standard;
- Employee;
- Skill;
- Employee Skill;
- Operation Skill Requirement;
- UOM;
- Material Group;
- Item;
- Item Revision;
- EBOM;
- MBOM;
- substitutes;
- Operation;
- Routing;
- Routing Operation;
- Production Version;
- Production Version Line Eligibility;
- MES print-station master-data bindings;
- MES master-data outbox;
- audit/history rows that are disposable in the approved environment.

### MES Execution

- Work Order creation workflows;
- Work Orders;
- Work Order Operations;
- Work Order material snapshots;
- resource allocations;
- capacity reservations;
- allocation audit;
- allocation idempotency rows;
- approval logs;
- execution sessions;
- operation confirmations;
- material projections;
- print jobs;
- print attempts;
- print result events;
- execution outbox;
- execution read models populated from MES master data;
- disposable numbering sequences where reset is required.

### MES Traceability

- policies when included in the canonical MES seed;
- numbering rules;
- QR split rules;
- label templates owned by MES Traceability;
- label instances;
- genealogy;
- traceability projections;
- traceability outbox;
- disposable numbering state.

### MES Kiosk Gateway

- terminal registrations if disposable;
- terminal sessions;
- terminal state;
- kiosk projections;
- WebSocket/session data.

## Explicitly out of scope unless separately approved

Preserve:

- Keycloak realm and users;
- Kong configuration;
- Kafka cluster configuration;
- Schema Registry infrastructure;
- Docker images;
- Docker Compose definitions;
- database schemas and migrations;
- platform observability;
- WMS business data;
- QMS business data;
- printer credentials;
- physical printer configuration;
- remote Printer Adapter identity;
- production secrets;
- unrelated platform data.

Do not delete WMS or QMS data merely because MES references their IDs.

---

# Phase C — Pre-Reset Audit

Before deleting data, generate an exact inventory.

## Required evidence

For every MES-owned table, capture:

- service owner;
- database;
- schema;
- table;
- row count;
- lifecycle/status distribution;
- minimum and maximum timestamps;
- foreign-key dependencies;
- references from other MES tables;
- whether the table is safe to truncate;
- whether deletion must be ordered;
- whether sequences must be reset;
- whether data must be preserved for infrastructure operation.

Create a dependency graph.

Use migrations and database metadata.

Do not assume prefix alone proves ownership.

## Required pre-reset checks

- confirm all target databases are disposable;
- confirm no production-like hostname;
- confirm no unresolved ownership;
- confirm current migration state;
- confirm no active production Work Order;
- confirm no external test currently running;
- confirm no uncommitted reset or seed process;
- confirm target row counts are recorded.

---

# Phase D — Implement the Full MES Reset

Implement a safe reset process.

## Reset strategy

Prefer:

- transaction per service-owned database where practical;
- child-first deletion;
- explicit table allowlist;
- service-owned database connection;
- exact table order;
- post-delete verification;
- sequence reset only when deterministic business numbering requires it.

Do not use:

- database-wide `DROP DATABASE`;
- schema drop and recreate;
- unbounded wildcard table deletion;
- cross-database transaction;
- direct deletion from WMS/QMS;
- destructive Kafka cluster reset;
- removal of migrations.

## Required reset behavior

For each service:

1. connect to its own database;
2. validate database identity;
3. verify migration tables;
4. print intended target tables;
5. start guarded reset;
6. delete child rows before parents;
7. reset approved sequences;
8. preserve migrations;
9. preserve required configuration rows;
10. verify target row count is zero;
11. commit;
12. write structured result.

If a reset step fails:

- stop immediately;
- preserve logs;
- do not continue to seed;
- report exact database and table;
- do not partially claim success.

## Outbox and consumer state

Reset MES-owned outbox rows only when the environment is disposable.

Document whether Kafka topics still contain old events.

If old MES events in Kafka can repopulate projections after reset:

- stop affected consumers before reset;
- reset only explicitly approved consumer groups or use new deterministic consumer groups;
- or rebuild projections using a controlled strategy.

Do not delete arbitrary Kafka topics.

Do not reset shared consumer groups without confirming ownership.

---

# Phase E — Design the Canonical Seed Dataset

The seed must match the final current domain model after all implementation phases.

## Seed principles

The canonical seed must be:

- deterministic;
- rerunnable;
- idempotent where possible;
- complete;
- internally consistent;
- lifecycle-valid;
- effectivity-valid;
- testable;
- suitable for MES Console UAT;
- safe for repeated reset and seed;
- independent from old database state.

Use deterministic business-code namespaces.

Do not rely on generated database ordering.

## Required factory hierarchy

Seed a realistic Won Seal Tech structure, including at minimum:

```text
Plant / Site
  → Production Area
    → Production Line 1
      → required Work Centers
        → Workstations
          → Equipment / Machine Units
    → Production Line 2
      → required Work Centers
        → Workstations
          → Equipment / Machine Units
```

For the representative two-line assembly flow, include:

- Binding;
- Test 5 in 1;
- Air Test;
- Packing.

Create the exact number of Work Centers and Workstations required by the implemented model.

## Required two-line semantics

Seed:

- one Primary Line;
- one Backup Line;
- equivalent technical process;
- separate physical resources;
- one complete resource chain per line;
- Production Version Line Eligibility;
- primary priority;
- backup priority;
- line effectivity;
- line readiness.

Ensure:

- one Routing is shared;
- one MBOM is shared;
- one Production Version is shared;
- Work Center/Workstation/Equipment differ per line;
- no resource is accidentally assigned to both lines in a conflicting effective period.

---

# Phase F — Seed the Resource Model

Seed all currently required Resource Planning inputs.

At minimum:

- active/effective Site;
- Production Area;
- Production Lines;
- Work Centers;
- Workstations;
- Machine Definitions;
- identified Physical Machine Units;
- Machine Requirement Groups;
- primary machine requirements;
- optional supporting requirements where useful;
- effective Resource Assignments;
- Resource Capabilities;
- Resource Calendars;
- Shifts;
- Work Calendar;
- Production Standards;
- planning eligibility;
- operational status;
- capacity;
- efficiency;
- row versions;
- lifecycle status.

The default canonical fixture must be fully Ready.

Do not seed maintenance, expired, or blocked resources into the default Ready baseline.

Create separate deterministic scenario-mutator helpers for:

- primary line capacity full;
- primary machine maintenance;
- primary assignment expired;
- primary calendar unavailable;
- primary production standard missing;
- backup line blocked;
- both lines blocked;
- stale candidate;
- cross-site mismatch.

These scenario helpers must restore the original fixture.

---

# Phase G — Seed Product Definition

Create a complete and realistic product catalog.

## Required content

Seed multiple examples:

- Finished Goods;
- Semi-Finished Goods;
- Raw Materials;
- Packaging Materials;
- Label Materials where currently modeled;
- material groups;
- UOMs;
- fractional and non-fractional UOM examples;
- lot-tracked items;
- serial-tracked items;
- non-tracked packaging items;
- active, draft, obsolete, and future-effective examples.

## Main representative product

Create a canonical two-line product with:

- Item;
- released Item Revision;
- optional EBOM baseline;
- released MBOM;
- MBOM lines;
- operation-material mappings;
- substitutes where supported;
- released Routing;
- Routing Operations;
- predecessors;
- operation times;
- skill requirements where currently implemented;
- quality/traceability/print flags where currently implemented;
- released Production Version;
- Production Version Line Eligibility for both lines.

Ensure ownership equality:

```text
ProductionVersion.item_revision_id
= MBOM.item_revision_id
= Routing.item_revision_id
= EBOM.item_revision_id when EBOM is selected
```

Do not use EBOM lines to create Work Order material requirements.

---

# Phase H — Seed Labor and Skills Only to the Current Implemented Scope

Seed current implemented labor structures:

- Employees;
- Skills;
- Employee Skills;
- Employee Shift Schedules;
- Operation Skill Requirements;
- Work Center headcount context where currently implemented.

Do not invent or seed unimplemented concepts such as:

- Shopfloor Check-in Point;
- Labor Availability Session;
- Employee Equipment Authorization;
- Labor Auto Assignment Policy;
- Job Labor Demand;
- Job Labor Assignment;

unless these were actually implemented in the completed phases and proven by source/migrations.

Mark unsupported labor features separately.

---

# Phase I — Seed Traceability and Printing Data

Seed only implemented MES-owned traceability and print master data.

At minimum, where supported:

- traceability policy;
- numbering rule;
- QR policy;
- label template metadata;
- split rule;
- print-station master definition;
- Workstation binding;
- label quantity inputs;
- printer/template references needed for strict approval.

Do not duplicate physical printer ownership in MES Equipment.

Do not hardcode runtime Adapter IPs, printer IPs, Kafka brokers, or credentials in seed data.

Physical printer readiness may remain environment-dependent.

The default seed must distinguish:

```text
MES print master-data readiness
```

from:

```text
real physical printer readiness
```

---

# Phase J — Seed Data Through the Correct Ownership Path

Prefer seed creation through current APIs when:

- lifecycle validation matters;
- business code generation matters;
- outbox generation matters;
- relationship replacement semantics matter;
- release workflow matters.

Use direct database inserts only when:

- no supported API exists;
- the table is implementation-internal;
- insertion is deterministic and validated;
- ownership remains local;
- the reason is documented.

Do not bypass release validation to create invalid Released records.

When using APIs:

- create Draft;
- configure dependencies;
- validate;
- release;
- verify outbox/read models.

When using direct inserts:

- execute within the owning database;
- use exact migrations/schema;
- preserve constraints;
- document why API use was impossible.

---

# Phase K — Rebuild Projections and Read Models

After master-data seeding:

- start or confirm outbox relays;
- publish current master-data events;
- allow MES Execution read models to synchronize;
- verify `rm_*` tables;
- verify no duplicate projections;
- verify event idempotency;
- verify required Production Version appears in execution readiness APIs.

Do not create execution read models by directly copying cross-service database rows unless the current architecture explicitly uses a controlled rebuild mechanism.

If event delivery is asynchronous:

- poll with timeout;
- show progress;
- fail if projections do not converge;
- record correlation and event IDs.

---

# Phase L — Canonical Seed Verification

Create `scripts/verify-mes-canonical-seed.mjs`.

The verifier must be read-only.

## Verify hierarchy

- exactly expected Sites;
- correct Areas;
- both Production Lines;
- correct Work Center ownership;
- correct Workstation ownership;
- no cross-line hierarchy mismatch.

## Verify resource readiness

For every required operation and each line:

- Work Center exists;
- Workstation exists;
- primary requirement exists;
- assignment is effective;
- Machine Unit is identified;
- Machine Unit is planning eligible;
- Machine Unit is Available;
- calendar is valid;
- shift is valid;
- production standard is valid;
- capability is valid;
- quantity/capacity is sufficient.

## Verify product definition

- Item Revision is released/effective;
- MBOM is released/effective;
- Routing is released/effective;
- Production Version is released/effective;
- ownership matches;
- Routing has expected operation count;
- MBOM lines map correctly;
- EBOM is not used as manufacturing material authority;
- both line eligibility rows exist;
- exactly one primary line exists;
- priorities are deterministic.

## Verify integrity

- no orphan rows;
- no duplicate business codes;
- no duplicate active Resource Assignment;
- no overlapping Machine Unit assignment;
- no invalid effectivity;
- no dangling foreign keys;
- no Released record missing dependencies;
- no stale read model;
- no unexpected Work Orders after seed unless an explicit verification WO is created and cleaned.

---

# Phase M — Run the Current One-Line Resource Planning Full Flow

Run the maintained verified flow against the new seed.

At minimum run:

```text
npm run test:mes:resource-planning-domain:phase1
npm run test:mes:resource-planning-full-flow:phase2
```

Use actual maintained commands.

Required result:

- all negative resource scenarios pass;
- normal flow passes;
- no skipped scenario;
- strict approval passes;
- execution start passes;
- exact cleanup passes;
- all test fixture mutations restore successfully.

The new seed must not require old manual records.

---

# Phase N — Run the Two-Line API Full Flow

Run or create the maintained two-line full-flow test.

Required scenarios:

1. Primary line Ready.
2. Primary line selected.
3. All operations allocated inside Primary Line.
4. Primary line capacity full.
5. Backup line selected.
6. Primary machine maintenance.
7. Backup line selected.
8. Both lines blocked.
9. Work Order enters safe hold/blocked state.
10. Mixed-line commit rejected.
11. Stale candidate rejected.
12. Replan before Release.
13. Change-line policy after Release but before Start.
14. Change-line after Start rejected.
15. Concurrent WOs compete for Primary capacity.
16. Second WO falls back to Backup where policy allows.
17. Historical Work Order retains line snapshot.
18. New Work Order uses changed eligibility.
19. Exact cleanup.
20. Fixture restoration.

Verify:

- selected line snapshot;
- operation line consistency;
- resource allocation;
- capacity reservation;
- audit;
- outbox;
- idempotency;
- row version;
- approval;
- execution guard.

---

# Phase O — Run MES Console Browser E2E

Run the maintained MES Console suites against the new seed.

At minimum include:

- real Keycloak login;
- Work Order creation;
- async workflow;
- Compute & Check;
- line readiness display;
- candidate display;
- resource commit;
- refresh persistence;
- fallback display;
- both-lines-blocked display;
- mixed-line protection;
- approval;
- execution start;
- logout/login persistence;
- authorization;
- cross-site denial;
- translated errors;
- no raw UUID;
- no raw enum;
- exact cleanup.

Run all maintained commands, including applicable:

```text
npm run test:e2e:machine:all
npm run test:e2e:resource-planning:all
npm run test:e2e:resource-planning:concurrency
npm run test:e2e:resource-planning:numbering
npm run test:e2e:all
npm run test:e2e:regression
```

Add the two-line E2E command when implemented.

No mandatory test may be skipped because of missing test credentials.

---

# Phase P — Run Product Definition Regression

Verify through API and UI:

- Item creation/readiness;
- Item Revision lifecycle;
- EBOM;
- MBOM;
- Routing;
- Routing Operations;
- Production Version;
- line eligibility;
- old snapshot stability;
- new version behavior.

Confirm the seed can support:

```text
Item Revision
→ MBOM
→ Routing
→ Production Version
→ Work Order
→ Line Selection
→ Resource Planning
```

without manually patching the database after seed.

---

# Phase Q — Verify Database State After Tests

After all tests:

- remove exact disposable Work Orders;
- remove exact test-created allocations and reservations;
- restore scenario mutations;
- preserve canonical seed data;
- verify no orphan rows;
- verify no active leaked reservations;
- verify no stale test sessions;
- verify no temporary print jobs unless explicitly retained;
- verify no failed workflow rows from expected successful tests;
- verify canonical seed remains Ready.

Provide final row-count comparison:

| Area | After seed | After tests | Expected |
|---|---:|---:|---:|

Any unexpected difference must fail the task.

---

# Mandatory Full-Flow Gate

The reset and seed task passes only when all of the following are true:

- Docker Compose environment was inspected;
- reset boundary was explicit;
- destructive guards worked;
- all targeted MES business data was removed;
- non-MES systems were preserved;
- migrations were preserved;
- canonical seed completed;
- seed verifier passed;
- one-line Resource Planning API flow passed;
- Phase 1 negative matrix passed;
- Phase 2 full API flow passed;
- two-line API flow passed;
- MES Console E2E passed;
- authorization passed;
- concurrency passed;
- numbering passed;
- snapshot regression passed;
- exact cleanup passed;
- canonical seed remained valid after testing;
- no mandatory test was skipped;
- no manual database patch was required after seeding;
- all reports and artifacts were written.

---

# Failure Handling

If any step fails:

1. stop the current stage;
2. preserve logs and artifacts;
3. identify whether the defect is in:
   - reset logic;
   - seed logic;
   - migration;
   - source implementation;
   - event synchronization;
   - test fixture;
   - runtime environment;
   - authorization;
   - documentation;
4. fix the defect in the same task;
5. rerun the failed stage;
6. rerun all affected downstream tests;
7. update reports;
8. do not declare completion until the full gate passes.

Do not:

- disable a failing validation;
- remove a failing test;
- convert a failure to a skip;
- manually patch data without updating the seed;
- keep hidden dependencies on old records;
- proceed to final UAT with a partially valid seed.

---

# Required Final Report

Create:

```text
implementation-fix/mes-canonical-reset-seed-final-report-YYYYMMDD.md
```

The report must include:

## Environment

- Compose project;
- Compose files;
- Git commit SHA;
- runtime versions;
- database names;
- migration versions;
- seed version;
- run ID.

## Reset

- databases reset;
- tables reset;
- pre-reset counts;
- post-reset counts;
- preserved components;
- safety guards;
- duration;
- errors.

## Seed

- entities created by type;
- business codes;
- both Production Lines;
- resource counts;
- Item counts;
- revision counts;
- EBOM/MBOM/Routing counts;
- Production Version counts;
- line eligibility counts;
- traceability/print data;
- labor data;
- read-model synchronization.

## Verification

- seed verifier;
- one-line API flow;
- negative resource matrix;
- Phase 2 full API flow;
- two-line API flow;
- browser E2E;
- concurrency;
- authorization;
- numbering;
- snapshot regression;
- cleanup.

## Exact results

Use:

```text
declared
executed
passed
failed
skipped
```

## Remaining limitations

Clearly separate:

- WMS material readiness;
- physical Print Station readiness;
- real printer acceptance;
- QMS integration;
- automatic labor assignment;
- IIoT;
- any other out-of-scope capability.

## Final status

Use exactly one:

```text
PASS_READY_FOR_TWO_LINE_UAT
PASS_WITH_ACCEPTED_EXTERNAL_LIMITATIONS
FAILED_RESET
FAILED_SEED
FAILED_VERIFICATION
BLOCKED_BY_ENVIRONMENT
BLOCKED_BY_PRODUCT_DECISION
```

The final Vietnamese MES Console two-line UAT scenario may begin only when the final status is:

```text
PASS_READY_FOR_TWO_LINE_UAT
```

or an explicitly approved:

```text
PASS_WITH_ACCEPTED_EXTERNAL_LIMITATIONS
```

External limitations must not include a broken MES seed, failed Resource Planning, failed two-line selection, failed authorization, or failed MES Console E2E.