# Reusable WMS Location Hierarchy UX

Date: 2026-07-24
Process source: `process-fix/Redesign-the-WMS-Location-Hierarchy-as-a-Reusable-UX-Component.md`

## Implementation

- Added the reusable `components/wms/location-hierarchy` component family:
  `LocationHierarchyCard`, `LocationHierarchyNode`, `LocationHierarchyBins`, and typed hierarchy
  contracts.
- The card renders Warehouse, Zone, Storage Location or Work Center staging location, and Bins as
  explicit semantic levels with icons, labels, indentation, connector lines, and distinct visual
  treatment.
- Hierarchy nodes are display-only to prevent accidental navigation. The only navigation action in the
  card is the dedicated location icon beside the Bin disclosure; UUIDs are never rendered.
- Bin disclosure is closed by default when bins are only available in the location. Expanding it shows
  inline Bin code/name/status details. An optional `actualBinId` highlights the movement bin and labels
  the remaining bins as available context.
- Material-request movement rows now reuse the same source and destination card. The directional route
  remains visible between the cards, with each lot allocation rendered independently.
- Work Center staging labels are derived from `location_purpose`, not inferred from styling or route.
- Added a dedicated square-arrow icon beside the Bin disclosure. It opens the parent Location detail
  route directly and does not toggle the disclosure or make the whole hierarchy card one action.
- Added VI/EN/JA/KO semantic hierarchy translations.

## Verification

- `npm run build` passed in `services/wms-console`.
- `npm run i18n:scan` passed.
- `git diff --check` passed for the changed component and detail files.
- Docker image rebuilt and WMS Console restarted; WMS Console, inventory, and outbound containers are
  running, with inventory and outbound reporting healthy.
- The dedicated parent-location navigation icon is included in the deployed console image.
- **UNVERIFIED:** browser screenshots, keyboard click-through, and genuine live movement-bin data.
  The current inventory movement contract does not expose source/destination bin IDs, so available
  bins are not presented as participating bins unless a future API response supplies `actualBinId`.
