-- Production Workflow Migration (Up)
-- Phase 1: Workflows and Workflow Operations

CREATE TABLE production_workflows (
    id              UUID PRIMARY KEY,
    workflow_code   VARCHAR(100) NOT NULL,
    workflow_name   VARCHAR(255) NOT NULL,
    description     TEXT,
    product_family  VARCHAR(100) NOT NULL,
    version         INTEGER NOT NULL DEFAULT 1,
    status          VARCHAR(50) NOT NULL DEFAULT 'draft',
    published_at    TIMESTAMPTZ,
    archived_at     TIMESTAMPTZ,
    revision        INTEGER NOT NULL DEFAULT 1,
    created_by      VARCHAR(100),
    updated_by      VARCHAR(100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workflow_code, version)
);

CREATE INDEX idx_production_workflows_code   ON production_workflows (workflow_code);
CREATE INDEX idx_production_workflows_status ON production_workflows (status);
CREATE INDEX idx_production_workflows_family ON production_workflows (product_family);

CREATE TABLE workflow_operations (
    id                  UUID PRIMARY KEY,
    workflow_id          UUID NOT NULL REFERENCES production_workflows(id) ON DELETE CASCADE,
    sequence            INTEGER NOT NULL,
    operation_type      VARCHAR(100) NOT NULL,
    station_type        VARCHAR(100) NOT NULL,
    estimated_duration  INTEGER NOT NULL DEFAULT 0, -- in seconds
    retry_limit         INTEGER NOT NULL DEFAULT 0,
    is_required         BOOLEAN NOT NULL DEFAULT TRUE,
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workflow_id, sequence)
);

CREATE INDEX idx_workflow_operations_workflow ON workflow_operations (workflow_id);
CREATE INDEX idx_workflow_operations_seq      ON workflow_operations (sequence);
