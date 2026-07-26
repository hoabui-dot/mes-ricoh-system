# Redesign the WMS Location Hierarchy as a Reusable UX Component

Please redesign the **From Location** and **To Location** sections on the WMS Material Request Detail page.

The current layout is still unclear because Warehouse, Zone, Storage Location, and Bin are rendered with almost the same indentation and visual weight. Users cannot immediately understand which value is a warehouse, zone, location, or bin.

Act as a senior enterprise WMS product designer. The goal is to make the physical storage hierarchy understandable at a glance.

## Core UX principle

Do not display the hierarchy as a flat text list.

Render it as an explicit structured path:

```text
Warehouse
└── Zone
    └── Storage Location
        └── Bins

Every level must have:

A visible type label
A distinct icon
Clear indentation
A vertical connector line
Localized business name as the primary text
Business code as smaller secondary text
Different visual treatment from the other levels
Create a reusable component

Create one shared component and reuse it for both source and destination:

<LocationHierarchyCard
  direction="source"
  warehouse={...}
  zone={...}
  location={...}
  bins={...}
/>

Suggested component structure:

components/wms/location-hierarchy/
  LocationHierarchyCard.tsx
  LocationHierarchyNode.tsx
  LocationHierarchyBins.tsx
  locationHierarchy.types.ts

Do not duplicate separate JSX for From and To.

Recommended visual design

Render each side as a compact card, not as plain text inside a table cell.

Example:

┌──────────────────────────────────────────┐
│ FROM LOCATION                            │
│                                          │
│ 🏭 WAREHOUSE                             │
│    Kizuna 3 Raw Material Warehouse       │
│    WH-KZ3-RM                             │
│    │                                     │
│    ├─ ◫ ZONE                             │
│    │    Metal Core Zone                  │
│    │    ZONE-METAL                       │
│    │    │                                │
│    │    └─ 📍 STORAGE LOCATION           │
│    │         Metal Core M01 Rack R01     │
│    │         MET-M01-R01                 │
│    │         │                           │
│    │         └─ ▦ BINS · 3               │
│    │              B01  B02  B03          │
└──────────────────────────────────────────┘

For the destination:

┌──────────────────────────────────────────┐
│ TO LOCATION                              │
│                                          │
│ 🏭 WAREHOUSE                             │
│    Kizuna 3 WIP Warehouse                │
│    WH-KZ3-WIP                            │
│    │                                     │
│    ├─ ◫ ZONE                             │
│    │    Work Center Staging Zone         │
│    │    ZONE-WC-STAGING                  │
│    │    │                                │
│    │    └─ 📍 STAGING LOCATION           │
│    │         Molding Staging Area        │
│    │         STG-WC-MOLD                 │
│    │         │                           │
│    │         └─ ▦ BINS · 2               │
│    │              B01  B02               │
└──────────────────────────────────────────┘

Use explicit labels such as:

Warehouse
Zone
Storage location
Work Center staging location
Bins

Do not rely on indentation alone.

Movement layout

Inside the movement row, use a clear directional layout:

[ Source hierarchy card ]  →  [ Destination hierarchy card ]

The arrow should sit between the two cards and visually represent stock movement.

On smaller screens, stack vertically:

Source
↓
Destination

Do not compress both hierarchies into narrow columns.

Bin behavior

Bins are the lowest level and must not look equal to Warehouse or Location.

Use:

Compact chips
A count badge
Collapse/expand when there are many bins
Natural bin codes such as B01, not the full repeated parent prefix when unnecessary

Example:

Bins · 3
[B01] [B02] [B03]

The full business code may appear in a tooltip or expanded detail.

Do not show all bins by default when a movement was not allocated to specific bins. In that case, label them clearly:

Available bins in this location

Do not imply that every listed bin participated in the movement.

If the movement has an actual source or destination bin, highlight only that bin:

Movement bin
[B02]

This distinction is important.

Semantic hierarchy types

The component must support location purpose:

type LocationNodeType =
  | "warehouse"
  | "zone"
  | "storage_location"
  | "work_center_staging"
  | "bin";

Use different labels and icons based on the type.

For example, the destination should say:

Work Center staging location

instead of the generic:

Storage location

when location_purpose === "WorkCenterStaging".

Interaction

Each hierarchy node may be clickable when a detail route exists.

Use:

Hover state
External/detail icon
Tooltip: Open warehouse, Open zone, or Open location
Keyboard-accessible interaction

Do not make the entire dense text block one ambiguous link.

Add a small secondary action:

View on warehouse map

scoped to the relevant location.

Table redesign

The current table row contains too much hierarchy content for a normal table.

Consider replacing the movement table with a list of movement cards when detailed hierarchy is needed.

Recommended movement card:

Lot LOT-STL-05-260501-A             367.525 PCS

[ Source hierarchy ]   →   [ Destination hierarchy ]

Expiry: 13/01/2028
Movement type: Transfer to staging
Time: 17:49 24/07/2026

When there are multiple lot movements, render one card per movement.

This is more readable than forcing large hierarchy trees into table cells.

Accessibility
Use semantic ordered hierarchy markup
Do not communicate hierarchy through color only
Ensure connector lines remain visible in light and dark themes
Provide accessible node labels
Support keyboard navigation
Use aria-expanded for collapsed bins
Keep localized names primary and codes secondary
Acceptance criteria

The redesign is complete only when:

Users can immediately distinguish Warehouse, Zone, Location, and Bin.
Each hierarchy level has an explicit type label.
Indentation and connector lines clearly show parent-child relationships.
Source and destination reuse the same shared component.
Work Center staging is labeled differently from normal storage.
Actual movement bins are distinguished from merely available bins.
Multiple movements render as separate, understandable records.
The layout works in desktop, tablet, light theme, and dark theme.
No UUIDs are shown.
Browser review confirms that a non-technical warehouse user can explain the source and destination hierarchy without additional documentation.