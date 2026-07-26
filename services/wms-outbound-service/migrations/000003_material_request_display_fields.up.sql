ALTER TABLE material_request ADD COLUMN IF NOT EXISTS work_center_code VARCHAR(50);
ALTER TABLE material_request ADD COLUMN IF NOT EXISTS item_code VARCHAR(50);
