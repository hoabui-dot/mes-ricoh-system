ALTER TABLE material_request ADD COLUMN IF NOT EXISTS work_order_code VARCHAR(50);
ALTER TABLE material_request ADD COLUMN IF NOT EXISTS work_order_name VARCHAR(200);
ALTER TABLE material_request ADD COLUMN IF NOT EXISTS uom_code VARCHAR(30);
