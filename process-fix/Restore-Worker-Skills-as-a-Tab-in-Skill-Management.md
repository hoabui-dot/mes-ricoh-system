# Restore Worker Skills as a Tab in Skill Management

## Objective

Restore the existing Worker/Employee Skills management into the new Skill Management page without changing or losing the existing worker-skill data model.

The Skill Management page must contain four tabs:

```text
Machine Skills
Workstation Skills
Work Center Skills
Worker Skills

Use the existing worker-skill architecture and data as the source of truth. Do not recreate worker skills as Machine, Workstation, or Work Center skills.

Requirements
Audit the previous Worker Skills screen, APIs, tables, validations, permissions, and assignment rules.
Move the existing Worker Skills UI into the new Skill Management workspace as the Worker Skills tab.
Preserve all existing:
Skill records
Employee skill assignments
Skill levels
Certification or expiry data
Effective dates
Statuses
Audit history
IDs and references
Reuse the existing backend endpoints and business rules where possible. Do not duplicate employee-skill tables or migrate valid data into a new incompatible structure.
The Worker Skills tab must support the same CRUD capabilities that existed before:
Create skill
View details
Edit skill
Activate/deactivate
Safe delete
Assign skill to workers
Update worker level or qualification
End an assignment while preserving history
Before editing or deleting a Worker Skill, check dependencies including:
Employee skill assignments
Operation Skill Requirements
Active Work Orders or planning references
Qualification or certification history
Rules:
A referenced Worker Skill cannot be permanently deleted.
Offer deactivation when deletion is blocked.
Scope cannot be changed after the skill is used.
Editing name or description may proceed after dependency confirmation.
Ending a worker assignment must preserve historical records.
Expired or inactive worker skills cannot satisfy new planning requirements.
Display worker names and skill names as translated business names. Do not display raw user, employee, or skill UUIDs.
Keep the worker-skill scope separate:
scope = Employee

Do not include Employee skills in Machine, Workstation, or Work Center selectors.

Update navigation so the old standalone Worker Skills route redirects to the new Worker Skills tab without breaking existing bookmarks.
Remove no legacy worker-skill data. Only remove duplicated UI navigation after the new tab is working.
Acceptance Criteria
The new Skill Management page contains a Worker Skills tab.
All previous Worker Skills data is visible and unchanged.
Existing employee-skill CRUD and assignment rules still work.
Referenced skills cannot be deleted incorrectly.
Worker qualification history remains intact.
Operation Skill Requirements still resolve Employee skills correctly.
Employee skills do not appear in resource-skill tabs.
Old Worker Skills routes redirect to the new tab.
No IDs or historical references are lost.