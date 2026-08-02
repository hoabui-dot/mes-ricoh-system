# Phase 10 — Build a Safe Full MES Reset and Deterministic Won Seal Tech Seed

## Objective

Create a safe, repeatable development/demo reset and seed workflow representing the verified final MES architecture, including two equivalent Production Lines.

## Safety requirements

The reset command must:

- refuse production and production-like environments;
- require `ALLOW_DESTRUCTIVE_SEED=true`;
- print target databases and environment before mutation;
- audit row counts before cleanup;
- use service-owned cleanup logic;
- delete in dependency order;
- never use cross-database foreign keys or distributed SQL transactions;
- preserve unrelated infrastructure configuration;
- fail immediately on unknown environment;
- produce pre-cleanup and post-cleanup reports.

## Cleanup scope

Reset disposable MES data for:

- MES Master Data;
- MES Execution;
- MES Traceability;
- MES Kiosk Gateway where applicable;
- MES-related projections that are explicitly disposable.

Do not delete WMS or QMS production data unless a separate explicitly approved reset contract exists.

Do not delete credentials, Keycloak realm configuration, Kafka platform configuration or printer runtime secrets.

## Seed scope

Create deterministic Won Seal Tech data containing:

### Organization

- Site/Plant;
- Production Area;
- Line 1;
- Line 2;
- Work Centers;
- Workstations;
- Shifts;
- Calendars.

### Resources

- Machine Definitions;
- Physical Machine Units;
- Machine Requirement Groups;
- Resource Assignments;
- Resource Capabilities;
- Production Standards;
- resource availability and capacity.

### Product definitions

Create multiple:

- Items;
- Item Revisions;
- material groups;
- UOMs;
- EBOMs where applicable;
- MBOMs;
- substitutes;
- Routings;
- Routing Operations;
- Production Versions;
- Production Version Line Eligibility.

### Main two-line product

Create one representative assembly product using:

- one Item Revision;
- one MBOM;
- one Routing;
- one Production Version;
- Line 1 as primary;
- Line 2 as backup;
- Binding;
- Test 5 in 1;
- Air Test;
- Packing.

### Traceability and print

Create only valid policy/template/master records owned by MES.

Do not duplicate printer ownership as MES Equipment when printer ownership belongs to Print Station.

### Workforce data

Seed current implemented employee, shift and skill structures.

Do not invent the proposed Auto Labor Assignment schema unless it has been implemented in an approved phase.

## Scenario profiles

Support deterministic scenario toggles or separate scripts for:

- all resources Ready;
- primary line capacity full;
- primary machine maintenance;
- primary assignment expired;
- backup line blocked;
- both lines blocked.

Do not make the default baseline invalid.

## Verification

After seed:

1. verify counts;
2. verify no orphan rows;
3. verify lifecycle/effectivity;
4. verify every released Production Version;
5. create a Work Order;
6. run line selection;
7. run Compute & Check;
8. commit resources;
9. approve;
10. verify selected line and snapshots;
11. run browser E2E smoke;
12. verify exact cleanup behavior.

## Commands

Expose maintained root commands such as:

- `npm run reset:seed:mes`
- `npm run seed:mes:won-seal-tech`
- `npm run verify:mes:seed`
- `npm run test:mes:two-line-flow`

Use the actual repository command naming conventions.

## Required reports

Create:

- `mes-system/process-expand/mes-enterprise/ai-report/phase-10/mes-full-reset-and-seed-YYYYMMDD.md`
- `artifacts/mes-seed-verification-YYYYMMDD.json`

## Completion gate

The phase passes only when reset, seed, verify and full Work Order resource planning flow succeed repeatedly from a clean environment.