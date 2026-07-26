-- Seed Production Workflows and Workflow Operations (Down)
DELETE FROM workflow_operations WHERE workflow_id IN (
    'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6e',
    'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e',
    'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7f',
    'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f',
    'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e90'
);

DELETE FROM production_workflows WHERE id IN (
    'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6e',
    'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e',
    'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7f',
    'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f',
    'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e90'
);
