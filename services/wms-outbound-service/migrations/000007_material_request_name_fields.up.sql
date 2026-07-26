ALTER TABLE material_request ADD COLUMN IF NOT EXISTS item_name VARCHAR(200);
ALTER TABLE material_request ADD COLUMN IF NOT EXISTS work_center_name VARCHAR(200);
