-- Normalize stale execution projections created before Item Revision UOM was
-- included in the release event. Only copy a UOM when the referenced MBOM has
-- an unambiguous released base UOM; do not invent or overwrite a real value.
UPDATE rm_item_revision ir
SET base_uom_id = source.base_uom_id
FROM (
  SELECT pv.item_revision_id, MIN(mb.base_uom_id::text)::uuid AS base_uom_id
  FROM rm_production_version pv
  JOIN rm_mbom_header mb ON mb.master_id = pv.mbom_header_id
  WHERE pv.lifecycle_status = 'Released'
    AND mb.lifecycle_status = 'Released'
    AND mb.base_uom_id IS NOT NULL
  GROUP BY pv.item_revision_id
  HAVING COUNT(DISTINCT mb.base_uom_id) = 1
) source
WHERE ir.master_id = source.item_revision_id
  AND ir.base_uom_id IS NULL;

-- Keep the normalization conservative. Rows still missing UOM remain visible
-- as incomplete readiness data and cannot be used to create a Work Order.
