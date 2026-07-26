-- Migration: 000001_create_identity_tables.down.sql
-- Rolls back the identity module tables in reverse dependency order.

DROP TABLE IF EXISTS identity_outbox_events    CASCADE;
DROP TABLE IF EXISTS identity_audit_logs       CASCADE;
DROP TABLE IF EXISTS identity_refresh_tokens   CASCADE;
DROP TABLE IF EXISTS identity_role_permissions CASCADE;
DROP TABLE IF EXISTS identity_user_roles       CASCADE;
DROP TABLE IF EXISTS identity_permissions      CASCADE;
DROP TABLE IF EXISTS identity_roles            CASCADE;
DROP TABLE IF EXISTS identity_users            CASCADE;
