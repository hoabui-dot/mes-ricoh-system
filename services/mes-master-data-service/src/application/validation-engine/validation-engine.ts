import { Pool, PoolClient } from 'pg';

export interface ValidationFailure {
  rule: string;
  severity: 'ERROR' | 'WARN';
  message: string;
  details?: Record<string, unknown>;
}

export interface ValidationResult {
  production_version_id: string;
  valid: boolean;
  failures: ValidationFailure[];
  delegated_rules: Array<{ rule: string; delegated_to: string; reason: string }>;
}

type Queryable = Pool | PoolClient;

async function exists(db: Queryable, sql: string, params: unknown[]): Promise<boolean> {
  const { rows } = await db.query(sql, params);
  return rows.length > 0;
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
    failures.push({ rule: 'PV_EXISTS', severity: 'ERROR', message: 'Production Version does not exist' });
    return {
      production_version_id: productionVersionId,
      valid: false,
      failures,
      delegated_rules: [{ rule: '9', delegated_to: 'mes-traceability-service', reason: 'Traceability policy is outside mes-master-data-service ownership.' }],
    };
  }

  if (!(await exists(db, `SELECT 1 FROM md_item_revision WHERE master_id = $1 AND lifecycle_status = 'Released' AND effective_from <= NOW() AND (effective_to IS NULL OR effective_to > NOW())`, [pv.item_revision_id]))) {
    failures.push({ rule: '1', severity: 'ERROR', message: 'Item Revision must be Released and effective' });
  }

  const { rows: mbomLines } = await db.query<{ master_id: string; quantity_per: string; uom_id: string; phantom_flag: boolean; component_revision_id: string }>(
    `SELECT master_id, quantity_per, uom_id, phantom_flag, component_revision_id
     FROM md_mbom_line WHERE mbom_header_id = $1`,
    [pv.mbom_header_id],
  );
  if (mbomLines.length === 0) {
    failures.push({ rule: '2', severity: 'ERROR', message: 'MBOM must have at least one line' });
  }
  for (const line of mbomLines) {
    if (Number(line.quantity_per) <= 0) {
      failures.push({ rule: '2', severity: 'ERROR', message: 'MBOM line QuantityPer must be > 0', details: { line_id: line.master_id } });
    }
    if (!(await exists(db, `SELECT 1 FROM md_uom WHERE master_id = $1 AND lifecycle_status = 'Released'`, [line.uom_id]))) {
      failures.push({ rule: '2', severity: 'ERROR', message: 'MBOM line UOM must be valid and Released', details: { line_id: line.master_id } });
    }
    if (line.phantom_flag && !(await exists(db, `SELECT 1 FROM md_mbom_header WHERE item_revision_id = $1 AND lifecycle_status = 'Released'`, [line.component_revision_id]))) {
      failures.push({ rule: '3', severity: 'ERROR', message: 'Phantom component must have a valid Released child MBOM', details: { line_id: line.master_id } });
    }
  }
  if (await exists(db, `WITH RECURSIVE c(master_id, parent_line_id, path) AS (
      SELECT master_id, parent_line_id, ARRAY[master_id] FROM md_mbom_line WHERE mbom_header_id = $1
      UNION ALL
      SELECT l.master_id, l.parent_line_id, c.path || l.master_id
      FROM md_mbom_line l JOIN c ON l.parent_line_id = c.master_id
      WHERE NOT l.master_id = ANY(c.path)
    )
    SELECT 1 FROM md_mbom_line l JOIN c ON l.master_id = c.parent_line_id WHERE l.master_id = ANY(c.path) LIMIT 1`, [pv.mbom_header_id])) {
    failures.push({ rule: '2', severity: 'ERROR', message: 'MBOM hierarchy must not contain cycles' });
  }

  const { rows: routingOps } = await db.query<{ master_id: string; operation_id: string; work_center_id: string; seq: number; predecessor_seq: number | null }>(
    `SELECT master_id, operation_id, work_center_id, seq, predecessor_seq
     FROM md_routing_operation WHERE routing_header_id = $1`,
    [pv.routing_header_id],
  );
  if (routingOps.length === 0) {
    failures.push({ rule: '4', severity: 'ERROR', message: 'Routing must have at least one operation' });
  }
  const seqs = new Set<number>();
  for (const op of routingOps) {
    if (seqs.has(op.seq)) failures.push({ rule: '4', severity: 'ERROR', message: 'Routing operation sequence must be unique', details: { seq: op.seq } });
    seqs.add(op.seq);
    if (op.predecessor_seq !== null && !routingOps.some((candidate) => candidate.seq === op.predecessor_seq)) {
      failures.push({ rule: '4', severity: 'ERROR', message: 'Routing predecessor must reference an existing sequence', details: { seq: op.seq, predecessor_seq: op.predecessor_seq } });
    }
    if (!(await exists(db, `SELECT 1 FROM md_work_center WHERE master_id = $1 AND site_id = $2 AND active_flag = TRUE AND lifecycle_status = 'Released'`, [op.work_center_id, pv.site_id]))) {
      failures.push({ rule: '5', severity: 'ERROR', message: 'Work Center must be active and belong to Production Version site', details: { routing_operation_id: op.master_id } });
    }
    if (!(await exists(db, `SELECT 1 FROM md_resource_capability WHERE operation_id = $1 AND work_center_id = $2 AND capability_type = 'Eligible' AND active_flag = TRUE AND lifecycle_status = 'Released'`, [op.operation_id, op.work_center_id]))) {
      failures.push({ rule: '6', severity: 'ERROR', message: 'At least one eligible resource capability is required', details: { routing_operation_id: op.master_id } });
    }
    const schedulable = await exists(db, `SELECT 1 FROM md_operation WHERE master_id = $1 AND is_schedulable = TRUE`, [op.operation_id]);
    if (schedulable && !(await exists(db, `SELECT 1 FROM md_production_standard WHERE item_revision_id = $1 AND operation_id = $2 AND work_center_id = $3 AND setup_time_min IS NOT NULL AND cycle_time_sec IS NOT NULL AND lifecycle_status = 'Released'`, [pv.item_revision_id, op.operation_id, op.work_center_id]))) {
      failures.push({ rule: '7', severity: 'ERROR', message: 'Schedulable operation needs setup and cycle time in Production Standard', details: { routing_operation_id: op.master_id } });
    }
  }
  if (routingOps.some((op) => op.predecessor_seq === op.seq)) {
    failures.push({ rule: '4', severity: 'ERROR', message: 'Routing predecessor graph must not contain cycles' });
  }

  if (!(await exists(db, `SELECT 1 FROM md_resource_calendar WHERE available_from <= NOW() AND available_to > NOW() AND lifecycle_status = 'Released'`, []))) {
    failures.push({ rule: '8', severity: 'ERROR', message: 'Resource Calendar must have availability in the planning window' });
  }
  if (!(await exists(db, `SELECT 1 FROM md_role_permission WHERE permission_code = 'MES_MASTER_DATA_APPROVE' AND action = 'APPROVE' AND lifecycle_status = 'Released'`, []))) {
    failures.push({ rule: '10', severity: 'ERROR', message: 'At least one approver role must exist' });
  }
  if (!(await exists(db, `SELECT 1 FROM md_workstation WHERE active_flag = TRUE AND lifecycle_status = 'Released'`, []))) {
    failures.push({ rule: '10', severity: 'ERROR', message: 'At least one workstation-eligible executor must exist' });
  }

  return {
    production_version_id: productionVersionId,
    valid: failures.length === 0,
    failures,
    delegated_rules: [{ rule: '9', delegated_to: 'mes-traceability-service', reason: 'Traceability policy is outside mes-master-data-service ownership.' }],
  };
}
