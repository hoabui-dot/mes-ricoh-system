# Improve WMS Material Request Detail UX

Please redesign the WMS Material Request Detail page to make warehouse movement information easier to understand for non-technical users.

The current **From Location** and **To Location** columns display Warehouse, Zone, Storage Location, and multiple Bins as flat text lines. This makes users think the request is using several different warehouses.

## Required UX changes

Present each location as a clear hierarchy:

```text
Warehouse
Zone
Storage location
Bins

Recommended design:

Show Warehouse name as the primary title
Show warehouse code as secondary text
Display Zone and Storage Location as a compact breadcrumb
Display Bins as small chips or a collapsed list
Use a directional arrow between source and destination
Do not render every hierarchy level with the same visual weight
Keep localized names primary and business codes secondary
Never expose UUIDs

Example:

FROM

Kizuna 3 Raw Material Warehouse
WH-KZ3-RM

Metal Core Zone
→ Metal Core M01 Rack R01

Bins: B01, B02, B03
TO

Kizuna 3 WIP Warehouse
WH-KZ3-WIP

Work Center Staging Zone
→ Molding Staging Area

Bins: B01, B02
Improve summary labels

Replace ambiguous labels:

Available in warehouse

with:

Total allocatable stock in source warehouse

Add a tooltip explaining that this value may aggregate eligible stock from multiple lots, bins, or storage locations within the valid source warehouse scope.

Replace:

Shortage to compensate

with a label that matches the real calculation, such as:

Required transfer from storage

or:

Staging shortage before allocation

If the value represents remaining shortage after fulfillment, show 0 for a fully staged request.

Movement table

Each row should represent one real inventory movement or lot allocation.

Clearly display:

Lot code
Source location
Destination staging location
Quantity and UOM
Expiry date
Movement type
Movement time

When multiple lots or source locations are used, render separate rows instead of combining them into one visually confusing location block.

Use expandable technical hierarchy only when users need more detail.

The default view should answer immediately:

What material moved, how much moved, from where, and to which Work Center staging area?

Preserve the existing API and inventory-ledger traceability behavior unless a confirmed display-field gap requires backend enrichment.

After implementation, verify the page with:

One source location
Multiple source lots
Multiple source locations
Existing staging stock
Full allocation
Partial allocation
Shortage

Update the implementation report with before/after screenshots and browser verification results.