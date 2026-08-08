import { describe, expect, it } from 'vitest';
import { evaluateLineReleaseReadiness } from '../../src/infrastructure/http/line-release-readiness.js';

const now = new Date('2026-08-07T00:00:00Z');
const line = { master_id: 'line-1', site_id: 'site-1', area_id: 'area-1', active_flag: true, effective_from: '2026-01-01T00:00:00Z', effective_to: null };
const membership = { line_work_center_id: 'lwc-1', work_center_id: 'wc-1', active_flag: true, effective_from: '2026-01-01T00:00:00Z', effective_to: null, work_center_site_id: 'site-1', work_center_area_id: 'area-1', work_center_lifecycle_status: 'Released', work_center_active_flag: true, work_center_effective_from: '2026-01-01T00:00:00Z', work_center_effective_to: null, shared_line_count: 1 };
const scope = { scope_id: 'scope-1', resource_assignment_id: 'ra-1', work_center_id: 'wc-1', active_flag: true, effective_from: '2026-01-01T00:00:00Z', effective_to: null, assignment_site_id: 'site-1', assignment_work_center_id: 'wc-1', assignment_lifecycle_status: 'Released', assignment_effective_from: '2026-01-01T00:00:00Z', assignment_effective_to: null, resource_reference_ready: true, other_line_conflict: false };

const evaluate = (overrides: Partial<Parameters<typeof evaluateLineReleaseReadiness>[0]> = {}) => evaluateLineReleaseReadiness({ line, memberships: [membership], scopes: [], eligibilityCount: 0, now, ...overrides });

describe('Production Line structural release readiness', () => {
  it('blocks an empty line', () => expect(evaluate({ memberships: [] })).toMatchObject({ ready: false, blockers: [{ code: 'PRODUCTION_LINE_WORK_CENTER_REQUIRED' }] }));
  it('blocks an expired-only membership', () => expect(evaluate({ memberships: [{ ...membership, effective_to: '2026-08-06T00:00:00Z' }] }).blockers[0]?.code).toBe('PRODUCTION_LINE_WORK_CENTER_MEMBERSHIP_EXPIRED'));
  it('requires explicit scope for a shared Work Center', () => expect(evaluate({ memberships: [{ ...membership, shared_line_count: 2 }] }).blockers[0]?.code).toBe('PRODUCTION_LINE_RESOURCE_SCOPE_REQUIRED'));
  it('allows dedicated Work Center fallback and treats missing eligibility as warning', () => expect(evaluate()).toMatchObject({ ready: true, status: 'ReadyWithWarnings', warning_count: 1 }));
  it('blocks invalid scoped references', () => expect(evaluate({ scopes: [{ ...scope, assignment_lifecycle_status: 'Inactive' }] }).blockers[0]?.code).toBe('PRODUCTION_LINE_RESOURCE_SCOPE_REFERENCE_NOT_READY'));
  it('releases structurally valid shared topology', () => expect(evaluate({ memberships: [{ ...membership, shared_line_count: 2 }], scopes: [scope], eligibilityCount: 1 })).toMatchObject({ ready: true, status: 'Ready', blocker_count: 0 }));
});
