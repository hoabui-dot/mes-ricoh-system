import type { LocalizedText } from '@mom-platform/i18n-ui-shared';

export type DisplayState = 'waiting' | 'ready' | 'in_progress' | 'completed' | 'failed' | 'blocked';

export interface KioskJobCounts {
  total: number;
  waiting: number;
  ready: number;
  in_progress: number;
  completed: number;
  failed: number;
  blocked: number;
}

export interface KioskWorkOrderSummary {
  wo_id: string;
  wo_code: string;
  item_code: string;
  item_name?: string;
  quantity: number;
  uom_id?: string;
  uom_code?: string;
  selected_production_line_code?: string;
  selected_production_line_name_i18n?: LocalizedText;
  status: string;
  dispatch_mode: string;
  job_counts: KioskJobCounts;
  progress_percent: number;
  manual_progress_percent: number;
  updated_at: string;
}

export interface KioskNamedResource {
  id?: string;
  code?: string;
  name_i18n?: LocalizedText;
}

export interface KioskResourceContext {
  allocation_status?: string;
  validation_status?: string;
  work_center: KioskNamedResource;
  workstation: KioskNamedResource;
  allocated_resource_type?: string;
  allocated_resource: KioskNamedResource;
  warning_codes?: string[];
}

export interface KioskSessionContext {
  session_id: string;
  operator_user_id: string;
  operator_code?: string;
  operator_name_i18n?: LocalizedText;
  terminal_ref: string;
  status: string;
  started_at: string;
  ended_at?: string;
}

export interface KioskFailureContext {
  reason_code: string;
  reason_name_i18n?: LocalizedText;
  reason_text?: string;
  terminal_ref: string;
  occurred_at: string;
}

export interface KioskReasonCode {
  code: string;
  name?: LocalizedText;
  reason_type: string;
  lifecycle_status: string;
  requires_comment?: boolean;
}

export interface KioskActionEligibility {
  can_start: boolean;
  can_complete: boolean;
  can_fail: boolean;
  can_abort: boolean;
  can_retry: boolean;
  blockers: string[];
}

export interface KioskOperationBehavior {
  operation_code: string;
  operation_type: string;
  confirmation_mode: string;
  requires_material_scan: boolean;
  requires_output_label: boolean;
  requires_scrap_reason: boolean;
  special_rule?: string;
}

export interface KioskFailureImpact {
  operation_state: string;
  work_order_state: string;
  successors_blocked: boolean;
}

export interface KioskJobCard {
  wo_operation_id: string;
  operation_code: string;
  operation_name_i18n?: LocalizedText;
  sequence_no: number;
  predecessor_sequences: number[];
  predecessor_status: string;
  selected_production_line_code?: string;
  execution_target_type: string;
  status: string;
  display_state: DisplayState;
  resource: KioskResourceContext;
  active_session?: KioskSessionContext;
  last_session?: KioskSessionContext;
  requested_quantity: number;
  expected_good_quantity?: number;
  qty_good: number;
  qty_scrap: number;
  planned_start_at?: string;
  planned_end_at?: string;
  started_at?: string;
  finished_at?: string;
  failure?: KioskFailureContext;
  behavior: KioskOperationBehavior;
  failure_impact: KioskFailureImpact;
  action_eligibility: KioskActionEligibility;
}

export interface KioskPrintOperation {
  wo_operation_id: string;
  operation_code: string;
  operation_name_i18n?: LocalizedText;
  sequence_no: number;
  status: string;
  print_status: string;
  print_job_code?: string;
  print_job_status?: string;
  selected_printer_code?: string;
  last_error_code?: string;
  last_error_message?: string;
  dispatched_at?: string;
  completed_at?: string;
  read_only: true;
}

export interface KioskWorkOrderDetail {
  work_order: KioskWorkOrderSummary;
  job_cards: KioskJobCard[];
  print_operations: KioskPrintOperation[];
  projection_at: string;
}

export interface KioskWorkOrderListResponse {
  data: KioskWorkOrderSummary[];
  pagination: {
    page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
  };
}

export type CachedKioskWorkOrder = KioskWorkOrderSummary & { cached_at: string };
