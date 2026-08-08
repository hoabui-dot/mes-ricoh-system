-- Analytics uses bounded operational windows. These indexes support the owner-service
-- read paths without introducing a warehouse or cache.
CREATE INDEX IF NOT EXISTS ix_wo_header_analytics_window
  ON wo_header (created_at, status, site_id, selected_production_line_code);

CREATE INDEX IF NOT EXISTS ix_wo_print_job_analytics_window
  ON wo_print_job (created_at, status);

CREATE INDEX IF NOT EXISTS ix_wo_resource_allocation_analytics_window
  ON wo_resource_allocation (allocated_at, status, validation_status);

CREATE INDEX IF NOT EXISTS ix_wo_material_requirement_analytics_wo
  ON wo_material_requirement (wo_id, stock_check_status);
