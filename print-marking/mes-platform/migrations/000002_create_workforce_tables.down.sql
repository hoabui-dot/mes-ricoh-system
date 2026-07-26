-- Migration: 000002_create_workforce_tables.down.sql
-- Rolls back workforce module tables in reverse dependency order.

DROP TABLE IF EXISTS workforce_outbox_events    CASCADE;
DROP TABLE IF EXISTS workforce_certificates     CASCADE;
DROP TABLE IF EXISTS workforce_skill_matrix     CASCADE;
DROP TABLE IF EXISTS workforce_skills           CASCADE;
DROP TABLE IF EXISTS workforce_workers          CASCADE;
DROP TABLE IF EXISTS workforce_teams            CASCADE;
DROP TABLE IF EXISTS workforce_workshops        CASCADE;
DROP TABLE IF EXISTS workforce_departments      CASCADE;
