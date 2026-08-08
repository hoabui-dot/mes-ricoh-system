export type ResourceScopeLineContext = {
  master_id: string;
  site_id: string;
  lifecycle_status: string;
  active_flag: boolean;
};

export type ResourceAssignmentScopeContext = {
  master_id: string;
  site_id: string;
  work_center_id: string;
  workstation_id: string | null;
  equipment_id: string | null;
  machine_group_id: string | null;
  machine_unit_id: string | null;
  lifecycle_status: string;
};

export type LineResourceScopeInput = ResourceAssignmentScopeContext & {
  effective_from: string | null;
  effective_to: string | null;
};

function scopeError(code: string, statusCode = 422): Error & { statusCode: number; code: string } {
  return Object.assign(new Error(code), { statusCode, code });
}

export function validateLineResourceScopeReplacement(input: {
  line: ResourceScopeLineContext;
  items: unknown;
  assignments: Map<string, ResourceAssignmentScopeContext>;
  configuredWorkCenterIds: Set<string>;
  currentAssignmentIds: Set<string>;
  assignmentOwnerLineIds: Map<string, string>;
  now?: Date;
}): LineResourceScopeInput[] {
  if (!Array.isArray(input.items)) throw scopeError('PRODUCTION_LINE_RESOURCE_SCOPES_REQUIRED');
  const now = input.now ?? new Date();
  const assignmentIds = new Set<string>();

  const normalized = (input.items as Array<Record<string, unknown>>).map((item) => {
    const assignmentId = String(item['resource_assignment_id'] || '').trim();
    if (!assignmentId) throw scopeError('RESOURCE_ASSIGNMENT_ID_REQUIRED');
    if (assignmentIds.has(assignmentId)) throw scopeError('PRODUCTION_LINE_RESOURCE_SCOPE_DUPLICATE', 409);
    assignmentIds.add(assignmentId);

    const assignment = input.assignments.get(assignmentId);
    if (!assignment) throw scopeError('RESOURCE_ASSIGNMENT_NOT_FOUND', 404);
    if (assignment.site_id !== input.line.site_id) throw scopeError('PRODUCTION_LINE_RESOURCE_SITE_MISMATCH');
    if (!input.configuredWorkCenterIds.has(assignment.work_center_id)) throw scopeError('PRODUCTION_LINE_RESOURCE_WORK_CENTER_NOT_SCOPED');
    if (['Inactive', 'Obsolete', 'Retired'].includes(assignment.lifecycle_status)) throw scopeError('PRODUCTION_LINE_RESOURCE_ASSIGNMENT_INACTIVE');
    const ownerLineId = input.assignmentOwnerLineIds.get(assignmentId);
    if (ownerLineId && ownerLineId !== input.line.master_id) throw scopeError('RESOURCE_ASSIGNMENT_LINE_SCOPE_OVERLAP', 409);

    const effectiveFrom = item['effective_from'] ? String(item['effective_from']) : null;
    const effectiveTo = item['effective_to'] ? String(item['effective_to']) : null;
    const fromDate = effectiveFrom ? new Date(effectiveFrom) : now;
    const toDate = effectiveTo ? new Date(effectiveTo) : null;
    if (Number.isNaN(fromDate.getTime()) || (toDate && Number.isNaN(toDate.getTime())) || (toDate && toDate <= fromDate)) throw scopeError('PRODUCTION_LINE_RESOURCE_SCOPE_EFFECTIVITY_INVALID');
    if (toDate && toDate <= now) throw scopeError('PRODUCTION_LINE_RESOURCE_SCOPE_EFFECTIVITY_INACTIVE');

    return { ...assignment, effective_from: effectiveFrom, effective_to: effectiveTo };
  });

  const submitted = new Set(normalized.map((item) => item.master_id));
  const removesCurrent = [...input.currentAssignmentIds].some((id) => !submitted.has(id));
  if (input.line.active_flag !== false && input.line.lifecycle_status === 'Released' && removesCurrent) {
    throw scopeError('PRODUCTION_LINE_RELEASED_RESOURCE_SCOPE_REMOVE_FORBIDDEN', 409);
  }
  return normalized.sort((left, right) => left.work_center_id.localeCompare(right.work_center_id) || left.master_id.localeCompare(right.master_id));
}
