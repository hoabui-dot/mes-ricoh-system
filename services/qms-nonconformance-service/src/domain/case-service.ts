import { createEventEnvelope, writeToOutbox } from '@mom-platform/shared-kernel';
import type { PoolClient } from 'pg';

export const SERVICE_NAME = 'qms-nonconformance-service';

export async function allocateCode(client: PoolClient, entityType: 'NCR' | 'CAPA', siteId: string): Promise<string> {
  const prefix = entityType === 'NCR' ? 'NCR' : 'CAPA';
  const rule = (await client.query(`INSERT INTO qms_ncr_numbering_rule (entity_type, site_id, prefix, date_format, sequence_length) VALUES ($1,$2,$3,'YYYYMMDD',5) ON CONFLICT (entity_type,site_id) DO UPDATE SET prefix=EXCLUDED.prefix RETURNING rule_id,prefix,date_format,sequence_length`, [entityType, siteId, prefix])).rows[0] as { rule_id: string; prefix: string; date_format: string; sequence_length: number };
  const datePart = rule.date_format === 'YYMMDD' ? new Date().toISOString().slice(2, 10).replace(/-/g, '') : new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const sequenceKey = datePart;
  const sequence = (await client.query(`INSERT INTO qms_ncr_numbering_sequence (rule_id, sequence_key, current_value, updated_at) VALUES ($1,$2,1,NOW()) ON CONFLICT (rule_id,sequence_key) DO UPDATE SET current_value=qms_ncr_numbering_sequence.current_value+1,updated_at=NOW() RETURNING current_value`, [rule.rule_id, sequenceKey])).rows[0] as { current_value: number };
  return `${rule.prefix}-${datePart}-${String(sequence.current_value).padStart(rule.sequence_length, '0')}`;
}

export async function publishNcrRaised(client: PoolClient, traceId: string, row: Record<string, unknown>): Promise<void> {
  await writeToOutbox(client, { topic: 'QMS.Nonconformance.NCRRaised.v1', envelope: createEventEnvelope({ event_type: 'QMS.Nonconformance.NCRRaised.v1', source_service: SERVICE_NAME, trace_id: traceId, payload: { ncr_id: row['ncr_id'], ncr_code: row['ncr_code'], source: row['source'], source_result_id: row['source_result_id'], item_revision_id: row['item_revision_id'], work_order_id: row['work_order_id'], work_center_id: row['work_center_id'], lot_or_label_ref: row['lot_or_label_ref'], site_id: row['site_id'], severity: row['severity'], status: row['status'], failed_characteristics: row['failed_characteristics'] ?? [] } }) });
}

export function error(message: string, statusCode = 400, errorCode?: string): Error & { statusCode: number; errorCode?: string } { return Object.assign(new Error(message), { statusCode, ...(errorCode ? { errorCode } : {}) }); }
