-- Notification Module Migration (Up)
-- Phase 7: Email, In-App Alerts, RabbitMQ Consumer, Alert Center

CREATE TABLE notification_alerts (
    id          UUID PRIMARY KEY,
    user_id     UUID,             -- logical ref to identity_users (nullable for role-based notifications)
    role        VARCHAR(50),      -- target role (nullable for user-specific notifications)
    title       VARCHAR(255) NOT NULL,
    message     TEXT NOT NULL,
    type        VARCHAR(50) NOT NULL,    -- 'info', 'warning', 'critical'
    channel     VARCHAR(50) NOT NULL,    -- 'email', 'in_app', 'both'
    is_read     BOOLEAN NOT NULL DEFAULT FALSE,
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notification_alerts_user ON notification_alerts (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_notification_alerts_role ON notification_alerts (role) WHERE role IS NOT NULL;
CREATE INDEX idx_notification_alerts_unread ON notification_alerts (user_id, is_read) WHERE user_id IS NOT NULL AND is_read = FALSE;

-- Outbox queue pattern for the Notification module
CREATE TABLE notification_outbox_events (
    id           UUID PRIMARY KEY,
    event_name   VARCHAR(255) NOT NULL,
    routing_key  VARCHAR(255) NOT NULL,
    payload      JSONB NOT NULL,
    status       VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'published', 'failed'
    retry_count  INTEGER NOT NULL DEFAULT 0,
    error        TEXT,
    published_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
