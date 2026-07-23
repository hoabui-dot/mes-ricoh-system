# WMS Console SelectBase and CRUD Confirmation Implementation

Date: 2026-07-22

## Requirement

The WMS Console UI must stop using basic native select controls and provide a shared shadcn-style select component for all pages. CRUD and state-changing actions must not call backend APIs immediately after submit/click; users must see a confirmation dialog before the mutation is executed.

## Scope

- WMS Console shared UI components.
- Topbar warehouse/language selectors.
- Inventory filter selectors.
- Master-data create dialogs and active/inactive status updates.
- Inbound receipt creation and receipt confirmation.
- Outbound material request creation.

## Implementation

### SelectBase

Added `services/wms-console/src/components/ui/select.tsx` as a Radix Select based `SelectBase` component.

Design points:

- Uses `@radix-ui/react-select`, matching the project shadcn/Radix direction.
- Provides a simple `options` API so feature pages do not build low-level select primitives repeatedly.
- Supports placeholder, disabled state, class names, required/name attributes, and empty selection through an internal sentinel value.
- Replaces every previous native `<select>`/`<option>` usage in WMS Console source.

Updated consumers:

- `components/layout/Topbar.tsx`
- `features/inventory/InventoryPages.tsx`
- `features/master-data/MasterDataPages.tsx`
- `features/inbound/InboundPages.tsx`
- `features/outbound/OutboundPages.tsx`

### CRUD Confirmation

Added `services/wms-console/src/components/shared/ConfirmActionDialog.tsx`.

Design points:

- Uses `@radix-ui/react-alert-dialog`.
- Uses the existing UI `Button` component.
- Keeps the dialog open while a mutation is pending.
- Closes only through cancel or successful mutation handlers.

Mutation behavior changed:

- Create Warehouse: validates form, opens confirmation, then calls `api.createWarehouse`.
- Create Zone: validates form, opens confirmation, then calls `api.createZone`.
- Create Location: validates form, opens confirmation, then calls `api.createLocation`.
- Create Bin: validates form, opens confirmation, then calls `api.createBin`.
- Create Item UOM Mapping: validates form, opens confirmation, then calls `api.createItemUomMapping`.
- Master-data status toggle: opens confirmation, then calls the correct update endpoint.
- Create Inbound Receipt: validates form, opens confirmation, then calls `api.createReceipt`.
- Confirm Inbound Receipt: opens confirmation, then calls `api.confirmReceipt`.
- Create Outbound Material Request: validates form, opens confirmation, then calls `api.createMaterialRequest`.

### i18n

Added Vietnamese and English keys for:

- `common.all`
- `confirm.createTitle`
- `confirm.createBody`
- `confirm.statusTitle`
- `confirm.statusBody`
- `confirm.receiptTitle`
- `confirm.receiptBody`

Japanese and Korean inherit the English fallback entries through the existing locale object structure.

## Verification

- `npm run build --workspace=wms-console` passed.
- `npm run i18n:scan:wms-console` passed after rerunning outside sandbox because `tsx` could not create `/tmp/tsx-*` IPC inside the sandbox.
- Source scan confirmed no remaining native `<select>`/`<option>` usage in `services/wms-console/src`.

## Operational Notes

The confirmation dialog intentionally applies to mutating operations, not passive filter changes. Inventory/topbar selectors still update local UI state immediately because those are read/filter controls and do not write backend data.
