# Item Revision Effective Date-Time Handling

## Canonical Rules

Item Revision validity uses `[effective_from, effective_to)`. The start is inclusive, the end is exclusive, and adjacent revisions share the exact same instant. `NULL effective_to` means no scheduled end; it does not by itself mean Current. Current resolution must use `effective_from <= target AND (effective_to IS NULL OR target < effective_to)`.

The UI uses the owning Site timezone. The current configured default is `Asia/Ho_Chi_Minh` (`UTC+07:00`). The API must receive ISO 8601 with an explicit offset and the database stores UTC `TIMESTAMPTZ`. Seconds are part of the business boundary.

## Revision Creation

The client submits only localized content, revision metadata, and `effective_from`. The service locks the Item and all revisions, finds chronological neighbours, rejects an exact start conflict, sets the predecessor `effective_to` to the new start, sets the new `effective_to` to the successor start when present, and commits the complete change atomically. Historical Work Order snapshots and Production Version links are never rewritten.

## Consumer Rule

Production Version and Work Order resolution must select a specific revision at a documented instant, using the interval predicate. Do not use version number or `effective_to IS NULL` as a substitute for effectivity.

## Error Contract

Use `ITEM_REVISION_EFFECTIVE_FROM_REQUIRED`, `ITEM_REVISION_EFFECTIVE_FROM_INVALID`, `ITEM_REVISION_EFFECTIVE_FROM_PAST`, `ITEM_REVISION_EFFECTIVE_FROM_CONFLICT`, `ITEM_REVISION_EFFECTIVE_RANGE_INVALID`, `ITEM_REVISION_EFFECTIVE_RANGE_OVERLAP`, `ITEM_REVISION_NOT_EFFECTIVE`, and `ITEM_REVISION_OVERLAP_DETECTED` where applicable. Console field/form errors must translate these codes rather than displaying raw keys.
