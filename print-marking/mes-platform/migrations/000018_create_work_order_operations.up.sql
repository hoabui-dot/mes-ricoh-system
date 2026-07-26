-- 1. Alter workflow_operations to include new operational attributes
ALTER TABLE workflow_operations ADD COLUMN operation_name VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE workflow_operations ADD COLUMN requires_station BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE workflow_operations ADD COLUMN default_station_type VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE workflow_operations ADD COLUMN quality_check_required BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE workflow_operations ADD COLUMN is_final_operation BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE workflow_operations ADD COLUMN required_skills VARCHAR(255) NOT NULL DEFAULT '[]';

-- 2. Create work_order_operations table to store immutable operation snapshots
CREATE TABLE work_order_operations (
    id UUID PRIMARY KEY,
    work_order_id UUID NOT NULL REFERENCES production_work_orders(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL,
    operation_name VARCHAR(255) NOT NULL DEFAULT '',
    operation_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    estimated_duration INTEGER NOT NULL DEFAULT 0,
    retry_limit INTEGER NOT NULL DEFAULT 0,
    is_required BOOLEAN NOT NULL DEFAULT true,
    requires_station BOOLEAN NOT NULL DEFAULT true,
    default_station_type VARCHAR(100) NOT NULL DEFAULT '',
    quality_check_required BOOLEAN NOT NULL DEFAULT false,
    is_final_operation BOOLEAN NOT NULL DEFAULT false,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    assigned_station VARCHAR(100) NOT NULL DEFAULT '',
    assigned_team VARCHAR(100) NOT NULL DEFAULT '',
    duration INTEGER NOT NULL DEFAULT 0,
    retry_count INTEGER NOT NULL DEFAULT 0,
    telemetry TEXT NOT NULL DEFAULT '',
    result VARCHAR(100) NOT NULL DEFAULT '',
    comments TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_work_order_ops_wo_id ON work_order_operations(work_order_id);

-- 3. Seed workflow templates
-- WF-BEARING-SEAL
INSERT INTO production_workflows (id, workflow_code, workflow_name, description, product_family, version, status, published_at, created_by, updated_by)
VALUES ('501ae111-0000-0000-0000-000000000001', 'WF-BEARING-SEAL', 'Bearing Seal standard manufacturing process', 'Seal', 'Bearing Seal', 1, 'published', NOW(), 'admin.user', 'admin.user');

INSERT INTO workflow_operations (id, workflow_id, sequence, operation_type, station_type, estimated_duration, retry_limit, is_required, metadata, operation_name, requires_station, default_station_type, quality_check_required, is_final_operation, required_skills) VALUES
('501ae111-0000-0000-0000-000000000010', '501ae111-0000-0000-0000-000000000001', 10, 'MIXING', 'MIXING_AREA', 600, 0, true, '{}', 'Raw Material Mixing', false, '', false, false, '[]'),
('501ae111-0000-0000-0000-000000000020', '501ae111-0000-0000-0000-000000000001', 20, 'MOLDING', 'MOLDING_STATION', 300, 1, true, '{}', 'Compression Molding', true, 'MOLDING_STATION', false, false, '["MOLD_OP"]'),
('501ae111-0000-0000-0000-000000000030', '501ae111-0000-0000-0000-000000000001', 30, 'VULCANIZATION', 'VULCAN_STATION', 1200, 0, true, '{}', 'Vulcanization', true, 'VULCAN_STATION', false, false, '["MOLD_OP"]'),
('501ae111-0000-0000-0000-000000000040', '501ae111-0000-0000-0000-000000000001', 40, 'COOLING', 'COOLING_AREA', 900, 0, true, '{}', 'Cooling', false, '', false, false, '[]'),
('501ae111-0000-0000-0000-000000000050', '501ae111-0000-0000-0000-000000000001', 50, 'DEFLASHING', 'DEFLASHING_STATION', 180, 0, true, '{}', 'Deflashing', false, '', false, false, '[]'),
('501ae111-0000-0000-0000-000000000060', '501ae111-0000-0000-0000-000000000001', 60, 'VISION_VERIFY', 'VISION_STATION', 10, 3, true, '{}', 'Visual Inspection', true, 'VISION_STATION', true, false, '[]'),
('501ae111-0000-0000-0000-000000000070', '501ae111-0000-0000-0000-000000000001', 70, 'VISION_VERIFY', 'VISION_STATION', 15, 3, true, '{}', 'Dimension Inspection', true, 'VISION_STATION', true, false, '[]'),
('501ae111-0000-0000-0000-000000000080', '501ae111-0000-0000-0000-000000000001', 80, 'MARK', 'LASER_STATION', 8, 2, true, '{}', 'Laser Marking', true, 'LASER_STATION', false, false, '[]'),
('501ae111-0000-0000-0000-000000000090', '501ae111-0000-0000-0000-000000000001', 90, 'PRINT', 'PRINT_STATION', 5, 2, true, '{}', 'Label Printing', true, 'PRINT_STATION', false, false, '[]'),
('501ae111-0000-0000-0000-0000000000a0', '501ae111-0000-0000-0000-000000000001', 100, 'PACKAGING', 'PACKAGING_AREA', 60, 0, true, '{}', 'Packaging', false, '', false, true, '[]');

-- WF-O-RING
INSERT INTO production_workflows (id, workflow_code, workflow_name, description, product_family, version, status, published_at, created_by, updated_by)
VALUES ('501ae111-0000-0000-0000-000000000002', 'WF-O-RING', 'Standard O-Ring extrusion and molding', 'O-Ring', 'O-Ring', 1, 'published', NOW(), 'admin.user', 'admin.user');

INSERT INTO workflow_operations (id, workflow_id, sequence, operation_type, station_type, estimated_duration, retry_limit, is_required, metadata, operation_name, requires_station, default_station_type, quality_check_required, is_final_operation, required_skills) VALUES
('501ae111-0000-0000-0000-000000000210', '501ae111-0000-0000-0000-000000000002', 10, 'MIXING', 'MIXING_AREA', 600, 0, true, '{}', 'Mixing', false, '', false, false, '[]'),
('501ae111-0000-0000-0000-000000000220', '501ae111-0000-0000-0000-000000000002', 20, 'EXTRUSION', 'EXTRUSION_STATION', 120, 1, true, '{}', 'Extrusion', true, 'EXTRUSION_STATION', false, false, '[]'),
('501ae111-0000-0000-0000-000000000230', '501ae111-0000-0000-0000-000000000002', 30, 'CUTTING', 'CUTTING_STATION', 60, 1, true, '{}', 'Cutting', true, 'CUTTING_STATION', false, false, '[]'),
('501ae111-0000-0000-0000-000000000240', '501ae111-0000-0000-0000-000000000002', 40, 'VULCANIZATION', 'VULCAN_STATION', 900, 0, true, '{}', 'Vulcanization', true, 'VULCAN_STATION', false, false, '["MOLD_OP"]'),
('501ae111-0000-0000-0000-000000000250', '501ae111-0000-0000-0000-000000000002', 50, 'VISION_VERIFY', 'VISION_STATION', 10, 3, true, '{}', 'Inspection', true, 'VISION_STATION', true, false, '[]'),
('501ae111-0000-0000-0000-000000000260', '501ae111-0000-0000-0000-000000000002', 60, 'PRINT', 'PRINT_STATION', 5, 2, true, '{}', 'Printing', true, 'PRINT_STATION', false, false, '[]'),
('501ae111-0000-0000-0000-000000000270', '501ae111-0000-0000-0000-000000000002', 70, 'PACKAGING', 'PACKAGING_AREA', 60, 0, true, '{}', 'Packaging', false, '', false, true, '[]');

-- WF-RUBBER-METAL
INSERT INTO production_workflows (id, workflow_code, workflow_name, description, product_family, version, status, published_at, created_by, updated_by)
VALUES ('501ae111-0000-0000-0000-000000000003', 'WF-RUBBER-METAL', 'Rubber-to-metal bonding process', 'Rubber-Metal', 'Rubber-Metal', 1, 'published', NOW(), 'admin.user', 'admin.user');

INSERT INTO workflow_operations (id, workflow_id, sequence, operation_type, station_type, estimated_duration, retry_limit, is_required, metadata, operation_name, requires_station, default_station_type, quality_check_required, is_final_operation, required_skills) VALUES
('501ae111-0000-0000-0000-000000000310', '501ae111-0000-0000-0000-000000000003', 10, 'PREPARATION', 'PREP_STATION', 180, 0, true, '{}', 'Surface Preparation', true, 'PREP_STATION', false, false, '[]'),
('501ae111-0000-0000-0000-000000000320', '501ae111-0000-0000-0000-000000000003', 20, 'BONDING', 'BONDING_STATION', 120, 0, true, '{}', 'Bonding Agent', true, 'BONDING_STATION', false, false, '[]'),
('501ae111-0000-0000-0000-000000000330', '501ae111-0000-0000-0000-000000000003', 30, 'MOLDING', 'MOLDING_STATION', 300, 1, true, '{}', 'Molding', true, 'MOLDING_STATION', false, false, '["MOLD_OP"]'),
('501ae111-0000-0000-0000-000000000340', '501ae111-0000-0000-0000-000000000003', 40, 'VULCANIZATION', 'VULCAN_STATION', 1500, 0, true, '{}', 'Vulcanization', true, 'VULCAN_STATION', false, false, '["MOLD_OP"]'),
('501ae111-0000-0000-0000-000000000350', '501ae111-0000-0000-0000-000000000003', 50, 'PULL_TEST', 'TEST_STATION', 30, 0, true, '{}', 'Pull Test', true, 'TEST_STATION', true, false, '[]'),
('501ae111-0000-0000-0000-000000000360', '501ae111-0000-0000-0000-000000000003', 60, 'VISION_VERIFY', 'VISION_STATION', 10, 3, true, '{}', 'Vision Inspection', true, 'VISION_STATION', true, false, '[]'),
('501ae111-0000-0000-0000-000000000370', '501ae111-0000-0000-0000-000000000003', 70, 'MARK', 'LASER_STATION', 8, 2, true, '{}', 'Laser Mark', true, 'LASER_STATION', false, false, '[]'),
('501ae111-0000-0000-0000-000000000380', '501ae111-0000-0000-0000-000000000003', 80, 'PACKAGING', 'PACKAGING_AREA', 60, 0, true, '{}', 'Packaging', false, '', false, true, '[]');
