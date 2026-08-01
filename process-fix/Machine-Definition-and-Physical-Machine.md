Audit and complete the Machine Definition / Physical Machine Unit architecture across MES Console, backend APIs, verification scripts, package.json, seed/cleanup tooling, and documentation.

Do not treat the current implementation report as proof that the UI is correct. Inspect the running form, current source code, API contracts, schema, migrations, and actual persisted data before changing anything.

# 1. Correct the Machine Definition Create/Edit form

The current Machine Create form still mixes Machine Definition fields with Physical Machine Unit fields.

The authoritative model is:

```text
Machine Definition (`md_equipment`)
  = shared technical/catalog definition

Physical Machine Unit (`md_machine_unit`)
  = one identifiable physical machine

Resource Assignment (`md_resource_assignment`)
  = effective placement of one physical unit at a Workstation

WO Resource Allocation
  = unit committed to a WO Operation and time window

The Machine Definition form must contain only shared definition fields:

localized name;
generated business code;
Site;
Equipment/Machine type;
localized description;
manufacturer;
model;
rated capacity or technical specification where supported;
default efficiency;
resource skills;
catalog lifecycle;
optional policy: Allow physical units of this definition in planning.

Remove from the canonical Machine Definition form:

physical serial number;
authoritative physical quantity;
physical execution status;
individual-unit availability;
current physical Workstation assignment;
generic Active toggle that may be interpreted as disabling the whole fleet.

If the existing quantity field must remain for compatibility, rename it to:

Expected Unit Count

Explain that it is informational only and that actual quantity is derived from active Physical Machine Units.

Do not use it in readiness, assignment, availability, reservation, or Work Order allocation logic.

If md_equipment.execution_status and serial_number must remain in the database, mark them deprecated and stop sending them from new MES Console forms.

2. Physical Machine Unit workflow

After a Machine Definition is created, redirect to or expose its detail page.

The detail page must contain a Physical Machine Units section with:

Add Unit;
Bulk Import Units;
unit code / asset code;
serial number;
physical identity status;
lifecycle;
execution status;
planning eligibility;
current Work Center;
current Workstation;
effective assignment;
reservation/allocation summary;
readiness;
actions.

Operational actions belong to each physical unit:

Set Available;
Set Maintenance;
Set Out of Service;
Activate;
Retire;
Move Assignment;
End Assignment;
View History.

Updating one unit must never change other units of the same Machine Definition.

3. Definition lifecycle and destructive actions

Machine Definition lifecycle controls catalog usage only.

Use clear actions such as:

Release Definition;
Prevent New Requirements;
Mark Obsolete;
View Dependency Impact.

Marking a Definition Obsolete must not cascade to existing Physical Machine Units.

Remove unconditional Delete and Deactivate actions from Machine Definition rows.

Physical deletion is allowed only when there are no:

Physical Machine Units;
Workstation requirements;
machine groups;
assignments;
capabilities;
calendars;
production standards;
Work Order references;
historical dependencies.

Backend validation remains authoritative.

4. Machine list projection

Redesign the Machine Definition list to show derived unit summaries instead of aggregate execution status.

Show:

definition name/code;
Site;
type/model;
total units;
identified units;
pending-identification units;
available units;
assigned units;
reserved units;
maintenance units;
out-of-service units;
planning-eligible units;
catalog lifecycle.

Do not show one aggregate Available, Blocked, or execution status as though it represents every physical unit.

If a summary readiness badge remains, it must be read-only, derived, and accompanied by counts or reasons.

The backend list endpoint must return the summary projection without frontend N+1 requests.

5. Full Machine flow verification script

Create one canonical automated verification script:

scripts/test-mes-machine-flow.mjs

Add a root package.json command:

{
  "scripts": {
    "test:mes:machine-flow": "node scripts/test-mes-machine-flow.mjs"
  }
}

The script must use the running public/internal APIs and print a clear result for every use case.

It must test at least:

Create a disposable Machine Definition.
Verify Definition response does not use aggregate serial or execution status as physical identity.
Create three Physical Machine Units with distinct serial numbers.
Reject duplicate asset code.
Reject duplicate serial number.
Verify unit counts and derived summaries.
Change one unit to Maintenance and confirm other units are unchanged.
Confirm Maintenance unit is not planning eligible.
Create or resolve a Workstation machine requirement for the Definition.
Assign one concrete Physical Machine Unit to a Workstation.
Reject conflicting active assignment of the same unit.
Verify effective assignment appears on Machine and Workstation detail.
Verify Workstation Machine Readiness uses identified physical units.
End or move the assignment and verify history is preserved.
Confirm a pending/unidentified unit cannot be assigned or selected.
Confirm a Definition with an expected quantity but insufficient physical units is not treated as physically ready.
Where controlled fixture data permits, verify candidate/resource planning returns concrete unit IDs.
Verify Definition Obsolete does not alter existing unit execution states.
Verify Definition delete is blocked while dependencies exist.
Clean up all disposable test records child-first.

For every use case, log:

[START] use-case code and description
[PASS] expected status and important returned values
[FAIL] expected vs actual response
[SKIP] reason when an external dependency is intentionally unavailable

At the end print a summary:

Total
Passed
Failed
Skipped
Cleanup result
Created IDs
Duration

Exit with a non-zero code when any required use case fails.

The script must:

use unique business identifiers;
be rerunnable;
avoid modifying real production records;
perform child-first cleanup in finally;
support configurable base URLs and credentials through existing environment variables;
never silently pass a use case because an API returned HTTP 200;
validate response bodies, ownership, status, counts, and history.
6. Root package.json cleanup

Audit the root package.json.

Keep only the intentionally supported root commands:

total development/demo cleanup;
total seed data;
Cloudflare URL/tunnel command;
platform build command;
test:mes:machine-flow.

Use clear canonical names, for example:

{
  "scripts": {
    "cleanup:mes:data": "...",
    "seed:mes:data": "...",
    "cloudflare:url": "...",
    "build": "...",
    "test:mes:machine-flow": "node scripts/test-mes-machine-flow.mjs"
  }
}

Use the existing canonical names where callers or documentation already depend on them.

Before deleting any command:

search the entire repository for references;
inspect CI, Docker, documentation, Makefiles, shell scripts and workspace commands;
do not remove service-level package scripts required to build or start individual services;
restrict this cleanup to obsolete root orchestration and verification commands unless a service script is proven unused.

Delete obsolete root script entries and their related script files only after proving they have no remaining consumers.

Do not delete:

migration files;
canonical seed/cleanup implementations;
scripts used by Docker or CI;
workspace lifecycle commands;
utilities imported by retained scripts.

Update all remaining documentation and callers to the retained commands.

7. Seed and cleanup behavior

The total seed command must create a deterministic valid resource hierarchy including:

Site
Work Center
Workstations
Machine Definitions
identified Physical Machine Units
Machine Requirements
effective Resource Assignments
Capabilities
Calendars
Production Standards

The total cleanup command must delete only owned disposable fixture data, child-first, without broad prefix deletion of unrelated business data.

The Machine verification script may create its own disposable fixture, but it must reuse the canonical seed context when appropriate and must always clean up what it owns.

8. Vietnamese note document

Create:

product-doc/VI-MES-SCRIPTS-NOTE.md

Keep it brief and practical.

Document:

the purpose of each retained root package.json command;
when to use cleanup;
when to use seed;
how to start or retrieve the Cloudflare URL;
how to build;
how to run test:mes:machine-flow;
required environment variables;
warning that cleanup affects fixture/demo data;
expected PASS/FAIL/SKIP output;
where to inspect failures.

Do not turn the note into an implementation history or changelog.

9. Documentation updates

Update the authoritative sections of:

AI_CONTEXT.md;
UI_AI_CONTEXT.md;
database ERD/relationship documentation;
API documentation.

Remove outdated claims that Machine Definition owns physical serial number, physical execution status, or authoritative quantity.

Do not append dated fix logs. Merge valid rules into the canonical domain sections.

10. Verification

Run and report:

database migration/status audit;
Master Data typecheck/build/tests;
MES Console typecheck/build;
root package.json command audit;
repository reference search for deleted scripts;
git diff --check;
seed command;
test:mes:machine-flow;
cleanup command;
browser verification of Machine Create, Detail and Physical Unit workflows.

Verify visually that the new Machine Definition form no longer contains:

Serial Number;
physical Execution Status;
authoritative Machine Quantity;
misleading fleet-wide Active/Deactivate behavior.

Provide a final report containing:

previous field and new owner matrix;
schema/API/UI changes;
package.json scripts retained and removed;
deleted script files and proof they were unused;
Machine flow use-case results;
seed and cleanup results;
remaining compatibility fields and removal plan.