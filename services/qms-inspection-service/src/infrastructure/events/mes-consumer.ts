import { Kafka, type Consumer } from 'kafkajs';
import type { Pool } from 'pg';

type Envelope = { event_id: string; event_type: string; payload: Record<string, unknown> };

export class MesInspectionConsumer {
  private consumer: Consumer | null = null;
  constructor(private readonly pool: Pool, private readonly brokers: string[]) {}

  async start(): Promise<void> {
    const kafka = new Kafka({ clientId: 'qms-inspection-service-consumer', brokers: this.brokers });
    this.consumer = kafka.consumer({ groupId: 'qms-inspection-service-group' });
    await this.consumer.connect();
    await this.consumer.subscribe({ topics: ['MES.MasterData.ItemRevisionReleased.v2', 'MES.MasterData.RoutingReleased.v1', 'MES.Execution.OperationFinished.v1'], fromBeginning: true });
    await this.consumer.run({ eachMessage: async ({ message }) => { if (!message.value) return; try { const envelope = JSON.parse(message.value.toString()) as Envelope; await this.process(envelope); } catch (error) { console.error('[MESConsumer] Message processing failed:', error); } } });
    console.info('[MESConsumer] Listening for MES master-data and operation events');
  }

  private async process(envelope: Envelope): Promise<void> {
    const p = envelope.payload ?? {};
    if (envelope.event_type === 'MES.MasterData.ItemRevisionReleased.v2') {
      await this.pool.query(`INSERT INTO qms_rm_item_revision (item_revision_id,item_code,item_name,lifecycle_status,updated_at) VALUES ($1,$2,$3::jsonb,$4,NOW()) ON CONFLICT (item_revision_id) DO UPDATE SET item_code=EXCLUDED.item_code,item_name=EXCLUDED.item_name,lifecycle_status=EXCLUDED.lifecycle_status,updated_at=NOW()`, [p['master_id'] ?? p['item_revision_id'], p['code'] ?? '', JSON.stringify(p['name'] ?? { vi: '' }), p['lifecycle_status'] ?? 'Released']);
      return;
    }
    if (envelope.event_type !== 'MES.Execution.OperationFinished.v1') return;
    const operationId = String(p['operation_id'] ?? '');
    const itemRevisionId = String(p['item_revision_id'] ?? '');
    const workOrderId = String(p['wo_id'] ?? '');
    if (!operationId || !itemRevisionId || !workOrderId) { console.warn(`[MESConsumer] Ignoring incomplete OperationFinished event ${envelope.event_id}`); return; }
    const operation = await this.pool.query('SELECT operation_type, site_id FROM qms_rm_operation WHERE operation_id=$1', [operationId]);
    if (!operation.rows[0] || operation.rows[0].operation_type !== 'Inspection') return;
    const plan = await this.pool.query(`SELECT plan_id FROM qms_inspection_plan WHERE item_revision_id=$1 AND operation_id=$2 AND site_id=$3 AND status='Released' AND (effective_from IS NULL OR effective_from <= NOW()) AND (effective_to IS NULL OR effective_to >= NOW()) ORDER BY plan_version DESC LIMIT 1`, [itemRevisionId, operationId, operation.rows[0].site_id]);
    const existing = await this.pool.query('SELECT result_id FROM qms_inspection_result WHERE source_event_id=$1', [envelope.event_id]);
    if (existing.rows[0]) return;
    await this.pool.query(`INSERT INTO qms_inspection_result (plan_id,work_order_id,work_center_id,item_revision_id,lot_or_label_ref,inspected_qty,source_event_id,missing_plan_flag) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (source_event_id) DO NOTHING`, [plan.rows[0]?.plan_id ?? null, workOrderId, p['work_center_id'] ?? null, itemRevisionId, p['output_label_id'] ?? null, Number(p['qty_good'] ?? 0) + Number(p['qty_scrap'] ?? 0), envelope.event_id, !plan.rows[0]]);
  }

  async stop(): Promise<void> { if (this.consumer) { await this.consumer.disconnect(); this.consumer = null; } }
}
