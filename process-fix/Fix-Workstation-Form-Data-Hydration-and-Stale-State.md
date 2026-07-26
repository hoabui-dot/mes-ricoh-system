# env

## Objective

Fix the Workstation create/edit form so it always displays the latest persisted configuration.

Current bug:

```text
A Workstation has 2 Machine Groups.
The user deletes 1 group and saves.
After reopening the edit form, the UI shows 3 groups.

This indicates stale cache, duplicated hydration, failed form reset, or merging persisted data with previous local state.

Review the full data-loading and form-hydration flow in:

/master-data/workstations/new
/master-data/workstations/:id/edit

Do not patch only the rendered list.

Requirements
On every entry into the create or edit route, fetch fresh data from the backend.
Edit mode must load the latest Workstation detail, Machine Groups, requirements, supported Operations, and Skills.
Create mode must start from a completely empty form.
Never merge newly fetched Machine Groups with existing form state.
Replace the complete form state after all required edit data has loaded.
Prevent duplicate hydration caused by:
React Strict Mode
repeated effects
route reuse
stale TanStack Query cache
old local component state
edit-to-create navigation
create-to-edit navigation
delayed older responses
Use unique query keys containing the Workstation ID.
For Workstation detail and Machine Group configuration:
use staleTime: 0
refetch on mount
refetch when the Workstation ID changes
invalidate after create, edit, group replacement, or deletion
do not reuse stale data as form default values
Cancel or ignore outdated requests with AbortController, request IDs, or equivalent protection so an older response cannot overwrite newer form data.
Hydrate the form exactly once per successful fresh detail load.
Use form.reset(normalizedFreshData) or the project-equivalent full replacement method.
Do not use append logic when hydrating persisted Machine Groups.

Incorrect:

setMachineGroups(previous => [...previous, ...fetchedGroups]);

Required behaviour:

setMachineGroups(normalize(fetchedGroups));
After saving:
invalidate Workstation detail
invalidate Machine Group detail/list
invalidate Machine availability
wait for the mutation to finish
navigate only after success
When reopening edit, the backend response must be the sole source of truth.
If Machine Group loading is incomplete, do not show stale or empty editable rows.

Show a loading state for each asynchronous section:

Basic Workstation data
Machine Groups
Supported Operations
Skills
Machine availability

For example:

Machine Groups
[ loading spinner ] Loading machine groups...
Disable Save until all required edit sections have completed loading successfully.
If one section fails:
show an inline error for that section
provide Retry
preserve successfully loaded sections
do not silently render cached data
Remove any hidden legacy form state such as:
primary_machine_id
supporting_machines
legacy machine group members
previous resource assignments

if it is being merged with machine_groups[].requirements[].

Verify delete behaviour:
Persisted groups: Group A, Group B

Delete Group B
Save
Reload edit page

Expected:
Only Group A is returned and rendered.
Verify route transitions:
Edit Workstation A
→ Create Workstation
→ Edit Workstation B
→ Return to Workstation A

Each route must show only its own latest persisted data.

Focused Verification Script

Create:

scripts/verify-workstation-form-hydration.mjs

The script should:

Read a Workstation and record its Machine Groups.
Remove one group through the real API.
Read the Workstation again.
Confirm the removed group is absent.
Re-add or restore test data only when safe.
Print fetched group IDs/codes before and after.
Print PASS or FAIL.

Also inspect the browser console for duplicate hydration, repeated append operations, stale query results, and out-of-order responses.

Acceptance Criteria
Edit form always displays the latest persisted Workstation data.
Deleted Machine Groups do not reappear.
Machine Groups are replaced during hydration, never appended.
Create form is always empty.
Route changes cannot reuse old Workstation state.
Old network responses cannot overwrite fresh data.
Every asynchronous form section shows a loading indicator.
Save remains disabled until required data is loaded.
Failed sections show Retry instead of cached content.
The hydration verification script passes.