export function formatRoutingCode(numberDate: string, sequence: number): string {
  const compactDate = numberDate.replaceAll('-', '');
  if (!/^\d{8}$/.test(compactDate)) throw new Error('Routing number date must be YYYY-MM-DD or YYYYMMDD');
  if (!Number.isInteger(sequence) || sequence < 1) throw new Error('Routing number sequence must be a positive integer');
  return `RT-${compactDate}-${String(sequence).padStart(4, '0')}`;
}
