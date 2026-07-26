# Workstation Form Data Hydration and Stale State

## Root cause

The Workstation form loader had no request-generation guard. A delayed response from a previous route could call
`setForm` after navigating between edit and create or between two Workstations. The detail request also used the
browser default cache policy. In addition, the Workstation detail query returned inactive and expired historical
Machine Groups together with the current configuration, so the form could render audit history as editable groups.
Machine availability failures could also silently fall back to status-only Machine rows.

## Changes

- Added a request-generation guard around the complete loader. Older Promise responses are ignored after route/entity
  changes, including delayed code reservations, detail responses, and list responses.
- Create route entry resets to `emptyResourceForm()` before loading and never merges fetched values into previous
  state.
- Workstation detail, resource-skill assignments, and machine availability use `cache: no-store`.
- Availability failure is now a load failure instead of silently displaying stale/status-only Machine data.
- Edit hydration uses one complete `setForm(normalizedRecord)` replacement after the fresh detail and skill data load.
- Added visible Workstation section loading status for basic data, Machine Groups, Supported Operations, Skills, and
  Machine availability. Save is disabled until the Workstation sections finish loading.
- Workstation detail now returns only active, currently effective Machine Groups. Historical groups remain in the
  database for audit but are not editable form defaults.
- Added `scripts/verify-workstation-form-hydration.mjs` and `npm run verify:mes:workstation-hydration`. The script
  removes one current group through the real API, reloads the detail, verifies the group is absent, and restores the
  original current groups when a fixture has at least two active groups.

## Verification

- MES Console and master-data service Docker images were rebuilt twice with `docker compose build --no-cache` and
  restarted.
- MES Console TypeScript/Vite build passed; only the existing large-bundle warning remains.
- The actual Workstation `261110cd-b878-46ae-856b-b7556ed056d5` now exposes one current group and excludes its two
  inactive historical groups from the detail response.
- The hydration mutation script correctly refused to mutate the fixture because only one current group exists; this
  protects the live fixture from an unsafe remove test. A two-group fixture is required to obtain the full destructive
  remove/reload/restore PASS result.
- The Workstation edit route returned HTTP 200 after the no-cache rebuild and `git diff --check` passed.
