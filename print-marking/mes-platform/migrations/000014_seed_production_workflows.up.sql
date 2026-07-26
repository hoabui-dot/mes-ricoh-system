-- Seed Production Workflows and Workflow Operations

-- 1. Coffee Packaging Workflow (Version 1 - Published)
INSERT INTO production_workflows (
    id, workflow_code, workflow_name, description, product_family, version, status, published_at, created_by, updated_by
) VALUES (
    'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    'WF-COFFEE',
    'Standard Coffee Packaging Workflow',
    'Standard coffee packaging line printing, marking and inspection',
    'Coffee',
    1,
    'published',
    NOW(),
    'admin.user',
    'admin.user'
);

INSERT INTO workflow_operations (
    id, workflow_id, sequence, operation_type, station_type, estimated_duration, retry_limit, is_required, metadata
) VALUES 
('c0f1e000-0000-0000-0000-000000000010', 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 10, 'PRINT', 'PRINT_STATION', 8, 2, true, '{"description": "Print expiry date and batch code on plastic film"}'),
('c0f1e000-0000-0000-0000-000000000020', 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 20, 'MARK', 'LASER_STATION', 12, 1, true, '{"description": "Laser engrave batch serial on bottom rim"}'),
('c0f1e000-0000-0000-0000-000000000030', 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 30, 'VISION_VERIFY', 'VISION_STATION', 4, 3, true, '{"description": "Verify OCR and barcode clarity using high-res camera"}'),
('c0f1e000-0000-0000-0000-000000000040', 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 40, 'PLC_REJECT', 'PLC_STATION', 2, 0, true, '{"description": "PLC pneumatic reject gate action for failed vision verification"}'),
('c0f1e000-0000-0000-0000-000000000050', 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 50, 'MANUAL_APPROVAL', 'COMBINED_STATION', 45, 0, false, '{"description": "Supervisor approval for marginal defects"}');


-- 2. Coffee Packaging Workflow (Version 2 - Draft)
INSERT INTO production_workflows (
    id, workflow_code, workflow_name, description, product_family, version, status, created_by, updated_by
) VALUES (
    'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6e',
    'WF-COFFEE',
    'Standard Coffee Packaging Workflow',
    'Standard coffee packaging line printing, marking and inspection',
    'Coffee',
    2,
    'draft',
    'admin.user',
    'admin.user'
);

