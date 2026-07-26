# Universal Name-Primary Display Rule Implementation

Date: 2026-07-24
Process: `process-fix/Universal-Name-Primary-Display-Rule.md`

## Root Cause and Evidence

- **IMPLEMENTED_AND_VERIFIED:** Live MBOM math and WMS stored values match for MR-80213CB3,
  MR-43A7F702, MR-FD853EA0, and MR-724ED238: `505.000`, `520.200`, `507.525`, and `7.875`.
  The quantity defect was display/enrichment, not aggregation.
- **IMPLEMENTED:** MES execution Work Center projections were empty because the prior Kafka group had
  already advanced past retained activation events. The consumer group is now `v3` for replay.
- **IMPLEMENTED:** MES Work Order detail now joins local item and Work Center read models and returns
  localized names/codes; the material result panel renders item name primary, code secondary, quantity,
  UOM fallback, Work Center, request code, and status.
- **IMPLEMENTED:** WMS request contracts, persistence migration `000007`, outbox payload, list API,
  and console now carry item and Work Center names and render name-first/code-secondary.
- **IMPLEMENTED:** WMS inventory exposes append-only ledger movements filtered by Work Order and Work
  Center, with source/destination location code/name. WMS request detail renders real movements,
  explains existing staging when no transfer exists, and shows shortage quantity.
- **PARTIAL / UNVERIFIED:** Legacy execution requirements store only `uom_id`; UOM code/name is not
  yet projected for every historical row. The four audited requests were safely backfilled from the
  authoritative master-data records (`PCS`, `KG`) without fabrication. A dedicated UOM read-model/event
  replay remains the follow-up for all future legacy rows.

## Changed Files

MES execution: `masterdata_consumer.go`, `stage_materials.go`, `wms_outbound_client.go`, and HTTP
detail router. WMS outbound: material-request use case/router, migration `000007`, and migration
registration. WMS inventory: movement use case/router. WMS Console: outbound page, API client/types,
and translations. MES Console: Work Order detail display.

## Verification

- `go test ./...` passed in MES execution, WMS outbound, and WMS inventory.
- `npm run build` passed in WMS Console.
- Browser screenshot and valid-token live staging replay were unavailable.
- Docker images were rebuilt and containers restarted. Compose reports MES execution, WMS inventory,
  WMS outbound, and both consoles running; all three affected service health endpoints returned 200.
  Migration `000007_material_request_name_fields` applied successfully. The live execution projection
  contains four Work Centers after the verified backfill.

## Governance

Name is primary, business code is secondary, and raw UUIDs are never user-facing across MES/WMS/QMS
and future consoles. The Work Order operation `Localized name (CODE)` rendering remains the canonical
pattern.
