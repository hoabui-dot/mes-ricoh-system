export type LocalizedText = string | Record<string, string>;

export type WorkOrderBlocker = {
  code: string;
  message?: string;
  operation_code?: string;
  operation_id?: string;
  line_id?: string;
};

export type ReadinessDimension = {
  key: string;
  dimension_code?: string;
  status: string;
  blocking?: boolean;
  evaluation_stage?: string;
  reason_code?: string;
  localized_message_key?: string;
  details?: WorkOrderBlocker[];
  evaluated_at?: string | null;
  source?: string;
  blockers?: WorkOrderBlocker[];
  detail?: string;
};

export type ProductionLineReference = {
  id?: string;
  code?: string;
  name_i18n?: LocalizedText;
  selection_role?: 'PRIMARY' | 'BACKUP' | string;
};

export type LineOperationEvaluation = {
  operation_id?: string;
  routing_operation_id?: string;
  operation_code: string;
  operation_name?: LocalizedText;
  work_center_id?: string;
  mandatory?: boolean;
  status: string;
  total_candidate_count?: number;
  feasible_candidate_count?: number;
  candidate_ids?: string[];
  blocker_codes?: string[];
  excluded_candidate_reasons?: Record<string, number>;
};

export type LineEvaluationResult = ProductionLineReference & {
  production_line_id?: string;
  production_line_code?: string;
  priority?: number;
  status: string;
  blockers: WorkOrderBlocker[];
  dimensions?: ReadinessDimension[];
  operations?: LineOperationEvaluation[];
  complete_line_feasibility_status?: string;
  selection_reason?: string;
  evaluated_at?: string;
  policy_version?: string;
};

export type AllocationHistoryEntry = {
  allocation_id?: string;
  operation_code?: string;
  status?: string;
  validation_status?: string;
  planned_production_line_id?: string;
  planned_start_at?: string;
  planned_end_at?: string;
  warning_codes?: string[];
};

export type GateSummary = {
  approval_state: string;
  execution_state: string;
  line_selection_status: string;
  resource_allocation_state?: string;
  capacity_state?: string;
  operation_count?: number;
  active_allocation_count?: number;
  valid_allocation_count?: number;
  approval_eligible?: boolean;
  execution_eligible?: boolean;
  blockers?: string[];
};

export type WorkOrderListRow = {
  wo_id: string;
  wo_code: string;
  item_code: string;
  item_name?: LocalizedText;
  quantity: number;
  uom_id?: string;
  planned_start_at?: string;
  planned_end_at?: string;
  status: string;
  site_id?: string;
  production_version_code?: string;
  selected_production_line_code?: string;
  selected_production_line_name_i18n?: LocalizedText;
  line_selection_mode?: string;
  line_selection_status?: string;
  line_selection_reason?: string;
  fallback_reason?: string;
  resource_hold_reason?: { code?: string };
  primary_evaluation?: LineEvaluationResult;
  backup_evaluation?: LineEvaluationResult;
  line_locked_at?: string;
  approval_state?: string;
  execution_state?: string;
  created_at?: string;
};

export type WorkOrderHeader = WorkOrderListRow & {
  production_version_id?: string;
  item_revision_id?: string;
  item_revision_code?: string;
  mbom_code?: string;
  routing_code?: string;
  planning_snapshot?: unknown;
  shift_id?: string;
  row_version?: number;
  resource_hold_reason?: { code?: string; evaluated_lines?: LineEvaluationResult[] };
  evaluated_line_results?: LineEvaluationResult[];
};

export type WorkOrderDetail = {
  header: WorkOrderHeader;
  operations: Array<Record<string, unknown>>;
  material_requirements: Array<Record<string, unknown>>;
  approval_logs: Array<Record<string, unknown>>;
  allocation_history?: AllocationHistoryEntry[];
  resource_evaluation_dimensions?: ReadinessDimension[];
  gate_summary?: GateSummary;
};
