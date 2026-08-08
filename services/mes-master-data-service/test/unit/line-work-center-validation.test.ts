import { describe, expect, it } from 'vitest';
import { validateLineWorkCenterReplacement, type ProductionLineMembershipContext, type WorkCenterMembershipContext } from '../../src/infrastructure/http/line-work-center-validation.js';

const line: ProductionLineMembershipContext = {
  master_id: 'line-1', site_id: 'site-1', area_id: 'area-1', lifecycle_status: 'Draft', active_flag: true,
};

function workCenter(id: string, overrides: Partial<WorkCenterMembershipContext> = {}): WorkCenterMembershipContext {
  return { master_id: id, site_id: 'site-1', area_id: 'area-1', lifecycle_status: 'Released', active_flag: true, ...overrides };
}

function validate(items: unknown, options: {
  line?: ProductionLineMembershipContext;
  workCenters?: WorkCenterMembershipContext[];
  current?: string[];
} = {}) {
  const centers = options.workCenters ?? [workCenter('wc-1'), workCenter('wc-2')];
  return validateLineWorkCenterReplacement({
    line: options.line ?? line,
    items,
    workCenters: new Map(centers.map((center) => [center.master_id, center])),
    currentWorkCenterIds: new Set(options.current ?? []),
    now: new Date('2026-08-07T00:00:00.000Z'),
  });
}

describe('Production Line Work Center replacement validation', () => {
  it('normalizes ordered valid membership', () => {
    expect(validate([
      { work_center_id: 'wc-2', sequence_no: 2, mandatory_flag: false },
      { work_center_id: 'wc-1', sequence_no: 1 },
    ])).toEqual([
      { work_center_id: 'wc-1', sequence_no: 1, mandatory_flag: true, effective_from: null, effective_to: null },
      { work_center_id: 'wc-2', sequence_no: 2, mandatory_flag: false, effective_from: null, effective_to: null },
    ]);
  });

  it.each([
    [[{ work_center_id: 'missing' }], 'WORK_CENTER_NOT_FOUND'],
    [[{ work_center_id: 'wc-1' }, { work_center_id: 'wc-1' }], 'PRODUCTION_LINE_WORK_CENTER_DUPLICATE'],
    [[{ work_center_id: 'wc-1', sequence_no: 1 }, { work_center_id: 'wc-2', sequence_no: 1 }], 'PRODUCTION_LINE_WORK_CENTER_SEQUENCE_DUPLICATE'],
    [[{ work_center_id: 'wc-1', sequence_no: 0 }], 'PRODUCTION_LINE_WORK_CENTER_SEQUENCE_INVALID'],
    [[{ work_center_id: 'wc-1', effective_from: '2026-08-08T00:00:00Z', effective_to: '2026-08-07T00:00:00Z' }], 'PRODUCTION_LINE_WORK_CENTER_EFFECTIVITY_INVALID'],
  ])('rejects invalid membership %#j', (items, code) => {
    expect(() => validate(items)).toThrow(code);
  });

  it('rejects wrong-site and wrong-area Work Centers', () => {
    expect(() => validate([{ work_center_id: 'wc-site' }], { workCenters: [workCenter('wc-site', { site_id: 'site-2' })] })).toThrow('PRODUCTION_LINE_WORK_CENTER_SITE_MISMATCH');
    expect(() => validate([{ work_center_id: 'wc-area' }], { workCenters: [workCenter('wc-area', { area_id: 'area-2' })] })).toThrow('PRODUCTION_LINE_WORK_CENTER_AREA_MISMATCH');
  });

  it('rejects inactive Work Centers', () => {
    expect(() => validate([{ work_center_id: 'wc-1' }], { workCenters: [workCenter('wc-1', { active_flag: false })] })).toThrow('PRODUCTION_LINE_WORK_CENTER_INACTIVE');
  });

  it('allows a shared Work Center topology; Resource Assignment scope owns isolation', () => {
    expect(validate([{ work_center_id: 'wc-1' }])).toHaveLength(1);
  });

  it('guards removing membership from an active Released line', () => {
    expect(() => validate([{ work_center_id: 'wc-1' }], {
      line: { ...line, lifecycle_status: 'Released' }, current: ['wc-1', 'wc-2'],
    })).toThrow('PRODUCTION_LINE_RELEASED_WORK_CENTER_REMOVE_FORBIDDEN');
  });

  it('allows removing membership while the line is Draft', () => {
    expect(validate([{ work_center_id: 'wc-1' }], { current: ['wc-1', 'wc-2'] })).toHaveLength(1);
  });
});
