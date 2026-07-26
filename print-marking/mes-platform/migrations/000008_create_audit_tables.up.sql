-- Audit Logging Module Migration (Up)
-- Phase 8: TraceId, CorrelationId, User, Timestamp, Old/New values

CREATE TABLE audit_logs (
    id             UUID PRIMARY KEY,
    trace_id       VARCHAR(255) NOT NULL,
    correlation_id VARCHAR(255) NOT NULL,
    user_id        UUID,                 -- logical ref to identity_users (nullable for system actions)
    action         VARCHAR(255) NOT NULL, -- e.g. 'CREATE', 'UPDATE', 'DELETE'
    entity_name    VARCHAR(255) NOT NULL, -- e.g. 'workforce_workers'
    entity_id      VARCHAR(255) NOT NULL, -- primary key of target row
    old_values     TEXT,                  -- JSON string of field values prior to change
    new_values     TEXT,                  -- JSON string of field values following change
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_trace ON audit_logs (trace_id);
CREATE INDEX idx_audit_logs_correlation ON audit_logs (correlation_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_name, entity_id);
CREATE INDEX idx_audit_logs_user ON audit_logs (user_id) WHERE user_id IS NOT NULL;
