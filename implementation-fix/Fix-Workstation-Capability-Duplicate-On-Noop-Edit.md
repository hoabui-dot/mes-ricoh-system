# Workstation Capability Duplicate On No-op Edit

## Root cause

The requested ID `261110cd-b878-46d6-82e4-950d67ce72bc` does not exist in the live database. The matching persisted Workstation is `261110cd-b878-46ae-856b-b7556ed056d5` (`WS-MOLD-KIOSK01`), which had three unique active capability rows. The edit form correctly loaded them, but the capability replacement endpoint deactivated the old rows and inserted replacements using the old `effective_from` values. The database constraint is unique on `(workstation_id, operation_id, effective_from)`, so the new rows conflicted with their historical rows even on a no-op save.

## Fix

- Capability replacement keeps explicitly future effective dates.
- Historical/current dates are replaced with a new `NOW()` timestamp.
- Duplicate operation IDs in one submitted payload return `WORKSTATION_CAPABILITY_DUPLICATE` before partial inserts.
- Added Vietnamese, English, Japanese, and Korean translations.

## Verification

- Active capability data for Workstation `261110cd-b878-46ae-856b-b7556ed056d5` was inspected; operation IDs were unique.
- A no-op `PUT` containing the historical `effective_from` values returned three new active capability rows successfully. The rows received `2026-07-26T14:09:42.398Z`, and no duplicate constraint error occurred.
- `mes-master-data-service` and `mes-console` Docker images rebuilt successfully and the containers were recreated.
- `GET /master-data/workstations/261110cd-b878-46ae-856b-b7556ed056d5/edit` returned HTTP 200.
- `git diff --check` passed.
