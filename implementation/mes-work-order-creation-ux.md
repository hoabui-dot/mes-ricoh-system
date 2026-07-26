# Display Label Refinement: Localized Business Names

The Work Order creation form now uses localized business names as the primary visible identity in
the production-ready product selector. Technical item, revision, production-version, MBOM, Routing,
site, and UOM codes remain available as secondary context and are still submitted/resolved through
the original stable IDs. The readiness summary now displays localized MBOM and Routing names with
their codes as secondary references. The workflow progress header and summary also show the localized
product name first.

Verification on 2026-07-23: MES Console TypeScript/Vite build passed, `mes-console` Docker image was
rebuilt, and the container was recreated successfully on port 13052.

# Work Order Creation UX Implementation

**Date:** 2026-07-23  
**Requirement:** `process-expend/Improve-Work-Order-Creation-UX.md`  
**Scope:** MES Console Work Order creation, MES master-data readiness lookup, MES execution numbering, and shared Page Detail guidance.

## Delivered

### Production-ready product selector

`mes-master-data-service` now exposes `GET /api/mes/master-data/production-ready-item-revisions` before the generic master-data resource route. It accepts `search`, `site_id`, `planned_date`, and `limit`. Candidates are joined across item, item revision, UOM, production version, MBOM, routing, and site records, then passed through the existing `validateProductionVersion` engine. Only released, effective, structurally complete configurations are returned.

The response carries stable `item_id`, `item_revision_id`, `production_version_id`, `base_uom_id`, and `site_id` values plus localized item name, revision, UOM, PV, site, display code, and `readiness_status`. The endpoint is intentionally backed by the existing validation engine so the UI does not duplicate release/effective-date/MBOM/routing rules.

The MES Console uses a debounced `ComboboxBase` selector. Each option is keyed by `production_version_id`, which is necessary when one item revision has more than one valid production version. The form stores the complete selected `ReadyProduct` object, not only the visible label or an item-revision ID. A remote refresh clears that object only when its production-version ID is no longer returned. The selected configuration is rendered read-only and the form submits stable IDs rather than relying on a manually typed item code.

The readiness response also includes `mbom_header_id` and `routing_header_id`. The readiness summary displays the selected revision code, production-version code, MBOM ID, and Routing ID, while the selected configuration panel displays UOM and site. This makes the state-to-API contract inspectable in the UI and keeps all required IDs available for submit.

### Work Order numbering and preview

`mes-execution-service` migration `000007_work_order_numbering_daily.up.sql` adds an atomic `wo_numbering_daily` counter keyed by UTC work date. New codes are generated in the Work Order creation transaction as `WO-YYYYMMDD-####`. The existing unique `wo_header.wo_code` constraint remains authoritative, and legacy codes are not rewritten.

`GET /api/mes/execution/work-order-code-preview` returns the next expected code without reserving it. The UI labels the field as a preview; the final transaction allocates the number atomically and may advance if another user creates a WO first.

The create workflow accepts `production_version_id` and resolves that exact PV for the requested revision/site. When omitted for backward-compatible callers, it retains the existing default-PV resolution behavior. The workflow also accepts localized `item_name` objects.

### Page Detail modal

`PageDetailButton` now centralizes route-aware content and renders exactly two primary sections: **How to use** and one route-specific context section. Work Order creation has a localized, ordered ten-step process covering selection, quantity/date, readiness, demand, snapshots, checks, draft creation, review, approval, and event handoff. List routes explain their actual columns, filters, and actions. The modal has a semantic dialog, keyboard-accessible close control, scrollable content, and desktop anchor navigation.

### Localization

New Work Order creation and guide strings are present in Vietnamese, English, Japanese, and Korean. Product names continue to use the existing localized-text payload and select the active supported language fallback in the client.

## Verification

- `npm run build` in `services/mes-console`: passed.
- `npm run build` in `services/mes-master-data-service`: passed.
- `gofmt` and `go test ./...` in `services/mes-execution-service`: passed.
- Docker Compose build for `mes-master-data-service`, `mes-execution-service`, and `mes-console`: passed.
- Containers recreated successfully; execution migration `000007` applied and all three services started healthy/ready.
- Live readiness probe returned two valid PV configurations, including two distinct PV IDs for one revision.
- Live code preview probe returned `WO-20260723-0001` with `is_reserved: false`.
- MES Console HTTP probe returned `200`.
- Root-cause verification confirmed the previous failure: the combobox stored a PV ID while `selectedProduct` was looked up by item-revision ID. The lookup now uses PV ID and the full object is stored on selection.
- Follow-up live verification after the hotfix returned `mbom_header_id` and `routing_header_id` for both valid PV options; the form source now stores the selected `ReadyProduct` object and uses that same object for readiness, UOM, button gating, and submit payload.
- No Playwright, Puppeteer, Selenium, or browser-driver dependency exists in this repository, so an automated browser-console capture was not available. Network behavior was reproduced against the running service with the same request parameters used by the form, and the production build/container served successfully.

## Known limits and follow-up

- The preview is advisory, not a reservation. A final code can differ under concurrency by design.
- The readiness endpoint evaluates each candidate through the existing validation engine and currently uses offset-free `limit` results; cursor pagination and quantity-specific capacity validation are outside this requirement.
- The workflow runner remains in-process, as documented by the real-time Work Order implementation. Durable worker recovery remains a Phase 4 hardening item.
- Existing Work Orders keep their historical `WO-####` values; only newly created records use the daily format.
- The Schema Registry continues to report existing compatibility `409` warnings during service startup for previously registered event subjects; services remain healthy and this task did not alter event schemas.

## Internal ID Exposure Audit

Requirement source: `process-fix/exposing-internal-database-IDs.md`.

### Screens inspected

- Work Order creation and Work Order detail.
- Work Order list.
- Items and Item Revision management.
- Production Version management.
- Routing list.
- MBOM list, MBOM detail, component lines, and substitutes.
- Work Centers, Employees, Shifts, Work Calendar, and Tier-2 administration.
- I18n Review and shared error/route components.

### Raw values removed from normal UI

- Work Order creation readiness no longer showed `mbom_header_id` or `routing_header_id`; it now shows MBOM and Routing business codes.
- Production Version list no longer sliced PV/MBOM/Routing UUIDs. It shows Production Version, Item, MBOM, and Routing codes.
- Routing list no longer used `routing_id.slice(0, 8)` or `item_id` as visible fallbacks. It uses Routing code and Item/Revision code.
- MBOM lines and substitute rows no longer fall back to component revision UUIDs; they show revision codes or a localized unknown-component label.
- Work Order detail no longer prints `WO ID` beside the business Work Order code.
- Tier-2 notes no longer fall back to `site_id`.
- Workflow progress result rendering filters internal ID/UUID fields from normal result text. Technical error references remain available for diagnostics.

### API contract updates

The master-data generic list endpoint now enriches related resource responses:

- `production-versions`: `item_code`, `item_name`, `revision_code`, `mbom_code`, `mbom_name`, `routing_code`, `routing_name`, and `site_code`.
- `routings`: `item_code`, `item_name`, `revision_code`, and `site_code`.
- `mbom-headers`: `item_code`, `item_name`, `revision_code`, `site_code`, and `base_uom_code`.
- `production-ready-item-revisions`: `mbom_code`, `mbom_name`, `routing_code`, and `routing_name` in addition to the stable IDs required by the API payload.

Internal IDs remain in React keys, route parameters, API request bodies, and mutation URLs. These are non-visible implementation values. Technical error references and workflow correlation/reference values remain diagnostic surfaces and are not presented as business identity.
