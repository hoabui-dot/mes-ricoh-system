export type ProductionLineMembershipContext = {
  master_id: string;
  site_id: string;
  area_id: string;
  lifecycle_status: string;
  active_flag: boolean;
};

export type WorkCenterMembershipContext = {
  master_id: string;
  site_id: string;
  area_id: string;
  lifecycle_status: string;
  active_flag: boolean;
};

export type LineWorkCenterInput = {
  work_center_id: string;
  sequence_no: number;
  mandatory_flag: boolean;
  effective_from: string | null;
  effective_to: string | null;
};

function membershipError(code: string, statusCode = 422): Error & { statusCode: number; code: string } {
  return Object.assign(new Error(code), { statusCode, code });
}

export function validateLineWorkCenterReplacement(input: {
  line: ProductionLineMembershipContext;
  items: unknown;
  workCenters: Map<string, WorkCenterMembershipContext>;
  currentWorkCenterIds: Set<string>;
  now?: Date;
}): LineWorkCenterInput[] {
  if (!Array.isArray(input.items)) throw membershipError('PRODUCTION_LINE_WORK_CENTERS_REQUIRED');
  const now = input.now ?? new Date();
  const workCenterIds = new Set<string>();
  const sequences = new Set<number>();

  const normalized = (input.items as Array<Record<string, unknown>>).map((item, index) => {
    const workCenterId = String(item['work_center_id'] || '').trim();
    const sequence = item['sequence_no'] === undefined || item['sequence_no'] === null || item['sequence_no'] === ''
      ? index + 1
      : Number(item['sequence_no']);
    if (!workCenterId) throw membershipError('PRODUCTION_LINE_WORK_CENTER_ID_REQUIRED');
    if (workCenterIds.has(workCenterId)) throw membershipError('PRODUCTION_LINE_WORK_CENTER_DUPLICATE', 409);
    if (!Number.isInteger(sequence) || sequence < 1) throw membershipError('PRODUCTION_LINE_WORK_CENTER_SEQUENCE_INVALID');
    if (sequences.has(sequence)) throw membershipError('PRODUCTION_LINE_WORK_CENTER_SEQUENCE_DUPLICATE', 409);
    workCenterIds.add(workCenterId);
    sequences.add(sequence);

    const workCenter = input.workCenters.get(workCenterId);
    if (!workCenter) throw membershipError('WORK_CENTER_NOT_FOUND', 404);
    if (workCenter.site_id !== input.line.site_id) throw membershipError('PRODUCTION_LINE_WORK_CENTER_SITE_MISMATCH');
    if (workCenter.area_id !== input.line.area_id) throw membershipError('PRODUCTION_LINE_WORK_CENTER_AREA_MISMATCH');
    if (workCenter.active_flag === false || workCenter.lifecycle_status === 'Retired') throw membershipError('PRODUCTION_LINE_WORK_CENTER_INACTIVE');

    const effectiveFrom = item['effective_from'] ? String(item['effective_from']) : null;
    const effectiveTo = item['effective_to'] ? String(item['effective_to']) : null;
    const fromDate = effectiveFrom ? new Date(effectiveFrom) : now;
    const toDate = effectiveTo ? new Date(effectiveTo) : null;
    if (Number.isNaN(fromDate.getTime()) || (toDate && Number.isNaN(toDate.getTime()))) throw membershipError('PRODUCTION_LINE_WORK_CENTER_EFFECTIVITY_INVALID');
    if (toDate && toDate <= fromDate) throw membershipError('PRODUCTION_LINE_WORK_CENTER_EFFECTIVITY_INVALID');
    if (toDate && toDate <= now) throw membershipError('PRODUCTION_LINE_WORK_CENTER_EFFECTIVITY_INACTIVE');

    return {
      work_center_id: workCenterId,
      sequence_no: sequence,
      mandatory_flag: item['mandatory_flag'] !== false,
      effective_from: effectiveFrom,
      effective_to: effectiveTo,
    };
  });

  const submittedIds = new Set(normalized.map((item) => item.work_center_id));
  const removesCurrentMembership = [...input.currentWorkCenterIds].some((id) => !submittedIds.has(id));
  if (input.line.active_flag !== false && input.line.lifecycle_status === 'Released' && removesCurrentMembership) {
    throw membershipError('PRODUCTION_LINE_RELEASED_WORK_CENTER_REMOVE_FORBIDDEN', 409);
  }

  return normalized.sort((left, right) => left.sequence_no - right.sequence_no || left.work_center_id.localeCompare(right.work_center_id));
}
