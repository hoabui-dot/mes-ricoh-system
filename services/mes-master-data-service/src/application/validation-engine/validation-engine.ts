import { Pool, PoolClient } from 'pg';

export interface ValidationFailure {
  rule: string;
  severity: 'ERROR' | 'WARN';
  code: string;
  params?: Record<string, string | number>;
}

export interface ValidationResult {
  production_version_id: string;
  valid: boolean;
  failures: ValidationFailure[];
  warnings: ValidationFailure[];
  delegated_rules: Array<{ rule: string; delegated_to: string; reason: string }>;
}

type Queryable = Pool | PoolClient;

async function exists(db: Queryable, sql: string, params: unknown[]): Promise<boolean> {
  const { rows } = await db.query(sql, params);
  return rows.length > 0;
}

function fail(rule: string, code: string, params?: Record<string, string | number>): ValidationFailure {
  return { rule, severity: 'ERROR', code, ...(params ? { params } : {}) };
}

export async function validateProductionVersion(
  db: Queryable,
  productionVersionId: string,
): Promise<ValidationResult> {
  const failures: ValidationFailure[] = [];

  const { rows } = await db.query<{
    pv_id: string;
    item_revision_id: string;
    mbom_header_id: string;
    routing_header_id: string;
    site_id: string;
  }>(
    `SELECT master_id AS pv_id, item_revision_id, mbom_header_id, routing_header_id, site_id
     FROM md_production_version
     WHERE master_id = $1`,
    [productionVersionId],
  );
  const pv = rows[0];
  if (!pv) {
    failures.push(fail('PV_EXISTS', 'PRODUCTION_VERSION.NOT_FOUND'));
    return {
      production_version_id: productionVersionId,
      valid: false,
      failures,
      warnings: [],
      delegated_rules: [{ rule: '9', delegated_to: 'mes-traceability-service', reason: 'Traceability policy is outside mes-master-data-service ownership.' }],
    };
  }

  if (!(await exists(db, `SELECT 1 FROM md_item_revision WHERE master_id = $1 AND lifecycle_status = 'Released' AND effective_from <= NOW() AND (effective_to IS NULL OR effective_to > NOW())`, [pv.item_revision_id]))) {
    failures.push(fail('1', 'ITEM_REVISION.NOT_RELEASED'));
  }
  const outputItem = await db.query<{ item_type: string }>(`
    SELECT i.item_type
    FROM md_item_revision r
    JOIN md_item i ON i.master_id = r.item_id
    WHERE r.master_id = $1`, [pv.item_revision_id]);
  if (!outputItem.rows[0]) failures.push(fail('1', 'ITEM_REVISION.NOT_FOUND'));
  else if (outputItem.rows[0].item_type === 'RM') failures.push(fail('1', 'MBOM.OUTPUT_RAW_MATERIAL'));

  const mbomHeader = await db.query<{ base_uom_id: string; effective_from: string; effective_to: string | null; item_revision_id: string | null }>(`SELECT base_uom_id, effective_from, effective_to, item_revision_id FROM md_mbom_header WHERE master_id = $1 AND lifecycle_status = 'Released' AND effective_from <= NOW() AND (effective_to IS NULL OR effective_to > NOW())`, [pv.mbom_header_id]);
  if (!mbomHeader.rows[0]) failures.push(fail('2', 'MBOM.NOT_RELEASED'));
  else if (mbomHeader.rows[0].item_revision_id && mbomHeader.rows[0].item_revision_id !== pv.item_revision_id) {
    failures.push(fail('2', 'PRODUCTION_VERSION_MBOM_ITEM_REVISION_MISMATCH'));
  }
  const outputUom = await db.query<{ base_uom_id: string }>(`SELECT base_uom_id FROM md_item_revision WHERE master_id = $1`, [pv.item_revision_id]);
  if (mbomHeader.rows[0] && outputUom.rows[0] && mbomHeader.rows[0].base_uom_id !== outputUom.rows[0].base_uom_id) failures.push(fail('2', 'PRODUCTION_VERSION_MBOM_UOM_MISMATCH'));

  const { rows: mbomLines } = await db.query<{ master_id: string; quantity_per: string; uom_id: string; phantom_flag: boolean; component_revision_id: string; issue_operation_id: string | null }>(
    `SELECT l.master_id, l.quantity_per, r.base_uom_id AS uom_id, l.phantom_flag, l.component_revision_id, l.issue_operation_id
     FROM md_mbom_line l JOIN md_item_revision r ON r.master_id = l.component_revision_id
     WHERE l.mbom_header_id = $1 AND l.effective_to IS NULL AND l.lifecycle_status NOT IN ('Inactive','Obsolete')`,
    [pv.mbom_header_id],
  );
  if (mbomLines.length === 0) {
    failures.push(fail('2', 'MBOM.NO_LINES'));
  }
  for (const line of mbomLines) {
    if (Number(line.quantity_per) <= 0) {
      failures.push(fail('2', 'MBOM.LINE_QTY_NON_POSITIVE', { lineId: line.master_id }));
    }
    if (!(await exists(db, `SELECT 1 FROM md_uom WHERE master_id = $1 AND lifecycle_status = 'Released'`, [line.uom_id]))) {
      failures.push(fail('2', 'MBOM.LINE_UOM_NOT_RELEASED', { lineId: line.master_id }));
    }
    // MBOM headers are independent master data. A phantom line has no implicit
    // child-MBOM ownership relationship, so it is not resolved through a
    // component revision lookup.
  }
  if (await exists(db, `WITH RECURSIVE c(master_id, parent_line_id, path) AS (
      SELECT master_id, parent_line_id, ARRAY[master_id] FROM md_mbom_line WHERE mbom_header_id = $1
      UNION ALL
      SELECT l.master_id, l.parent_line_id, c.path || l.master_id
      FROM md_mbom_line l JOIN c ON l.parent_line_id = c.master_id
      WHERE NOT l.master_id = ANY(c.path)
    )
    SELECT 1 FROM md_mbom_line l JOIN c ON l.master_id = c.parent_line_id WHERE l.master_id = ANY(c.path) LIMIT 1`, [pv.mbom_header_id])) {
    failures.push(fail('2', 'MBOM.CYCLE'));
  }

  const { rows: routingOps } = await db.query<{ master_id: string; operation_id: string; work_center_id: string; seq: number; predecessor_seq: number | null; lifecycle_status: string }>(
    `SELECT master_id, operation_id, work_center_id, seq, predecessor_seq, lifecycle_status
     FROM md_routing_operation WHERE routing_header_id = $1 AND effective_to IS NULL AND lifecycle_status NOT IN ('Inactive','Obsolete')`,
    [pv.routing_header_id],
  );
  if (routingOps.length === 0) {
    failures.push(fail('4', 'ROUTING.NO_OPERATIONS'));
  }
  const routingActive = await exists(db, `SELECT 1 FROM md_routing_header WHERE master_id = $1 AND lifecycle_status = 'Released' AND effective_from <= NOW() AND (effective_to IS NULL OR effective_to > NOW())`, [pv.routing_header_id]);
  if (!routingActive) failures.push(fail('4', 'ROUTING.NOT_ACTIVE'));
  const factoryIds = new Set<string>();
  const seqs = new Set<number>();
  const routingOperationIds = new Set(routingOps.map((operation) => operation.operation_id));
  for (const op of routingOps) {
    if (op.lifecycle_status !== 'Released') failures.push(fail('4', 'ROUTING_OPERATION_NOT_RELEASED', { routingOperationId: op.master_id }));
    if (seqs.has(op.seq)) failures.push(fail('4', 'ROUTING.SEQ_DUPLICATE', { seq: op.seq }));
    seqs.add(op.seq);
    if (op.predecessor_seq !== null && !routingOps.some((candidate) => candidate.seq === op.predecessor_seq)) {
      failures.push(fail('4', 'ROUTING.PREDECESSOR_MISSING', { seq: op.seq, predecessorSeq: op.predecessor_seq }));
    }
    const workCenter = await db.query<{ site_id: string }>(`SELECT site_id FROM md_work_center WHERE master_id = $1 AND active_flag = TRUE AND lifecycle_status NOT IN ('Inactive', 'Obsolete')`, [op.work_center_id]);
    if (!workCenter.rows[0]) failures.push(fail('5', 'ROUTING_WORKCENTER_INVALID', { routingOperationId: op.master_id }));
    else factoryIds.add(workCenter.rows[0].site_id);
    if (!(await exists(db, `SELECT 1 FROM md_operation WHERE master_id = $1 AND lifecycle_status = 'Released'`, [op.operation_id]))) failures.push(fail('5', 'ROUTING_OPERATION_INACTIVE', { routingOperationId: op.master_id }));
    const workstationCapabilitySupported = await exists(db, `
      SELECT 1 FROM md_work_center wc
      JOIN md_work_center_composition c ON c.work_center_id = wc.master_id AND c.active_flag = TRUE AND (c.effective_to IS NULL OR c.effective_to > NOW())
      JOIN md_workstation ws ON ws.master_id = c.workstation_id AND ws.active_flag = TRUE AND ws.lifecycle_status NOT IN ('Inactive', 'Obsolete')
      JOIN md_workstation_operation_capability capability ON capability.workstation_id = ws.master_id AND capability.operation_id = $2 AND capability.active_flag = TRUE AND (capability.effective_to IS NULL OR capability.effective_to > NOW())
      WHERE wc.master_id = $1 AND wc.active_flag = TRUE AND wc.lifecycle_status NOT IN ('Inactive', 'Obsolete')`, [op.work_center_id, op.operation_id]);
    const lineCapabilitySupported = await exists(db, `
      SELECT 1
      FROM md_production_version_line_eligibility e
      WHERE e.production_version_id = $1
        AND e.active_flag = TRUE
        AND e.effective_from <= NOW()
        AND (e.effective_to IS NULL OR e.effective_to > NOW())
        AND NOT EXISTS (
          SELECT 1
          FROM md_production_line_work_center lwc
          JOIN md_resource_capability rc ON rc.work_center_id = lwc.work_center_id
            AND rc.operation_id = $2
            AND rc.eligibility = TRUE
            AND rc.active_flag = TRUE
            AND rc.lifecycle_status = 'Released'
            AND rc.effective_from <= NOW()
            AND (rc.effective_to IS NULL OR rc.effective_to > NOW())
          WHERE lwc.production_line_id = e.production_line_id
            AND lwc.active_flag = TRUE
            AND lwc.effective_from <= NOW()
            AND (lwc.effective_to IS NULL OR lwc.effective_to > NOW())
        )
      LIMIT 1`, [productionVersionId, op.operation_id]);
    if (!workstationCapabilitySupported && lineCapabilitySupported) failures.push(fail('6', 'WORKCENTER_OPERATION_NOT_SUPPORTED', { routingOperationId: op.master_id }));
    const schedulable = await exists(db, `SELECT 1 FROM md_operation WHERE master_id = $1 AND is_schedulable = TRUE`, [op.operation_id]);
    if (schedulable && !(await exists(db, `
      SELECT 1 FROM md_operation operation
      JOIN md_work_center wc ON wc.master_id = $4
      WHERE operation.master_id = $3
        AND (
          (operation.default_cycle_time_sec > 0 AND operation.default_base_quantity > 0 AND operation.default_required_persons > 0 AND operation.default_efficiency_factor > 0 AND operation.default_yield > 0)
          OR EXISTS (SELECT 1 FROM md_production_standard ps WHERE (ps.item_revision_id = $1 OR ps.item_revision_id IS NULL) AND (ps.routing_operation_id = $2 OR (ps.routing_operation_id IS NULL AND ps.operation_id = $3 AND ps.work_center_id = $4)) AND ps.setup_time_min IS NOT NULL AND ps.cycle_time_sec IS NOT NULL AND ps.lifecycle_status = 'Released')
          OR EXISTS (SELECT 1 FROM md_production_standard ps WHERE ps.item_revision_id IS NULL AND ps.routing_operation_id IS NULL AND ps.operation_id = $3 AND ps.work_center_id = $4 AND ps.site_id = wc.site_id AND ps.source_method = 'WorkCenter' AND ps.setup_time_min IS NOT NULL AND ps.cycle_time_sec IS NOT NULL AND ps.lifecycle_status = 'Released')
        )`, [pv.item_revision_id, op.master_id, op.operation_id, op.work_center_id]))) {
      failures.push(fail('7', 'PRODUCTION_STANDARD.MISSING_TIME', { routingOperationId: op.master_id }));
    }
  }
  for (const line of mbomLines) {
    if (line.issue_operation_id && !routingOperationIds.has(line.issue_operation_id)) failures.push(fail('3', 'PRODUCTION_VERSION_ISSUE_OPERATION_NOT_IN_ROUTING', { lineId: line.master_id }));
  }
  if (routingOps.some((op) => op.predecessor_seq === op.seq)) {
    failures.push(fail('4', 'ROUTING.CYCLE'));
  }

  const lineEligibility = await db.query<{ active_count: number; primary_count: number; priority_count: number }>(`
    SELECT COUNT(*)::INT AS active_count,
           COUNT(*) FILTER (WHERE is_primary = TRUE)::INT AS primary_count,
           COUNT(DISTINCT priority_no)::INT AS priority_count
    FROM md_production_version_line_eligibility
    WHERE production_version_id = $1
      AND active_flag = TRUE
      AND effective_from <= NOW()
      AND (effective_to IS NULL OR effective_to > NOW())`, [productionVersionId]);
  const eligibilityCounts = lineEligibility.rows[0];
  if (!eligibilityCounts || Number(eligibilityCounts.active_count) < 1) failures.push(fail('11', 'PRODUCTION_VERSION_LINE_ELIGIBILITY_REQUIRED'));
  else {
    if (Number(eligibilityCounts.primary_count) !== 1) failures.push(fail('11', 'PRODUCTION_VERSION_LINE_PRIMARY_REQUIRED'));
    if (Number(eligibilityCounts.priority_count) !== Number(eligibilityCounts.active_count)) failures.push(fail('11', 'PRODUCTION_VERSION_LINE_PRIORITY_DUPLICATE'));
  }

  const warnings: ValidationFailure[] = factoryIds.size > 1 ? [{ rule: '5', severity: 'WARN', code: 'INTER_FACTORY_ROUTING' }] : [];
  if (!(await exists(db, `SELECT 1 FROM md_resource_calendar WHERE available_from <= NOW() AND available_to > NOW() AND lifecycle_status = 'Released'`, []))) {
    failures.push(fail('8', 'RESOURCE_CALENDAR.MISSING'));
  }
  if (!(await exists(db, `SELECT 1 FROM md_role_permission WHERE permission_code = 'MES_MASTER_DATA_APPROVE' AND action = 'APPROVE' AND lifecycle_status = 'Released'`, []))) {
    failures.push(fail('10', 'PERMISSION.APPROVER_MISSING'));
  }
  if (!(await exists(db, `SELECT 1 FROM md_workstation WHERE active_flag = TRUE AND lifecycle_status = 'Released'`, []))) {
    failures.push(fail('10', 'WORKSTATION.EXECUTOR_MISSING'));
  }

  return {
    production_version_id: productionVersionId,
    valid: failures.length === 0,
    failures,
    warnings,
    delegated_rules: [{ rule: '9', delegated_to: 'mes-traceability-service', reason: 'Traceability policy is outside mes-master-data-service ownership.' }],
  };
}
