# MBOM Migration 0049 Reconciliation

Date: 2026-07-29

## Purpose

Migration `0049_reconcile_released_mbom_line_lifecycle` repaired the specific
legacy state where a current line under a Released MBOM header was still Draft.
It did not change component, quantity, UOM, parent, or historical identifiers.

## Source limitation

Migration 0049 was written before row-level audit capture existed, so the
database does not contain a before/after audit row for the promotion itself.
The previous implementation audit recorded one mismatch in the deterministic
E2E dataset: `E2E-WO-MBOM-01` had a Released header and a current Draft line.
The migration source condition was:

```sql
h.lifecycle_status = 'Released'
AND l.effective_to IS NULL
AND l.lifecycle_status NOT IN ('Inactive', 'Obsolete')
```

This is sufficient to identify a current line under a Released header, but it
does not independently prove component/UOM/effective-date validity. Therefore
the promotion is retained and the row remains marked for manual review rather
than being silently rewritten or deleted.

## Current reconciliation evidence

Command:

```bash
docker exec mes-master-data-db psql \
  -U mes_master_data_user -d mes_master_data_db -At \
  -c "SELECT ... FROM md_mbom_line ..."
```

Observed after migration and reseed:

| MBOM | Line count | Header status | Current line status | Component status | UOM | Review |
|---|---:|---|---|---|---|---|
| `E2E-WO-MBOM-01` | 1 | Released | Released | Released | Released / PCS | Review history of 0049 if audit evidence is required |
| `MBOM-FG-WS-CM01-R1` | 5 | Released | Released | Released | Released | No current mismatch |
| `MBOM-SFG-ROLL-EPDM-R1` | 1 | Released | Released | Released | Released | No current mismatch |

Aggregate live result:

- Released headers with current Draft lines: `0`
- Current orphan lines: `0`
- Current invalid component revisions in Released structures: `0`
- Current invalid UOMs in Released structures: `0`
- Current duplicate sibling sequences: `0`
- Current active cycles: `0`

## Decision

Historical Work Orders and master identifiers were not modified. The absence
of a pre-migration audit row is a documentation limitation, not a reason to
delete or recreate the MBOM data.

The new `0050_mbom_concurrency_and_substitute_audit` migration adds the audit
foundation for future substitute approval history and `structure_version` for
future structure changes.
