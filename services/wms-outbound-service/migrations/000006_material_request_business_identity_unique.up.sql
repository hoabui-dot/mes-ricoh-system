-- Enforce the same logical identity used by the advisory lock at the database boundary.
-- Keep the earliest row if a legacy database already contains a replay duplicate.
DELETE FROM material_request newer
USING material_request older
WHERE newer.request_id <> older.request_id
  AND newer.wo_id = older.wo_id
  AND newer.work_center_ref = older.work_center_ref
  AND newer.item_revision_id = older.item_revision_id
  AND newer.required_qty = older.required_qty
  AND (newer.created_at, newer.request_id) > (older.created_at, older.request_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_material_request_business_identity
  ON material_request (wo_id, work_center_ref, item_revision_id, required_qty);
