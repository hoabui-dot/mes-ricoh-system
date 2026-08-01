# MES Console Base UI Architecture

## Scope

Introduced a public Base UI layer for MES Console while preserving existing feature imports and business behavior.

## Components

- `services/mes-console/src/components/base/BaseModal.tsx`: size variants (`sm`, `md`, `lg`, `xl`, `full`), top/center placement, loading/confirm/cancel state, custom footer, validation-friendly children, and viewport-safe scrolling.
- `services/mes-console/src/components/base/BaseDataTable.tsx`: the only business-facing table contract; TanStack Table is internal and supports sorting, pagination (10/50/100), selection state, expansion state, sticky headers, loading, empty state, toolbar, and row actions.
- Base controls/states: `BaseButton`, `BaseCard`, `BaseInput`, `BaseSelect`, `BaseForm`, `BaseTextarea`, `BaseDatePicker`, `BaseTimePicker`, `BaseCheckbox`, `BaseTabs`, `BaseBadge`, `BaseEmptyState`, `BaseLoading`, and `BasePagination`.

## Compatibility

`components/ui/modal.tsx` now re-exports `BaseModal` as `Modal`, so existing feature modules retain their props and automatically use the new modal implementation. New feature code should import from `components/base`.

## Migrated Feature

`work-orders/WOListScreen.tsx`, `master-data/ProductionVersionScreen.tsx`, `master-data/ItemsScreen.tsx`, `master-data/MbomScreen.tsx`, and `master-data/RoutingScreen.tsx` now use `BaseDataTable`. The Labor Resource list surfaces in `ResourceFoundationScreen.tsx`, `EmployeesScreen.tsx`, and `ShiftsScreen.tsx` also use the same wrapper. Filtering, row detail navigation, status badges, release/edit actions, and detail behavior are unchanged. Production Version detail is rendered by `BaseModal` rather than an inline fixed overlay.

`BaseDataTableColumn` is the business-facing column type. It supports an optional `align` property while keeping TanStack types out of route modules. Pagination labels (`table.previous`, `table.next`, `table.rowsPerPage`, `table.page`, `table.noRows`, and `table.range`) and loading/empty labels are resolved through the shared VI/EN/JA/KO i18n bundle.

## Remaining Migration

Several specialized route files still contain inline HTML tables or custom list layouts, such as EBOM, operation catalog, planning constraints, print stations, and skill cards. They are outside the requested Item/MBOM/Routing/Labor Resource migration and remain candidates for incremental column-definition extraction into `BaseDataTable`. No business/API code was changed as part of this UI migration.

## Verification

`npm run build` passed for `services/mes-console` after the Item, MBOM, Routing, Resource Foundation, Employees, and Shifts migrations. TanStack Table was added as a direct MES Console dependency. Production Version detail uses centered placement. Base loading and pagination labels resolve through i18n. The MES Console Docker image was rebuilt and recreated; `http://127.0.0.1:13052/` returned HTTP 200.
