import { describe, expect, it } from 'vitest';
import { validateLineResourceScopeReplacement, type ResourceAssignmentScopeContext } from '../../src/infrastructure/http/line-resource-scope-validation.js';

const line = { master_id: 'line-1', site_id: 'site-1', lifecycle_status: 'Draft', active_flag: true };

function assignment(id: string, overrides: Partial<ResourceAssignmentScopeContext> = {}): ResourceAssignmentScopeContext {
  return {
    master_id: id, site_id: 'site-1', work_center_id: 'wc-1', workstation_id: `ws-${id}`,
    equipment_id: null, machine_group_id: null, machine_unit_id: null, lifecycle_status: 'Released', ...overrides,
  };
}

function validate(items: unknown, options: {
  line?: typeof line;
  assignments?: ResourceAssignmentScopeContext[];
  workCenters?: string[];
  current?: string[];
  owners?: Array<[string, string]>;
} = {}) {
  const assignments = options.assignments ?? [assignment('ra-1'), assignment('ra-2')];
  return validateLineResourceScopeReplacement({
    line: options.line ?? line, items,
    assignments: new Map(assignments.map((value) => [value.master_id, value])),
    configuredWorkCenterIds: new Set(options.workCenters ?? ['wc-1']),
    currentAssignmentIds: new Set(options.current ?? []),
    assignmentOwnerLineIds: new Map(options.owners ?? []),
    now: new Date('2026-08-07T00:00:00Z'),
  });
}

describe('Production Line resource scope validation', () => {
  it('derives immutable resource snapshots from Resource Assignment', () => {
    const result = validate([{ resource_assignment_id: 'ra-1' }]);
    expect(result[0]).toMatchObject({ master_id: 'ra-1', work_center_id: 'wc-1', workstation_id: 'ws-ra-1', effective_from: null, effective_to: null });
  });

  it.each([
    [[{ resource_assignment_id: 'missing' }], 'RESOURCE_ASSIGNMENT_NOT_FOUND'],
    [[{ resource_assignment_id: 'ra-1' }, { resource_assignment_id: 'ra-1' }], 'PRODUCTION_LINE_RESOURCE_SCOPE_DUPLICATE'],
    [[{ resource_assignment_id: 'ra-1', effective_from: 'bad-date' }], 'PRODUCTION_LINE_RESOURCE_SCOPE_EFFECTIVITY_INVALID'],
  ])('rejects invalid scope %#j', (items, code) => expect(() => validate(items)).toThrow(code));

  it('rejects hierarchy mismatch and inactive assignment', () => {
    expect(() => validate([{ resource_assignment_id: 'ra-site' }], { assignments: [assignment('ra-site', { site_id: 'site-2' })] })).toThrow('PRODUCTION_LINE_RESOURCE_SITE_MISMATCH');
    expect(() => validate([{ resource_assignment_id: 'ra-wc' }], { assignments: [assignment('ra-wc', { work_center_id: 'wc-2' })] })).toThrow('PRODUCTION_LINE_RESOURCE_WORK_CENTER_NOT_SCOPED');
    expect(() => validate([{ resource_assignment_id: 'ra-old' }], { assignments: [assignment('ra-old', { lifecycle_status: 'Obsolete' })] })).toThrow('PRODUCTION_LINE_RESOURCE_ASSIGNMENT_INACTIVE');
  });

  it('prevents one assignment leaking across line scopes', () => {
    expect(() => validate([{ resource_assignment_id: 'ra-1' }], { owners: [['ra-1', 'line-2']] })).toThrow('RESOURCE_ASSIGNMENT_LINE_SCOPE_OVERLAP');
  });

  it('guards scope removal from an active Released line but permits Draft removal', () => {
    expect(() => validate([{ resource_assignment_id: 'ra-1' }], { line: { ...line, lifecycle_status: 'Released' }, current: ['ra-1', 'ra-2'] })).toThrow('PRODUCTION_LINE_RELEASED_RESOURCE_SCOPE_REMOVE_FORBIDDEN');
    expect(validate([{ resource_assignment_id: 'ra-1' }], { current: ['ra-1', 'ra-2'] })).toHaveLength(1);
  });
});
