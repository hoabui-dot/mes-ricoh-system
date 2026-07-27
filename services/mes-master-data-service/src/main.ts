// Must be first import.
import './instrumentation.js';

import express from 'express';
import { Pool } from 'pg';
import { OutboxRelayWorker } from '@mom-platform/shared-kernel';
import { runMigrations } from './infrastructure/db/migrate.js';
import { seedMasterData } from './infrastructure/db/seed.js';
import { masterDataRouter } from './infrastructure/http/master-data.router.js';
import { registerEventSchemas } from './infrastructure/events/schema-registry.js';
import { PrintStationRuntimeConsumer } from './infrastructure/events/print-station-runtime-consumer.js';

const PORT = parseInt(process.env['PORT'] ?? '3020', 10);
const DATABASE_URL = process.env['DATABASE_URL'] ?? 'postgresql://mes_master_data_user:mes_master_data_pass@localhost:15434/mes_master_data_db';
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

async function bootstrap() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  await waitForDb(pool);
  await runMigrations(pool);
  if (SEED_ON_STARTUP) await seedMasterData(pool);

  try {
    await registerEventSchemas(SCHEMA_REGISTRY_URL);
  } catch (err) {
    console.warn('[SchemaRegistry] Registration skipped/failed:', err);
  }

  const relay = new OutboxRelayWorker({
    pool,
    kafkaBrokers: KAFKA_BROKERS,
    clientId: 'mes-master-data-service',
    pollIntervalMs: 1000,
    batchSize: 50,
    maxRetries: 3,
  });
  await relay.start();
  const printStationRuntime = new PrintStationRuntimeConsumer(pool, KAFKA_BROKERS);
  let runtimeKafkaConnected = false;
  const connectRuntime = async () => {
    while (true) {
      try {
        await printStationRuntime.start();
        runtimeKafkaConnected = true;
        return;
      } catch (error) {
        runtimeKafkaConnected = false;
        console.warn('[PrintStationRuntime] Kafka unavailable; retrying in 10 seconds', error);
        await new Promise((resolve) => setTimeout(resolve, 10_000));
      }
    }
  };
  void connectRuntime();

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.status(runtimeKafkaConnected ? 200 : 503).json({ status: runtimeKafkaConnected ? 'ok' : 'degraded', service: 'mes-master-data-service', uptime: process.uptime(), kafka: { status: runtimeKafkaConnected ? 'Connected' : 'Disconnected' }, printStationRuntime: { status: runtimeKafkaConnected ? 'Connected' : 'Disconnected' } });
  });
  app.get('/metrics', (_req, res) => {
    res.set('Content-Type', 'text/plain');
    res.send(`# HELP mes_master_data_service_up Service health\n# TYPE mes_master_data_service_up gauge\nmes_master_data_service_up 1\n`);
  });
  app.use('/api/mes/master-data', masterDataRouter(pool));
  app.use((_req, res) => res.status(404).json({ error: 'Not Found' }));
  app.use((err: Error & { statusCode?: number; code?: string; details?: unknown }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[HTTP] Unhandled error:', err);
    res.status(err.statusCode ?? 500).json({ error: err.code || (err.statusCode ? err.message : 'Internal Server Error'), message: err.message, ...(err.details ? { details: err.details } : {}) });
  });

  const server = app.listen(PORT, () => {
    console.info(`[Bootstrap] mes-master-data-service listening on :${PORT}`);
  });

  const shutdown = async (signal: string) => {
    console.info(`[Bootstrap] Received ${signal}, shutting down gracefully...`);
    server.close(async () => {
      await relay.stop();
      await printStationRuntime.stop();
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
