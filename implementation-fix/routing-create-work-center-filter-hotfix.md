# Routing Create Work Center Filter Hotfix

## Root Cause

`/master-data/routings/new` loads Work Center-specific capability data through:

```text
GET /api/mes/master-data/resource-capabilities?work_center_id=<id>
```

The generic master-data query joined `md_resource_capability rc`, `md_work_center wc`, and `md_equipment eq`, but generated the filter as the unqualified `work_center_id = $2`. PostgreSQL correctly rejected this because more than one joined relation exposes `work_center_id`.

## Fix

The filter now uses `md_resource_capability.work_center_id = $2`. The existing projection replacement converts that qualification to `rc.work_center_id` in the joined query.

## Verification

- Repository typecheck passed.
- MES master-data service image rebuilt and container restarted.
- Live `resource-capabilities?work_center_id=<id>` returned HTTP 200 and capability data.
- MES master-data service is running after the rebuild.
