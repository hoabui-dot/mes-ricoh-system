import './instrumentation.js';

import express from 'express';
import { Pool } from 'pg';
import { OutboxRelayWorker } from '@mom-platform/shared-kernel';
import { runMigrations } from './infrastructure/db/migrate.js';
import { seedWmsMasterData } from './infrastructure/db/seed.js';
import { masterDataRouter } from './infrastructure/http/master-data.router.js';
import { registerEventSchemas } from './infrastructure/events/schema-registry.js';
import { MesItemRevisionConsumer } from './infrastructure/internal_read_model/mes-item-revision-consumer.js';

const PORT = parseInt(process.env['PORT'] ?? '3060', 10);
const DATABASE_URL = process.env['DATABASE_URL'] ?? 'postgresql://wms_master_data_user:wms_master_data_pass@localhost:15438/wms_master_data_db';
const MIGRATION_DATABASE_URL = process.env['MIGRATION_DATABASE_URL'] ?? DATABASE_URL;
const KAFKA_BROKERS = (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(',');
const SCHEMA_REGISTRY_URL = process.env['SCHEMA_REGISTRY_URL'] ?? 'http://localhost:18081';
const SEED_ON_STARTUP = (process.env['SEED_ON_STARTUP'] ?? 'true') === 'true';

async function waitForDb(pool: Pool): Promise<void> {
  for (let i = 0; i < 15; i += 1) {
    try {
      await pool.query('SELECT 1');
      console.info('[Bootstrap] Database connection established');
      return;
    } catch {
      console.warn(`[Bootstrap] DB not ready yet, retrying (${i + 1}/15)...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw new Error('Database never became ready');
}

async function bootstrap(): Promise<void> {
  const migrationPool = new Pool({ connectionString: MIGRATION_DATABASE_URL });
  await waitForDb(migrationPool);
  await runMigrations(migrationPool);
  if (SEED_ON_STARTUP) await seedWmsMasterData(migrationPool);
  if (MIGRATION_DATABASE_URL !== DATABASE_URL) await migrationPool.end();

  const pool = MIGRATION_DATABASE_URL === DATABASE_URL ? migrationPool : new Pool({ connectionString: DATABASE_URL });
  await waitForDb(pool);

  try {
    await registerEventSchemas(SCHEMA_REGISTRY_URL);
  } catch (err) {
    console.warn('[SchemaRegistry] Registration skipped/failed:', err);
  }

  const relay = new OutboxRelayWorker({
    pool,
    kafkaBrokers: KAFKA_BROKERS,
    clientId: 'wms-master-data-service',
    pollIntervalMs: 1000,
    batchSize: 50,
    maxRetries: 3,
  });
  await relay.start();

  const mesConsumer = new MesItemRevisionConsumer(pool, KAFKA_BROKERS);
  await mesConsumer.start();

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'wms-master-data-service', uptime: process.uptime() });
  });
  app.get('/metrics', (_req, res) => {
    res.set('Content-Type', 'text/plain');
    res.send(`# HELP wms_master_data_service_up Service health\n# TYPE wms_master_data_service_up gauge\nwms_master_data_service_up 1\n`);
  });
  app.use('/api/wms/master-data', masterDataRouter(pool));
  app.use((_req, res) => res.status(404).json({ error: 'Not Found' }));
  app.use((err: Error & { statusCode?: number; errorCode?: string; details?: unknown; code?: string; constraint?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[HTTP] Unhandled error:', err);
    const dbErrorMap: Record<string, { statusCode: number; errorCode: string }> = {
      '23505': { statusCode: 409, errorCode: 'UNIQUE_CONSTRAINT_VIOLATION' },
      '23514': { statusCode: 422, errorCode: 'CHECK_CONSTRAINT_VIOLATION' },
      '23503': { statusCode: 422, errorCode: 'FOREIGN_KEY_CONSTRAINT_VIOLATION' },
    };
    const mapped = err.code ? dbErrorMap[err.code] : undefined;
    res.status(err.statusCode ?? mapped?.statusCode ?? 500).json({
      error: err.errorCode ?? mapped?.errorCode ?? (err.statusCode ? err.message : 'Internal Server Error'),
      message: err.message,
      details: err.details ?? (err.constraint ? { constraint: err.constraint } : undefined),
    });
  });

  const server = app.listen(PORT, () => {
    console.info(`[Bootstrap] wms-master-data-service listening on :${PORT}`);
  });

  const shutdown = async (signal: string) => {
    console.info(`[Bootstrap] Received ${signal}, shutting down gracefully...`);
    server.close(async () => {
      await mesConsumer.stop();
      await relay.stop();
      await pool.end();
      console.info('[Bootstrap] Shutdown complete');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('[Bootstrap] Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('[Bootstrap] Fatal error:', err);
  process.exit(1);
});
