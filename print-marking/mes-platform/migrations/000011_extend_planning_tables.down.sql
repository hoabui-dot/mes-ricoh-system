-- Migration: 000011_extend_planning_tables.down.sql
-- Rollback shift templates extensions and planning permissions

ALTER TABLE planning_shift_templates DROP COLUMN IF EXISTS code;
ALTER TABLE planning_shift_templates DROP COLUMN IF EXISTS description;
ALTER TABLE planning_shift_templates DROP COLUMN IF EXISTS break_start;
ALTER TABLE planning_shift_templates DROP COLUMN IF EXISTS break_end;
ALTER TABLE planning_shift_templates DROP COLUMN IF EXISTS working_hours;
ALTER TABLE planning_shift_templates DROP COLUMN IF EXISTS cross_day;
ALTER TABLE planning_shift_templates DROP COLUMN IF EXISTS color;
ALTER TABLE planning_shift_templates DROP COLUMN IF EXISTS status;

ALTER TABLE projection_dashboard_snapshots DROP COLUMN IF EXISTS busy_workers;
ALTER TABLE projection_dashboard_snapshots DROP COLUMN IF EXISTS unassigned_workers;
ALTER TABLE projection_dashboard_snapshots DROP COLUMN IF EXISTS overtime_workers;

DELETE FROM identity_permissions WHERE name IN (
    'shift.create',
    'shift.update',
    'shift.delete',
    'calendar.generate',
    'calendar.update',
    'schedule.read',
    'schedule.assign',
    'schedule.bulk',
    'team.assign',
    'worker.assign',
    'planning.dashboard'
);