INSERT INTO workflow_operations (
    id, workflow_id, sequence, operation_type, station_type, estimated_duration, retry_limit, is_required, metadata
) VALUES 
('c0f1e000-0000-0000-0000-000000000110', 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6e', 10, 'PRINT', 'PRINT_STATION', 7, 2, true, '{"description": "Optimized print step"}'),
('c0f1e000-0000-0000-0000-000000000120', 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6e', 20, 'MARK', 'LASER_STATION', 10, 1, true, '{"description": "Optimized marking speed"}'),
('c0f1e000-0000-0000-0000-000000000130', 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6e', 30, 'VISION_VERIFY', 'VISION_STATION', 3, 3, true, '{"description": "Optimized camera trigger"}'),
('c0f1e000-0000-0000-0000-000000000140', 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6e', 40, 'PLC_REJECT', 'PLC_STATION', 2, 0, true, '{"description": "Standard reject gate"}'),
('c0f1e000-0000-0000-0000-000000000150', 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6e', 50, 'MANUAL_APPROVAL', 'COMBINED_STATION', 30, 0, false, '{"description": "Operator check"}');


-- 3. Bottle Packaging Workflow (Version 1 - Published)
INSERT INTO production_workflows (
    id, workflow_code, workflow_name, description, product_family, version, status, published_at, created_by, updated_by
) VALUES (
    'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e',
    'WF-BOTTLE',
    'Glass Bottle Marking Workflow',
    'Laser etching and vision verification for premium glass bottles',
    'Bottle',
    1,
    'published',
    NOW(),
    'admin.user',
    'admin.user'
);

INSERT INTO workflow_operations (
    id, workflow_id, sequence, operation_type, station_type, estimated_duration, retry_limit, is_required, metadata
) VALUES 
('b071e000-0000-0000-0000-000000000010', 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', 10, 'PRINT', 'PRINT_STATION', 5, 2, true, '{"description": "Print batch number on bottleneck"}'),
('b071e000-0000-0000-0000-000000000020', 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', 20, 'VISION_VERIFY', 'VISION_STATION', 4, 2, true, '{"description": "Pre-etch barcode validation"}'),
('b071e000-0000-0000-0000-000000000030', 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', 30, 'MARK', 'LASER_STATION', 15, 1, true, '{"description": "Laser mark QR code on glass body"}'),
('b071e000-0000-0000-0000-000000000040', 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', 40, 'VISION_VERIFY', 'VISION_STATION', 4, 3, true, '{"description": "Post-etch grading verification"}'),
('b071e000-0000-0000-0000-000000000050', 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', 50, 'PLC_REJECT', 'PLC_STATION', 3, 0, true, '{"description": "Reject gate"}');


-- 4. Bottle Packaging Workflow (Version 2 - Draft)
INSERT INTO production_workflows (
    id, workflow_code, workflow_name, description, product_family, version, status, created_by, updated_by
) VALUES (
    'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7f',
    'WF-BOTTLE',
    'Glass Bottle Marking Workflow',
    'Laser etching and vision verification for premium glass bottles',
    'Bottle',
    2,
    'draft',
    'admin.user',
    'admin.user'
);

INSERT INTO workflow_operations (
    id, workflow_id, sequence, operation_type, station_type, estimated_duration, retry_limit, is_required, metadata
) VALUES 
('b071e000-0000-0000-0000-000000000110', 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7f', 10, 'PRINT', 'PRINT_STATION', 5, 2, true, '{"description": "Print batch number"}'),
('b071e000-0000-0000-0000-000000000120', 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7f', 20, 'VISION_VERIFY', 'VISION_STATION', 4, 2, true, '{"description": "Initial scan"}'),
('b071e000-0000-0000-0000-000000000130', 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7f', 30, 'MARK', 'LASER_STATION', 14, 1, true, '{"description": "Laser mark"}'),
('b071e000-0000-0000-0000-000000000140', 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7f', 40, 'VISION_VERIFY', 'VISION_STATION', 4, 3, true, '{"description": "Final validation"}'),
('b071e000-0000-0000-0000-000000000150', 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7f', 50, 'PLC_REJECT', 'PLC_STATION', 3, 0, true, '{"description": "Reject gate"}');


-- 5. Medicine Blister Workflow (Version 1 - Published)
INSERT INTO production_workflows (
    id, workflow_code, workflow_name, description, product_family, version, status, published_at, created_by, updated_by
) VALUES (
    'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f',
    'WF-MEDICINE',
    'Pharmaceutical Blister Verification',
    'High-reliability pharmaceutical print, marking and vision check',
    'Medicine',
    1,
    'published',
    NOW(),
    'admin.user',
    'admin.user'
);

INSERT INTO workflow_operations (
    id, workflow_id, sequence, operation_type, station_type, estimated_duration, retry_limit, is_required, metadata
) VALUES 
('d0d1e000-0000-0000-0000-000000000010', 'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f', 10, 'PRINT_AND_MARK', 'COMBINED_STATION', 10, 1, true, '{"description": "Print brand name and stamp expiration date"}'),
('d0d1e000-0000-0000-0000-000000000020', 'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f', 20, 'VISION_VERIFY', 'VISION_STATION', 3, 0, true, '{"description": "Verify print and foil integrity"}'),
('d0d1e000-0000-0000-0000-000000000030', 'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f', 30, 'WAIT', 'PLC_STATION', 5, 0, true, '{"description": "Wait for seal dry down conveyor"}'),
('d0d1e000-0000-0000-0000-000000000040', 'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f', 40, 'MANUAL_APPROVAL', 'COMBINED_STATION', 60, 0, true, '{"description": "Quality assurance pharmacist manual sample release"}'),
('d0d1e000-0000-0000-0000-000000000050', 'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f', 50, 'PLC_REJECT', 'PLC_STATION', 2, 0, true, '{"description": "Reject gate"}');


-- 6. Medicine Blister Workflow (Version 2 - Draft)
INSERT INTO production_workflows (
    id, workflow_code, workflow_name, description, product_family, version, status, created_by, updated_by
) VALUES (
    'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e90',
    'WF-MEDICINE',
    'Pharmaceutical Blister Verification',
    'High-reliability pharmaceutical print, marking and vision check',
    'Medicine',
    2,
    'draft',
    'admin.user',
    'admin.user'
);

INSERT INTO workflow_operations (
    id, workflow_id, sequence, operation_type, station_type, estimated_duration, retry_limit, is_required, metadata
) VALUES 
('d0d1e000-0000-0000-0000-000000000110', 'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e90', 10, 'PRINT_AND_MARK', 'COMBINED_STATION', 9, 1, true, '{"description": "Optimize combined print and mark"}'),
('d0d1e000-0000-0000-0000-000000000120', 'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e90', 20, 'VISION_VERIFY', 'VISION_STATION', 3, 0, true, '{"description": "Camera validation"}'),
('d0d1e000-0000-0000-0000-000000000130', 'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e90', 30, 'WAIT', 'PLC_STATION', 4, 0, true, '{"description": "Conveyor wait"}'),
('d0d1e000-0000-0000-0000-000000000140', 'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e90', 40, 'MANUAL_APPROVAL', 'COMBINED_STATION', 40, 0, true, '{"description": "Supervisor check"}'),
('d0d1e000-0000-0000-0000-000000000150', 'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e90', 50, 'PLC_REJECT', 'PLC_STATION', 2, 0, true, '{"description": "Reject gate"}');
