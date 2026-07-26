ALTER TABLE material_request ADD COLUMN IF NOT EXISTS request_code VARCHAR(32);
UPDATE material_request
SET request_code = 'MR-' || UPPER(REPLACE(LEFT(request_id::text, 8), '-', ''))
WHERE request_code IS NULL;
ALTER TABLE material_request ALTER COLUMN request_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_material_request_code ON material_request(request_code);
ALTER TABLE material_request ADD COLUMN IF NOT EXISTS source_system VARCHAR(30) NOT NULL DEFAULT 'MES';
ALTER TABLE material_request ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE material_request ADD COLUMN IF NOT EXISTS work_center_code VARCHAR(50);
ALTER TABLE material_request ADD COLUMN IF NOT EXISTS item_code VARCHAR(50);
