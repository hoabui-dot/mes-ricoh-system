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
  available_at?: Date;
  aggregate_type?: string | null;
  aggregate_id?: string | null;
  aggregate_version?: number | null;
  event_version?: number | null;
  correlation_id?: string | null;
  causation_id?: string | null;
  trace_id?: string | null;
  partition_key?: string | null;
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

export interface OutboxMetrics {
  pending: number;
  failed: number;
  oldestPendingAgeSeconds: number;
}

export async function readOutboxMetrics(pool: Pool): Promise<OutboxMetrics> {
  const { rows } = await pool.query<{ pending: string; failed: string; oldest_age: number | null }>(
    `SELECT COUNT(*) FILTER (WHERE status = 'PENDING')::text AS pending,
            COUNT(*) FILTER (WHERE status = 'FAILED')::text AS failed,
            COALESCE(EXTRACT(EPOCH FROM (NOW() - MIN(created_at) FILTER (WHERE status = 'PENDING'))), 0) AS oldest_age
       FROM outbox_events`,
  );
  return { pending: Number(rows[0]?.pending ?? 0), failed: Number(rows[0]?.failed ?? 0), oldestPendingAgeSeconds: Number(rows[0]?.oldest_age ?? 0) };
}

export async function replayOutboxEvent(pool: Pool, eventId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ event_type: string; topic: string; payload: unknown }>(
      'SELECT event_type, topic, payload FROM outbox_dead_letters WHERE event_id = $1 FOR UPDATE', [eventId],
    );
    if (rows.length === 0) throw new Error(`OUTBOX_DEAD_LETTER_NOT_FOUND:${eventId}`);
    const row = rows[0]!;
    await client.query(
      `INSERT INTO outbox_events (id,event_type,topic,payload,status,retry_count,error_message,published_at)
       VALUES ($1,$2,$3,$4,'PENDING',0,NULL,NULL)
       ON CONFLICT (id) DO UPDATE SET status='PENDING',retry_count=0,error_message=NULL,published_at=NULL`,
      [eventId, row.event_type, row.topic, row.payload],
    );
    await client.query('UPDATE outbox_dead_letters SET replayed_at=NOW(), replay_count=replay_count+1 WHERE event_id=$1', [eventId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
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
 * const relay = new OutboxRelayWorker({ pool, kafkaBrokers: ['kafka:29092'], clientId: 'my-service' });
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
      await client.query('BEGIN');
      const { rows } = await client.query<OutboxEvent>(
        `SELECT id, event_type, topic, payload, retry_count, partition_key
         FROM outbox_events
         WHERE status = 'PENDING'
           AND retry_count < $1
           AND COALESCE(available_at, created_at) <= NOW()
         ORDER BY created_at ASC
         LIMIT $2
         FOR UPDATE SKIP LOCKED`,
        [this.maxRetries, this.batchSize],
      );

      if (rows.length === 0) {
        await client.query('COMMIT');
        return;
      }

      for (const row of rows) {
        try {
          await this.producer.send({
            topic: row.topic,
            messages: [
              {
                key: row.partition_key || row.id,
                value: typeof row.payload === 'string' ? row.payload : JSON.stringify(row.payload),
                headers: { 'event-type': row.event_type },
              },
            ],
          });

          await client.query(
            `UPDATE outbox_events
             SET status = 'PUBLISHED', published_at = NOW(), error_message = NULL
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
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
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

ALTER TABLE outbox_events
  ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS aggregate_type TEXT,
  ADD COLUMN IF NOT EXISTS aggregate_id UUID,
  ADD COLUMN IF NOT EXISTS aggregate_version BIGINT,
  ADD COLUMN IF NOT EXISTS event_version INTEGER,
  ADD COLUMN IF NOT EXISTS correlation_id TEXT,
  ADD COLUMN IF NOT EXISTS causation_id TEXT,
  ADD COLUMN IF NOT EXISTS trace_id TEXT,
  ADD COLUMN IF NOT EXISTS partition_key TEXT;

CREATE TABLE IF NOT EXISTS outbox_dead_letters (
  event_id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,
  topic TEXT NOT NULL,
  payload JSONB NOT NULL,
  retry_count INTEGER NOT NULL,
  error_message TEXT,
  parked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  replayed_at TIMESTAMPTZ,
  replay_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_outbox_events_status_created
  ON outbox_events (status, created_at)
  WHERE status = 'PENDING';
`;
