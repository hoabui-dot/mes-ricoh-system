# Improve WMS Material Request Detail UX

Date: 2026-07-24
Process source: `process-fix/Improve-WMS-Material-Request-Detail-UX.md`

## Implementation

- Replaced flat From/To location text with a weighted hierarchy: warehouse name and code, zone,
  storage location, and expandable bin chips. Business routes remain clickable and UUIDs are never
  rendered.
- Each movement row now presents one lot allocation and a source-to-destination route with a visible
  directional arrow. Quantity/UOM, expiry, movement type, and movement time remain separate columns.
- Existing staging rows retain the explicit existing-balance state; shortage requests show their
  shortage summary above the same traceability table instead of hiding movement rows.
- Summary metrics now use allocation language. Available stock has a tooltip explaining that it can
  aggregate eligible stock across lots, bins, and locations in the valid source warehouse scope.
  Shortfall has a tooltip describing the remaining quantity required at staging.
- Added Vietnamese, English, Japanese, and Korean translations for route, bins, and metric guidance.

## Verification

- `npm run build` passed in `services/wms-console`.
- `npm run i18n:scan` passed.
- WMS Console image rebuilt and restarted with Docker; dependent WMS services remained healthy.
- Existing live evidence remains valid: one-source transfer (`367.525 PCS`), existing staging
  balance (`12.250 KG`), partial-allocation and shortage request records are present in the live API.
- **UNVERIFIED:** browser screenshots/click-through in this environment, a genuine single request
  with multiple source lots, and a genuine single request with multiple source locations.

## Files

- `services/wms-console/src/features/outbound/OutboundPages.tsx`
- `services/wms-console/src/i18n.ts`
