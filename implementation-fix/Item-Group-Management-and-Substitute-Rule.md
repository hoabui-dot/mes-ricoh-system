# Item Group Management and MBOM Substitute Rule

Date: 2026-07-30

`item_type` and `item_group` are separate fields. `item_type` is the fixed business classification
(`FG`, `SFG`, `RM`); `item_group` is the compatibility/material-family key used by MBOM substitutes
and resource-capability resolution. The database has always required `item_group`, but the Item
Console previously did not expose it. The backend therefore defaulted new Items to `General`, which
made substitute compatibility failures appear unexplained.

MES Console Item create/edit now exposes a localized-independent `Material group` field, shows it in
the Item list/detail, and submits it to `md_item.item_group`. Existing rows without a meaningful group
remain `General` until corrected. Item Revision creation inherits the Item group; changing a Released
Item specification still follows the existing successor-revision rules.

For an MBOM substitute, the source and selected Revision must be Released/effective, have the same
item group, and have the same UOM or a Released UOM conversion. The backend returns structured detail
codes for failed conditions and the Console shows them in the reusable validation toast.
