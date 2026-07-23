import { Kafka, type Consumer } from 'kafkajs';
import { Pool } from 'pg';
import { localizedTextSchema } from '@mom-platform/shared-kernel';

const TOPIC = 'MES.MasterData.ItemRevisionReleased.v2';

type Envelope = {
  payload?: Record<string, unknown>;
};

export class MesItemRevisionConsumer {
  private consumer: Consumer | null = null;

  constructor(
    private readonly pool: Pool,
    private readonly brokers: string[],
  ) {}

  async start(): Promise<void> {
    const kafka = new Kafka({ clientId: 'wms-master-data-service', brokers: this.brokers });
    this.consumer = kafka.consumer({ groupId: 'wms-master-data-item-revision-readmodel' });
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: TOPIC, fromBeginning: true });
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        await this.process(message.value);
      },
    });
    console.info(`[MESReadModel] Listening for ${TOPIC}`);
  }

  async stop(): Promise<void> {
    if (this.consumer) await this.consumer.disconnect();
  }

  private async process(value: Buffer): Promise<void> {
    let envelope: Envelope;
    try {
      envelope = JSON.parse(value.toString('utf8')) as Envelope;
    } catch {
      return;
    }
    const payload = envelope.payload;
    if (!payload) return;

    const itemRevisionId = payload['master_id'];
    const itemCode = payload['code'];
    const itemName = payload['name'];
    if (typeof itemRevisionId !== 'string' || typeof itemCode !== 'string') return;
    const parsedName = localizedTextSchema.safeParse(itemName);
    if (!parsedName.success) return;

    await this.pool.query(
      `INSERT INTO rm_item_revision (item_revision_id, item_code, item_name, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (item_revision_id)
       DO UPDATE SET item_code = EXCLUDED.item_code,
                     item_name = EXCLUDED.item_name,
                     updated_at = NOW()`,
      [itemRevisionId, itemCode, JSON.stringify(parsedName.data)],
    );
  }
}
