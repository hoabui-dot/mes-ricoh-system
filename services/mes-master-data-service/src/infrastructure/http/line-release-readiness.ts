export type LineReadinessDiagnostic = {
  code: string;
  category: 'line' | 'work_center' | 'resource_scope' | 'eligibility';
  severity: 'blocking' | 'warning';
  reference_id?: string;
};

export type LineReleaseReadiness = {
  status: 'Ready' | 'ReadyWithWarnings' | 'NotReady';
  ready: boolean;
  blocker_count: number;
  warning_count: number;
  blockers: LineReadinessDiagnostic[];
  warnings: LineReadinessDiagnostic[];
};

type Row = Record<string, any>;
type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: Row[] }> };

function effective(row: Row, now: Date, prefix = ''): boolean {
  const active = row[`${prefix}active_flag`];
  const from = row[`${prefix}effective_from`];
  const to = row[`${prefix}effective_to`];
  return active !== false && (!from || new Date(from) <= now) && (!to || new Date(to) > now);
}

export function evaluateLineReleaseReadiness(input: {
  line: Row;
  memberships: Row[];
  scopes: Row[];
  eligibilityCount: number;
  now?: Date;
}): LineReleaseReadiness {
  const now = input.now ?? new Date();
  const blockers: LineReadinessDiagnostic[] = [];
  const warnings: LineReadinessDiagnostic[] = [];
  const block = (code: string, category: LineReadinessDiagnostic['category'], reference_id?: string) => blockers.push({ code, category, severity: 'blocking', ...(reference_id ? { reference_id } : {}) });

  if (!effective(input.line, now)) block('PRODUCTION_LINE_NOT_EFFECTIVE', 'line', input.line.master_id);

  const currentMemberships = input.memberships.filter((row) => effective(row, now));
  if (!currentMemberships.length) {
    const hasExpiredMembership = input.memberships.some((row) => row.active_flag !== false && row.effective_to && new Date(row.effective_to) <= now);
    block(hasExpiredMembership ? 'PRODUCTION_LINE_WORK_CENTER_MEMBERSHIP_EXPIRED' : 'PRODUCTION_LINE_WORK_CENTER_REQUIRED', 'work_center');
  }

  const currentScopes = input.scopes.filter((row) => effective(row, now));
  const currentWorkCenterIds = new Set(currentMemberships.map((row) => String(row.work_center_id)));
  for (const membership of currentMemberships) {
    const referenceId = String(membership.line_work_center_id || membership.work_center_id);
    if (membership.work_center_active_flag === false || membership.work_center_lifecycle_status !== 'Released' || !effective(membership, now, 'work_center_')) block('PRODUCTION_LINE_WORK_CENTER_NOT_READY', 'work_center', referenceId);
    if (membership.work_center_site_id !== input.line.site_id || membership.work_center_area_id !== input.line.area_id) block('PRODUCTION_LINE_WORK_CENTER_HIERARCHY_INVALID', 'work_center', referenceId);
    if (Number(membership.shared_line_count || 0) > 1 && !currentScopes.some((scope) => String(scope.work_center_id) === String(membership.work_center_id))) block('PRODUCTION_LINE_RESOURCE_SCOPE_REQUIRED', 'resource_scope', String(membership.work_center_id));
  }

  for (const scope of currentScopes) {
    const referenceId = String(scope.scope_id || scope.resource_assignment_id);
    if (!currentWorkCenterIds.has(String(scope.work_center_id)) || String(scope.assignment_work_center_id) !== String(scope.work_center_id) || scope.assignment_site_id !== input.line.site_id) block('PRODUCTION_LINE_RESOURCE_SCOPE_HIERARCHY_INVALID', 'resource_scope', referenceId);
    if (scope.assignment_lifecycle_status !== 'Released' || !effective(scope, now, 'assignment_') || scope.resource_reference_ready === false) block('PRODUCTION_LINE_RESOURCE_SCOPE_REFERENCE_NOT_READY', 'resource_scope', referenceId);
    if (scope.other_line_conflict === true) block('PRODUCTION_LINE_RESOURCE_SCOPE_CONFLICT', 'resource_scope', referenceId);
  }

  if (input.eligibilityCount === 0) warnings.push({ code: 'PRODUCTION_LINE_ELIGIBILITY_NOT_CONFIGURED', category: 'eligibility', severity: 'warning' });
  return {
    status: blockers.length ? 'NotReady' : warnings.length ? 'ReadyWithWarnings' : 'Ready',
    ready: blockers.length === 0,
    blocker_count: blockers.length,
    warning_count: warnings.length,
    blockers,
    warnings,
  };
}

