-- Migration: 000003_create_planning_tables.down.sql
-- Rolls back planning module tables in reverse dependency order.

DROP TABLE IF EXISTS planning_outbox_events    CASCADE;
DROP TABLE IF EXISTS planning_overtimes        CASCADE;
DROP TABLE IF EXISTS planning_leaves           CASCADE;
DROP TABLE IF EXISTS planning_holidays         CASCADE;
DROP TABLE IF EXISTS planning_worker_assignments CASCADE;
DROP TABLE IF EXISTS planning_team_assignments   CASCADE;
DROP TABLE IF EXISTS planning_shifts           CASCADE;
DROP TABLE IF EXISTS planning_shift_templates   CASCADE;
