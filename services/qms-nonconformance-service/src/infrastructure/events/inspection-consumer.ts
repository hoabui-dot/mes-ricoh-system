import { Kafka, type Consumer } from 'kafkajs';
import type { Pool } from 'pg';
import { allocateCode, publishNcrRaised } from '../../domain/case-service.js';

type Envelope = { event_id: string; event_type: string; trace_id?: string; payload: Record<string, unknown> };

export class InspectionFailureConsumer {
  private consumer: Consumer | null = null;
  constructor(private readonly pool: Pool, private readonly brokers: string[]) {}
  async start(): Promise<void> {
    const kafka = new Kafka({ clientId: 'qms-nonconformance-service-consumer', brokers: this.brokers });
    this.consumer = kafka.consumer({ groupId: 'qms-nonconformance-service-group' }); await this.consumer.connect(); await this.consumer.subscribe({ topics: ['QMS.Inspection.InspectionFailed.v1'], fromBeginning: true });
    await this.consumer.run({ eachMessage: async ({ message }) => { if (!message.value) return; try { await this.process(JSON.parse(message.value.toString()) as Envelope); } catch (error) { console.error('[InspectionFailureConsumer] Processing failed:', error); } } });
    console.info('[InspectionFailureConsumer] Listening for QMS.Inspection.InspectionFailed.v1');
  }
  private async process(envelope: Envelope): Promise<void> {
    if (envelope.event_type !== 'QMS.Inspection.InspectionFailed.v1') return;
    const p = envelope.payload ?? {};
    const siteId = String(p['site_id'] ?? '');
    if (!siteId) {
      console.warn(`[InspectionFailureConsumer] Ignoring historical event without site_id: ${envelope.event_id}`);
      return;
    }
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [envelope.event_id]); if ((await client.query('SELECT ncr_id FROM qms_ncr WHERE source_event_id=$1', [envelope.event_id])).rows[0]) { await client.query('ROLLBACK'); return; }
      const code = await allocateCode(client, 'NCR', siteId);
      const failed = Array.isArray(p['failed_characteristics']) ? p['failed_characteristics'] as Array<Record<string, unknown>> : [];
      const description = { vi: `Không phù hợp phát sinh từ kiểm tra ${String(p['result_id'] ?? '')}`, en: `Nonconformance from inspection ${String(p['result_id'] ?? '')}`, ja: `検査 ${String(p['result_id'] ?? '')} で発生した不適合`, ko: `검사 ${String(p['result_id'] ?? '')}에서 발생한 부적합` };
      const severity = ['Critical', 'Major', 'Minor'].includes(String(p['defect_category'])) ? String(p['defect_category']) : 'Major';
      const row = (await client.query(`INSERT INTO qms_ncr (ncr_code,source,source_result_id,source_event_id,item_revision_id,work_order_id,work_center_id,lot_or_label_ref,site_id,severity,description,status,raised_by_user_id) VALUES ($1,'InspectionFailure',$2,$3,$4,$5,$6,$7,$8,$9,$10,'Open',$11) RETURNING *`, [code, p['result_id'] ?? null, envelope.event_id, p['item_revision_id'] ?? null, p['work_order_id'] ?? null, p['work_center_id'] ?? null, p['lot_or_label_ref'] ?? null, siteId, severity, JSON.stringify(description), '00000000-0000-0000-0000-000000000001'])).rows[0] as Record<string, unknown>;
      await publishNcrRaised(client, envelope.trace_id ?? 'missing-trace', { ...row, failed_characteristics: failed }); await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async stop(): Promise<void> { if (this.consumer) { await this.consumer.disconnect(); this.consumer = null; } }
}
