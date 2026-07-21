import { Kafka, Producer, KafkaConfig, logLevel } from 'kafkajs';
import { Pool, PoolClient } from 'pg';
import { EventEnvelope } from './event-envelope.js';

/**
 * OUTBOX PATTERN IMPLEMENTATION
 * ─────────────────────────────────────────────────────────────────────────────
 * Core problem: We need to atomically save a domain record AND publish an event.
 * Without the outbox, a crash between the DB write and Kafka publish loses the event.
 *
 * Solution:
 *   1. In the same DB transaction: save domain record + insert into `outbox_events`
 *   2. A separate relay worker polls `outbox_events`, publishes to Kafka, marks processed
 *
 * Each service that uses this pattern must have the `outbox_events` table in its DB.
 * Use audit-trigger.sql to create the table (see `../migrations/` in each service).
 */

// ─── Outbox Table Shape ───────────────────────────────────────────────────────

export interface OutboxEvent {
  id: string;
  event_type: string;
  topic: string;
  payload: string; // JSON-serialized EventEnvelope
  status: 'PENDING' | 'PUBLISHED' | 'FAILED';
  created_at: Date;
  published_at: Date | null;
  retry_count: number;
  error_message: string | null;
}

// ─── Outbox Writer (used inside domain transactions) ─────────────────────────

/**
 * Writes an event to the `outbox_events` table within an existing DB transaction.
 * Call this inside your repository's transaction — do NOT commit the transaction here.
 *
 * @example
 * await db.transaction(async (trx) => {
 *   await trx.insert(myDomainTable).values(record);
 *   await writeToOutbox(trx, { topic: 'mes.master-data', envelope });
 * });
 */
export async function writeToOutbox(
  client: PoolClient,
  params: {
    topic: string;
    envelope: EventEnvelope;
  },
): Promise<void> {
  const { topic, envelope } = params;
  await client.query(
    `INSERT INTO outbox_events (id, event_type, topic, payload, status, created_at, retry_count)
     VALUES ($1, $2, $3, $4, 'PENDING', NOW(), 0)`,
    [envelope.event_id, envelope.event_type, topic, JSON.stringify(envelope)],
  );
}

// ─── Outbox Relay Worker ──────────────────────────────────────────────────────

export interface OutboxRelayConfig {
  pool: Pool;
  kafkaBrokers: string[];
  clientId: string;
  /** How often to poll the outbox table (ms). Default: 1000ms */
  pollIntervalMs?: number;
  /** Max events to process per poll cycle. Default: 50 */
  batchSize?: number;
  /** Max retry attempts before marking FAILED. Default: 3 */
  maxRetries?: number;
}

/**
 * Outbox Relay Worker — runs as a background process in each service.
 * Polls `outbox_events` for PENDING rows, publishes to Kafka, marks PUBLISHED.
 *
 * Usage: Start once at application startup, stop on graceful shutdown.
 *
 * @example
 * const relay = new OutboxRelayWorker({ pool, kafkaBrokers: ['kafka:29092'], clientId: 'hello-world-service' });
 * await relay.start();
 * // on shutdown:
 * await relay.stop();
 */
export class OutboxRelayWorker {
  private readonly pool: Pool;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly maxRetries: number;
  private producer: Producer | null = null;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private readonly config: OutboxRelayConfig) {
    this.pool = config.pool;
    this.pollIntervalMs = config.pollIntervalMs ?? 1000;
    this.batchSize = config.batchSize ?? 50;
    this.maxRetries = config.maxRetries ?? 3;
  }

  async start(): Promise<void> {
    const kafkaConfig: KafkaConfig = {
      clientId: `${this.config.clientId}-outbox-relay`,
      brokers: this.config.kafkaBrokers,
      logLevel: logLevel.WARN,
      retry: { retries: 5 },
    };
    const kafka = new Kafka(kafkaConfig);
    this.producer = kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30000,
    });
    await this.producer.connect();
    this.running = true;

    this.intervalHandle = setInterval(() => {
      void this.poll().catch((err) => {
        console.error('[OutboxRelay] Poll error:', err);
      });
    }, this.pollIntervalMs);

    console.info(`[OutboxRelay] Started — polling every ${this.pollIntervalMs}ms`);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.intervalHandle) clearInterval(this.intervalHandle);
    if (this.producer) await this.producer.disconnect();
    console.info('[OutboxRelay] Stopped');
  }

  private async poll(): Promise<void> {
    if (!this.running || !this.producer) return;

    const client = await this.pool.connect();
    try {
      // SELECT FOR UPDATE SKIP LOCKED — safe for multiple relay instances
      const { rows } = await client.query<OutboxEvent>(
        `SELECT id, event_type, topic, payload, retry_count
         FROM outbox_events
         WHERE status = 'PENDING' AND retry_count < $1
         ORDER BY created_at ASC
         LIMIT $2
         FOR UPDATE SKIP LOCKED`,
        [this.maxRetries, this.batchSize],
      );

      if (rows.length === 0) return;

      for (const row of rows) {
        try {
          await this.producer.send({
            topic: row.topic,
            messages: [
              {
                key: row.id,
                value: typeof row.payload === 'string' ? row.payload : JSON.stringify(row.payload),
                headers: { 'event-type': row.event_type },
              },
            ],
          });

          await client.query(
            `UPDATE outbox_events
             SET status = 'PUBLISHED', published_at = NOW()
             WHERE id = $1`,
            [row.id],
          );
        } catch (err) {
          const newRetryCount = row.retry_count + 1;
          const newStatus = newRetryCount >= this.maxRetries ? 'FAILED' : 'PENDING';
          await client.query(
            `UPDATE outbox_events
             SET retry_count = $1, status = $2, error_message = $3
             WHERE id = $4`,
            [newRetryCount, newStatus, String(err), row.id],
          );
          console.error(`[OutboxRelay] Failed to publish event ${row.id} (attempt ${newRetryCount}):`, err);
        }
      }
    } finally {
      client.release();
    }
  }
}

// ─── SQL Migration helper (exported as a string for service migrations) ───────

export const OUTBOX_TABLE_SQL = `
-- outbox_events table — required by OutboxRelayWorker
-- Include this in the 0001_initial.sql migration of any service using the outbox pattern
CREATE TABLE IF NOT EXISTS outbox_events (
  id             UUID        PRIMARY KEY,
  event_type     TEXT        NOT NULL,
  topic          TEXT        NOT NULL,
  payload        JSONB       NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PUBLISHED', 'FAILED')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at   TIMESTAMPTZ,
  retry_count    INTEGER     NOT NULL DEFAULT 0,
  error_message  TEXT
);

CREATE INDEX IF NOT EXISTS idx_outbox_events_status_created
  ON outbox_events (status, created_at)
  WHERE status = 'PENDING';
`;
