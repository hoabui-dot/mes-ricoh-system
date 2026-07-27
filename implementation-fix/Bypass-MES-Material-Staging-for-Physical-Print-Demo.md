# Temporary MES Material-Staging Bypass

Date: 2026-07-27

## Root cause

`POST /work-orders/{id}/stage-materials` correctly called WMS. The tested Work
Order received `Shortage/INSUFFICIENT_STOCK` for one component because WMS had
no available quantity. This was a WMS inventory result, not an approval or
Production Version error.

## Controlled bypass

The MES Execution service now supports `MES_MATERIAL_STAGING_REQUIRED=false`
for the current execution and physical-printer demo. In this mode:

- MES does not call WMS and does not change WMS inventory.
- Requirements remain `NotChecked`; they are never falsely marked `Staged`.
- The endpoint returns `status=Bypassed` and an explicit warning.
- The Console displays a warning in VI/EN/JA/KO.
- The default remains strict when the variable is absent or `true`.

The active MES Compose file sets the flag to `false` for this development
environment. Set it to `true` before production use.

## Physical-print boundary

Bypassing material staging only removes the WMS inventory gate. It does not
create a material movement and does not itself print a label. Physical print
still requires Work Order approval, `start-execution`, a Print Station-bound
operation, Kafka connectivity, an ONLINE station, and a ready Zebra printer.

## Verification

- Reproduced `WO-20260727-0018` shortage from WMS.
- Added the opt-in bypass and localized warning.
- MES Execution and Console Docker rebuild/recreate completed after this change.
- Strict mode remains available with `MES_MATERIAL_STAGING_REQUIRED=true`.

## Runtime result

> Superseded on 2026-07-27. This report documents a historical temporary
> policy only. The active system always calls WMS and no longer returns
> `status=Bypassed`.

The existing released WO `WO-20260727-0018` was retried after deployment. The
endpoint returned HTTP 200 with `status=Bypassed`. The Console now shows the
localized warning instead of a staging failure.

The WO is not yet a physical-print proof: its current operation snapshot has
`execution_target_type=KIOSK_DEMO`, `workstation_id=null`, and
`print_station_id=null`. Therefore `start-execution` for this WO would not
send a printer command. The Print Station itself is healthy, but the Routing
projection/workstation capability must be corrected or a new released Routing
and Production Version must be used before claiming physical printing.
