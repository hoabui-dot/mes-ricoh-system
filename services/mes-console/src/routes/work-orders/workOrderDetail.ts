import type { LineEvaluationResult, WorkOrderDetail } from './workOrderContracts';

export function normalizeEvaluatedLine(result: any): LineEvaluationResult {
  const dimensions = Array.isArray(result?.dimensions) ? result.dimensions : [];
  return { ...result, blockers: Array.isArray(result?.blockers) ? result.blockers : [], dimensions };
}

export function normalizeWorkOrderDetail(data: any): WorkOrderDetail['header'] & WorkOrderDetail {
  const payload = data?.data || data;
  const header = payload?.header || payload;
  if (!header || typeof header !== 'object' || !header.wo_id) throw new Error('Invalid work order detail response');
  const evaluated = Array.isArray(header.evaluated_line_results) ? header.evaluated_line_results.map(normalizeEvaluatedLine) : [];
  return { ...header, evaluated_line_results: evaluated, operations: Array.isArray(payload?.operations) ? payload.operations : [], material_requirements: Array.isArray(payload?.material_requirements) ? payload.material_requirements : [], approval_logs: Array.isArray(payload?.approval_logs) ? payload.approval_logs : [], allocation_history: Array.isArray(payload?.allocation_history) ? payload.allocation_history : [], gate_summary: payload?.gate_summary, print_jobs: Array.isArray(payload?.print_jobs) ? payload.print_jobs : [] } as WorkOrderDetail['header'] & WorkOrderDetail;
}

export function localizedText(value: any): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  return String(value.vi || value.en || value.ja || value.ko || '');
}
