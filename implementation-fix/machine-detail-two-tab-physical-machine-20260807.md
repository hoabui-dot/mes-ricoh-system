# Machine Detail: Physical Machine Group and Two Tabs

Date: 2026-08-07

## Data-model decision

The database intentionally keeps two levels:

- `md_equipment` is the Machine Definition / machine type aggregate, such as
  a 500-ton press definition.
- `md_machine_unit` is one identifiable physical machine under that
  definition, with its own asset code, sequence, and unique serial number.

For three presses of the same type, one Equipment definition owns three
Machine Units. Assignments and planning must reference the unit so that a
specific serial cannot be assigned to two workstations at the same time.
Removing this distinction from the database would break serial uniqueness,
assignment history, and machine-group allocation. The distinction is
therefore removed from the user experience, not from the persistence model.

## Console behavior

`master-data/machines/:id` now has two tabs:

1. `Thông tin máy` (default): combined machine header and description, machine
   definition fields, and the physical-machine list/editor. The old standalone
   Unit card is no longer rendered.
2. `Lịch sử gán`: all Work Center/Workstation assignments with role and
   effective period.

The separate Machine Readiness card was removed from this inspection page.
Readiness remains available to planning and line validation APIs where it can
block an actual production decision.
