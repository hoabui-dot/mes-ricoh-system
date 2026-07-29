export function normalizeWorkOrderDetail(data: any): any {
  const payload = data?.data || data;
  const header = payload?.header || payload;
  if (!header || typeof header !== 'object' || !header.wo_id) throw new Error('Invalid work order detail response');
  return { ...header, operations: Array.isArray(payload?.operations) ? payload.operations : [], material_requirements: Array.isArray(payload?.material_requirements) ? payload.material_requirements : [], approval_logs: Array.isArray(payload?.approval_logs) ? payload.approval_logs : [], print_jobs: Array.isArray(payload?.print_jobs) ? payload.print_jobs : [] };
}

export function localizedText(value: any): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  return String(value.vi || value.en || value.ja || value.ko || '');
}