export async function loadLineReleaseReadiness(db: Queryable, lineId: string, now = new Date()): Promise<{ line: Row | null; readiness: LineReleaseReadiness | null }> {
  const at = now.toISOString();
  const lineResult = await db.query(`SELECT * FROM md_production_line WHERE master_id = $1`, [lineId]);
  const line = lineResult.rows[0] || null;
  if (!line) return { line: null, readiness: null };
  const [memberships, scopes, eligibility] = await Promise.all([
    db.query(`
      SELECT lwc.*, wc.site_id AS work_center_site_id, wc.area_id AS work_center_area_id,
             wc.lifecycle_status AS work_center_lifecycle_status, wc.active_flag AS work_center_active_flag,
             wc.effective_from AS work_center_effective_from, wc.effective_to AS work_center_effective_to,
             (SELECT COUNT(DISTINCT other.production_line_id)::INT FROM md_production_line_work_center other
              WHERE other.work_center_id = lwc.work_center_id AND other.active_flag = TRUE
                AND other.effective_from <= $2::timestamptz AND (other.effective_to IS NULL OR other.effective_to > $2::timestamptz)) AS shared_line_count
      FROM md_production_line_work_center lwc JOIN md_work_center wc ON wc.master_id = lwc.work_center_id
      WHERE lwc.production_line_id = $1 AND lwc.active_flag = TRUE`, [lineId, at]),
    db.query(`
      SELECT scope.*, ra.site_id AS assignment_site_id, ra.work_center_id AS assignment_work_center_id,
             ra.lifecycle_status AS assignment_lifecycle_status, ra.effective_from AS assignment_effective_from,
             ra.effective_to AS assignment_effective_to,
             (ra.workstation_id IS NULL OR (ws.lifecycle_status = 'Released' AND ws.active_flag = TRUE AND ws.effective_from <= $2::timestamptz AND (ws.effective_to IS NULL OR ws.effective_to > $2::timestamptz)))
             AND (ra.equipment_id IS NULL OR (eq.lifecycle_status = 'Released' AND eq.active_flag = TRUE AND eq.effective_from <= $2::timestamptz AND (eq.effective_to IS NULL OR eq.effective_to > $2::timestamptz)))
             AND (ra.machine_group_id IS NULL OR (mg.lifecycle_status = 'Released' AND mg.effective_from <= $2::timestamptz AND (mg.effective_to IS NULL OR mg.effective_to > $2::timestamptz)))
             AND (ra.machine_unit_id IS NULL OR mu.active_flag = TRUE) AS resource_reference_ready,
             EXISTS (SELECT 1 FROM md_production_line_resource_scope other
                     WHERE other.resource_assignment_id = scope.resource_assignment_id AND other.production_line_id <> scope.production_line_id
                       AND other.active_flag = TRUE AND other.effective_from <= $2::timestamptz AND (other.effective_to IS NULL OR other.effective_to > $2::timestamptz)) AS other_line_conflict
      FROM md_production_line_resource_scope scope
      JOIN md_resource_assignment ra ON ra.master_id = scope.resource_assignment_id
      LEFT JOIN md_workstation ws ON ws.master_id = ra.workstation_id
      LEFT JOIN md_equipment eq ON eq.master_id = ra.equipment_id
      LEFT JOIN md_workstation_machine_group mg ON mg.master_id = ra.machine_group_id
      LEFT JOIN md_machine_unit mu ON mu.machine_unit_id = ra.machine_unit_id
      WHERE scope.production_line_id = $1 AND scope.active_flag = TRUE`, [lineId, at]),
    db.query(`SELECT COUNT(*)::INT AS count FROM md_production_version_line_eligibility WHERE production_line_id = $1 AND active_flag = TRUE AND effective_from <= $2::timestamptz AND (effective_to IS NULL OR effective_to > $2::timestamptz)`, [lineId, at]),
  ]);
  return { line, readiness: evaluateLineReleaseReadiness({ line, memberships: memberships.rows, scopes: scopes.rows, eligibilityCount: Number(eligibility.rows[0]?.count || 0), now }) };
}
